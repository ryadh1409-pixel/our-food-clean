/**
 * HalfOrder: join a shared Firestore order (modular SDK).
 * Uses a transaction + arrayUnion(usersJoined) for atomic, duplicate-safe joins,
 * and appends a user object to the `users` array (full replacement; not arrayUnion on maps).
 */
import {
  arrayUnion,
  doc,
  getDoc,
  increment,
  runTransaction,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';

import { isUserBanned } from '@/services/adminGuard';
import { hasBlockBetween } from '@/services/blocks';
import { auth, db } from '@/services/firebase';

export type OrderMemberUser = {
  uid: string;
  displayName: string;
  photoURL?: string | null;
  joinedAt?: unknown;
};

function normalizeUsersFromDoc(data: Record<string, unknown>): OrderMemberUser[] {
  const joined = Array.isArray(data.usersJoined)
    ? (data.usersJoined as unknown[]).filter((u): u is string => typeof u === 'string')
    : [];
  const rawUsers = Array.isArray(data.users) ? (data.users as Record<string, unknown>[]) : [];

  if (rawUsers.length === joined.length) {
    return rawUsers.map((u, i) => ({
      uid: typeof u?.uid === 'string' ? u.uid : joined[i] ?? '',
      displayName: typeof u?.displayName === 'string' ? u.displayName : '',
      photoURL: typeof u?.photoURL === 'string' ? u.photoURL : null,
      joinedAt: u?.joinedAt ?? null,
    }));
  }

  return joined.map((uid) => ({
    uid,
    displayName: '',
    photoURL: null,
    joinedAt: null,
  }));
}

/**
 * Join the current user to `orders/{orderId}`.
 * @throws Error with a user-facing message on failure
 */
export async function joinOrder(orderId: string): Promise<void> {
  const trimmedId = orderId?.trim();
  if (!trimmedId) {
    throw new Error('Invalid order.');
  }

  const user = auth.currentUser;
  if (!user?.uid) {
    throw new Error('You must be signed in to join an order.');
  }
  const uid = user.uid;

  if (await isUserBanned(uid)) {
    throw new Error('Your account has been restricted. You cannot join orders.');
  }

  const orderRef = doc(db, 'orders', trimmedId);
  const preSnap = await getDoc(orderRef);
  if (!preSnap.exists()) {
    throw new Error('Order not found.');
  }

  const preData = preSnap.data() as Record<string, unknown>;
  const createdBy = typeof preData.createdBy === 'string' ? preData.createdBy : '';
  if (createdBy && createdBy !== uid) {
    if (await hasBlockBetween(uid, createdBy)) {
      throw new Error('You cannot join this order due to a block.');
    }
  }

  const displayName =
    user.displayName || user.email?.split('@')[0] || 'User';
  const photoURL = user.photoURL ?? null;

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(orderRef);
    if (!snap.exists()) {
      throw new Error('Order no longer exists.');
    }
    const d = snap.data() as Record<string, unknown>;
    const peopleJoined = Number(d?.peopleJoined ?? 1);
    const maxPeople = Number(d?.maxPeople ?? 2);
    const usersJoined = Array.isArray(d?.usersJoined)
      ? (d.usersJoined as unknown[]).filter((x): x is string => typeof x === 'string')
      : [];

    if (usersJoined.includes(uid)) {
      throw new Error('You already joined this order.');
    }
    if (peopleJoined >= maxPeople) {
      throw new Error('Order is already full.');
    }

    const existingUsers = normalizeUsersFromDoc(d);
    const nextUsers: Record<string, unknown>[] = [
      ...existingUsers.map((u) => ({
        uid: u.uid,
        displayName: u.displayName,
        photoURL: u.photoURL ?? null,
        ...(u.joinedAt != null ? { joinedAt: u.joinedAt } : {}),
      })),
      {
        uid,
        displayName,
        photoURL,
        joinedAt: serverTimestamp(),
      },
    ];

    tx.update(orderRef, {
      peopleJoined: increment(1),
      usersJoined: arrayUnion(uid),
      users: nextUsers,
    });
  });

  await setDoc(
    doc(db, 'orders', trimmedId, 'joins', uid),
    { userId: uid, joinedAt: serverTimestamp() },
    { merge: true },
  ).catch(() => {});

  await setDoc(
    doc(db, 'users', uid, 'joinedOrders', trimmedId),
    { orderId: trimmedId, joinedAt: serverTimestamp() },
    { merge: true },
  ).catch(() => {});

  console.info('[joinOrder] success', { orderId: trimmedId, uid });
}
