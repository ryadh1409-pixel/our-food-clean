import { doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';

import { auth, db } from '@/services/firebase';

/**
 * HalfOrder: set `status` to `cancelled` and record who cancelled (for push targeting).
 */
export async function cancelHalfOrder(orderId: string): Promise<void> {
  const oid = orderId.trim();
  if (!oid) throw new Error('Invalid order.');

  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('You must be signed in.');

  const ref = doc(db, 'orders', oid);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Order not found.');

  const d = snap.data() as Record<string, unknown>;
  const users = Array.isArray(d.users)
    ? d.users.filter((x): x is string => typeof x === 'string' && x.length > 0)
    : [];
  if (users.length === 0) {
    throw new Error('This order cannot be cancelled from here.');
  }
  if (!users.includes(uid)) {
    throw new Error('You are not a member of this order.');
  }
  if (typeof d.cardId !== 'string' || !d.cardId) {
    throw new Error('This order type does not support this cancel flow.');
  }
  if (d.status === 'cancelled') return;

  await updateDoc(ref, {
    status: 'cancelled',
    cancelledBy: uid,
    cancelReason: 'user',
    cancelledAt: serverTimestamp(),
  });
}
