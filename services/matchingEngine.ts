/**
 * Smart + geo matching for growth: scores orders by food overlap and distance,
 * optional OpenAI copy for the assistant UI.
 */
import OpenAI from 'openai';
import Constants from 'expo-constants';
import { getDistance } from 'geolib';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  where,
} from 'firebase/firestore';

import {
  GROWTH_MATCH_RADIUS_KM,
  GROWTH_ORDER_SCAN_LIMIT,
} from '@/constants/growth';
import { db } from '@/services/firebase';
import { mapRawUserDocument } from '@/services/users';

/** Input user for `getSmartMatches` (location + food intent). */
export type GrowthMatchUser = {
  lat: number;
  lng: number;
  food: string;
  uid?: string;
};

/** Alias for `getSmartMatches` input (distinct from Firestore user docs). */
export type User = GrowthMatchUser;

/**
 * Joinable / matchable order row (HalfOrder + classic fields).
 * Alias `Order` is the growth-engine shape (not `lib/orders.Order`).
 */
export type SmartMatchOrder = {
  id: string;
  score: number;
  distanceMeters: number | null;
  foodName: string;
  restaurantName: string;
  status?: string;
  /** Host / creator for optional coord fallback. */
  anchorUserId?: string;
};

/** Growth matching result row (alias keeps API as `Order[]` in docs). */
export type Order = SmartMatchOrder;

export type SmartMatchesResult = {
  aiText: string;
  nearbyOrders: Order[];
};

const ACTIVE_STATUSES = ['open', 'active', 'waiting', 'matched'] as const;

function openAiApiKey(): string | undefined {
  const fromEnv =
    typeof process !== 'undefined'
      ? process.env?.EXPO_PUBLIC_OPENAI_API_KEY
      : undefined;
  const extra = Constants.expoConfig?.extra as Record<string, unknown> | undefined;
  const fromExtra =
    typeof extra?.openaiApiKey === 'string' ? extra.openaiApiKey : '';
  return (fromEnv || fromExtra || '').trim() || undefined;
}

function normalizeFood(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function orderFoodHaystack(data: Record<string, unknown>): string {
  return [
    typeof data.foodName === 'string' ? data.foodName : '',
    typeof data.restaurantName === 'string' ? data.restaurantName : '',
    typeof data.title === 'string' ? data.title : '',
    typeof data.mealType === 'string' ? data.mealType : '',
    typeof data.itemsSummary === 'string' ? data.itemsSummary : '',
    typeof data.location === 'string' ? data.location : '',
  ]
    .join(' ')
    .trim();
}

function foodsAlign(userFood: string, haystack: string): boolean {
  const u = normalizeFood(userFood);
  const h = normalizeFood(haystack);
  if (!u) return true;
  if (h.includes(u)) return true;
  const tokens = u.split(' ').filter((t) => t.length > 2);
  return tokens.some((t) => h.includes(t));
}

function distanceMeters(
  user: Pick<GrowthMatchUser, 'lat' | 'lng'>,
  point: { lat: number; lng: number } | null,
): number | null {
  if (!point) return null;
  const a = { latitude: user.lat, longitude: user.lng };
  const b = { latitude: point.lat, longitude: point.lng };
  const d = getDistance(a, b);
  return Number.isFinite(d) ? d : null;
}

function distanceScore(distanceMetersVal: number | null): number {
  if (distanceMetersVal == null) return 8;
  const cap = GROWTH_MATCH_RADIUS_KM * 1000;
  if (distanceMetersVal > cap) return 0;
  return Math.round(30 * (1 - distanceMetersVal / cap));
}

async function resolveOrderAnchorPoint(
  data: Record<string, unknown>,
): Promise<{ lat: number; lng: number } | null> {
  const latRaw =
    typeof data.latitude === 'number'
      ? data.latitude
      : typeof data.lat === 'number'
        ? data.lat
        : null;
  const lngRaw =
    typeof data.longitude === 'number'
      ? data.longitude
      : typeof data.lng === 'number'
        ? data.lng
        : null;
  if (
    latRaw != null &&
    lngRaw != null &&
    Number.isFinite(latRaw) &&
    Number.isFinite(lngRaw)
  ) {
    return { lat: latRaw, lng: lngRaw };
  }
  const anchor =
    (typeof data.hostId === 'string' && data.hostId) ||
    (typeof data.createdBy === 'string' && data.createdBy) ||
    '';
  if (!anchor) return null;
  try {
    const snap = await getDoc(doc(db, 'users', anchor));
    if (!snap.exists()) return null;
    const loc = mapRawUserDocument(
      anchor,
      snap.data() as Record<string, unknown>,
    ).location;
    return loc;
  } catch {
    return null;
  }
}

async function generateAiSuggestion(
  userFood: string,
  matches: Order[],
): Promise<string> {
  const key = openAiApiKey();
  if (!key) {
    if (matches.length === 0) {
      return 'No nearby matches right now — try Swipe or widen your search area.';
    }
    const top = matches[0]?.foodName ?? 'food';
    return `Found ${matches.length} nearby option(s) for ${userFood || 'you'} — top pick: ${top}. Tap an order below to join.`;
  }
  try {
    const client = new OpenAI({
      apiKey: key,
      dangerouslyAllowBrowser: true,
    });
    const lines = matches
      .slice(0, 5)
      .map(
        (m, i) =>
          `${i + 1}. ${m.restaurantName || m.foodName} (~${m.distanceMeters != null ? `${Math.round(m.distanceMeters)}m` : '?'} )`,
      )
      .join('\n');
    const res = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'You help people split food orders. One short friendly sentence (max 220 chars), no markdown, suggest the best nearby pick.',
        },
        {
          role: 'user',
          content: `User wants: ${userFood || 'something to eat'}.\nNearby:\n${lines || 'none'}`,
        },
      ],
      max_tokens: 120,
      temperature: 0.6,
    });
    const text = res.choices[0]?.message?.content?.trim();
    if (text) return text;
  } catch (e) {
    console.warn('[matchingEngine] OpenAI failed', e);
  }
  return matches.length > 0
    ? `Nearby: ${matches[0].restaurantName || matches[0].foodName} is your closest match.`
    : 'Try again soon for more local matches.';
}

/**
 * Returns ranked nearby orders and optional AI blurb.
 * Does not throw: failures yield empty list + safe `aiText`.
 */
export async function getSmartMatches(
  user: GrowthMatchUser,
): Promise<SmartMatchesResult> {
  if (
    !Number.isFinite(user.lat) ||
    !Number.isFinite(user.lng) ||
    (user.lat === 0 && user.lng === 0)
  ) {
    return {
      aiText: 'Turn on location to see smart nearby matches.',
      nearbyOrders: [],
    };
  }

  try {
    const q = query(
      collection(db, 'orders'),
      where('status', 'in', [...ACTIVE_STATUSES]),
      limit(GROWTH_ORDER_SCAN_LIMIT),
    );
    const snap = await getDocs(q);
    const now = Date.now();
    const radiusM = GROWTH_MATCH_RADIUS_KM * 1000;

    type Row = SmartMatchOrder & {
      haystack: string;
      point: { lat: number; lng: number } | null;
    };

    const rows = await Promise.all(
      snap.docs.map(async (d): Promise<Row | null> => {
        const data = d.data() as Record<string, unknown>;
        const exp =
          typeof data.expiresAt === 'number' ? data.expiresAt : null;
        if (exp != null && exp <= now) return null;

        const haystack = orderFoodHaystack(data);
        if (!foodsAlign(user.food, haystack)) return null;

        const uid = typeof data.createdBy === 'string' ? data.createdBy : '';
        if (user.uid && uid && uid === user.uid) return null;

        const point = await resolveOrderAnchorPoint(data);
        const dist = distanceMeters(user, point);
        if (dist != null && dist > radiusM) return null;

        const foodName =
          typeof data.foodName === 'string' && data.foodName.trim()
            ? data.foodName.trim()
            : typeof data.title === 'string'
              ? data.title.trim()
              : 'Order';
        const restaurantName =
          typeof data.restaurantName === 'string' && data.restaurantName.trim()
            ? data.restaurantName.trim()
            : typeof data.location === 'string'
              ? data.location
              : foodName;

        const foodScore = 50;
        const score = foodScore + distanceScore(dist);

        return {
          id: d.id,
          score,
          distanceMeters: dist,
          foodName,
          restaurantName,
          status: typeof data.status === 'string' ? data.status : undefined,
          anchorUserId:
            (typeof data.hostId === 'string' && data.hostId) ||
            (typeof data.createdBy === 'string' && data.createdBy) ||
            undefined,
          haystack,
          point,
        };
      }),
    );

    const candidates = rows.filter((x): x is Row => x != null);

    candidates.sort((a, b) => b.score - a.score);
    const top = candidates.slice(0, 12).map(({ haystack: _h, point: _p, ...rest }) => rest);
    const aiText = await generateAiSuggestion(user.food, top);
    return { aiText, nearbyOrders: top };
  } catch (e) {
    console.warn('[matchingEngine] getSmartMatches', e);
    return {
      aiText: 'Matches are temporarily unavailable. Try again in a moment.',
      nearbyOrders: [],
    };
  }
}
