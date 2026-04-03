/**
 * When a HalfOrder reaches exactly two members, notify the other user via Expo Push API.
 * Prefers `participants[].expoPushToken` when present. Deduped with `orders.notified`.
 */
import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';

import { HALF_ORDER_PAIR_JOIN_PUSH_TYPE } from '@/constants/pushTypes';
import { sendPushNotification } from '@/services/expoPushSend';
import { db } from '@/services/firebase';
import { normalizeParticipantRecords } from '@/services/orders';

function normalizeOrderUsers(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === 'string' && x.length > 0);
}

async function getExpoPushTokenForUser(uid: string): Promise<string | null> {
  const uSnap = await getDoc(doc(db, 'users', uid));
  if (uSnap.exists()) {
    const d = uSnap.data() as Record<string, unknown>;
    const f =
      typeof d.fcmToken === 'string' && d.fcmToken.trim()
        ? d.fcmToken.trim()
        : '';
    const a =
      typeof d.pushToken === 'string' && d.pushToken.trim()
        ? d.pushToken.trim()
        : '';
    const b =
      typeof d.expoPushToken === 'string' && d.expoPushToken.trim()
        ? d.expoPushToken.trim()
        : '';
    if (f) return f;
    if (a) return a;
    if (b) return b;
  }
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

async function fetchJoinerDisplayName(joinerUid: string): Promise<string> {
  const snap = await getDoc(doc(db, 'users', joinerUid));
  if (!snap.exists()) return 'Someone';
  const d = snap.data() as Record<string, unknown>;
  const fromName =
    (typeof d.name === 'string' && d.name.trim() ? d.name.trim() : '') ||
    (typeof d.displayName === 'string' && d.displayName.trim()
      ? d.displayName.trim()
      : '');
  const email = typeof d.email === 'string' ? d.email.trim() : '';
  const local =
    email.includes('@') ? (email.split('@')[0]?.trim() ?? '') : '';
  return fromName || local || 'Someone';
}

/**
 * Claim `orders.notified` in a transaction, then send Expo push to the other member.
 */
export async function trySendPairJoinExpoPush(
  orderId: string,
  joinerUid: string,
): Promise<void> {
  const oid = orderId.trim();
  const jid = joinerUid.trim();
  if (!oid || !jid) return;

  let recipientUid: string | null = null;

  try {
    await runTransaction(db, async (tx) => {
      const ref = doc(db, 'orders', oid);
      const snap = await tx.get(ref);
      if (!snap.exists()) return;
      const d = snap.data() as Record<string, unknown>;
      if (typeof d.cardId !== 'string' || !d.cardId) return;
      const users = normalizeOrderUsers(d.users);
      if (users.length !== 2) return;
      if (!users.includes(jid)) return;
      if (d.notified === true) return;
      if (d.notificationSent === true) return;
      if (d.pairJoinPushSent === true) return;
      const other = users.find((u) => u !== jid);
      if (!other) return;

      tx.update(ref, {
        notified: true,
        notificationSent: true,
        notifiedAt: serverTimestamp(),
      });
      recipientUid = other;
    });
  } catch (e) {
    console.warn('[pairPush] claim transaction failed', e);
    return;
  }

  if (!recipientUid) return;

  const orderSnap = await getDoc(doc(db, 'orders', oid));
  const orderData = orderSnap.exists() ? orderSnap.data() : null;
  const participants = normalizeParticipantRecords(orderData?.participants);
  const recipientParticipant = participants.find(
    (p) => p.userId === recipientUid,
  );
  const tokenFromOrder =
    typeof recipientParticipant?.expoPushToken === 'string' &&
    recipientParticipant.expoPushToken.trim()
      ? recipientParticipant.expoPushToken.trim()
      : null;

  const token = tokenFromOrder ?? (await getExpoPushTokenForUser(recipientUid));
  const joinerName = await fetchJoinerDisplayName(jid);

  const title = `${joinerName} joined your order 🍕`;
  const body = 'You can now chat';

  const data: Record<string, string> = {
    type: HALF_ORDER_PAIR_JOIN_PUSH_TYPE,
    orderId: oid,
    userId: jid,
    joinerName,
  };

  await sendPushNotification(token, title, body, data);
}
