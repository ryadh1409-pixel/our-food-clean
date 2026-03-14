import { db } from '@/firebase/config';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import type { NextApiRequest, NextApiResponse } from 'next';
import { haversineDistanceKm } from '@/lib/haversine';
const NEARBY_KM = 2;
const MESSAGE = 'Someone near you is sharing food.';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const orderId = (req.body?.orderId ?? req.query.orderId) as
    | string
    | undefined;
  if (!orderId?.trim()) {
    return res.status(400).json({ error: 'orderId required' });
  }

  try {
    const orderSnap = await getDoc(doc(db, 'orders', orderId));
    if (!orderSnap.exists()) {
      return res.status(404).json({ error: 'Order not found' });
    }
    const orderData = orderSnap.data();
    const lat = orderData?.latitude ?? orderData?.location?.latitude;
    const lng = orderData?.longitude ?? orderData?.location?.longitude;
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return res
        .status(200)
        .json({ notified: 0, reason: 'order_has_no_location' });
    }

    const usersSnap = await getDocs(collection(db, 'users'));
    const tokens: string[] = [];
    usersSnap.docs.forEach((d) => {
      const data = d.data();
      const userLat = data?.lastLatitude ?? data?.latitude;
      const userLng = data?.lastLongitude ?? data?.longitude;
      if (typeof userLat !== 'number' || typeof userLng !== 'number') return;
      const dist = haversineDistanceKm(lat, lng, userLat, userLng);
      if (dist > NEARBY_KM) return;
      const token = data?.pushToken ?? data?.expoPushToken;
      if (typeof token === 'string' && token.length > 0) tokens.push(token);
    });

    if (tokens.length === 0) {
      return res
        .status(200)
        .json({ notified: 0, reason: 'no_nearby_users_with_tokens' });
    }

    const title = 'HalfOrder';
    const body = MESSAGE;
    const messages = tokens.map((to) => ({ to, title, body }));
    const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(messages),
    });
    const data = (await response.json()) as { data?: { status: string }[] };
    const results = Array.isArray(data?.data) ? data.data : [];
    const sent = results.filter((r) => r?.status === 'ok').length;

    res.status(200).json({ notified: sent, totalNearby: tokens.length });
  } catch (e) {
    console.error('notifyNearby error:', e);
    res.status(500).json({ error: e instanceof Error ? e.message : 'Failed' });
  }
}
