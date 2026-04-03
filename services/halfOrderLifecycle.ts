import {
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';

import { ORDER_STATUS } from '@/constants/orderStatus';
import { auth, db } from '@/services/firebase';
import { normalizeOrderUserIds } from '@/services/orders';

export async function markHalfOrderChatActive(orderId: string): Promise<void> {
  const oid = orderId.trim();
  if (!oid) return;
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  const ref = doc(db, 'orders', oid);
  let snap;
  try {
    snap = await getDoc(ref);
  } catch {
    return;
  }
  if (!snap.exists()) return;
  const d = snap.data() as Record<string, unknown>;
  if (typeof d.cardId !== 'string' || !d.cardId) return;
  if (d.status !== ORDER_STATUS.MATCHED) return;
  const users = normalizeOrderUserIds(d.users);
  if (!users.includes(uid) || users.length < 2) return;
  try {
    await updateDoc(ref, { status: ORDER_STATUS.ACTIVE });
  } catch {
    /* rules or offline */
  }
}

export async function completeHalfOrder(orderId: string): Promise<void> {
  const oid = orderId.trim();
  if (!oid) throw new Error('Invalid order.');
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('You must be signed in.');
  const ref = doc(db, 'orders', oid);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Order not found.');
  const d = snap.data() as Record<string, unknown>;
  const users = normalizeOrderUserIds(d.users);
  if (!users.includes(uid)) {
    throw new Error('You are not a member of this order.');
  }
  const st = typeof d.status === 'string' ? d.status : '';
  if (st !== ORDER_STATUS.MATCHED && st !== ORDER_STATUS.ACTIVE) {
    throw new Error('This order cannot be marked complete.');
  }
  await updateDoc(ref, {
    status: ORDER_STATUS.COMPLETED,
    completedAt: serverTimestamp(),
  });
}
