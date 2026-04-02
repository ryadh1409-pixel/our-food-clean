import { db } from '@/services/firebase';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  writeBatch,
} from 'firebase/firestore';

async function wipeSubcollection(
  orderId: string,
  sub: 'messages' | 'ratings',
): Promise<void> {
  const snap = await getDocs(collection(db, 'orders', orderId, sub));
  if (snap.empty) return;
  const batch = writeBatch(db);
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}

/**
 * Admin-only: delete `orders/{orderId}` after clearing known subcollections.
 */
export async function adminDeleteOrderDeep(orderId: string): Promise<void> {
  const trimmed = orderId.trim();
  if (!trimmed) throw new Error('Invalid order id');
  await wipeSubcollection(trimmed, 'messages');
  await wipeSubcollection(trimmed, 'ratings');
  await deleteDoc(doc(db, 'orders', trimmed));
}
