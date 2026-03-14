import { db } from '@/firebase/config';
import { collection, getDocs } from 'firebase/firestore';
import type { NextApiRequest, NextApiResponse } from 'next';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const GRID = 8;
const TOP_N = 6;

type Hotspot = { lat: number; lng: number; count: number; suggestion: string };

function getLatLng(
  d: Record<string, unknown>,
): { lat: number; lng: number } | null {
  const lat = d.latitude ?? (d.location as { latitude?: number })?.latitude;
  const lng = d.longitude ?? (d.location as { longitude?: number })?.longitude;
  if (typeof lat === 'number' && typeof lng === 'number') return { lat, lng };
  return null;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ hotspots?: Hotspot[]; error?: string }>,
) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: 'OPENAI_API_KEY is not set' });
  }

  try {
    const snap = await getDocs(collection(db, 'orders'));
    const points = snap.docs
      .map((d) => getLatLng(d.data()))
      .filter((p): p is { lat: number; lng: number } => p != null);

    if (points.length === 0) {
      return res.status(200).json({
        hotspots: [
          {
            lat: 43.6532,
            lng: -79.3832,
            count: 0,
            suggestion: 'Downtown Toronto – start promoting here',
          },
        ],
      });
    }

    const lats = points.map((p) => p.lat);
    const lngs = points.map((p) => p.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);

    const grid: Record<string, { lat: number; lng: number; count: number }> =
      {};
    points.forEach(({ lat, lng }) => {
      const gi = Math.min(
        GRID - 1,
        Math.floor(((lat - minLat) / (maxLat - minLat || 1)) * GRID),
      );
      const gj = Math.min(
        GRID - 1,
        Math.floor(((lng - minLng) / (maxLng - minLng || 1)) * GRID),
      );
      const key = `${gi},${gj}`;
      if (!grid[key]) {
        grid[key] = {
          lat: minLat + (gi + 0.5) * ((maxLat - minLat) / GRID),
          lng: minLng + (gj + 0.5) * ((maxLng - minLng) / GRID),
          count: 0,
        };
      }
      grid[key].count += 1;
    });

    const top = Object.entries(grid)
      .map(([, v]) => v)
      .sort((a, b) => b.count - a.count)
      .slice(0, TOP_N);

    const coordList = top
      .map(
        (t) => `(${t.lat.toFixed(4)}, ${t.lng.toFixed(4)}) – ${t.count} orders`,
      )
      .join('\n');
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: `These are high order-density areas in Toronto (latitude, longitude – order count). For each area, suggest ONE of: University, Mall, Food court, Event location, or Other. Reply with a JSON array of exactly ${top.length} strings, in the same order as the list. Only the JSON array.\n\n${coordList}`,
        },
      ],
      temperature: 0.2,
    });

    const content = completion.choices[0]?.message?.content?.trim() || '[]';
    const jsonStr = content.replace(/^```json?\s*|\s*```$/g, '');
    let suggestions: string[] = [];
    try {
      suggestions = JSON.parse(jsonStr);
    } catch {
      suggestions = top.map(() => 'Other');
    }
    if (!Array.isArray(suggestions)) suggestions = top.map(() => 'Other');

    const hotspots: Hotspot[] = top.map((t, i) => ({
      lat: t.lat,
      lng: t.lng,
      count: t.count,
      suggestion: suggestions[i] || 'Other',
    }));

    res.status(200).json({ hotspots });
  } catch (e) {
    console.error(e);
    res.status(500).json({
      error: e instanceof Error ? e.message : 'Failed to analyze hotspots',
    });
  }
}
