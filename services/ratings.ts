import { db } from '@/services/firebase';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  where,
} from 'firebase/firestore';

export async function saveRating(
  orderId: string,
  fromUserId: string,
  toUserId: string,
  rating: number,
  comment: string,
): Promise<void> {
  if (!orderId || !fromUserId || !toUserId) {
    throw new Error('Missing rating data.');
  }
  if (fromUserId === toUserId) {
    throw new Error('You cannot rate yourself.');
  }
  const alreadyRated = await hasRatedOrderForUser(orderId, fromUserId, toUserId);
  if (alreadyRated) {
    throw new Error('You already rated this participant.');
  }
  await addDoc(collection(db, 'ratings'), {
    orderId,
    fromUserId,
    toUserId,
    rating: Math.min(5, Math.max(1, Math.round(rating))),
    comment: comment.trim() || '',
    createdAt: serverTimestamp(),
  });
  // User doc (ratingAverage, ratingCount, averageRating, totalRatings) updated by Cloud Function onRatingCreated
}

export async function hasRatedOrder(
  orderId: string,
  fromUserId: string,
): Promise<boolean> {
  const q = query(
    collection(db, 'ratings'),
    where('orderId', '==', orderId),
    where('fromUserId', '==', fromUserId),
  );
  const snap = await getDocs(q);
  return !snap.empty;
}

export async function hasRatedOrderForUser(
  orderId: string,
  fromUserId: string,
  toUserId: string,
): Promise<boolean> {
  const q = query(
    collection(db, 'ratings'),
    where('orderId', '==', orderId),
    where('fromUserId', '==', fromUserId),
    where('toUserId', '==', toUserId),
  );
  const snap = await getDocs(q);
  return !snap.empty;
}

export async function getRatedUserIdsForOrder(
  orderId: string,
  fromUserId: string,
): Promise<Set<string>> {
  const q = query(
    collection(db, 'ratings'),
    where('orderId', '==', orderId),
    where('fromUserId', '==', fromUserId),
  );
  const snap = await getDocs(q);
  const ids = new Set<string>();
  snap.docs.forEach((d) => {
    const toUserId = d.data()?.toUserId;
    if (typeof toUserId === 'string' && toUserId) {
      ids.add(toUserId);
    }
  });
  return ids;
}

export type TrustScore = { average: number; count: number };

export async function getTrustScore(userId: string): Promise<TrustScore> {
  const userSnap = await getDoc(doc(db, 'users', userId));
  if (userSnap.exists()) {
    const d = userSnap.data();
    const avg = d?.ratingAverage ?? d?.averageRating;
    const cnt = d?.ratingCount ?? d?.totalRatings;
    if (typeof avg === 'number' && typeof cnt === 'number' && cnt > 0) {
      return { average: Math.round(avg * 10) / 10, count: cnt };
    }
  }
  const q = query(collection(db, 'ratings'), where('toUserId', '==', userId));
  const snap = await getDocs(q);
  if (snap.empty) {
    return { average: 0, count: 0 };
  }
  let sum = 0;
  snap.docs.forEach((d) => {
    const r = d.data().rating;
    if (typeof r === 'number') sum += r;
  });
  const count = snap.size;
  const average = count > 0 ? Math.round((sum / count) * 10) / 10 : 0;
  return { average, count };
}
