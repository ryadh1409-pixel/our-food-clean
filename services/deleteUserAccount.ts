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
import { planLeaveOrder } from '@/services/orderLifecycle';

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

  // 3) Orders where user is a member (not already wiped as host).
  // HalfOrders: cancel the pair — participants-only leave leaves a ghost uid in `users`.
  const participantSnap = await getDocs(
    query(collection(db, 'orders'), where('participants', 'array-contains', uid)),
  );
  const usersSnap = await getDocs(
    query(collection(db, 'orders'), where('users', 'array-contains', uid)),
  );
  const seenOrderIds = new Set<string>();
  for (const orderDoc of [...participantSnap.docs, ...usersSnap.docs]) {
    if (hostedIds.has(orderDoc.id) || seenOrderIds.has(orderDoc.id)) continue;
    seenOrderIds.add(orderDoc.id);
    try {
      const plan = planLeaveOrder(orderDoc.data() as Record<string, unknown>, uid, {
        cancelReason: 'account_deleted',
      });
      if (plan.kind === 'already_left') continue;
      await updateDoc(orderDoc.ref, plan.fields);
    } catch {
      // Order may have been deleted or permission edge case — continue
    }
  }

  // 4) Remove this user from other users' blockedUsers arrays
  const blockedInOtherUsers = await getDocs(
    query(collection(db, 'users'), where('blockedUsers', 'array-contains', uid)),
  );
  for (const userDoc of blockedInOtherUsers.docs) {
    if (userDoc.id === uid) continue;
    try {
      await updateDoc(userDoc.ref, {
        blockedUsers: arrayRemove(uid),
      });
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
