import { db } from '@/firebase/config';
import {
  addDoc,
  collection,
  getDocs,
  query,
  where,
  Timestamp,
} from 'firebase/firestore';
import nodemailer from 'nodemailer';
import type { NextApiRequest, NextApiResponse } from 'next';
import { haversineDistanceKm } from '@/lib/haversine';

const CRON_SECRET = process.env.CRON_SECRET;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const RADIUS_KM = 0.5; // 500 meters
const MIN_ORDERS_IN_RADIUS = 20;
const DEDUPE_MS = 30 * 60 * 1000; // don't create another hotspot alert for 30 min

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
    if (provided !== CRON_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const now = Date.now();
  const tenMinAgo = now - WINDOW_MS;
  const tenMinAgoTs = Timestamp.fromMillis(tenMinAgo);

  try {
    const ordersRef = collection(db, 'orders');
    const recentSnap = await getDocs(
      query(ordersRef, where('createdAt', '>=', tenMinAgoTs)),
    );
    const orders: OrderDoc[] = recentSnap.docs.map(
      (d) => ({ id: d.id, ...d.data() }) as OrderDoc,
    );
    const withLocation = orders
      .map((o) => ({
        order: o,
        createdAt: getOrderCreatedAt(o),
        latLng: getOrderLatLng(o),
      }))
      .filter((x) => x.createdAt >= tenMinAgo && x.latLng != null) as {
      order: OrderDoc;
      createdAt: number;
      latLng: { lat: number; lng: number };
    }[];

    if (withLocation.length < MIN_ORDERS_IN_RADIUS) {
      return res.status(200).json({
        checked: true,
        ordersInWindow: withLocation.length,
        hotspotDetected: false,
        reason: 'below_threshold',
      });
    }

    let maxCount = 0;
    let centerLat = 0;
    let centerLng = 0;

    for (const { latLng } of withLocation) {
      let count = 0;
      for (const other of withLocation) {
        const d = haversineDistanceKm(
          latLng.lat,
          latLng.lng,
          other.latLng.lat,
          other.latLng.lng,
        );
        if (d <= RADIUS_KM) count += 1;
      }
      if (count > maxCount) {
        maxCount = count;
        centerLat = latLng.lat;
        centerLng = latLng.lng;
      }
    }

    if (maxCount < MIN_ORDERS_IN_RADIUS) {
      return res.status(200).json({
        checked: true,
        ordersInWindow: withLocation.length,
        hotspotDetected: false,
        reason: 'no_dense_cluster',
      });
    }

    const alertsRef = collection(db, 'alerts');
    const allHotspots = await getDocs(
      query(alertsRef, where('type', '==', 'hotspot')),
    );
    const recentHotspots = allHotspots.docs.filter((d) => {
      const created = d.data()?.createdAt?.toMillis?.();
      return typeof created === 'number' && created >= now - DEDUPE_MS;
    });
    if (recentHotspots.length > 0) {
      return res.status(200).json({
        checked: true,
        ordersInWindow: withLocation.length,
        hotspotDetected: true,
        alertCreated: false,
        reason: 'already_alerted_recently',
      });
    }

    await addDoc(alertsRef, {
      type: 'hotspot',
      message: `Hotspot detected: ${maxCount} orders within 500m`,
      location: { latitude: centerLat, longitude: centerLng },
      createdAt: Timestamp.now(),
      status: 'new',
    });

    if (ADMIN_EMAIL) {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: Number(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth:
          process.env.SMTP_USER && process.env.SMTP_PASS
            ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
            : undefined,
      });
      await transporter.sendMail({
        from: process.env.SMTP_USER || ADMIN_EMAIL,
        to: ADMIN_EMAIL,
        subject: 'HalfOrder Hotspot Alert',
        text: 'High activity detected in a small area. Check admin dashboard.',
      });
    }

    res.status(200).json({
      checked: true,
      ordersInWindow: withLocation.length,
      hotspotDetected: true,
      alertCreated: true,
      count: maxCount,
      location: { latitude: centerLat, longitude: centerLng },
    });
  } catch (e) {
    console.error('checkHotspot error:', e);
    res.status(500).json({
      error: e instanceof Error ? e.message : 'Check failed',
    });
  }
}
