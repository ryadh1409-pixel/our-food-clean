import { auth, db } from '@/services/firebase';
import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';

/**
 * Blocks a user for the signed-in user (or explicit `blockerId`).
 * Writes:
 * - `users/{blocker}/blockedUsers/{blocked}` (subcollection)
 * - `users/{blocker}.blockedUsers` array (for quick checks + legacy rules)
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
  if (blockedUsers.includes(blockedUserId)) {
    await setDoc(
      doc(db, 'users', currentUid, 'blockedUsers', blockedUserId),
      {
        blockedUserId,
        createdAt: serverTimestamp(),
      },
      { merge: true },
    );
    return;
  }

  await setDoc(
    doc(db, 'users', currentUid, 'blockedUsers', blockedUserId),
    {
      blockedUserId,
      createdAt: serverTimestamp(),
    },
    { merge: true },
  );

  if (userSnap.exists()) {
    await updateDoc(userRef, {
      blockedUsers: arrayUnion(blockedUserId),
    });
  } else {
    await setDoc(
      userRef,
      {
        blockedUsers: [blockedUserId],
      },
      { merge: true },
    );
  }
}

/** Removes block from subcollection and parent array. */
export async function unblockBlockedUser(
  blockedUserId: string,
  blockerId?: string,
): Promise<void> {
  const currentUid = blockerId ?? auth.currentUser?.uid ?? null;
  if (!currentUid || !blockedUserId) return;

  const userRef = doc(db, 'users', currentUid);
  try {
    await deleteDoc(doc(db, 'users', currentUid, 'blockedUsers', blockedUserId));
  } catch {
    /* missing doc */
  }
  const snap = await getDoc(userRef);
  if (snap.exists()) {
    await updateDoc(userRef, {
      blockedUsers: arrayRemove(blockedUserId),
    });
  }
}

/**
 * True when either user blocked the other.
 *
 * Reverse blocks are read from `users/{other}.blockedUsers` (any signed-in
 * user can read the parent profile). Do not `get` `users/{other}/blockedUsers/*`:
 * that subcollection is owner-only, so the read permission-denies and rejects
 * this whole check. Join then fails for every existing order.
 */
export async function isUserBlocked(
  currentUserId: string,
  otherUserId: string,
): Promise<boolean> {
  if (!currentUserId || !otherUserId) return false;
  if (currentUserId === otherUserId) return false;

  const [meSnap, otherSnap, subMe] = await Promise.all([
    getDoc(doc(db, 'users', currentUserId)),
    getDoc(doc(db, 'users', otherUserId)),
    getDoc(
      doc(db, 'users', currentUserId, 'blockedUsers', otherUserId),
    ),
  ]);

  const myBlocked = meSnap.exists() ? meSnap.data()?.blockedUsers : [];
  const otherBlocked = otherSnap.exists() ? otherSnap.data()?.blockedUsers : [];
  const myBlockedList = Array.isArray(myBlocked) ? myBlocked : [];
  const otherBlockedList = Array.isArray(otherBlocked) ? otherBlocked : [];

  if (myBlockedList.includes(otherUserId) || otherBlockedList.includes(currentUserId)) {
    return true;
  }
  if (subMe.exists()) {
    return true;
  }

  const [b1, b2] = await Promise.all([
    getDocs(
      query(
        collection(db, 'blocks'),
        where('blockerId', '==', currentUserId),
        where('blockedUserId', '==', otherUserId),
      ),
    ),
    getDocs(
      query(
        collection(db, 'blocks'),
        where('blockerId', '==', otherUserId),
        where('blockedUserId', '==', currentUserId),
      ),
    ),
  ]);
  return !b1.empty || !b2.empty;
}

/**
 * All user IDs this account hides (blocked + users who blocked this account).
 */
export async function getHiddenUserIds(currentUserId: string): Promise<Set<string>> {
  if (!currentUserId) return new Set<string>();

  const meRef = doc(db, 'users', currentUserId);
  const qBlockers = query(
    collection(db, 'users'),
    where('blockedUsers', 'array-contains', currentUserId),
  );
  const [meSnap, blockersSnap, subSnap] = await Promise.all([
    getDoc(meRef),
    getDocs(qBlockers),
    getDocs(collection(db, 'users', currentUserId, 'blockedUsers')),
  ]);
  const ids = new Set<string>();
  const mine = meSnap.exists() ? meSnap.data()?.blockedUsers : [];
  if (Array.isArray(mine)) {
    mine.forEach((id) => {
      if (typeof id === 'string' && id) ids.add(id);
    });
  }
  subSnap.docs.forEach((d) => {
    const bid = typeof d.data()?.blockedUserId === 'string' ? d.data()?.blockedUserId : d.id;
    if (typeof bid === 'string' && bid) ids.add(bid);
  });
  blockersSnap.docs.forEach((d) => {
    if (d.id) ids.add(d.id);
  });
  return ids;
}
