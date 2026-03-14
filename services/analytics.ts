import { Platform } from 'react-native';
import {
  addDoc,
  collection,
  doc,
  increment,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db } from './firebase';

type BaseEventPayload = {
  userId: string | null;
  createdAt?: unknown;
};

async function safeUpdateUser(
  userId: string | null,
  updates: Record<string, unknown>,
): Promise<void> {
  if (!userId) return;
  const userRef = doc(db, 'users', userId);
  await setDoc(
    userRef,
    {
      userId,
      ...updates,
      lastActive: serverTimestamp(),
    },
    { merge: true },
  );
}

/**
 * Track a generic analytics event in the `events` collection.
 * This is used for the live activity stream in the admin dashboard.
 */
export async function trackEvent(
  type: string,
  payload: Omit<BaseEventPayload, 'createdAt'> & Record<string, unknown> = {
    userId: null,
  },
): Promise<void> {
  const event: Record<string, unknown> = {
    type,
    createdAt: serverTimestamp(),
    ...payload,
  };
  await addDoc(collection(db, 'events'), event);
}

/**
 * APP OPEN TRACKING
 *
 * Creates a session document and increments the user's appOpenCount.
 * Collection: app_sessions
 */
export async function trackAppOpen(userId: string | null): Promise<void> {
  await addDoc(collection(db, 'app_sessions'), {
    userId: userId ?? null,
    openedAt: serverTimestamp(),
    platform: Platform.OS,
  });
  await safeUpdateUser(userId, {
    appOpenCount: increment(1),
  });
  await trackEvent('app_open', { userId });
}

/**
 * ORDER EVENTS
 *
 * Called when an order is created.
 * Collection: events (type: "order_created")
 */
export async function trackOrderCreated(
  userId: string,
  orderId: string,
): Promise<void> {
  await addDoc(collection(db, 'events'), {
    type: 'order_created',
    userId,
    orderId,
    createdAt: serverTimestamp(),
  });
  await safeUpdateUser(userId, {
    ordersCreated: increment(1),
  });
}

/**
 * Called when a user joins an order.
 * Collection: events (type: "order_joined")
 */
export async function trackOrderJoined(
  userId: string,
  orderId: string,
): Promise<void> {
  await addDoc(collection(db, 'events'), {
    type: 'order_joined',
    userId,
    orderId,
    createdAt: serverTimestamp(),
  });
  await safeUpdateUser(userId, {
    ordersJoined: increment(1),
  });
}

/**
 * NOTIFICATION OPEN TRACKING
 *
 * Called when the app is opened from a push notification.
 * Collection: notification_opens
 */
export async function trackNotificationOpen(
  userId: string | null,
  notificationId: string | null,
): Promise<void> {
  await addDoc(collection(db, 'notification_opens'), {
    userId: userId ?? null,
    notificationId: notificationId ?? null,
    openedAt: serverTimestamp(),
  });
  await trackEvent('notification_open', { userId, notificationId });
}
