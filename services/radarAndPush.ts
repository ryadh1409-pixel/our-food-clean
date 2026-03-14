import * as Notifications from 'expo-notifications';
import {
  addDoc,
  collection,
  doc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { Platform } from 'react-native';
import { db } from './firebase';
import { getUserLocation } from './location';

/**
 * Updates lastActive timestamp when the app launches.
 * Used for inactive user reminder (don't remind users who opened app in last 48h).
 */
export async function updateLastActive(uid: string): Promise<void> {
  try {
    const userRef = doc(db, 'users', uid);
    await updateDoc(userRef, {
      lastActive: serverTimestamp(),
    });
  } catch {
    // ignore
  }
}

/**
 * Saves user's latitude/longitude to Firestore under users/{userId}
 * and appends a point to user_activity for the admin activity map.
 */
export async function updateUserLocationInFirestore(
  uid: string,
  userEmail?: string | null,
): Promise<void> {
  try {
    const { latitude, longitude } = await getUserLocation();
    const userRef = doc(db, 'users', uid);
    await updateDoc(userRef, {
      latitude,
      longitude,
      location: { latitude, longitude },
      lastLatitude: latitude,
      lastLongitude: longitude,
      lastLocationUpdatedAt: serverTimestamp(),
      lastActive: serverTimestamp(),
    });
    await addDoc(collection(db, 'user_activity'), {
      userId: uid,
      userEmail: userEmail ?? '',
      latitude,
      longitude,
      time: serverTimestamp(),
    });
  } catch {
    // Permission denied or location unavailable - skip
  }
}

/**
 * Registers for Expo Push Notifications and saves the token to users/{userId}.
 * Requires notificationsEnabled to be respected by backend when sending.
 */
export async function registerPushTokenAndSave(uid: string): Promise<void> {
  try {
    if (Platform.OS === 'web') return;

    const { status: existingStatus } =
      await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return;

    const tokenData = await Notifications.getExpoPushTokenAsync();
    const token = tokenData?.data;
    if (!token || typeof token !== 'string') return;

    const userRef = doc(db, 'users', uid);
    await updateDoc(userRef, {
      expoPushToken: token,
      pushToken: token,
    });
  } catch {
    // Ignore push registration errors
  }
}
