import { db } from '@/services/firebase';
import { doc, getDoc } from 'firebase/firestore';

/**
 * Returns true if the user is banned and cannot create or join orders.
 */
export async function isUserBanned(uid: string): Promise<boolean> {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() && snap.data()?.banned === true;
}
