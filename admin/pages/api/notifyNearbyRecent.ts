import { db } from '@/firebase/config';
import {
  collection,
  getDocs,
  query,
  Timestamp,
  where,
} from 'firebase/firestore';
import type { NextApiRequest, NextApiResponse } from 'next';
import { haversineDistanceKm } from '@/lib/haversine';

const NEARBY_KM = 1;
const WINDOW_MS = 5 * 60 * 1000; // 5 min

const CRON_SECRET = process.env.CRON_SECRET;

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
    const since = Timestamp.fromMillis(Date.now() - WINDOW_MS);
    const ordersSnap = await getDocs(
      query(collection(db, 'orders'), where('createdAt', '>=', since)),
    );
    type OrderInfo = { lat: number; lng: number; restaurantName: string };
    const orders: OrderInfo[] = [];
    ordersSnap.docs.forEach((d) => {
      const data = d.data();
      const lat = data?.latitude ?? data?.location?.latitude;
      const lng = data?.longitude ?? data?.location?.longitude;
      const restaurantName =
        typeof data?.restaurantName === 'string' && data.restaurantName.trim()
          ? data.restaurantName
          : 'a restaurant';
      if (typeof lat === 'number' && typeof lng === 'number') {
        orders.push({ lat, lng, restaurantName });
      }
    });

    const usersSnap = await getDocs(collection(db, 'users'));
    const payloads: { to: string; title: string; body: string }[] = [];

    usersSnap.docs.forEach((d) => {
      const data = d.data();
      if (data?.notificationsEnabled === false) return;
      const userLat =
        data?.lastLatitude ?? data?.location?.latitude ?? data?.latitude;
      const userLng =
        data?.lastLongitude ?? data?.location?.longitude ?? data?.longitude;
      if (typeof userLat !== 'number' || typeof userLng !== 'number') return;
      const token = data?.pushToken ?? data?.expoPushToken;
      if (typeof token !== 'string' || !token.length) return;
      for (const order of orders) {
        if (
          haversineDistanceKm(order.lat, order.lng, userLat, userLng) <=
          NEARBY_KM
        ) {
          payloads.push({
            to: token,
            title: 'HalfOrder',
            body: `🍕 New shared order near you at ${order.restaurantName}. Tap to join.`,
          });
          break;
        }
      }
    });

    if (payloads.length === 0) {
      return res
        .status(200)
        .json({ notified: 0, ordersChecked: orders.length });
    }

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payloads),
    });
    const data = (await response.json()) as { data?: { status: string }[] };
    const results = Array.isArray(data?.data) ? data.data : [];
    const sent = results.filter((r) => r?.status === 'ok').length;

    res.status(200).json({ notified: sent, ordersChecked: orders.length });
  } catch (e) {
    console.error('notifyNearbyRecent error:', e);
    res.status(500).json({ error: e instanceof Error ? e.message : 'Failed' });
  }
}
