import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '@/services/firebase';

export async function inviteFriend(
  email: string,
  orderId: string,
  inviterName: string,
): Promise<string> {
  const trimmedEmail = email.trim();
  const trimmedName = inviterName.trim() || 'Someone';
  if (!trimmedEmail || !orderId) {
    throw new Error('Email and orderId are required');
  }
  const ref = await addDoc(collection(db, 'invites'), {
    email: trimmedEmail,
    orderId,
    inviterName: trimmedName,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}
