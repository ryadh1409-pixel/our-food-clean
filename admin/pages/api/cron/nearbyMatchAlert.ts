import { db } from '@/firebase/config';
import {
  collection,
  getDocs,
  query,
  Timestamp,
  updateDoc,
  doc,
  where,
} from 'firebase/firestore';
import type { NextApiRequest, NextApiResponse } from 'next';
import { haversineDistanceKm } from '@/lib/haversine';

const NEARBY_KM = 0.5; // 500 meters
const ACTIVE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const ALERT_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes
const TITLE = 'HalfOrder';
const BODY =
  '👋 Match nearby!\n\nAnother HalfOrder user is within 500m of you.\nCreate an order and share food together.';

const CRON_SECRET = process.env.CRON_SECRET;

type UserRow = {
  id: string;
  latitude: number | null;
  longitude: number | null;
  notificationsEnabled: boolean;
  pushToken: string | null;
  lastNearbyMatchAlertAt: number | null;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.setHeader('Allow', 'POST, GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (CRON_SECRET) {
    const provided =
      req.headers.authorization?.replace(/^Bearer\s+/i, '') ||
      (req.query.secret as string) ||
      (req.body?.secret as string);
    if (provided !== CRON_SECRET)
      return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const now = Date.now();
    const tenMinAgo = Timestamp.fromMillis(now - ACTIVE_WINDOW_MS);
    const thirtyMinAgo = now - ALERT_COOLDOWN_MS;

    const usersSnap = await getDocs(
      query(collection(db, 'users'), where('lastActive', '>=', tenMinAgo)),
    );

    const ordersSnap = await getDocs(
      query(
        collection(db, 'orders'),
        where('status', 'in', ['active', 'waiting']),
      ),
    );
    const activeOrderUserIds = new Set<string>();
    ordersSnap.docs.forEach((d) => {
      const data = d.data();
      const hostId = data?.hostId ?? data?.creatorId ?? data?.userId;
      if (hostId) activeOrderUserIds.add(hostId);
      const ids = data?.participantIds ?? data?.joinedUsers ?? [];
      if (Array.isArray(ids))
        ids.forEach((id: string) => activeOrderUserIds.add(id));
    });

    const users: UserRow[] = [];
    usersSnap.docs.forEach((d) => {
      const data = d.data();
      const lat =
        data?.latitude ?? data?.location?.latitude ?? data?.lastLatitude;
      const lng =
        data?.longitude ?? data?.location?.longitude ?? data?.lastLongitude;
      if (typeof lat !== 'number' || typeof lng !== 'number') return;
      const token = data?.pushToken ?? data?.expoPushToken;
      const notificationsEnabled = data?.notificationsEnabled !== false;
      const lastAlert =
        data?.lastNearbyMatchAlertAt?.toMillis?.() ??
        data?.lastNearbyMatchAlertAt ??
        0;
      users.push({
        id: d.id,
        latitude: lat,
        longitude: lng,
        notificationsEnabled,
        pushToken: typeof token === 'string' && token.length > 0 ? token : null,
        lastNearbyMatchAlertAt: lastAlert || null,
      });
    });

    const toSend: { userId: string; token: string }[] = [];
    for (let i = 0; i < users.length; i++) {
      const A = users[i];
      if (activeOrderUserIds.has(A.id)) continue;
      if (!A.pushToken || !A.notificationsEnabled) continue;

      let nearby = false;
      for (let j = 0; j < users.length; j++) {
        if (i === j) continue;
        const B = users[j];
        if (A.id === B.id) continue;
        if (!B.notificationsEnabled) continue;
        if (activeOrderUserIds.has(B.id)) continue;
        if (!B.latitude || !B.longitude) continue;
        const dist = haversineDistanceKm(
          A.latitude!,
          A.longitude!,
          B.latitude,
          B.longitude,
        );
        if (dist <= NEARBY_KM) {
          nearby = true;
          break;
        }
      }
      if (!nearby) continue;
      if (
        A.lastNearbyMatchAlertAt != null &&
        A.lastNearbyMatchAlertAt > thirtyMinAgo
      )
        continue;

      toSend.push({ userId: A.id, token: A.pushToken! });
    }

    let sent = 0;
    for (const { userId, token } of toSend) {
      try {
        const response = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: token,
            title: TITLE,
            body: BODY,
            data: { type: 'nearby_match' },
          }),
        });
        if (response.ok) {
          sent++;
          const userRef = doc(db, 'users', userId);
          await updateDoc(userRef, {
            lastNearbyMatchAlertAt: Timestamp.fromMillis(now),
          });
        }
      } catch {
        // skip failed send
      }
    }

    res.status(200).json({
      activeUsers: users.length,
      alertsSent: sent,
      withActiveOrder: activeOrderUserIds.size,
    });
  } catch (e) {
    console.error('nearbyMatchAlert error:', e);
    res.status(500).json({ error: e instanceof Error ? e.message : 'Failed' });
  }
}
