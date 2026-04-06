/**
 * Firestore `users/{userId}` reads for order denormalization and profile UI.
 */
import { doc, getDoc } from 'firebase/firestore';

import { db } from '@/services/firebase';

export type PublicUserFields = {
  userId: string;
  name: string;
  /** Mirrors `displayName` / name on `users/{uid}` for assistant context. */
  email: string | null;
  avatar: string | null;
  phone: string | null;
  expoPushToken: string | null;
  location: { lat: number; lng: number } | null;
};

function parseLocation(d: Record<string, unknown>): { lat: number; lng: number } | null {
  const loc = d.location;
  if (loc && typeof loc === 'object' && loc !== null) {
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
    if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
      return { lat, lng };
    }
  }
  return null;
}

function resolveName(d: Record<string, unknown>): string {
  const n =
    (typeof d.displayName === 'string' && d.displayName.trim()
      ? d.displayName.trim()
      : '') ||
    (typeof d.name === 'string' && d.name.trim() ? d.name.trim() : '');
  const email = typeof d.email === 'string' ? d.email.trim() : '';
  const local = email.includes('@') ? (email.split('@')[0]?.trim() ?? '') : '';
  return n || local || 'Someone';
}

function resolveAvatar(d: Record<string, unknown>): string | null {
  const a =
    (typeof d.photo === 'string' && d.photo.trim() ? d.photo.trim() : '') ||
    (typeof d.avatar === 'string' && d.avatar.trim() ? d.avatar.trim() : '') ||
    (typeof d.photoURL === 'string' && d.photoURL.trim() ? d.photoURL.trim() : '');
  if (/^https?:\/\//i.test(a) && a.length < 2000) return a;
  return null;
}

function resolveExpoToken(d: Record<string, unknown>): string | null {
  const t =
    typeof d.expoPushToken === 'string' && d.expoPushToken.trim()
      ? d.expoPushToken.trim()
      : typeof d.pushToken === 'string' && d.pushToken.trim()
        ? d.pushToken.trim()
        : typeof d.fcmToken === 'string' && d.fcmToken.trim()
          ? d.fcmToken.trim()
          : '';
  return t || null;
}

export function mapRawUserDocument(
  userId: string,
  d: Record<string, unknown>,
): PublicUserFields {
  const phoneRaw = typeof d.phone === 'string' ? d.phone.trim() : '';
  const emailRaw = typeof d.email === 'string' ? d.email.trim() : '';
  return {
    userId: userId.trim(),
    name: resolveName(d),
    email: emailRaw || null,
    avatar: resolveAvatar(d),
    phone: phoneRaw || null,
    expoPushToken: resolveExpoToken(d),
    location: parseLocation(d),
  };
}

/** Snapshot of fields stored on orders as `host` / `participants[]`. */
export async function getPublicUserFields(
  userId: string,
): Promise<PublicUserFields | null> {
  const uid = userId.trim();
  if (!uid) return null;

  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return null;

  return mapRawUserDocument(uid, snap.data() as Record<string, unknown>);
}
