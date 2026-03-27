import { auth, db } from '@/services/firebase';
import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';

/**
 * Blocks a user for the current signed-in user (or explicit blockerId).
 * Stores IDs in users/{uid}.blockedUsers array.
 */
export async function blockUser(
  blockedUserId: string,
  blockerId?: string,
): Promise<void> {
  const currentUid = blockerId ?? auth.currentUser?.uid ?? null;
  if (!currentUid) {
    throw new Error('You must be signed in to block users.');
  }
  if (!blockedUserId) {
    throw new Error('Invalid block target.');
  }
  if (currentUid === blockedUserId) {
    throw new Error('You cannot block yourself.');
  }

  const userRef = doc(db, 'users', currentUid);
  const userSnap = await getDoc(userRef);
  const existing = userSnap.exists() ? userSnap.data()?.blockedUsers : null;
  const blockedUsers = Array.isArray(existing) ? existing : [];
  if (blockedUsers.includes(blockedUserId)) return;

  await updateDoc(userRef, {
    blockedUsers: arrayUnion(blockedUserId),
  });
}

/**
 * True when either user blocked the other.
 */
export async function isUserBlocked(
  currentUserId: string,
  otherUserId: string,
): Promise<boolean> {
  if (!currentUserId || !otherUserId) return false;
  if (currentUserId === otherUserId) return false;

  const [meSnap, otherSnap] = await Promise.all([
    getDoc(doc(db, 'users', currentUserId)),
    getDoc(doc(db, 'users', otherUserId)),
  ]);
  const myBlocked = meSnap.exists() ? meSnap.data()?.blockedUsers : [];
  const otherBlocked = otherSnap.exists() ? otherSnap.data()?.blockedUsers : [];
  const myBlockedList = Array.isArray(myBlocked) ? myBlocked : [];
  const otherBlockedList = Array.isArray(otherBlocked) ? otherBlocked : [];
  return (
    myBlockedList.includes(otherUserId) || otherBlockedList.includes(currentUserId)
  );
}

/**
 * Returns all user IDs hidden for the current user (both directions).
 */
export async function getHiddenUserIds(currentUserId: string): Promise<Set<string>> {
  if (!currentUserId) return new Set<string>();

  const meRef = doc(db, 'users', currentUserId);
  const qBlockers = query(
    collection(db, 'users'),
    where('blockedUsers', 'array-contains', currentUserId),
  );
  const [meSnap, blockersSnap] = await Promise.all([getDoc(meRef), getDocs(qBlockers)]);
  const ids = new Set<string>();
  const mine = meSnap.exists() ? meSnap.data()?.blockedUsers : [];
  if (Array.isArray(mine)) {
    mine.forEach((id) => {
      if (typeof id === 'string' && id) ids.add(id);
    });
  }
  blockersSnap.docs.forEach((d) => {
    if (d.id) ids.add(d.id);
  });
  return ids;
}
