import {
  arrayRemove,
  arrayUnion,
  deleteField,
  doc,
  runTransaction,
  serverTimestamp,
  type Firestore,
} from 'firebase/firestore';

/** 45-minute window after a user joins (`joinedAtMap[uid]`). */
export const ORDER_JOIN_WINDOW_MS = 45 * 60 * 1000;

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

    tx.update(orderRef, {
      participants: arrayUnion(uid),
      [`joinedAtMap.${uid}`]: serverTimestamp(),
      ...extras,
      ...statusPatch,
    });
  });

  console.log('[joinOrderWithParticipantRecord] done', {
    orderId: trimmed,
    uid,
  });
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
    const parts = normalizeParticipantsStrings(d.participants);
    if (!parts.includes(uid)) {
      throw new Error('Not in order');
    }

    const patch: Record<string, unknown> = {
      participants: arrayRemove(uid),
      [`joinedAtMap.${uid}`]: deleteField(),
    };

    const currentStatus = typeof d.status === 'string' ? d.status : 'open';
    const maxPeople = Number(d.maxPeople ?? d.maxParticipants ?? 2);
    if (currentStatus === 'closed' && parts.length - 1 < maxPeople) {
      patch.status = 'open';
    }

    tx.update(orderRef, patch);
  });
}

export async function ensureParticipantRecordForUid(
  firestore: Firestore,
  orderId: string,
  uid: string,
): Promise<void> {
  await joinOrderWithParticipantRecord(firestore, orderId, uid, {});
}
