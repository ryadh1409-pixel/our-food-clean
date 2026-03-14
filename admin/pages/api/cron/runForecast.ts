import { runDemandForecast } from '@/lib/forecast';
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

  try {
    const result = await runDemandForecast();
    res.status(200).json({ success: true, ...result });
  } catch (e) {
    console.error('runForecast error:', e);
    res.status(500).json({
      error: e instanceof Error ? e.message : 'Forecast failed',
    });
  }
}
