/**
 * Order document shapes: `host`, `participants[]` (denormalized from `users`).
 */
import {
  arrayUnion,
  type DocumentData,
  serverTimestamp,
  type Timestamp,
} from 'firebase/firestore';

import { ORDER_STATUS } from '@/constants/orderStatus';
import { getPublicUserFields, type PublicUserFields } from '@/services/users';

export type OrderHost = {
  userId: string;
  name: string;
  avatar: string | null;
  phone: string | null;
  expoPushToken: string | null;
};

export type OrderParticipant = OrderHost & {
  /** Prefer `orders.joinedAtMap[uid]`; optional on legacy embedded rows. */
  joinedAt?: Timestamp | null;
  location: { lat: number; lng: number } | null;
};

export function publicUserToOrderHost(u: PublicUserFields): OrderHost {
  return {
    userId: u.userId,
    name: u.name,
    avatar: u.avatar,
    phone: u.phone,
    expoPushToken: u.expoPushToken,
  };
}

/** Hydrate order UI when `participants` are uid strings and `users` holds membership. */
export function publicUserFieldsToOrderParticipant(
  u: PublicUserFields,
): OrderParticipant {
  return {
    userId: u.userId,
    name: u.name,
    avatar: u.avatar,
    phone: u.phone,
    expoPushToken: u.expoPushToken,
    location: u.location,
  };
}

/**
 * Rich participant row for `orders.participants` (no `joinedAt` — Firestore forbids
 * `serverTimestamp()` inside array elements; use `joinedAtMap.{userId}` instead).
 */
export function publicUserToOrderParticipantWrite(
  u: PublicUserFields,
): Record<string, unknown> {
  return {
    userId: u.userId,
    name: u.name,
    avatar: u.avatar,
    phone: u.phone,
    expoPushToken: u.expoPushToken,
    location: u.location,
  };
}

export async function loadHalfOrderCreatorProfiles(
  uid: string,
): Promise<{ host: OrderHost } | null> {
  const row = await getPublicUserFields(uid);
  if (!row) return null;
  return { host: publicUserToOrderHost(row) };
}

export async function loadJoiningParticipantPayload(
  uid: string,
): Promise<Record<string, unknown> | null> {
  const row = await getPublicUserFields(uid);
  if (!row) return null;
  return publicUserToOrderParticipantWrite(row);
}

/** Parse `participants` as rich objects or legacy string IDs. */
export function normalizeParticipantRecords(raw: unknown): OrderParticipant[] {
  if (!Array.isArray(raw)) return [];
  const out: OrderParticipant[] = [];
  for (const item of raw) {
    if (typeof item === 'string' && item.trim()) {
      out.push({
        userId: item.trim(),
        name: 'Member',
        avatar: null,
        phone: null,
        expoPushToken: null,
        location: null,
      });
      continue;
    }
    if (!item || typeof item !== 'object') continue;
    const p = item as Record<string, unknown>;
    const userId = typeof p.userId === 'string' ? p.userId.trim() : '';
    if (!userId) continue;
    const name =
      typeof p.name === 'string' && p.name.trim() ? p.name.trim() : 'Someone';
    const avatar =
      typeof p.avatar === 'string' && p.avatar.trim() ? p.avatar.trim() : null;
    const phone =
      typeof p.phone === 'string' && p.phone.trim() ? p.phone.trim() : null;
    const expoPushToken =
      typeof p.expoPushToken === 'string' && p.expoPushToken.trim()
        ? p.expoPushToken.trim()
        : null;
    let location: { lat: number; lng: number } | null = null;
    const loc = p.location;
    if (loc && typeof loc === 'object' && loc !== null) {
      const o = loc as Record<string, unknown>;
      const la = typeof o.lat === 'number' ? o.lat : null;
      const lo = typeof o.lng === 'number' ? o.lng : null;
      if (la != null && lo != null && Number.isFinite(la) && Number.isFinite(lo)) {
        location = { lat: la, lng: lo };
      }
    }
    out.push({
      userId,
      name,
      avatar,
      phone,
      expoPushToken,
      location,
      joinedAt: p.joinedAt as Timestamp | undefined,
    });
  }
  return out;
}

export function normalizeOrderUserIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of raw) {
    let id: string | null = null;
    if (typeof x === 'string' && x.trim()) id = x.trim();
    else if (x && typeof x === 'object') {
      const u = (x as Record<string, unknown>).userId;
      if (typeof u === 'string' && u.trim()) id = u.trim();
    }
    if (id && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

export type HalfOrderJoinPlan =
  | { kind: 'already_member' }
  | { kind: 'update'; fields: Record<string, unknown> };

/** True when `participants` is a Firestore list of plain user-id strings (no rich objects). */
function participantsArrayIsPlainStringUids(raw: unknown): boolean {
  if (!Array.isArray(raw)) return false;
  return raw.every((x) => typeof x === 'string' && x.trim().length > 0);
}

function withMatchedStatusWhenPair(
  fields: Record<string, unknown>,
  usersBeforeCount: number,
): Record<string, unknown> {
  if (usersBeforeCount >= 1 && usersBeforeCount + 1 >= 2) {
    return { ...fields, status: ORDER_STATUS.MATCHED };
  }
  return fields;
}

/**
 * Build Firestore `update` fields for HalfOrder join.
 * `participants` is **string[]** (userIds only); join times live in `joinedAtMap.{uid}`.
 */
export function planHalfOrderJoin(args: {
  orderData: Record<string, unknown>;
  joinerUid: string;
  orderMaxUsers: number;
  /** When `participants` empty and one user, pass loaded host profile (same uid as sole user). */
  hostProfileIfBootstrapping: PublicUserFields | null;
}): HalfOrderJoinPlan {
  const users = normalizeOrderUserIds(args.orderData.users);
  const partIds = normalizeOrderUserIds(args.orderData.participants);

  if (users.includes(args.joinerUid)) {
    return { kind: 'already_member' };
  }
  if (users.length >= args.orderMaxUsers) {
    throw new Error('Order is full');
  }

  if (partIds.length === 0 && users.length === 1) {
    const hp = args.hostProfileIfBootstrapping;
    if (!hp || hp.userId !== users[0]) {
      throw new Error('Host profile could not be loaded for this order.');
    }
    const host = publicUserToOrderHost(hp);
    const fields = {
      users: arrayUnion(args.joinerUid),
      participants: arrayUnion(users[0], args.joinerUid),
      host,
      [`joinedAtMap.${args.joinerUid}`]: serverTimestamp(),
    };
    return {
      kind: 'update',
      fields: withMatchedStatusWhenPair(fields, users.length),
    };
  }

  if (partIds.length === users.length) {
    const rawParts = args.orderData.participants;
    const participantWrite: Record<string, unknown> =
      participantsArrayIsPlainStringUids(rawParts)
        ? { participants: arrayUnion(args.joinerUid) }
        : {
            participants: [...users, args.joinerUid],
          };
    const fields = {
      users: arrayUnion(args.joinerUid),
      ...participantWrite,
      [`joinedAtMap.${args.joinerUid}`]: serverTimestamp(),
    };
    return {
      kind: 'update',
      fields: withMatchedStatusWhenPair(fields, users.length),
    };
  }

  throw new Error('Order data out of sync. Try again shortly.');
}

export function memberIdsFromOrderData(d: DocumentData | undefined): string[] {
  if (!d) return [];
  const ids = normalizeOrderUserIds(d.users);
  if (ids.length > 0) return ids;
  const parts = normalizeParticipantRecords(d.participants);
  return parts.map((p) => p.userId);
}

export function parseOrderHost(raw: unknown): OrderHost | null {
  if (!raw || typeof raw !== 'object') return null;
  const h = raw as Record<string, unknown>;
  const userId = typeof h.userId === 'string' ? h.userId.trim() : '';
  if (!userId) return null;
  return {
    userId,
    name: typeof h.name === 'string' && h.name.trim() ? h.name.trim() : 'Host',
    avatar:
      typeof h.avatar === 'string' && h.avatar.trim() ? h.avatar.trim() : null,
    phone: typeof h.phone === 'string' && h.phone.trim() ? h.phone.trim() : null,
    expoPushToken:
      typeof h.expoPushToken === 'string' && h.expoPushToken.trim()
        ? h.expoPushToken.trim()
        : null,
  };
}

export { arrayUnion };
