import { db } from '@/services/firebase';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';

const TERMS_URL = 'https://halforder.app/terms/';

export { TERMS_URL };

/**
 * Persists Terms acceptance on the user profile (required for App Store UGC flows).
 */
export async function acceptTermsOfService(userId: string): Promise<void> {
  if (!userId.trim()) {
    throw new Error('Missing user id.');
  }
  await setDoc(
    doc(db, 'users', userId),
    {
      hasAcceptedTerms: true,
      acceptedAt: serverTimestamp(),
    },
    { merge: true },
  );
}
