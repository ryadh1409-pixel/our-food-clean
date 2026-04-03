/**
 * Pair-join referrals: first second member on a half-order triggers +2 credits for both
 * (joiner immediately; host via referralInbox claim).
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore';

import { db } from '@/services/firebase';
import { normalizeOrderUserIds } from '@/services/orders';

const REFERRAL_INBOX = 'referralInbox';
const REFER_CREDITS_JOINER = 2;
const REFER_CREDITS_INBOX = 2;

function inviterIdFromOrderData(d: Record<string, unknown>): string | null {
  const c = typeof d.createdBy === 'string' ? d.createdBy.trim() : '';
  if (c) return c;
  const h = typeof d.hostId === 'string' ? d.hostId.trim() : '';
  if (h) return h;
  const u = normalizeOrderUserIds(d.users);
  return u[0] ?? null;
}

/**
 * Call after a half-order transitions from one member to two (joiner's context).
 * Idempotent per order via `referrals/{orderId}`.
 */
export async function applyHalfOrderPairReferralRewards(
  orderId: string,
  joinerUid: string,
): Promise<void> {
  const oid = orderId?.trim();
  const jid = joinerUid?.trim();
  if (!oid || !jid) return;

  try {
    const orderRef = doc(db, 'orders', oid);
    const orderSnap = await getDoc(orderRef);
    if (!orderSnap.exists()) return;
    const od = orderSnap.data() as Record<string, unknown>;
    const users = normalizeOrderUserIds(od.users);
    if (users.length < 2 || !users.includes(jid)) return;

    const inviterId = inviterIdFromOrderData(od);
    if (!inviterId || inviterId === jid) return;

    const referralRef = doc(db, 'referrals', oid);
    const preReferral = await getDoc(referralRef);
    if (preReferral.exists()) return;

    const batch = writeBatch(db);
    batch.set(referralRef, {
      inviterId,
      invitedUserId: jid,
      orderId: oid,
      createdAt: serverTimestamp(),
    });
    batch.update(doc(db, 'users', jid), {
      credits: increment(REFER_CREDITS_JOINER),
    });
    batch.set(
      doc(db, 'users', inviterId, REFERRAL_INBOX, oid),
      {
        credits: REFER_CREDITS_INBOX,
        fromUid: jid,
        orderId: oid,
        createdAt: serverTimestamp(),
      },
      { merge: false },
    );
    await batch.commit();
  } catch (e) {
    console.warn('[referralRewards] applyHalfOrderPairReferralRewards', e);
  }
}

/** Host claims pending referral credits (self-serve inbox). */
export async function claimReferralInboxRewards(uid: string): Promise<void> {
  const u = uid?.trim();
  if (!u) return;
  try {
    const inboxCol = collection(db, 'users', u, REFERRAL_INBOX);
    const snap = await getDocs(inboxCol);
    if (snap.empty) return;
    for (const d of snap.docs) {
      const amt =
        typeof d.data().credits === 'number' ? d.data().credits : REFER_CREDITS_INBOX;
      const batch = writeBatch(db);
      batch.update(doc(db, 'users', u), { credits: increment(amt) });
      batch.delete(d.ref);
      await batch.commit();
    }
  } catch (e) {
    console.warn('[referralRewards] claimReferralInboxRewards', e);
  }
}

/** User is alone on a waiting half-order (for assistant copy). */
export async function userHasSoloWaitingHalfOrder(uid: string): Promise<boolean> {
  const u = uid?.trim();
  if (!u) return false;
  try {
    const q = query(
      collection(db, 'orders'),
      where('users', 'array-contains', u),
      where('status', '==', 'waiting'),
    );
    const snap = await getDocs(q);
    for (const d of snap.docs) {
      const data = d.data() as Record<string, unknown>;
      const users = normalizeOrderUserIds(data.users);
      const cardId = typeof data.cardId === 'string' && data.cardId.length > 0;
      if (cardId && users.length === 1) return true;
    }
  } catch {
    return false;
  }
  return false;
}
