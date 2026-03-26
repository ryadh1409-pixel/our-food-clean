import {
  addDoc,
  collection,
  getDocs,
  query,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import { db } from './firebase';
import { blockUser as blockUserService } from './block';

export async function reportAndBlock(
  reporterUid: string,
  reportedUid: string,
  orderId: string,
): Promise<void> {
  await addDoc(collection(db, 'reports'), {
    reporterId: reporterUid,
    reportedUserId: reportedUid,
    orderId,
    createdAt: serverTimestamp(),
  });
  await blockUserService(reportedUid, reporterUid);
}

export async function isBlockedByAny(
  blockedUid: string,
  blockerUids: string[],
): Promise<boolean> {
  if (blockerUids.length === 0) return false;
  const q = query(
    collection(db, 'blockedUsers'),
    where('blockedUserId', '==', blockedUid),
  );
  const snap = await getDocs(q);
  return snap.docs.some((d) => {
    const data = d.data();
    return blockerUids.includes(data?.blockerId ?? '');
  });
}

export async function hasBlockConflict(
  joinerUid: string,
  participantIds: string[],
): Promise<boolean> {
  const blockedByMe = query(
    collection(db, 'blockedUsers'),
    where('blockerId', '==', joinerUid),
  );
  const blockedMe = query(
    collection(db, 'blockedUsers'),
    where('blockedUserId', '==', joinerUid),
  );
  const [snap1, snap2] = await Promise.all([
    getDocs(blockedByMe),
    getDocs(blockedMe),
  ]);
  const participantSet = new Set(participantIds);
  for (const d of snap1.docs) {
    if (participantSet.has(d.data()?.blockedUserId ?? '')) return true;
  }
  for (const d of snap2.docs) {
    if (participantSet.has(d.data()?.blockerId ?? '')) return true;
  }
  return false;
}
