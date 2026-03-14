import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '@/services/firebase';

/**
 * Log when the app receives a push notification (foreground or background).
 * Call from Notifications.addNotificationReceivedListener.
 */
export async function logNotificationReceived(
  notificationId: string | null,
): Promise<void> {
  if (!notificationId) return;
  const user = auth.currentUser;
  await addDoc(collection(db, 'notification_logs'), {
    notificationId,
    userId: user?.uid ?? '',
    userEmail: user?.email ?? '',
    status: 'received',
    time: serverTimestamp(),
  });
}

/**
 * Log when the user taps a push notification.
 * Call from Notifications.addNotificationResponseReceivedListener.
 */
export async function logNotificationOpened(
  notificationId: string | null,
): Promise<void> {
  if (!notificationId) return;
  const user = auth.currentUser;
  await addDoc(collection(db, 'notification_logs'), {
    notificationId,
    userId: user?.uid ?? '',
    userEmail: user?.email ?? '',
    status: 'opened',
    time: serverTimestamp(),
  });
}
