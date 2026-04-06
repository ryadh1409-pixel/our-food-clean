/**
 * Denormalized HalfOrder member profiles: `orders/{orderId}/order_members/{userId}`.
 * Order doc keeps `users: string[]` for rules; rich fields live here only.
 */
import {
  doc,
  getDoc,
  setDoc,
  Timestamp,
} from 'firebase/firestore';

import { db } from '@/services/firebase';

export type OrderMemberLocation = { lat: number; lng: number };

export type OrderMemberProfileDoc = {
  userId: string;
  name: string;
  avatar: string | null;
  phone: string | null;
  pushToken: string | null;
  joinedAt: unknown;
  location: OrderMemberLocation | null;
};

function parseUserLocation(d: Record<string, unknown>): OrderMemberLocation | null {
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
    if (
      lat != null &&
      lng != null &&
      Number.isFinite(lat) &&
      Number.isFinite(lng)
    ) {
      return { lat, lng };
    }
  }
  const lat = d.latitude;
  const lng = d.longitude;
  if (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng)
  ) {
    return { lat, lng };
  }
  return null;
}

function resolveDisplayName(d: Record<string, unknown>): string {
  const fromName =
    (typeof d.name === 'string' && d.name.trim() ? d.name.trim() : '') ||
    (typeof d.displayName === 'string' && d.displayName.trim()
      ? d.displayName.trim()
      : '');
  const email = typeof d.email === 'string' ? d.email.trim() : '';
  const local = email.includes('@') ? (email.split('@')[0]?.trim() ?? '') : '';
  return fromName || local || 'Someone';
}

function resolveAvatar(d: Record<string, unknown>): string | null {
  const avatarRaw =
    (typeof d.photo === 'string' && d.photo.trim() ? d.photo.trim() : '') ||
    (typeof d.avatar === 'string' && d.avatar.trim() ? d.avatar.trim() : '') ||
    (typeof d.photoURL === 'string' && d.photoURL.trim()
      ? d.photoURL.trim()
      : '');
  if (/^https?:\/\//i.test(avatarRaw) && avatarRaw.length < 2000) return avatarRaw;
  return null;
}

function resolvePushToken(d: Record<string, unknown>): string | null {
  const f =
    typeof d.expoPushToken === 'string' && d.expoPushToken.trim()
      ? d.expoPushToken.trim()
      : '';
  const a =
    typeof d.pushToken === 'string' && d.pushToken.trim()
      ? d.pushToken.trim()
      : '';
  const b =
    typeof d.fcmToken === 'string' && d.fcmToken.trim()
      ? d.fcmToken.trim()
      : '';
  return f || a || b || null;
}

async function readPushTokenFromSubdocs(uid: string): Promise<string | null> {
  const subSnap = await getDoc(doc(db, 'users', uid, 'pushToken', 'default'));
  if (subSnap.exists()) {
    const t = subSnap.data()?.token;
    if (typeof t === 'string' && t.trim()) return t.trim();
  }
  const fcmSub = await getDoc(doc(db, 'users', uid, 'fcmToken', 'default'));
  if (fcmSub.exists()) {
    const t = fcmSub.data()?.token;
    if (typeof t === 'string' && t.trim()) return t.trim();
  }
  return null;
}

export async function syncOrderMemberProfile(
  orderId: string,
  userId: string,
): Promise<void> {
  const oid = orderId.trim();
  const uid = userId.trim();
  if (!oid || !uid) return;

  const uSnap = await getDoc(doc(db, 'users', uid));
  if (!uSnap.exists()) return;

  const d = uSnap.data() as Record<string, unknown>;
  let pushToken = resolvePushToken(d);
  if (!pushToken) {
    pushToken = await readPushTokenFromSubdocs(uid);
  }

  const phoneRaw = typeof d.phone === 'string' ? d.phone.trim() : '';
  const phone = phoneRaw || null;

  const profile: OrderMemberProfileDoc = {
    userId: uid,
    name: resolveDisplayName(d),
    avatar: resolveAvatar(d),
    phone,
    pushToken,
    joinedAt: Timestamp.now(),
    location: parseUserLocation(d),
  };

  await setDoc(doc(db, 'orders', oid, 'order_members', uid), profile, {
    merge: true,
  });
}

export async function syncOrderMemberProfilesForOrder(
  orderId: string,
  userIds: string[],
): Promise<void> {
  const unique = [...new Set(userIds.map((x) => x.trim()).filter(Boolean))];
  await Promise.all(unique.map((uid) => syncOrderMemberProfile(orderId, uid)));
}

export function mapOrderMemberSnap(
  id: string,
  data: Record<string, unknown>,
): OrderMemberProfileDoc {
  const locRaw = data.location;
  let location: OrderMemberLocation | null = null;
  if (locRaw && typeof locRaw === 'object' && locRaw !== null) {
    const o = locRaw as Record<string, unknown>;
    const la = typeof o.lat === 'number' ? o.lat : null;
    const lo = typeof o.lng === 'number' ? o.lng : null;
    if (la != null && lo != null && Number.isFinite(la) && Number.isFinite(lo)) {
      location = { lat: la, lng: lo };
    }
  }
  return {
    userId: typeof data.userId === 'string' && data.userId ? data.userId : id,
    name: typeof data.name === 'string' && data.name.trim() ? data.name.trim() : 'Someone',
    avatar:
      typeof data.avatar === 'string' && data.avatar.trim() ? data.avatar.trim() : null,
    phone: typeof data.phone === 'string' && data.phone.trim() ? data.phone.trim() : null,
    pushToken:
      typeof data.pushToken === 'string' && data.pushToken.trim()
        ? data.pushToken.trim()
        : null,
    joinedAt: data.joinedAt ?? null,
    location,
  };
}
