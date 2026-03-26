import { auth, db } from '@/services/firebase';
import {
  addDoc,
  collection,
  getDocs,
  query,
  serverTimestamp,
  where,
} from 'firebase/firestore';

type BlockDoc = {
  blockerId: string;
  blockedUserId: string;
  createdAt: unknown;
};

/**
 * Blocks a user for the current signed-in user (or explicit blockerId).
 * Uses `blockedUsers` collection and prevents duplicate rows.
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

  const existingQ = query(
    collection(db, 'blockedUsers'),
    where('blockerId', '==', currentUid),
    where('blockedUserId', '==', blockedUserId),
  );
  const existingSnap = await getDocs(existingQ);
  if (!existingSnap.empty) return;

  const payload: BlockDoc = {
    blockerId: currentUid,
    blockedUserId,
    createdAt: serverTimestamp(),
  };
  await addDoc(collection(db, 'blockedUsers'), payload);
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

  const blockedByMeQ = query(
    collection(db, 'blockedUsers'),
    where('blockerId', '==', currentUserId),
    where('blockedUserId', '==', otherUserId),
  );
  const blockedMeQ = query(
    collection(db, 'blockedUsers'),
    where('blockerId', '==', otherUserId),
    where('blockedUserId', '==', currentUserId),
  );
  const [byMeSnap, meSnap] = await Promise.all([
    getDocs(blockedByMeQ),
    getDocs(blockedMeQ),
  ]);
  return !byMeSnap.empty || !meSnap.empty;
}

/**
 * Returns all user IDs hidden for the current user (both directions).
 */
export async function getHiddenUserIds(currentUserId: string): Promise<Set<string>> {
  if (!currentUserId) return new Set<string>();

  const qBlocked = query(
    collection(db, 'blockedUsers'),
    where('blockerId', '==', currentUserId),
  );
  const qBlockers = query(
    collection(db, 'blockedUsers'),
    where('blockedUserId', '==', currentUserId),
  );
  const [blockedSnap, blockersSnap] = await Promise.all([
    getDocs(qBlocked),
    getDocs(qBlockers),
  ]);
  const ids = new Set<string>();
  blockedSnap.docs.forEach((d) => {
    const id = String(d.data()?.blockedUserId ?? '');
    if (id) ids.add(id);
  });
  blockersSnap.docs.forEach((d) => {
    const id = String(d.data()?.blockerId ?? '');
    if (id) ids.add(id);
  });
  return ids;
}
