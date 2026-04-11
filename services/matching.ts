/**
 * Split-order social matching: Firestore `users` + Haversine distance (2km).
 */
import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';

import { db } from '@/services/firebase';

export const SPLIT_MAX_DISTANCE_M = 2000;

export type MatchUserInput = {
  id: string;
  preferredFood: string;
  location: { lat: number; lng: number };
};

export type SplitMatchCandidate = {
  id: string;
  name: string;
  distanceMeters: number;
  preferredFood: string;
  location: { lat: number; lng: number };
};

/** Haversine distance in meters (Earth radius 6371000m). */
export function haversineDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function parseUserLocation(data: Record<string, unknown>): {
  lat: number;
  lng: number;
} | null {
  const loc = data.location;
  if (!loc || typeof loc !== 'object') return null;
  const o = loc as Record<string, unknown>;
  const lat =
    typeof o.lat === 'number'
      ? o.lat
      : typeof o.latitude === 'number'
        ? o.latitude
        : null;
  const lng =
    typeof o.lng === 'number'
      ? o.lng
      : typeof o.longitude === 'number'
        ? o.longitude
        : null;
  if (
    lat != null &&
    lng != null &&
    Number.isFinite(lat) &&
    Number.isFinite(lng)
  ) {
    return { lat, lng };
  }
  return null;
}

function resolveName(data: Record<string, unknown>): string {
  const n =
    (typeof data.displayName === 'string' && data.displayName.trim()
      ? data.displayName.trim()
      : '') ||
    (typeof data.name === 'string' && data.name.trim()
      ? data.name.trim()
      : '');
  return n || 'Someone nearby';
}

/**
 * Find closest other user also looking to split same food, within 2km.
 * Requires composite index: users (isLookingToSplit ASC, preferredFood ASC).
 */
export async function findMatch(
  currentUser: MatchUserInput,
): Promise<SplitMatchCandidate | null> {
  const food = currentUser.preferredFood.trim().toLowerCase();
  if (!food || !currentUser.id) return null;

  const qRef = query(
    collection(db, 'users'),
    where('isLookingToSplit', '==', true),
    where('preferredFood', '==', food),
  );

  const snapshot = await getDocs(qRef);

  let best: SplitMatchCandidate | null = null;
  let bestD = Infinity;

  snapshot.forEach((d) => {
    const uid = d.id;
    if (uid === currentUser.id) return;

    const data = d.data() as Record<string, unknown>;
    const loc = parseUserLocation(data);
    if (!loc) return;

    const dist = haversineDistanceMeters(
      currentUser.location.lat,
      currentUser.location.lng,
      loc.lat,
      loc.lng,
    );

    if (dist >= SPLIT_MAX_DISTANCE_M) return;

    if (dist < bestD) {
      bestD = dist;
      best = {
        id: uid,
        name: resolveName(data),
        distanceMeters: dist,
        preferredFood: food,
        location: loc,
      };
    }
  });

  return best;
}

/** Mark user as open to splitting; updates location + lastActive for matching. */
export async function setUserLookingToSplit(
  uid: string,
  preferredFood: string,
  location: { lat: number; lng: number },
): Promise<void> {
  const food = preferredFood.trim().toLowerCase();
  await setDoc(
    doc(db, 'users', uid),
    {
      isLookingToSplit: true,
      preferredFood: food,
      lastActive: serverTimestamp(),
      location: { lat: location.lat, lng: location.lng },
    },
    { merge: true },
  );
}

/** Clear own split flag (after join or ignore). */
export async function clearUserSplitMatching(uid: string): Promise<void> {
  await setDoc(
    doc(db, 'users', uid),
    {
      isLookingToSplit: false,
      lastActive: serverTimestamp(),
    },
    { merge: true },
  );
}

/**
 * Notify peer their match was consumed — their client listens on `splitPoke` and clears flags.
 */
export async function pokePeerClearSplitMatch(
  peerUid: string,
  fromUid: string,
): Promise<void> {
  await setDoc(doc(db, 'users', peerUid, 'splitPoke', fromUid), {
    fromUid,
    at: serverTimestamp(),
  });
}

export function formatSplitDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}
