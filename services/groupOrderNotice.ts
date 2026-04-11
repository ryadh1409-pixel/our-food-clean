import { db } from '@/services/firebase';
import { doc, setDoc } from 'firebase/firestore';

/**
 * Group pooling disclaimer (payment/pickup). Separate from legal ToS (`hasAcceptedTerms`).
 */
export async function acceptGroupOrderNotice(userId: string): Promise<void> {
  if (!userId.trim()) throw new Error('Missing user id.');
  await setDoc(
    doc(db, 'users', userId),
    { hasAcceptedGroupOrderNotice: true },
    { merge: true },
  );
}
