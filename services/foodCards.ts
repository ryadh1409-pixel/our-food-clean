import {
  ADMIN_FOOD_CARD_SLOT_IDS,
  FOOD_CARD_ORDER_MAX_USERS,
  isAdminFoodCardSlotId,
} from '@/constants/adminFoodCards';
import { ADMIN_UID } from '@/constants/adminUid';
import { PAYMENT_DISCLAIMER_CHAT_MATCHED } from '@/constants/paymentDisclaimer';
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
} from '@/services/orders';
import { trySendPairJoinExpoPush } from '@/services/orderPairPushNotify';
import { syncOrderMemberProfilesForOrder } from '@/services/orderMemberProfile';
import {
  fetchJoinableOrderIdsForCard,
  loadHostProfileForOrderJoin,
  transactionJoinHalfOrderForCard,
} from '@/services/foodCardSlotOrders';
import { applyHalfOrderPairReferralRewards } from '@/services/referralRewards';
import type { PublicUserFields } from '@/services/users';
import {
  addDoc,
  collection,
  doc,
  documentId,
  getDoc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  type DocumentSnapshot,
  type QuerySnapshot,
} from 'firebase/firestore';

export type FoodCard = {
  id: string;
  /** Catalog slot 1–10 when using admin slots. */
  slotNumber?: number;
  title: string;
  /** Optional AI-written blurb for the dish (shown in deck + detail). */
  aiDescription?: string;
  image: string;
  restaurantName: string;
  price: number;
  splitPrice: number;
  location: { latitude: number; longitude: number } | null;
  createdAt: Timestamp | null;
  expiresAt: number;
  /** Deck listing: only `active` is joinable (see `isFoodCardJoinDisabled`). */
  status: 'active' | 'matched' | 'full' | 'inactive';
  /** Admin slot flag — when false, card is hidden (handled before mapping). */
  active?: boolean;
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

function mapSlotOrLegacyFoodCard(
  d: QueryDocumentSnapshot,
): FoodCard | null {
  const data = d.data() as Record<string, unknown>;
  const aiDesc =
    typeof data.aiDescription === 'string' && data.aiDescription.trim()
      ? data.aiDescription.trim()
      : undefined;

  if (typeof data.active === 'boolean') {
    if (!data.active) return null;
    const price = Number(data.price) || 0;
    const split =
      typeof data.splitPrice === 'number' && data.splitPrice > 0
        ? data.splitPrice
        : price > 0
          ? price / 2
          : 0;
    const slotNum =
      typeof data.id === 'number' && data.id >= 1 && data.id <= 10
        ? data.id
        : Number.parseInt(d.id, 10);
    return {
      id: d.id,
      slotNumber: Number.isFinite(slotNum) ? slotNum : undefined,
      title: String(data.title ?? '').trim() || 'Menu item',
      image:
        typeof data.image === 'string' && data.image.trim()
          ? data.image.trim()
          : '',
      restaurantName:
        typeof data.restaurantName === 'string' && data.restaurantName.trim()
          ? data.restaurantName.trim()
          : 'HalfOrder',
      price,
      splitPrice: split,
      location: null,
      createdAt: (data.createdAt as Timestamp | null) ?? null,
      expiresAt: Number.MAX_SAFE_INTEGER,
      status: 'active',
      active: true,
      orderId: null,
      maxUsers: 2,
      aiDescription: aiDesc,
    };
  }

  const status = typeof data.status === 'string' ? data.status : '';
  if (!isActiveFoodCardStatus(status)) return null;
  const expiresAt = coerceExpiresAtMs(data.expiresAt);
  if (expiresAt <= Date.now()) return null;

  const oid =
    typeof data.orderId === 'string' && data.orderId.trim()
      ? data.orderId.trim()
      : null;

  return {
    id: d.id,
    title: String(data.title ?? ''),
    image: typeof data.image === 'string' ? data.image : '',
    restaurantName:
      typeof data.restaurantName === 'string' ? data.restaurantName : '',
    price: Number(data.price) || 0,
    splitPrice: Number(data.splitPrice) || 0,
    location:
      data.location && typeof data.location === 'object'
        ? (data.location as FoodCard['location'])
        : null,
    createdAt: (data.createdAt as Timestamp | null) ?? null,
    expiresAt,
    status: status as FoodCard['status'],
    ownerId: typeof data.ownerId === 'string' ? data.ownerId : undefined,
    orderId: oid,
    maxUsers: typeof data.maxUsers === 'number' ? data.maxUsers : 2,
    user1: data.user1 as FoodCard['user1'],
    user2: data.user2 as FoodCard['user2'],
    aiDescription: aiDesc,
  };
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
    if (typeof data?.active === 'boolean') {
      if (data.active) n += 1;
      continue;
    }
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
 * Real-time listener: admin catalog slots `1`–`10` only. Active slots use `active: true`.
 */
export function subscribeActiveFoodCards(
  onData: (cards: FoodCard[]) => void,
  onError?: (err: Error) => void,
): () => void {
  return onSnapshot(
    query(
      collection(db, FOOD_CARDS),
      where(documentId(), 'in', [...ADMIN_FOOD_CARD_SLOT_IDS]),
    ),
    (snap) => {
      const byId = new Map(snap.docs.map((d) => [d.id, d]));
      const cards = ADMIN_FOOD_CARD_SLOT_IDS.map((sid) => byId.get(sid))
        .filter((d): d is DocumentSnapshot => d != null)
        .map((d) => mapSlotOrLegacyFoodCard(d))
        .filter((c): c is FoodCard => c != null);
      console.log(`[food_cards] slot snapshot count=${cards.length}`);
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
  const slot = isAdminFoodCardSlotId(card.id);
  if (!slot && isCardOwnedByUser(card, uid)) return true;
  if (card.active === false) return true;
  if (!slot) {
    if (!isActiveFoodCardStatus(card.status)) return true;
    if ((card.expiresAt ?? 0) <= Date.now()) return true;
  }
  const orderUsers = orderUsersHint ?? null;
  if (orderUsers?.includes(uid)) return true;
  return false;
}

/**
 * HalfOrder join: find or create `orders/{orderId}` for `cardId` (catalog slot). Does not write `food_cards.orderId`.
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

  const cardSnapPre = await getDoc(cardRef);
  if (!cardSnapPre.exists()) throw new Error('Card not found');
  const cardDataPre = cardSnapPre.data() as Record<string, unknown>;

  if (typeof cardDataPre.active === 'boolean') {
    if (!cardDataPre.active) throw new Error('This card is not available');
  } else {
    const status =
      typeof cardDataPre.status === 'string' ? cardDataPre.status : '';
    if (!isActiveFoodCardStatus(status)) {
      throw new Error('This order is not open for joining');
    }
    if (coerceExpiresAtMs(cardDataPre.expiresAt) <= Date.now()) {
      throw new Error('This card has expired');
    }
    const ownerId =
      typeof cardDataPre.ownerId === 'string' ? cardDataPre.ownerId : '';
    if (ownerId && ownerId === authedUid) {
      throw new Error('You cannot join your own card');
    }
    const u1 = cardDataPre.user1 as { uid?: string } | null | undefined;
    if (u1 && typeof u1.uid === 'string' && u1.uid === authedUid) {
      throw new Error('You cannot join your own card');
    }
  }

  const maxUsers = Math.min(
    typeof cardDataPre.maxUsers === 'number' && cardDataPre.maxUsers > 0
      ? cardDataPre.maxUsers
      : FOOD_CARD_ORDER_MAX_USERS,
    FOOD_CARD_ORDER_MAX_USERS,
  );

  const candidateOrderIds = await fetchJoinableOrderIdsForCard(trimmed);

  for (const orderIdTry of candidateOrderIds) {
    const oSnap = await getDoc(doc(db, 'orders', orderIdTry));
    if (!oSnap.exists()) continue;
    const od0 = oSnap.data() as Record<string, unknown>;
    for (const m of normalizeOrderUserIds(od0.users)) {
      if (await hasBlockBetween(authedUid, m)) {
        throw new Error('You cannot join this order due to a block.');
      }
    }
    const uu0 = normalizeOrderUserIds(od0.users);
    const pp0 = Array.isArray(od0.participants) ? od0.participants.length : 0;
    let hostPrefetch: PublicUserFields | null = null;
    if (uu0.length === 1 && pp0 === 0) {
      hostPrefetch = await loadHostProfileForOrderJoin(orderIdTry);
    }
    let txOutcome: Awaited<
      ReturnType<typeof transactionJoinHalfOrderForCard>
    >;
    try {
      txOutcome = await transactionJoinHalfOrderForCard({
        orderId: orderIdTry,
        cardId: trimmed,
        joinerUid: authedUid,
        joinerParticipant,
        hostProfilePrefetch: hostPrefetch,
      });
    } catch {
      continue;
    }
    if (txOutcome.kind === 'skip') continue;

    const outcome = txOutcome;
    const finalSnap = await getDoc(doc(db, 'orders', outcome.orderId));
    const finalUsers = normalizeOrderUserIds(finalSnap.data()?.users);

    await ensureHalfOrderChat(outcome.orderId, finalUsers);
    await syncOrderMemberProfilesForOrder(outcome.orderId, finalUsers);

    let justBecamePair = false;
    if (!outcome.alreadyIn && outcome.priorUserCount === 1 && finalUsers.length >= 2) {
      justBecamePair = true;
      await postHalfOrderChatSystemMessage(
        outcome.orderId,
        'Someone joined your order!',
      );
      await postHalfOrderChatSystemMessage(
        outcome.orderId,
        PAYMENT_DISCLAIMER_CHAT_MATCHED,
      );
      void trySendPairJoinExpoPush(outcome.orderId, authedUid);
      void applyHalfOrderPairReferralRewards(outcome.orderId, authedUid);
    }

    return {
      alreadyJoined: outcome.alreadyIn,
      isFull: finalUsers.length >= outcome.maxUsers,
      orderId: outcome.orderId,
      justBecamePair,
    };
  }

  const outcome = await runTransaction(db, async (tx) => {
    const cardSnap = await tx.get(cardRef);
    if (!cardSnap.exists()) throw new Error('Card not found');
    const data = cardSnap.data() as Record<string, unknown>;
    if (typeof data.active === 'boolean') {
      if (!data.active) throw new Error('This card is not available');
    } else {
      const st = typeof data.status === 'string' ? data.status : '';
      if (!isActiveFoodCardStatus(st)) {
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
    }
    const mu = Math.min(
      typeof data.maxUsers === 'number' && data.maxUsers > 0
        ? data.maxUsers
        : FOOD_CARD_ORDER_MAX_USERS,
      FOOD_CARD_ORDER_MAX_USERS,
    );
    const newRef = doc(collection(db, 'orders'));
    tx.set(newRef, {
      ...buildHalfOrderFromCard(data, trimmed, authedUid, mu),
      host: creatorProfiles.host,
      participants: [creatorProfiles.firstParticipant],
    });
    return { kind: 'created' as const, orderId: newRef.id, maxUsers: mu };
  });

  const finalSnap = await getDoc(doc(db, 'orders', outcome.orderId));
  const finalUsers = normalizeOrderUserIds(finalSnap.data()?.users);

  await ensureHalfOrderChat(outcome.orderId, finalUsers);
  await syncOrderMemberProfilesForOrder(outcome.orderId, finalUsers);

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
    alreadyJoined: false,
    isFull: finalUsers.length >= outcome.maxUsers,
    orderId: outcome.orderId,
    justBecamePair: false,
  };
}

export async function createFoodCard(_input: {
  title: string;
  image: string;
  restaurantName: string;
  price: number;
  splitPrice: number;
  latitude?: number | null;
  longitude?: number | null;
  aiDescription?: string;
}): Promise<never> {
  throw new Error(
    'Food cards are fixed slots 1–10. Use the admin Food Cards dashboard.',
  );
}

export async function runFoodCardAutomationOnce(): Promise<void> {
  /** Catalog slots are persistent; no expiry churn. */
}

export async function skipFoodCard(_cardId: string): Promise<void> {
  // Skip is local-only for feed UX. No write needed.
}

export function startFoodCardAutomation(): () => void {
  return () => {};
}
