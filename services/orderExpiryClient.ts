/**
 * While the app is open, periodically cancel HalfOrders where the host waited past
 * `matchWaitDeadlineAt` (or createdAt + 45m) with only one member. Uses the host’s auth.
 */
import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  where,
  updateDoc,
} from 'firebase/firestore';

import { HALF_ORDER_MATCH_WAIT_MS } from '@/constants/orderStatus';
import { auth, db } from '@/services/firebase';
import { normalizeOrderUserIds } from '@/services/orders';

const TICK_MS = 60_000;

function parseCreatedAtMs(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (raw && typeof raw === 'object' && raw !== null && 'toMillis' in raw) {
    const fn = (raw as { toMillis?: () => number }).toMillis;
    if (typeof fn === 'function') {
      const n = fn.call(raw);
      return typeof n === 'number' ? n : 0;
    }
  }
  return 0;
}

function matchWaitDeadlineMs(data: Record<string, unknown>): number | null {
  const w = data.matchWaitDeadlineAt;
  if (typeof w === 'number' && Number.isFinite(w)) return w;
  const c = parseCreatedAtMs(data.createdAt);
  if (!c) return null;
  return c + HALF_ORDER_MATCH_WAIT_MS;
}

function isWaitingLikeStatus(s: string): boolean {
  return s === 'waiting' || s === 'active';
}

export function startExpiredOrdersCleanup(): () => void {
  let timer: ReturnType<typeof setInterval> | null = null;

  async function tick() {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    try {
      const snap = await getDocs(
        query(collection(db, 'orders'), where('users', 'array-contains', uid)),
      );
      const now = Date.now();
      for (const d of snap.docs) {
        const data = d.data() as Record<string, unknown>;
        if (typeof data.cardId !== 'string' || !data.cardId) continue;
        const users = normalizeOrderUserIds(data.users);
        if (users.length !== 1) continue;
        const st = typeof data.status === 'string' ? data.status : '';
        if (!isWaitingLikeStatus(st)) continue;
        if (st === 'cancelled' || st === 'completed') continue;
        const deadline = matchWaitDeadlineMs(data);
        if (deadline == null || now < deadline) continue;
        await updateDoc(doc(db, 'orders', d.id), {
          status: 'cancelled',
          cancelledBy: uid,
          cancelReason: 'wait_timeout',
          cancelledAt: serverTimestamp(),
        });
      }
    } catch (e) {
      console.warn('[orderExpiryClient]', e);
    }
  }

  timer = setInterval(tick, TICK_MS);
  void tick();
  return () => {
    if (timer) clearInterval(timer);
  };
}
