import { db } from '@/firebase/config';
import { collection, getDocs } from 'firebase/firestore';
import type { NextApiRequest, NextApiResponse } from 'next';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ sent: number; failed: number; error?: string }>,
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res
      .status(405)
      .json({ sent: 0, failed: 0, error: 'Method not allowed' });
  }

  const title = (req.body?.title as string)?.trim() || 'HalfOrder';
  const body =
    (req.body?.body as string)?.trim() ||
    (req.body?.message as string)?.trim() ||
    'Someone near you is sharing food 🍕';

  try {
    const snap = await getDocs(collection(db, 'users'));
    const tokens: string[] = [];
    snap.docs.forEach((d) => {
      const data = d.data();
      const token = data?.pushToken ?? data?.expoPushToken;
      if (typeof token === 'string' && token.length > 0) {
        tokens.push(token);
      }
    });

    if (tokens.length === 0) {
      return res.status(200).json({ sent: 0, failed: 0 });
    }

    const messages = tokens.map((to) => ({ to, title, body }));
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(messages),
    });

    const data = (await response.json()) as { data?: { status: string }[] };
    const results = Array.isArray(data?.data) ? data.data : [];
    const sent = results.filter((r) => r?.status === 'ok').length;
    const failed = results.length - sent;

    res.status(200).json({ sent, failed });
  } catch (e) {
    console.error(e);
    res.status(500).json({
      sent: 0,
      failed: 0,
      error: e instanceof Error ? e.message : 'Failed to send notifications',
    });
  }
}
