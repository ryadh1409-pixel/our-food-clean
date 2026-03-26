/**
 * Permanently deletes the current Firebase Auth user and related Firestore data.
 * Call only after the user confirms account deletion.
 *
 * Order of operations: Firestore cleanup first (while authenticated), then Auth delete.
 * `deleteUser()` signs the user out automatically.
 */
import { REFERRAL_ORDER_ID_KEY, REFERRAL_STORAGE_KEY } from '@/lib/invite-link';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { deleteUser, type User } from '@firebase/auth';
import {
  arrayRemove,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  query,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/services/firebase';

const CHUNK = 400;

async function deleteDocumentsInCollection(
  colRef: ReturnType<typeof collection>,
): Promise<void> {
  for (;;) {
    const snap = await getDocs(query(colRef, limit(CHUNK)));
    if (snap.empty) break;
    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

async function deleteOrderSubcollectionsAndDoc(orderId: string): Promise<void> {
  await deleteDocumentsInCollection(
    collection(db, 'orders', orderId, 'messages'),
  );
  await deleteDocumentsInCollection(
    collection(db, 'orders', orderId, 'ratings'),
  );
  await deleteDoc(doc(db, 'orders', orderId));
}

export type DeleteUserAccountResult = {
  /** True if Auth user was removed */
  authDeleted: true;
};

/**
 * Deletes Firestore data for `user` then deletes the Auth account.
 * @throws FirebaseError or Error on failure (e.g. auth/requires-recent-login)
 */
export async function deleteUserAccount(user: User): Promise<DeleteUserAccountResult> {
  const uid = user.uid;

  // 1) User inbox subcollection: users/{uid}/messages
  await deleteDocumentsInCollection(collection(db, 'users', uid, 'messages'));

  // 2) Orders hosted by this user — delete subcollections then order doc
  const hostedByHostId = await getDocs(
    query(collection(db, 'orders'), where('hostId', '==', uid)),
  );
  const hostedByUserId = await getDocs(
    query(collection(db, 'orders'), where('userId', '==', uid)),
  );
  const hostedIds = new Set<string>();
  hostedByHostId.docs.forEach((d) => hostedIds.add(d.id));
  hostedByUserId.docs.forEach((d) => hostedIds.add(d.id));
  for (const orderId of hostedIds) {
    await deleteOrderSubcollectionsAndDoc(orderId);
  }

  // 3) Orders where user is a participant (not host) — remove uid from participantIds
  const participantSnap = await getDocs(
    query(collection(db, 'orders'), where('participantIds', 'array-contains', uid)),
  );
  for (const orderDoc of participantSnap.docs) {
    try {
      await updateDoc(orderDoc.ref, {
        participantIds: arrayRemove(uid),
      });
    } catch {
      // Order may have been deleted or permission edge case — continue
    }
  }

  // 4) Block documents involving this user
  const blockedByMe = await getDocs(
    query(collection(db, 'blocks'), where('blockerId', '==', uid)),
  );
  const blockedMe = await getDocs(
    query(collection(db, 'blocks'), where('blockedId', '==', uid)),
  );
  for (const d of [...blockedByMe.docs, ...blockedMe.docs]) {
    try {
      await deleteDoc(d.ref);
    } catch {
      // ignore
    }
  }

  // 5) User profile document
  await deleteDoc(doc(db, 'users', uid));

  // 6) Local app keys
  await AsyncStorage.multiRemove([
    REFERRAL_STORAGE_KEY,
    REFERRAL_ORDER_ID_KEY,
  ]).catch(() => {});

  // 7) Firebase Authentication — permanent removal
  await deleteUser(user);

  return { authDeleted: true };
}

export function getDeleteAccountAuthErrorMessage(code: string): string {
  switch (code) {
    case 'auth/requires-recent-login':
      return 'For security, please sign out, sign in again, then delete your account.';
    case 'auth/network-request-failed':
      return 'Network error. Check your connection and try again.';
    default:
      return 'Could not delete your account. Please try again or contact support.';
  }
}
