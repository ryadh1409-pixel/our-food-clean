import {
  arrayUnion,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  setDoc,
  type Firestore,
} from 'firebase/firestore';

/** Deterministic match doc id: `{orderId}_{smallerUid}_{largerUid}` */
export function foodMatchDocId(orderId: string, uidA: string, uidB: string): string {
  const [a, b] = [uidA, uidB].sort();
  return `${orderId}_${a}_${b}`;
}

export type AcceptSwipeResult =
  | { ok: true; matched: false }
  | {
      ok: true;
      matched: true;
      matchId: string;
      partnerUid: string;
      orderId: string;
    }
  | { ok: false; error: string };

function firebaseMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return 'Unknown error';
}

/**
 * Adds the current user to `orders/{orderId}.usersAccepted` (arrayUnion).
 * If at least two people liked this order, creates `matches/{matchId}` once (deduped).
 */
export async function acceptFoodSwipe(
  db: Firestore,
  orderId: string,
  uid: string,
): Promise<AcceptSwipeResult> {
  console.log('[foodSwipeMatch] accept start', { orderId, uid });
  try {
    await runTransaction(db, async (transaction) => {
      const ref = doc(db, 'orders', orderId);
      const snap = await transaction.get(ref);
      if (!snap.exists()) {
        throw new Error('Order not found');
      }
      const data = snap.data();
      const maxPeople = Math.max(Number(data?.maxPeople ?? 2), 2);
      const accepted: string[] = Array.isArray(data?.usersAccepted)
        ? (data.usersAccepted as string[])
        : [];
      if (accepted.includes(uid)) {
        console.log('[foodSwipeMatch] user already in usersAccepted, no write');
        return;
      }
      if (accepted.length >= maxPeople) {
        throw new Error('This order is already full.');
      }
      transaction.update(ref, { usersAccepted: arrayUnion(uid) });
      console.log('[foodSwipeMatch] scheduled arrayUnion', { orderId, uid });
    });
  } catch (e) {
    const msg = firebaseMessage(e);
    console.error('[foodSwipeMatch] transaction failed', msg, e);
    return { ok: false, error: msg };
  }

  const snap = await getDoc(doc(db, 'orders', orderId));
  if (!snap.exists()) {
    return { ok: false, error: 'Order not found after update.' };
  }
  const data = snap.data() ?? {};
  const accepted: string[] = Array.isArray(data.usersAccepted)
    ? (data.usersAccepted as string[])
    : [];

  console.log('[foodSwipeMatch] post-tx usersAccepted', {
    orderId,
    count: accepted.length,
    accepted,
  });

  if (accepted.length < 2) {
    return { ok: true, matched: false };
  }

  const pair = [...accepted].slice(0, 2).sort();
  const u0 = pair[0];
  const u1 = pair[1];
  if (!u0 || !u1) {
    return { ok: true, matched: false };
  }

  const matchId = foodMatchDocId(orderId, u0, u1);
  const matchRef = doc(db, 'matches', matchId);
  const existing = await getDoc(matchRef);
  if (existing.exists()) {
    console.log('[foodSwipeMatch] match doc already exists', matchId);
    const partnerUid = accepted.find((x) => x !== uid) ?? u0;
    return {
      ok: true,
      matched: true,
      matchId,
      partnerUid,
      orderId,
    };
  }

  try {
    await setDoc(matchRef, {
      orderId,
      users: pair,
      status: 'matched',
      createdAt: serverTimestamp(),
    });
    console.log('[foodSwipeMatch] created match', matchId);
  } catch (e) {
    const msg = firebaseMessage(e);
    console.error('[foodSwipeMatch] setDoc match failed', msg, e);
    return { ok: false, error: msg };
  }

  const partnerUid = accepted.find((x) => x !== uid) ?? u0;
  return {
    ok: true,
    matched: true,
    matchId,
    partnerUid,
    orderId,
  };
}
