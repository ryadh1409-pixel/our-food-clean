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
  deleteField,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
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

function stringUidList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === 'string' && x.length > 0);
}

/** True when the order has no other members besides `uid` (or is empty). */
export function orderHasOnlyUidAsMember(
  data: DocumentData,
  uid: string,
): boolean {
  const users = stringUidList(data.users);
  const participants = stringUidList(data.participants);
  if (users.length > 1 || participants.length > 1) return false;
  if (users.length === 1 && users[0] !== uid) return false;
  if (participants.length === 1 && participants[0] !== uid) return false;
  return true;
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

/** Cancel a shared hosted order so peers keep history; do not hard-delete. */
async function cancelHostedOrderForPeers(
  orderId: string,
  uid: string,
  data: DocumentData,
): Promise<void> {
  if (data.status === 'cancelled' || data.status === 'completed') return;

  const hasCardId = typeof data.cardId === 'string' && data.cardId.length > 0;
  if (hasCardId) {
    await updateDoc(doc(db, 'orders', orderId), {
      status: 'cancelled',
      cancelledBy: uid,
      cancelReason: 'account_deleted',
      cancelledAt: serverTimestamp(),
    });
    return;
  }

  await updateDoc(doc(db, 'orders', orderId), {
    status: 'cancelled',
  });
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

  // 2) Orders hosted by this user — sole-member: hard-delete; shared: cancel only
  const hostedByHostId = await getDocs(
    query(collection(db, 'orders'), where('hostId', '==', uid)),
  );
  const hostedByUserId = await getDocs(
    query(collection(db, 'orders'), where('userId', '==', uid)),
  );
  const hostedByCreatedBy = await getDocs(
    query(collection(db, 'orders'), where('createdBy', '==', uid)),
  );
  const hostedIds = new Set<string>();
  hostedByHostId.docs.forEach((d) => hostedIds.add(d.id));
  hostedByUserId.docs.forEach((d) => hostedIds.add(d.id));
  hostedByCreatedBy.docs.forEach((d) => hostedIds.add(d.id));
  for (const orderId of hostedIds) {
    try {
      const snap = await getDoc(doc(db, 'orders', orderId));
      if (!snap.exists()) continue;
      const data = snap.data();
      if (orderHasOnlyUidAsMember(data, uid)) {
        await deleteOrderSubcollectionsAndDoc(orderId);
      } else {
        await cancelHostedOrderForPeers(orderId, uid, data);
      }
    } catch {
      // Permission / race — continue account deletion
    }
  }

  // 3) Orders where user is a participant (not host) — remove uid from participants + joinedAtMap
  const participantSnap = await getDocs(
    query(collection(db, 'orders'), where('participants', 'array-contains', uid)),
  );
  for (const orderDoc of participantSnap.docs) {
    try {
      await updateDoc(orderDoc.ref, {
        participants: arrayRemove(uid),
        [`joinedAtMap.${uid}`]: deleteField(),
      });
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
