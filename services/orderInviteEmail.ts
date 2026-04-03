import { addDoc, collection, serverTimestamp } from 'firebase/firestore';

import { auth, db } from '@/services/firebase';

/**
 * Writes `invites/{autoId}` — triggers Cloud Function `sendOrderInvite` (email).
 */
export async function submitOrderEmailInvite(input: {
  email: string;
  orderId: string;
  inviterName: string;
}): Promise<void> {
  const user = auth.currentUser;
  if (!user?.uid) throw new Error('Sign in to send invites.');

  const email = input.email.trim().toLowerCase();
  if (!email || !email.includes('@')) {
    throw new Error('Enter a valid email address.');
  }

  const orderId = input.orderId.trim();
  if (!orderId) throw new Error('Invalid order.');

  await addDoc(collection(db, 'invites'), {
    email,
    orderId,
    inviterName: input.inviterName.trim() || 'Someone',
    inviterId: user.uid,
    createdAt: serverTimestamp(),
  });
}
