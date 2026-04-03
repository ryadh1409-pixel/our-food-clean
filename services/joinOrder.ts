/**
 * Join `orders/{orderId}` using `participants` + `joinedAtMap`, or HalfOrder `users` array.
 */
import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';

import { isUserBanned } from '@/services/adminGuard';
import { hasBlockBetween } from '@/services/blocks';
import {
  ensureHalfOrderChat,
  postHalfOrderChatSystemMessage,
} from '@/services/halfOrderChat';
import { auth, db } from '@/services/firebase';
import {
  memberIdsFromOrderData,
  normalizeOrderUserIds,
  normalizeParticipantRecords,
  planHalfOrderJoin,
  loadJoiningParticipantPayload,
} from '@/services/orders';
import { syncOrderMemberProfilesForOrder } from '@/services/orderMemberProfile';
import { trySendPairJoinExpoPush } from '@/services/orderPairPushNotify';
import { joinOrderWithParticipantRecord } from '@/services/orderLifecycle';
import { getPublicUserFields } from '@/services/users';

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

  for (const m of memberIdsFromOrderData(preSnap.data())) {
    if (m !== uid && (await hasBlockBetween(uid, m))) {
      throw new Error('You cannot join this order due to a block.');
    }
  }

  await joinOrderWithParticipantRecord(db, trimmedId, uid, {}, {
    requireOpenForJoin: false,
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

/**
 * Join a HalfOrder (`users` membership, linked to food cards with `cardId`).
 */
export async function joinHalfOrderByOrderId(orderId: string): Promise<{
  alreadyJoined: boolean;
  justBecamePair: boolean;
}> {
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
  const usersFirst = normalizeOrderUserIds(preData.users);
  if (usersFirst.length === 0) {
    throw new Error('Use the standard join flow for this order.');
  }

  for (const m of memberIdsFromOrderData(preSnap.data())) {
    if (m !== uid && (await hasBlockBetween(uid, m))) {
      throw new Error('You cannot join this order due to a block.');
    }
  }

  const joinerParticipant = await loadJoiningParticipantPayload(uid);
  if (!joinerParticipant) {
    throw new Error('Could not load your profile to join.');
  }

  let hostPrefetch: Awaited<ReturnType<typeof getPublicUserFields>> = null;
  const ppPre = normalizeParticipantRecords(preData.participants);
  if (ppPre.length === 0 && usersFirst.length === 1) {
    hostPrefetch = await getPublicUserFields(usersFirst[0]);
  }

  const txResult = await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(orderRef);
    if (!snap.exists()) throw new Error('Order no longer exists.');
    const d = snap.data() as Record<string, unknown>;
    const users = normalizeOrderUserIds(d.users);
    const maxPeople =
      typeof d.maxUsers === 'number' && d.maxUsers > 0 ? d.maxUsers : 2;
    let hostForPlan = hostPrefetch;
    const partsLive = normalizeParticipantRecords(d.participants);
    if (partsLive.length === 0 && users.length === 1 && !hostForPlan) {
      hostForPlan = await getPublicUserFields(users[0]);
    }
    const plan = planHalfOrderJoin({
      orderData: d,
      joinerUid: uid,
      joinerParticipant,
      orderMaxUsers: maxPeople,
      hostProfileIfBootstrapping: hostForPlan,
    });
    if (plan.kind === 'already_member') {
      return { tag: 'already' as const, priorCount: users.length };
    }
    transaction.update(orderRef, plan.fields);
    return { tag: 'added' as const, priorCount: users.length };
  });

  const postSnap = await getDoc(orderRef);
  const finalUsers = normalizeOrderUserIds(postSnap.data()?.users);
  await ensureHalfOrderChat(trimmedId, finalUsers);
  await syncOrderMemberProfilesForOrder(trimmedId, finalUsers);

  let justBecamePair = false;
  if (txResult.tag === 'added' && txResult.priorCount === 1 && finalUsers.length >= 2) {
    justBecamePair = true;
    await postHalfOrderChatSystemMessage(
      trimmedId,
      'Someone joined your order!',
    );
    void trySendPairJoinExpoPush(trimmedId, uid);
  }

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

  return {
    alreadyJoined: txResult.tag === 'already',
    justBecamePair,
  };
}
