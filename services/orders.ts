import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  where,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';

/**
 * Deletes all orders whose expiresAt <= now (in millis).
 */
export async function deleteExpiredOrdersOnce(): Promise<void> {
  const now = Date.now();
  const q = query(collection(db, 'orders'), where('expiresAt', '<=', now));
  const snap = await getDocs(q);
  const deletions: Promise<void>[] = [];
  snap.forEach((d) => {
    deletions.push(deleteDoc(doc(db, 'orders', d.id)));
  });
  if (deletions.length > 0) {
    await Promise.allSettled(deletions);
  }
}

/**
 * Starts a background interval that cleans up expired orders every 60 seconds.
 * Returns a cleanup function to clear the interval.
 */
export function startExpiredOrdersCleanup(): () => void {
  const intervalId = setInterval(() => {
    deleteExpiredOrdersOnce().catch(() => {});
  }, 60 * 1000);
  return () => clearInterval(intervalId);
}

type CreateOrderInput = {
  title: string;
  price: number;
  participants: number;
};

export async function createOrder(input: CreateOrderInput) {
  const { title, price, participants } = input;
  await addDoc(collection(db, 'orders'), {
    title,
    price,
    participants,
    createdAt: serverTimestamp(),
  });
}
