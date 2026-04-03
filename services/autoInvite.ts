/**
 * After an order is created, notify nearby users with matching food preference (Expo push).
 * Relies on `users/{id}.location` and optional `foodPreference` string.
 */
import { getDistance } from 'geolib';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
} from 'firebase/firestore';

import {
  GROWTH_AUTO_INVITE_USER_SCAN_LIMIT,
  GROWTH_MATCH_RADIUS_KM,
  GROWTH_NEARBY_FOOD_PUSH_TYPE,
} from '@/constants/growth';
import { db } from '@/services/firebase';
import { sendPushNotification } from '@/services/expoPushSend';
import { mapRawUserDocument } from '@/services/users';

export type AutoInviteOrderInput = {
  id: string;
  foodName?: string;
  /** Creator — excluded from targets. */
  creatorUid?: string;
  latitude?: number | null;
  longitude?: number | null;
};

const recentInviteByOrder = new Map<string, number>();
const DEDUPE_MS = 120_000;

function shouldDedupe(orderId: string): boolean {
  const t = recentInviteByOrder.get(orderId);
  if (t != null && Date.now() - t < DEDUPE_MS) return true;
  recentInviteByOrder.set(orderId, Date.now());
  return false;
}

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

function preferenceMatches(pref: string, food: string): boolean {
  const p = normalize(pref);
  const f = normalize(food);
  if (!p || !f) return true;
  if (p.includes(f) || f.includes(p)) return true;
  return p.split(/\s+/).some((w) => w.length > 2 && f.includes(w));
}

function resolveFoodName(
  data: Record<string, unknown> | undefined,
  fallback: string,
): string {
  if (!data) return fallback;
  const n =
    (typeof data.foodName === 'string' && data.foodName.trim()
      ? data.foodName.trim()
      : '') ||
    (typeof data.restaurantName === 'string' && data.restaurantName.trim()
      ? data.restaurantName.trim()
      : '') ||
    fallback;
  return n || 'طعام';
}

function parseUserFoodPreference(d: Record<string, unknown>): string {
  const raw =
    (typeof d.foodPreference === 'string' && d.foodPreference.trim()
      ? d.foodPreference
      : '') ||
    (typeof d.favoriteFood === 'string' && d.favoriteFood.trim()
      ? d.favoriteFood
      : '') ||
    '';
  return raw;
}

/**
 * Loads latest order snapshot if only `id` is known; sends regional invites.
 */
export async function autoInvite(input: AutoInviteOrderInput): Promise<void> {
  const oid = input.id?.trim();
  if (!oid || shouldDedupe(oid)) return;

  let food = input.foodName?.trim() || '';
  let lat =
    typeof input.latitude === 'number' ? input.latitude : null;
  let lng =
    typeof input.longitude === 'number' ? input.longitude : null;
  let creator = input.creatorUid?.trim() || '';

  try {
    const snap = await getDoc(doc(db, 'orders', oid));
    if (!snap.exists()) return;
    const data = snap.data() as Record<string, unknown>;
    if (!food) food = resolveFoodName(data, 'طعام');

    if (lat == null || lng == null) {
      const la =
        typeof data.latitude === 'number'
          ? data.latitude
          : typeof data.lat === 'number'
            ? data.lat
            : null;
      const lo =
        typeof data.longitude === 'number'
          ? data.longitude
          : typeof data.lng === 'number'
            ? data.lng
            : null;
      if (la != null && lo != null) {
        lat = la;
        lng = lo;
      }
    }

    if (!creator) {
      creator =
        (typeof data.createdBy === 'string' && data.createdBy) ||
        (typeof data.hostId === 'string' && data.hostId) ||
        '';
    }

    if (lat == null || lng == null) {
      if (creator) {
        const uSnap = await getDoc(doc(db, 'users', creator));
        if (uSnap.exists()) {
          const loc = mapRawUserDocument(
            creator,
            uSnap.data() as Record<string, unknown>,
          ).location;
          if (loc) {
            lat = loc.lat;
            lng = loc.lng;
          }
        }
      }
    }

    if (lat == null || lng == null) {
      console.warn('[autoInvite] skip: no coordinates for order', oid);
      return;
    }

    const origin = { latitude: lat, longitude: lng };
    const radiusM = GROWTH_MATCH_RADIUS_KM * 1000;

    const q = query(
      collection(db, 'users'),
      limit(GROWTH_AUTO_INVITE_USER_SCAN_LIMIT),
    );
    const usersSnap = await getDocs(q);

    for (const u of usersSnap.docs) {
      const uid = u.id;
      if (creator && uid === creator) continue;

      const raw = u.data() as Record<string, unknown>;
      const pref = parseUserFoodPreference(raw);
      if (!pref.trim()) continue;
      if (!preferenceMatches(pref, food)) continue;

      const row = mapRawUserDocument(uid, raw);
      if (!row.location) continue;

      const dist = getDistance(origin, {
        latitude: row.location.lat,
        longitude: row.location.lng,
      });
      if (!Number.isFinite(dist) || dist > radiusM) continue;

      const token = row.expoPushToken;
      const title = '🔥 Food Match قريب منك!';
      const body = `${food} متوفر الآن`;

      await sendPushNotification(token, title, body, {
        type: GROWTH_NEARBY_FOOD_PUSH_TYPE,
        orderId: oid,
      });
    }
  } catch (e) {
    console.warn('[autoInvite] failed', e);
  }
}
