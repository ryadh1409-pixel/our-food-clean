import { runFounderReport } from '@/lib/founderReport';
import type { NextApiRequest, NextApiResponse } from 'next';

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
    if (provided !== CRON_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  if (!process.env.ADMIN_EMAIL) {
    return res.status(500).json({ error: 'ADMIN_EMAIL is not set' });
  }

  try {
    const payload = await runFounderReport();
    res.status(200).json({ success: true, payload });
  } catch (e) {
    console.error('Founder report error:', e);
    res.status(500).json({
      error: e instanceof Error ? e.message : 'Founder report failed',
    });
  }
}
