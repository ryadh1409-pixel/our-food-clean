import { FOOD_CARD_ORDER_MAX_USERS } from '@/constants/adminFoodCards';
import { ORDER_STATUS } from '@/constants/orderStatus';
import { db } from '@/services/firebase';
import { normalizeOrderUserIds, planHalfOrderJoin } from '@/services/orders';
import {
  getPublicUserFields,
  mapRawUserDocument,
  type PublicUserFields,
} from '@/services/users';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  type QueryDocumentSnapshot,
  where,
} from 'firebase/firestore';

const OPEN_ORDER_STATUSES = [ORDER_STATUS.WAITING, ORDER_STATUS.ACTIVE];

type OrderDocRow = {
  id: string;
  data: Record<string, unknown>;
};

function toOrderRows(
  docs: QueryDocumentSnapshot[],
): OrderDocRow[] {
  return docs.map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> }));
}

function filterAndSortJoinableOrders(rows: OrderDocRow[]): OrderDocRow[] {
  const filtered = rows.filter(({ data }) => {
    const st = data.status;
    if (typeof st !== 'string') return false;
    if (!OPEN_ORDER_STATUSES.includes(st as (typeof OPEN_ORDER_STATUSES)[number])) {
      return false;
    }
    const users = normalizeOrderUserIds(data.users);
    const maxU =
      typeof data.maxUsers === 'number' && data.maxUsers > 0
        ? data.maxUsers
        : 2;
    return users.length < maxU;
  });
  return filtered.sort((a, b) => {
    const na = normalizeOrderUserIds(a.data.users).length;
    const nb = normalizeOrderUserIds(b.data.users).length;
    if (na !== nb) return nb - na;
    const ta =
      a.data.createdAt &&
      typeof (a.data.createdAt as { toMillis?: () => number }).toMillis ===
        'function'
        ? (a.data.createdAt as { toMillis: () => number }).toMillis()
        : 0;
    const tb =
      b.data.createdAt &&
      typeof (b.data.createdAt as { toMillis?: () => number }).toMillis ===
        'function'
        ? (b.data.createdAt as { toMillis: () => number }).toMillis()
        : 0;
    return ta - tb;
  });
}

export async function fetchJoinableOrderIdsForCard(
  cardId: string,
): Promise<string[]> {
  const snap = await getDocs(
    query(
      collection(db, 'orders'),
      where('cardId', '==', cardId),
      orderBy('createdAt', 'asc'),
      limit(40),
    ),
  );
  return filterAndSortJoinableOrders(toOrderRows(snap.docs)).map((r) => r.id);
}

/** Live hints for UI: who is already in an open (waiting/active) order, and the next join target’s `users`. */
export function subscribeJoinHintsForFoodCard(
  cardId: string,
  onData: (hint: {
    primaryOpenUsers: string[];
    anyOpenOrderMemberIds: string[];
  }) => void,
  onError?: (e: Error) => void,
): () => void {
  const q = query(
    collection(db, 'orders'),
    where('cardId', '==', cardId),
    orderBy('createdAt', 'asc'),
    limit(40),
  );
  return onSnapshot(
    q,
    (snap) => {
      const rows = toOrderRows(snap.docs);
      const openFormation = rows.filter(({ data }) => {
        const st = data.status;
        return (
          st === ORDER_STATUS.WAITING || st === ORDER_STATUS.ACTIVE
        );
      });
      const anyOpenOrderMemberIds = new Set<string>();
      openFormation.forEach(({ data }) => {
        normalizeOrderUserIds(data.users).forEach((u) =>
          anyOpenOrderMemberIds.add(u),
        );
      });
      const joinable = filterAndSortJoinableOrders(rows);
      const primary = joinable[0];
      const primaryOpenUsers = primary
        ? normalizeOrderUserIds(primary.data.users)
        : [];
      onData({
        primaryOpenUsers,
        anyOpenOrderMemberIds: [...anyOpenOrderMemberIds],
      });
    },
    (e) => {
      onError?.(e instanceof Error ? e : new Error('Order hints failed'));
      onData({ primaryOpenUsers: [], anyOpenOrderMemberIds: [] });
    },
  );
}

export type SlotJoinTransactionResult =
  | {
      kind: 'joined_existing';
      orderId: string;
      alreadyIn: boolean;
      priorUserCount: number;
      maxUsers: number;
    }
  | { kind: 'skip' };

export async function transactionJoinHalfOrderForCard(args: {
  orderId: string;
  cardId: string;
  joinerUid: string;
  joinerParticipant: Record<string, unknown>;
  hostProfilePrefetch: PublicUserFields | null;
}): Promise<SlotJoinTransactionResult> {
  const {
    orderId,
    cardId,
    joinerUid,
    joinerParticipant,
    hostProfilePrefetch,
  } = args;

  return runTransaction(db, async (tx) => {
    const oRef = doc(db, 'orders', orderId);
    const oSnap = await tx.get(oRef);
    if (!oSnap.exists()) return { kind: 'skip' as const };
    const od = oSnap.data() as Record<string, unknown>;
    const cid = typeof od.cardId === 'string' ? od.cardId.trim() : '';
    if (cid !== cardId) return { kind: 'skip' as const };
    const st = od.status;
    if (
      typeof st !== 'string' ||
      !OPEN_ORDER_STATUSES.includes(
        st as (typeof OPEN_ORDER_STATUSES)[number],
      )
    ) {
      return { kind: 'skip' as const };
    }
    const users = normalizeOrderUserIds(od.users);
    const maxUsers = Math.min(
      typeof od.maxUsers === 'number' && od.maxUsers > 0
        ? od.maxUsers
        : FOOD_CARD_ORDER_MAX_USERS,
      FOOD_CARD_ORDER_MAX_USERS,
    );
    if (users.length >= maxUsers) return { kind: 'skip' as const };

    const partsLive =
      Array.isArray(od.participants) ? (od.participants as unknown[]) : [];
    let hostForPlan: PublicUserFields | null =
      partsLive.length === 0 && users.length === 1
        ? hostProfilePrefetch
        : null;
    if (
      partsLive.length === 0 &&
      users.length === 1 &&
      !hostForPlan &&
      users[0]
    ) {
      const uRef = doc(db, 'users', users[0]);
      const uSnap = await tx.get(uRef);
      if (uSnap.exists()) {
        hostForPlan = mapRawUserDocument(
          users[0],
          uSnap.data() as Record<string, unknown>,
        );
      }
    }

    const joinPlan = planHalfOrderJoin({
      orderData: od,
      joinerUid,
      joinerParticipant,
      orderMaxUsers: maxUsers,
      hostProfileIfBootstrapping: hostForPlan,
    });

    if (joinPlan.kind === 'already_member') {
      return {
        kind: 'joined_existing' as const,
        orderId,
        maxUsers,
        priorUserCount: users.length,
        alreadyIn: true,
      };
    }

    tx.update(oRef, joinPlan.fields);
    return {
      kind: 'joined_existing' as const,
      orderId,
      maxUsers,
      priorUserCount: users.length,
      alreadyIn: false,
    };
  });
}

export async function loadHostProfileForOrderJoin(
  orderId: string,
): Promise<PublicUserFields | null> {
  const o = await getDoc(doc(db, 'orders', orderId));
  if (!o.exists()) return null;
  const od = o.data() as Record<string, unknown>;
  const users = normalizeOrderUserIds(od.users);
  const parts =
    Array.isArray(od.participants) ? od.participants.length : 0;
  if (users.length !== 1 || parts !== 0) return null;
  return getPublicUserFields(users[0]);
}
