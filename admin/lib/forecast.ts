import { db } from '@/firebase/config';
import {
  addDoc,
  collection,
  deleteDoc,
  getDocs,
  query,
  where,
  Timestamp,
  doc,
  updateDoc,
} from 'firebase/firestore';
import { getGridKey, getGridCenter } from './geoGrid';
import { sendPushToAllUsers } from './push';

const CAMPAIGN_PUSH_TITLE = 'HalfOrder';
const CAMPAIGN_PUSH_BODY =
  '🍔 Many people near you are sharing food right now. Open HalfOrder and split your meal.';
const CAMPAIGN_RADIUS_M = 1000;
const CAMPAIGN_DURATION_MS = 2 * 60 * 60 * 1000; // 2 hours

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const WEEKS_IN_30_DAYS = 30 / 7;
const THRESHOLD_HIGH_PROBABILITY = 5; // avg orders per hour
const THRESHOLD_ALERT = 15; // create alert if expectedOrders >= 15

type OrderDoc = {
  id: string;
  latitude?: number;
  longitude?: number;
  location?: { latitude?: number; longitude?: number };
  createdAt?: { toMillis?: () => number };
};

function getOrderCreatedAt(order: OrderDoc): number {
  const c = order.createdAt;
  if (c && typeof (c as { toMillis?: () => number }).toMillis === 'function') {
    return (c as { toMillis: () => number }).toMillis();
  }
  return 0;
}

function getOrderLatLng(order: OrderDoc): { lat: number; lng: number } | null {
  const lat = order.latitude ?? order.location?.latitude;
  const lng = order.longitude ?? order.location?.longitude;
  if (typeof lat === 'number' && typeof lng === 'number') return { lat, lng };
  return null;
}

type BucketKey = string;
function bucketKey(
  gridKey: string,
  hour: number,
  dayOfWeek: number,
): BucketKey {
  return `${gridKey}|${hour}|${dayOfWeek}`;
}

export type PredictionDoc = {
  id: string;
  location: { latitude: number; longitude: number };
  hour: number;
  dayOfWeek: number;
  expectedOrders: number;
  confidence: number;
  createdAt: number;
};

export async function runDemandForecast(): Promise<{
  predictionsCount: number;
  alertCreated: boolean;
  bucketsAboveThreshold: number;
}> {
  const now = Date.now();
  const thirtyDaysAgo = now - THIRTY_DAYS_MS;
  const thirtyDaysAgoTs = Timestamp.fromMillis(thirtyDaysAgo);

  const ordersRef = collection(db, 'orders');
  const snapshot = await getDocs(
    query(ordersRef, where('createdAt', '>=', thirtyDaysAgoTs)),
  );
  const orders: OrderDoc[] = snapshot.docs.map(
    (d) => ({ id: d.id, ...d.data() }) as OrderDoc,
  );

  const withTimeAndLocation = orders
    .map((o) => ({
      createdAt: getOrderCreatedAt(o),
      latLng: getOrderLatLng(o),
    }))
    .filter((x) => x.createdAt >= thirtyDaysAgo && x.latLng != null) as {
    createdAt: number;
    latLng: { lat: number; lng: number };
  }[];

  const TZ = 'America/Toronto';
  const dayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const bucketCount: Record<BucketKey, number> = {};
  for (const { createdAt, latLng } of withTimeAndLocation) {
    const d = new Date(createdAt);
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ,
      hour: 'numeric',
      hour12: false,
      weekday: 'short',
    }).formatToParts(d);
    const hour = parseInt(
      parts.find((p) => p.type === 'hour')?.value ?? '0',
      10,
    );
    const dayOfWeek =
      dayMap[parts.find((p) => p.type === 'weekday')?.value ?? 'Sun'] ?? 0;
    const gridKey = getGridKey(latLng.lat, latLng.lng);
    const key = bucketKey(gridKey, hour, dayOfWeek);
    bucketCount[key] = (bucketCount[key] ?? 0) + 1;
  }

  const predictionsRef = collection(db, 'predictions');
  const existing = await getDocs(predictionsRef);
  for (const d of existing.docs) {
    await deleteDoc(doc(db, 'predictions', d.id));
  }

  const entries = Object.entries(bucketCount);
  const avgPerOccurrence = (count: number) => count / WEEKS_IN_30_DAYS;
  const confidence = (count: number) => Math.min(1, count / 20);
  let alertCreated = false;
  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const toWrite: { key: string; count: number }[] = [];
  for (const [key, count] of entries) {
    const expectedOrders = Math.round(avgPerOccurrence(count) * 10) / 10;
    if (expectedOrders >= THRESHOLD_HIGH_PROBABILITY)
      toWrite.push({ key, count });
  }

  for (const { key, count } of toWrite) {
    const expectedOrders = Math.round(avgPerOccurrence(count) * 10) / 10;
    const [gridKey, hourStr, dayStr] = key.split('|');
    const hour = Number(hourStr);
    const dayOfWeek = Number(dayStr);
    const center = getGridCenter(gridKey);

    await addDoc(predictionsRef, {
      location: center,
      hour,
      dayOfWeek,
      dayName: DAY_NAMES[dayOfWeek],
      expectedOrders,
      confidence: Math.round(confidence(count) * 100) / 100,
      createdAt: Timestamp.now(),
    });
  }

  const anyAboveAlert = toWrite.some(
    ({ count }) => avgPerOccurrence(count) >= THRESHOLD_ALERT,
  );
  if (anyAboveAlert) {
    const alertsRef = collection(db, 'alerts');
    await addDoc(alertsRef, {
      type: 'predicted_hotspot',
      message: 'Predicted hotspot in next hour.',
      createdAt: Timestamp.now(),
      status: 'new',
    });
    alertCreated = true;

    const topBucket = toWrite
      .filter(({ count }) => avgPerOccurrence(count) >= THRESHOLD_ALERT)
      .sort((a, b) => avgPerOccurrence(b.count) - avgPerOccurrence(a.count))[0];
    if (topBucket) {
      const [gridKey] = topBucket.key.split('|');
      const center = getGridCenter(gridKey);
      const startTime = Timestamp.now();
      const endTime = Timestamp.fromMillis(Date.now() + CAMPAIGN_DURATION_MS);
      const name = `Auto Hotspot ${center.latitude.toFixed(4)}, ${center.longitude.toFixed(4)}`;
      const campaignsRef = collection(db, 'campaigns');
      const campaignRef = await addDoc(campaignsRef, {
        name,
        type: 'auto',
        location: center,
        radius: CAMPAIGN_RADIUS_M,
        startTime,
        endTime,
        status: 'active',
        pushSent: false,
        usersReached: 0,
        ordersCreated: 0,
        matchesCreated: 0,
        createdAt: Timestamp.now(),
      });
      const { sent } = await sendPushToAllUsers(
        CAMPAIGN_PUSH_TITLE,
        CAMPAIGN_PUSH_BODY,
      );
      await updateDoc(doc(db, 'campaigns', campaignRef.id), {
        pushSent: true,
        usersReached: sent,
      });
    }
  }

  const bucketsAboveThreshold = toWrite.length;

  return {
    predictionsCount: bucketsAboveThreshold,
    alertCreated,
    bucketsAboveThreshold,
  };
}
