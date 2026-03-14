import { db } from '@/firebase/config';
import {
  addDoc,
  collection,
  getCountFromServer,
  getDocs,
  query,
  where,
  Timestamp,
} from 'firebase/firestore';
import nodemailer from 'nodemailer';
import type { NextApiRequest, NextApiResponse } from 'next';

const CRON_SECRET = process.env.CRON_SECRET;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const HIGH_ACTIVITY_THRESHOLD = 100;
const WINDOW_MS = 24 * 60 * 60 * 1000;

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
  const last24h = now - WINDOW_MS;
  const last24hTimestamp = Timestamp.fromMillis(last24h);

  try {
    const ordersRef = collection(db, 'orders');
    const countSnap = await getCountFromServer(
      query(ordersRef, where('createdAt', '>=', last24hTimestamp)),
    );
    const count = countSnap.data().count;

    if (count < HIGH_ACTIVITY_THRESHOLD) {
      return res
        .status(200)
        .json({
          checked: true,
          count,
          alertCreated: false,
          reason: 'below_threshold',
        });
    }

    const alertsRef = collection(db, 'alerts');
    const recentHighActivity = await getDocs(
      query(
        alertsRef,
        where('type', '==', 'high_activity'),
        where('createdAt', '>=', last24hTimestamp),
      ),
    );

    if (recentHighActivity.size > 0) {
      return res.status(200).json({
        checked: true,
        count,
        alertCreated: false,
        reason: 'already_alerted',
      });
    }

    await addDoc(alertsRef, {
      type: 'high_activity',
      message: '100+ orders detected in last 24 hours',
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
        subject: 'HalfOrder High Activity Alert',
        text: 'HalfOrder has reached more than 100 orders in the last 24 hours. This indicates strong user activity.',
      });
    }

    res.status(200).json({ checked: true, count, alertCreated: true });
  } catch (e) {
    console.error('checkHighActivity error:', e);
    res.status(500).json({
      error: e instanceof Error ? e.message : 'Check failed',
    });
  }
}
