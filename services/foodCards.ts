import { ADMIN_UID } from '@/constants/adminUid';
import {
  HALF_ORDER_MATCH_WAIT_MS,
  ORDER_STATUS,
} from '@/constants/orderStatus';
import { autoInvite } from '@/services/autoInvite';
import { auth, db } from '@/services/firebase';
import {
  ensureHalfOrderChat,
  postHalfOrderChatSystemMessage,
} from '@/services/halfOrderChat';
import { hasBlockBetween } from '@/services/blocks';
import {
  loadHalfOrderCreatorProfiles,
  loadJoiningParticipantPayload,
  normalizeOrderUserIds,
  normalizeParticipantRecords,
  planHalfOrderJoin,
} from '@/services/orders';
import { trySendPairJoinExpoPush } from '@/services/orderPairPushNotify';
import { syncOrderMemberProfilesForOrder } from '@/services/orderMemberProfile';
import { applyHalfOrderPairReferralRewards } from '@/services/referralRewards';
import { getPublicUserFields } from '@/services/users';
import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  type QuerySnapshot,
} from 'firebase/firestore';

export type FoodCard = {
  id: string;
  title: string;
  image: string;
  restaurantName: string;
  price: number;
  splitPrice: number;
  location: { latitude: number; longitude: number } | null;
  createdAt: Timestamp | null;
  expiresAt: number;
  /** Deck listing: only `active` is joinable (see `isFoodCardJoinDisabled`). */
  status: 'active' | 'matched' | 'full';
  ownerId?: string;
  /** HalfOrder: links to `orders/{orderId}`. */
  orderId?: string | null;
  /** @deprecated Legacy field; prefer order `users`. */
  joinedUsers?: string[];
  maxUsers?: number;
  user1?: { uid: string; name: string; photo: string | null } | null;
  user2?: { uid: string; name: string; photo: string | null } | null;
};

const FOOD_CARDS = 'food_cards';

/** Listing lifetime from creation (45 minutes). */
export const FOOD_CARD_TTL_MS = 45 * 60 * 1000;

export function foodCardExpiresAtFromNow(nowMs = Date.now()): number {
  return nowMs + FOOD_CARD_TTL_MS;
}

export function isActiveFoodCardStatus(status: string): boolean {
  return status === 'active';
}

/** All docs still marked `active` (includes expired until automation cleans up). */
export function queryAllActiveFoodCards() {
  return query(collection(db, FOOD_CARDS), where('status', '==', 'active'));
}

/**
 * User-visible deck: `status == "active"` and `expiresAt > nowMs` (server-side filter).
 * Pass fresh `Date.now()` when building the listener so the query matches current time.
 */
export function queryVisibleActiveFoodCards(nowMs: number = Date.now()) {
  return query(
    collection(db, FOOD_CARDS),
    where('status', '==', 'active'),
    where('expiresAt', '>', nowMs),
  );
}

/** @deprecated Use `queryVisibleActiveFoodCards` for user-facing counts; `queryAllActiveFoodCards` for maintenance. */
export function queryActiveFoodCards(nowMs: number = Date.now()) {
  return queryVisibleActiveFoodCards(nowMs);
}

function coerceExpiresAtMs(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (raw && typeof raw === 'object' && raw !== null && 'toMillis' in raw) {
    const fn = (raw as { toMillis: () => number }).toMillis;
    if (typeof fn === 'function') {
      const ms = fn.call(raw);
      return typeof ms === 'number' ? ms : 0;
    }
  }
  return 0;
}

/**
 * Admin metrics / caps: count visible deck cards from one `getDocs(collection('food_cards'))`
 * (no composite index). Matches swipe deck rules: `active` and `expiresAt > nowMs`.
 */
export function countVisibleActiveFoodCardsInSnapshot(
  snap: QuerySnapshot,
  nowMs: number = Date.now(),
): number {
  let n = 0;
  for (const d of snap.docs) {
    const data = d.data();
    if (data?.status !== 'active') continue;
    if (coerceExpiresAtMs(data?.expiresAt) > nowMs) n += 1;
  }
  return n;
}

/** Count documents with exact `status` (e.g. `matched`) from a `food_cards` snapshot. */
export function countFoodCardsWithStatus(
  snap: QuerySnapshot,
  status: string,
): number {
  let n = 0;
  for (const d of snap.docs) {
    if (d.data()?.status === status) n += 1;
  }
  return n;
}

/**
 * Real-time listener for the swipe/browse deck: **`food_cards`**, `status == "active"` only
 * (single-field query — no composite index). Drops expired rows client-side.
 */
export function subscribeActiveFoodCards(
  onData: (cards: FoodCard[]) => void,
  onError?: (err: Error) => void,
): () => void {
  return onSnapshot(
    query(collection(db, FOOD_CARDS), where('status', '==', 'active')),
    (snap) => {
      const now = Date.now();
      const raw = snap.docs.map((d) => {
        const data = d.data() as Omit<FoodCard, 'id' | 'expiresAt'> & {
          expiresAt?: unknown;
          orderId?: unknown;
        };
        const expiresAt = coerceExpiresAtMs(data.expiresAt);
        const oid =
          typeof data.orderId === 'string' && data.orderId.trim()
            ? data.orderId.trim()
            : null;
        return {
          id: d.id,
          ...data,
          orderId: oid,
          expiresAt,
        } as FoodCard;
      });
      console.log(
        `[food_cards] onSnapshot status==active rawDocs=${snap.size} (expiry filtered client-side)`,
      );
      raw.forEach((c) => {
        console.log(
          `[food_cards] card id=${c.id} status=${String(c.status)} expiresAt=${c.expiresAt}`,
        );
      });
      const cards = raw.filter((card) => (card.expiresAt ?? 0) > now);
      console.log(
        `[food_cards] visibleAfterClientExpiryCheck count=${cards.length}`,
      );
      onData(cards);
    },
    (e) => {
      console.warn('[food_cards] listener error', e);
      onData([]);
      onError?.(e instanceof Error ? e : new Error('Failed to load food cards'));
    },
  );
}

/** @deprecated Use `subscribeActiveFoodCards` */
export const subscribeWaitingFoodCards = subscribeActiveFoodCards;

export async function joinFoodCard(cardId: string): Promise<{
  matched: boolean;
  chatId?: string;
  otherUser?: { uid: string; name: string; photo: string | null };
}> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in required');
  const userName =
    auth.currentUser?.displayName?.trim() ||
    auth.currentUser?.email?.split('@')[0] ||
    'User';
  const userPhoto = auth.currentUser?.photoURL ?? null;
  const cardRef = doc(db, FOOD_CARDS, cardId);
  const self = { uid, name: userName, photo: userPhoto };

  const txResult = await runTransaction(db, async (tx) => {
    const snap = await tx.get(cardRef);
    if (!snap.exists()) throw new Error('Card not found');
    const data = snap.data() as Omit<FoodCard, 'id'>;
    if (!isActiveFoodCardStatus(data.status)) throw new Error('Card no longer available');

    if (!data.user1?.uid) {
      tx.update(cardRef, {
        user1: self,
      });
      return { matched: false as const };
    }
    if (data.user1.uid === uid) {
      return { matched: false as const };
    }
    if (data.user2?.uid) {
      throw new Error('Card already matched');
    }

    const host = data.user1;
    tx.update(cardRef, {
      user2: self,
      status: 'matched',
    });
    return {
      matched: true as const,
      user1: host,
      user2: self,
    };
  });

  if (!txResult.matched) {
    return { matched: false };
  }

  const { user1, user2 } = txResult;
  if (!user1?.uid || !user2?.uid) {
    return { matched: false };
  }

  const other = user1.uid === uid ? user2 : user1;
  const ids = [other.uid, uid].sort();
  const chatId = cardId;
  const now = Date.now();
  await setDoc(
    doc(db, 'chats', chatId),
    {
      users: ids,
      participants: ids,
      usersData: [other, self],
      user1,
      user2,
      orderId: cardId,
      type: 'food_card',
      lastMessage: 'Match created',
      lastMessageAt: now,
      createdAt: now,
      typing: null,
      unreadCount: 0,
    },
    { merge: true },
  );

  const firstMessage = 'You both joined this order 🍕';
  await addDoc(collection(db, 'chats', chatId, 'messages'), {
    text: firstMessage,
    senderId: 'system',
    sender: 'system',
    userName: 'System',
    createdAt: now,
    delivered: true,
    seen: false,
    system: true,
  });
  await updateDoc(doc(db, 'chats', chatId), {
    lastMessage: firstMessage,
    lastMessageAt: Date.now(),
  });
  console.log('System added');

  return { matched: true, chatId, otherUser: other };
}

export type JoinOrderResult = {
  alreadyJoined: boolean;
  isFull: boolean;
  orderId: string;
  /** True when this join brought the group from one member to two. */
  justBecamePair?: boolean;
};

function buildHalfOrderFromCard(
  data: Record<string, unknown>,
  cardId: string,
  uid: string,
  maxUsers: number,
): Record<string, unknown> {
  const title = typeof data.title === 'string' ? data.title : 'Shared order';
  const image = typeof data.image === 'string' ? data.image : '';
  const price = Number(data.price) || 0;
  const splitPrice = Number(data.splitPrice) || 0;
  const pricePerPerson =
    splitPrice > 0 ? splitPrice : maxUsers > 0 ? price / maxUsers : 0;
  const restaurant =
    typeof data.restaurantName === 'string' ? data.restaurantName.trim() : '';

  const loc = data.location;
  let latitude: number | undefined;
  let longitude: number | undefined;
  if (loc && typeof loc === 'object' && loc !== null) {
    const L = loc as Record<string, unknown>;
    const la =
      typeof L.latitude === 'number' ? L.latitude : null;
    const lo =
      typeof L.longitude === 'number' ? L.longitude : null;
    if (la != null && lo != null && Number.isFinite(la) && Number.isFinite(lo)) {
      latitude = la;
      longitude = lo;
    }
  }

  const now = Date.now();
  return {
    cardId,
    users: [uid],
    status: ORDER_STATUS.WAITING,
    matchWaitDeadlineAt: now + HALF_ORDER_MATCH_WAIT_MS,
    maxUsers,
    createdBy: uid,
    hostId: uid,
    createdAt: serverTimestamp(),
    foodName: title.trim() || 'Shared order',
    image: image.trim(),
    pricePerPerson: Number(pricePerPerson.toFixed(2)),
    totalPrice: Number(price.toFixed(2)),
    location: restaurant || 'Nearby',
    restaurantName: restaurant,
    ...(latitude != null && longitude != null ? { latitude, longitude } : {}),
  };
}

function isCardOwnedByUser(card: FoodCard, uid: string): boolean {
  if (typeof card.ownerId === 'string' && card.ownerId === uid) return true;
  if (card.user1?.uid === uid) return true;
  return false;
}

/**
 * Disable join for non-`active` cards, capacity (via live `orderUsers` when provided), admin preview, or own card.
 */
export function isFoodCardJoinDisabled(
  card: FoodCard,
  uid: string | undefined,
  orderUsersHint?: string[] | null,
): boolean {
  if (!uid) return true;
  if (uid === ADMIN_UID) return true;
  if (isCardOwnedByUser(card, uid)) return true;
  const cap =
    typeof card.maxUsers === 'number' && card.maxUsers > 0 ? card.maxUsers : 2;
  if (!isActiveFoodCardStatus(card.status)) return true;
  if ((card.expiresAt ?? 0) <= Date.now()) return true;
  const orderUsers = orderUsersHint ?? null;
  if (orderUsers?.includes(uid)) return true;
  if (orderUsers != null && orderUsers.length >= cap) return true;
  return false;
}

/**
 * HalfOrder join: create or update `orders` with `users` + `cardId`, set `food_cards.orderId`, sync `chats/{orderId}`.
 */
export async function joinOrder(
  cardId: string,
  uid: string,
): Promise<JoinOrderResult> {
  const trimmed = cardId.trim();
  if (!trimmed) throw new Error('Invalid card');

  const authedUid = auth.currentUser?.uid;
  if (!authedUid) throw new Error('Sign in required');
  if (!uid || uid !== authedUid) throw new Error('Not authorized');

  const cardRef = doc(db, FOOD_CARDS, trimmed);

  const joinerParticipant = await loadJoiningParticipantPayload(authedUid);
  if (!joinerParticipant) {
    throw new Error('Could not load your profile to join.');
  }

  const creatorProfiles = await loadHalfOrderCreatorProfiles(authedUid);
  if (!creatorProfiles) {
    throw new Error('Could not load your profile to create this order.');
  }

  let halfOrderHostPrefetch: Awaited<ReturnType<typeof getPublicUserFields>> = null;
  const cardSnapPrejoin = await getDoc(cardRef);
  if (cardSnapPrejoin.exists()) {
    const d0 = cardSnapPrejoin.data() as Record<string, unknown>;
    const oid0 =
      typeof d0.orderId === 'string' && d0.orderId.trim()
        ? d0.orderId.trim()
        : '';
    if (oid0) {
      const o0 = await getDoc(doc(db, 'orders', oid0));
      if (o0.exists()) {
        const od0 = o0.data() as Record<string, unknown>;
        for (const m of normalizeOrderUserIds(od0.users)) {
          if (await hasBlockBetween(authedUid, m)) {
            throw new Error('You cannot join this order due to a block.');
          }
        }
        const uu = normalizeOrderUserIds(od0.users);
        const pp = normalizeParticipantRecords(od0.participants);
        if (pp.length === 0 && uu.length === 1) {
          halfOrderHostPrefetch = await getPublicUserFields(uu[0]);
        }
      }
    }
  }

  const outcome = await runTransaction(db, async (tx) => {
    const cardSnap = await tx.get(cardRef);
    if (!cardSnap.exists()) throw new Error('Card not found');

    const data = cardSnap.data() as Record<string, unknown>;
    const status = typeof data.status === 'string' ? data.status : '';
    if (!isActiveFoodCardStatus(status)) {
      throw new Error('This order is not open for joining');
    }

    const ownerId = typeof data.ownerId === 'string' ? data.ownerId : '';
    if (ownerId && ownerId === authedUid) {
      throw new Error('You cannot join your own card');
    }
    const u1 = data.user1 as { uid?: string } | null | undefined;
    if (u1 && typeof u1.uid === 'string' && u1.uid === authedUid) {
      throw new Error('You cannot join your own card');
    }

    const maxUsers =
      typeof data.maxUsers === 'number' && data.maxUsers > 0 ? data.maxUsers : 2;

    const linkedOrderIdRaw = data.orderId;
    const linkedOrderId =
      typeof linkedOrderIdRaw === 'string' && linkedOrderIdRaw.trim()
        ? linkedOrderIdRaw.trim()
        : '';

    if (linkedOrderId) {
      const oRef = doc(db, 'orders', linkedOrderId);
      const oSnap = await tx.get(oRef);
      if (!oSnap.exists()) throw new Error('Order not found');
      const od = oSnap.data() as Record<string, unknown>;
      const users = normalizeOrderUserIds(od.users);
      const orderMax =
        typeof od.maxUsers === 'number' && od.maxUsers > 0 ? od.maxUsers : maxUsers;
      let hostForPlan = halfOrderHostPrefetch;
      const partsLive = normalizeParticipantRecords(od.participants);
      if (partsLive.length === 0 && users.length === 1 && !hostForPlan) {
        hostForPlan = await getPublicUserFields(users[0]);
      }
      const joinPlan = planHalfOrderJoin({
        orderData: od,
        joinerUid: authedUid,
        joinerParticipant: joinerParticipant,
        orderMaxUsers: orderMax,
        hostProfileIfBootstrapping: hostForPlan,
      });
      if (joinPlan.kind === 'already_member') {
        return {
          kind: 'joined_existing' as const,
          orderId: linkedOrderId,
          maxUsers: orderMax,
          priorUserCount: users.length,
          alreadyIn: true,
        };
      }
      tx.update(oRef, joinPlan.fields);
      return {
        kind: 'joined_existing' as const,
        orderId: linkedOrderId,
        maxUsers: orderMax,
        priorUserCount: users.length,
        alreadyIn: false,
      };
    }

    const newRef = doc(collection(db, 'orders'));
    tx.set(newRef, {
      ...buildHalfOrderFromCard(data, trimmed, authedUid, maxUsers),
      host: creatorProfiles.host,
      participants: [creatorProfiles.firstParticipant],
    });
    tx.update(cardRef, { orderId: newRef.id });
    return {
      kind: 'created' as const,
      orderId: newRef.id,
      maxUsers,
    };
  });

  const finalSnap = await getDoc(doc(db, 'orders', outcome.orderId));
  const finalUsers = normalizeOrderUserIds(finalSnap.data()?.users);

  await ensureHalfOrderChat(outcome.orderId, finalUsers);
  await syncOrderMemberProfilesForOrder(outcome.orderId, finalUsers);

  let justBecamePair = false;
  if (outcome.kind === 'joined_existing' && !outcome.alreadyIn) {
    if (outcome.priorUserCount === 1 && finalUsers.length >= 2) {
      justBecamePair = true;
      await postHalfOrderChatSystemMessage(
        outcome.orderId,
        'Someone joined your order!',
      );
      void trySendPairJoinExpoPush(outcome.orderId, authedUid);
      void applyHalfOrderPairReferralRewards(outcome.orderId, authedUid);
    }
  }

  const alreadyJoined =
    outcome.kind === 'joined_existing' && outcome.alreadyIn === true;

  if (outcome.kind === 'created') {
    const oData = finalSnap.data() as Record<string, unknown> | undefined;
    void autoInvite({
      id: outcome.orderId,
      foodName:
        typeof oData?.foodName === 'string' ? oData.foodName : undefined,
      creatorUid: authedUid,
      latitude:
        typeof oData?.latitude === 'number' ? oData.latitude : null,
      longitude:
        typeof oData?.longitude === 'number' ? oData.longitude : null,
    });
  }

  return {
    alreadyJoined,
    isFull: finalUsers.length >= outcome.maxUsers,
    orderId: outcome.orderId,
    justBecamePair,
  };
}

export async function createFoodCard(input: {
  title: string;
  image: string;
  restaurantName: string;
  price: number;
  splitPrice: number;
  latitude?: number | null;
  longitude?: number | null;
}) {
  const uid = auth.currentUser?.uid ?? '';
  if (!uid || uid !== ADMIN_UID) throw new Error('Admin only');
  const cardsSnap = await getDocs(collection(db, FOOD_CARDS));
  if (countVisibleActiveFoodCardsInSnapshot(cardsSnap) >= 10) {
    throw new Error('Max 10 active cards');
  }
  const now = Date.now();
  return addDoc(collection(db, FOOD_CARDS), {
    title: input.title.trim(),
    image: input.image.trim(),
    restaurantName: input.restaurantName.trim(),
    price: input.price,
    splitPrice: input.splitPrice,
    location:
      input.latitude != null && input.longitude != null
        ? { latitude: input.latitude, longitude: input.longitude }
        : null,
    ownerId: uid,
    maxUsers: 2,
    createdAt: serverTimestamp(),
    expiresAt: foodCardExpiresAtFromNow(now),
    status: 'active',
    user1: null,
    user2: null,
  });
}

async function duplicateCard(cardId: string) {
  const snap = await getDoc(doc(db, FOOD_CARDS, cardId));
  if (!snap.exists()) return;
  const data = snap.data();
  const now = Date.now();
  const owner =
    typeof data.ownerId === 'string' && data.ownerId
      ? data.ownerId
      : auth.currentUser?.uid ?? '';
  await addDoc(collection(db, FOOD_CARDS), {
    title: data.title ?? 'Food card',
    image: data.image ?? '',
    restaurantName: data.restaurantName ?? '',
    price: Number(data.price) || 0,
    splitPrice: Number(data.splitPrice) || 0,
    location: data.location ?? null,
    ownerId: owner,
    maxUsers: 2,
    createdAt: serverTimestamp(),
    expiresAt: foodCardExpiresAtFromNow(now),
    status: 'active',
    user1: null,
    user2: null,
    regeneratedFrom: cardId,
  });
}

export async function runFoodCardAutomationOnce(): Promise<void> {
  const now = Date.now();
  const activeDeckSnap = await getDocs(queryAllActiveFoodCards());
  const matchedSnap = await getDocs(
    query(collection(db, FOOD_CARDS), where('status', '==', 'matched')),
  );

  const tasks: Promise<unknown>[] = [];
  activeDeckSnap.docs.forEach((d) => {
    const data = d.data();
    if (typeof data.expiresAt === 'number' && data.expiresAt <= now) {
      tasks.push(
        duplicateCard(d.id).finally(() => deleteDoc(doc(db, FOOD_CARDS, d.id))),
      );
    }
  });
  matchedSnap.docs.forEach((d) => {
    const data = d.data();
    if (!data.regenerated) {
      tasks.push(
        duplicateCard(d.id).finally(() =>
          updateDoc(doc(db, FOOD_CARDS, d.id), {
            regenerated: true,
            adminNotification: `Match completed: ${data.title ?? 'Food'} - 2 users joined`,
          }),
        ),
      );
    }
  });
  if (tasks.length) await Promise.allSettled(tasks);
}

export async function skipFoodCard(_cardId: string): Promise<void> {
  // Skip is local-only for feed UX. No write needed.
}

export function startFoodCardAutomation(): () => void {
  const id = setInterval(() => {
    runFoodCardAutomationOnce().catch(() => {});
  }, 60 * 1000);
  return () => clearInterval(id);
}
