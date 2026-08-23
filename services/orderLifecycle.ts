import {
  Timestamp,
  arrayRemove,
  arrayUnion,
  deleteField,
  doc,
  runTransaction,
  serverTimestamp,
  type Firestore,
} from 'firebase/firestore';

/** Legacy per-user join window when `orders.expiresAt` is not set (`joinedAtMap[uid]`). */
export const ORDER_JOIN_WINDOW_MS = 45 * 60 * 1000;

/** Order-level expiry: 60 minutes after the first join (host → first joiner). Stored in `orders.expiresAt`. */
export const ORDER_EXPIRY_AFTER_FIRST_JOIN_MS = 60 * 60 * 1000;

function orderExpiryUnset(d: Record<string, unknown>): boolean {
  const exp = d.expiresAt;
  if (exp == null) return true;
  if (typeof exp === 'number' && Number.isFinite(exp) && exp > 0) return false;
  if (
    typeof exp === 'object' &&
    exp !== null &&
    typeof (exp as { toMillis?: () => number }).toMillis === 'function'
  ) {
    return false;
  }
  return true;
}

/** Canonical membership: `orders.participants` is `string[]` only. */
export function normalizeParticipantsStrings(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === 'string' && x.length > 0);
}

export function parseJoinedAtMs(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'object' && v !== null && 'toMillis' in v) {
    const fn = (v as { toMillis?: () => number }).toMillis;
    if (typeof fn === 'function') return fn.call(v);
  }
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  return null;
}

export function getJoinedAtMsForUser(
  joinedAtMap: unknown,
  uid: string,
): number | null {
  if (!joinedAtMap || typeof joinedAtMap !== 'object') return null;
  const v = (joinedAtMap as Record<string, unknown>)[uid];
  return parseJoinedAtMs(v);
}

export function remainingMsAfterJoin(
  joinedAtMs: number | null,
  now: number,
): number | null {
  if (joinedAtMs == null) return null;
  return ORDER_JOIN_WINDOW_MS - (now - joinedAtMs);
}

export type LifecycleDisplayStatus =
  | 'waiting'
  | 'matched'
  | 'active'
  | 'expired'
  | 'cancelled'
  | 'completed';

export function deriveLifecycleForViewer(input: {
  uid: string;
  createdBy: string;
  participants: string[];
  joinedAtMap: unknown;
  orderStatus: string;
  now: number;
}): {
  lifecycle: LifecycleDisplayStatus;
  remainingMs: number | null;
  joinedAtMs: number | null;
} {
  const { uid, createdBy, participants, joinedAtMap, orderStatus, now } = input;
  const st = orderStatus.trim().toLowerCase();
  if (st === 'cancelled') {
    return {
      lifecycle: 'cancelled',
      remainingMs: null,
      joinedAtMs: null,
    };
  }
  if (st === 'completed') {
    return {
      lifecycle: 'completed',
      remainingMs: null,
      joinedAtMs: null,
    };
  }
  if (st === 'expired') {
    return {
      lifecycle: 'expired',
      remainingMs: null,
      joinedAtMs: null,
    };
  }
  if (st === 'waiting') {
    return {
      lifecycle: 'waiting',
      remainingMs: null,
      joinedAtMs: null,
    };
  }
  if (st === 'matched') {
    return {
      lifecycle: 'matched',
      remainingMs: null,
      joinedAtMs: null,
    };
  }
  if (st === 'active') {
    if (
      participants.includes(uid) &&
      participants.length === 1 &&
      uid === createdBy
    ) {
      return {
        lifecycle: 'waiting',
        remainingMs: null,
        joinedAtMs: null,
      };
    }
    return {
      lifecycle: 'active',
      remainingMs: null,
      joinedAtMs: null,
    };
  }
  const joinedAtMs = getJoinedAtMsForUser(joinedAtMap, uid);
  const rem = remainingMsAfterJoin(joinedAtMs, now);

  if (joinedAtMs != null && rem != null && rem <= 0) {
    return { lifecycle: 'expired', remainingMs: rem, joinedAtMs };
  }

  if (participants.includes(uid)) {
    if (joinedAtMs == null) {
      const onlyHost =
        participants.length === 1 && participants[0] === createdBy;
      const isCreator = uid === createdBy;
      if (isCreator && onlyHost) {
        return { lifecycle: 'waiting', remainingMs: null, joinedAtMs: null };
      }
      return { lifecycle: 'active', remainingMs: null, joinedAtMs: null };
    }
    return {
      lifecycle: 'active',
      remainingMs: rem,
      joinedAtMs,
    };
  }

  return { lifecycle: 'waiting', remainingMs: null, joinedAtMs: null };
}

export function formatOrderCountdown(remainingMs: number): string {
  if (remainingMs <= 0) return '⏱ 0 min left';
  const mins = Math.ceil(remainingMs / 60000);
  return `⏱ ${mins} min left`;
}

export type JoinOrderParticipantExtras = {
  status?: string;
  user2Id?: string;
  user2Name?: string;
};

export type JoinOrderWithParticipantOptions = {
  requireOpenForJoin?: boolean;
  resolveStatus?: (
    nextParticipantCount: number,
    maxPeople: number,
  ) => string | undefined;
};

/**
 * Join: `participants: arrayUnion(uid)` and `joinedAtMap.{uid}: serverTimestamp()`.
 * Idempotent if uid already in `participants` (backfills `joinedAtMap` only when missing).
 */
export async function joinOrderWithParticipantRecord(
  firestore: Firestore,
  orderId: string,
  uid: string,
  extras: JoinOrderParticipantExtras = {},
  options: JoinOrderWithParticipantOptions = {},
): Promise<void> {
  const trimmed = orderId.trim();
  if (!trimmed) throw new Error('Invalid order.');
  const orderRef = doc(firestore, 'orders', trimmed);

  await runTransaction(firestore, async (tx) => {
    const snap = await tx.get(orderRef);
    if (!snap.exists()) throw new Error('Order no longer exists.');
    const d = snap.data() as Record<string, unknown>;
    if (options.requireOpenForJoin && d.status !== 'open') {
      throw new Error('Order is not open');
    }
    const parts = normalizeParticipantsStrings(d.participants);
    const maxPeople =
      typeof d.maxPeople === 'number'
        ? d.maxPeople
        : typeof d.maxParticipants === 'number'
          ? d.maxParticipants
          : 2;

    if (parts.includes(uid)) {
      const jm = d.joinedAtMap as Record<string, unknown> | undefined;
      if (jm && parseJoinedAtMs(jm[uid]) != null) return;
      tx.update(orderRef, {
        [`joinedAtMap.${uid}`]: serverTimestamp(),
      });
      return;
    }

    if (parts.length >= maxPeople) {
      throw new Error('Order is already full.');
    }

    const resolved = options.resolveStatus?.(parts.length + 1, maxPeople);
    const statusPatch =
      resolved !== undefined ? { status: resolved } : {};

    const patch: Record<string, unknown> = {
      participants: arrayUnion(uid),
      [`joinedAtMap.${uid}`]: serverTimestamp(),
      ...extras,
      ...statusPatch,
    };

    const isFirstJoinWindow =
      parts.length <= 1 && orderExpiryUnset(d);
    if (isFirstJoinWindow) {
      patch.startedAt = serverTimestamp();
      patch.expiresAt = Timestamp.fromMillis(
        Date.now() + ORDER_EXPIRY_AFTER_FIRST_JOIN_MS,
      );
    }

    tx.update(orderRef, patch);
  });

  console.log('[joinOrderWithParticipantRecord] done', {
    orderId: trimmed,
    uid,
  });
}

export type LeaveOrderPlan =
  | { kind: 'already_left' }
  | { kind: 'cancel_half'; fields: Record<string, unknown> }
  | { kind: 'leave_participants'; fields: Record<string, unknown> };

/**
 * HalfOrder membership is `users` (capacity / match). A participants-only leave
 * leaves a ghost uid in `users`, so the pair stays full and nobody else can join.
 * Joiner leave must cancel the pair (same as `cancelHalfOrder`).
 */
export function planLeaveOrder(
  data: Record<string, unknown>,
  uid: string,
  options?: { cancelReason?: string },
): LeaveOrderPlan {
  const cardId = typeof data.cardId === 'string' ? data.cardId.trim() : '';
  const users = normalizeParticipantsStrings(data.users);
  const parts = normalizeParticipantsStrings(data.participants);
  const status = typeof data.status === 'string' ? data.status : '';

  if (cardId) {
    if (status === 'cancelled' || status === 'completed' || status === 'expired') {
      return { kind: 'already_left' };
    }
    if (!users.includes(uid) && !parts.includes(uid)) {
      throw new Error('Not in order');
    }
    return {
      kind: 'cancel_half',
      fields: {
        status: 'cancelled',
        cancelledBy: uid,
        cancelReason: options?.cancelReason ?? 'user',
        cancelledAt: serverTimestamp(),
      },
    };
  }

  if (!parts.includes(uid)) {
    throw new Error('Not in order');
  }

  const fields: Record<string, unknown> = {
    participants: arrayRemove(uid),
    [`joinedAtMap.${uid}`]: deleteField(),
  };
  const maxPeople = Number(data.maxPeople ?? data.maxParticipants ?? 2);
  if (status === 'closed' && parts.length - 1 < maxPeople) {
    fields.status = 'open';
  }
  return { kind: 'leave_participants', fields };
}

export async function leaveOrderParticipant(
  firestore: Firestore,
  orderId: string,
  uid: string,
): Promise<void> {
  const trimmed = orderId.trim();
  if (!trimmed) throw new Error('Invalid order.');
  const orderRef = doc(firestore, 'orders', trimmed);

  await runTransaction(firestore, async (tx) => {
    const snap = await tx.get(orderRef);
    if (!snap.exists()) throw new Error('Order no longer exists.');
    const d = snap.data() as Record<string, unknown>;
    const plan = planLeaveOrder(d, uid);
    if (plan.kind === 'already_left') return;
    tx.update(orderRef, plan.fields);
  });
}

export async function ensureParticipantRecordForUid(
  firestore: Firestore,
  orderId: string,
  uid: string,
): Promise<void> {
  await joinOrderWithParticipantRecord(firestore, orderId, uid, {});
}
