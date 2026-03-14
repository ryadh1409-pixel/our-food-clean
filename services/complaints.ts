import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '@/services/firebase';

export type ComplaintUser = {
  uid: string;
  email: string | null;
};

/**
 * Submit a complaint or inquiry. Saves to Firestore `complaints` collection.
 * A Cloud Function will send a push notification to the admin.
 */
export async function submitComplaint(
  user: ComplaintUser,
  message: string,
): Promise<void> {
  const trimmed = message.trim();
  if (!trimmed) throw new Error('Message cannot be empty');
  await addDoc(collection(db, 'complaints'), {
    userId: user.uid,
    userEmail: user.email ?? '',
    message: trimmed,
    createdAt: serverTimestamp(),
    status: 'new',
  });
}
