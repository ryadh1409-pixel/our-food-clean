/**
 * Admin “AI” insights for push timing and copy (heuristics, no external model).
 */
import type { QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
import { collection, getDocs } from 'firebase/firestore';

import { ORDER_STATUS } from '@/constants/orderStatus';
import {
  ACTIVE_2H_MS,
  expoTokenFromUserFields,
  lastActiveMs,
  userLatLngFromDoc,
} from '@/services/adminBroadcastRecipients';
import { db } from '@/services/firebase';
import { haversineDistanceKm, type LatLng } from '@/services/haversineKm';

const CLUSTER_RADIUS_KM = 3;

function formatHour12(hour24: number): string {
  const h = ((hour24 % 24) + 24) % 24;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const x = h % 12;
  const label = x === 0 ? 12 : x;
  return `${label} ${ampm}`;
}

/** Histogram using the admin device’s local timezone for “peak hour” UX. */
function peakLocalHourFromTimestamps(timestampsMs: number[]): {
  peakHour: number;
  peakCount: number;
} {
  const counts = new Array(24).fill(0);
  for (const ms of timestampsMs) {
    const h = new Date(ms).getHours();
    counts[h] += 1;
  }
  let peakHour = 0;
  for (let h = 1; h < 24; h++) {
    if (counts[h] > counts[peakHour]) peakHour = h;
  }
  return { peakHour, peakCount: counts[peakHour] ?? 0 };
}

function countNearbyClusterUsers(
  locatedActive: Array<{ id: string; ll: LatLng }>,
): number {
  if (locatedActive.length < 2) return 0;
  const inCluster = new Set<string>();
  for (let i = 0; i < locatedActive.length; i++) {
    for (let j = i + 1; j < locatedActive.length; j++) {
      const km = haversineDistanceKm(
        locatedActive[i]!.ll,
        locatedActive[j]!.ll,
      );
      if (Number.isFinite(km) && km <= CLUSTER_RADIUS_KM) {
        inCluster.add(locatedActive[i]!.id);
        inCluster.add(locatedActive[j]!.id);
      }
    }
  }
  return inCluster.size;
}

function orderIsOpenWaiting(data: Record<string, unknown>): boolean {
  const st = typeof data.status === 'string' ? data.status : '';
  return st === ORDER_STATUS.WAITING;
}

export type AdminAiNotificationInsights = {
  computedAtMs: number;
  /** Users with lastActive in the last 2 hours. */
  activeUsersCount: number;
  /** Active (2h) users with at least one other active located user within 3 km. */
  nearbyClusterUsersCount: number;
  /** Half-orders in `waiting`. */
  openOrdersCount: number;
  /** Users with a valid Expo push token (any time). */
  usersWithPushTokenCount: number;
  /** Active (2h) users who also have an Expo push token. */
  activeWithTokenCount: number;
  peakHourLocal: number;
  peakHourLabel: string;
  /** True when current local hour matches peak (good moment to nudge). */
  isPeakHourNow: boolean;
  bestTimeHeadline: string;
  smartTitle: string;
  smartMessage: string;
  /** Heuristic: strong moment to broadcast (activity + demand). */
  shouldSuggestSend: boolean;
  /** Optional cluster summary for control center copy. */
  clusterRadiusKm: number;
};

export function computeAdminAiNotificationInsights(
  userSnaps: QueryDocumentSnapshot<DocumentData>[],
  orderSnaps: QueryDocumentSnapshot<DocumentData>[],
  nowMs: number = Date.now(),
): AdminAiNotificationInsights {
  const cutoff2h = nowMs - ACTIVE_2H_MS;

  const lastActiveSamples: number[] = [];
  let activeUsersCount = 0;
  let usersWithPushTokenCount = 0;
  let activeWithTokenCount = 0;
  const locatedActive: Array<{ id: string; ll: LatLng }> = [];

  for (const snap of userSnaps) {
    const raw = snap.data() as Record<string, unknown>;
    const la = lastActiveMs(raw);
    if (la != null) lastActiveSamples.push(la);

    if (expoTokenFromUserFields(raw)) usersWithPushTokenCount += 1;

    if (la != null && la >= cutoff2h) {
      activeUsersCount += 1;
      if (expoTokenFromUserFields(raw)) activeWithTokenCount += 1;
      const ll = userLatLngFromDoc(raw);
      if (ll) locatedActive.push({ id: snap.id, ll });
    }
  }

  const nearbyClusterUsersCount = countNearbyClusterUsers(locatedActive);

  let openOrdersCount = 0;
  for (const o of orderSnaps) {
    if (orderIsOpenWaiting(o.data() as Record<string, unknown>)) {
      openOrdersCount += 1;
    }
  }

  const { peakHourLocal } = peakLocalHourFromTimestamps(lastActiveSamples);
  const peakHourLabel = formatHour12(peakHourLocal);
  const currentHour = new Date(nowMs).getHours();
  const isPeakHourNow = currentHour === peakHourLocal;
  const bestTimeHeadline = isPeakHourNow
    ? `Now · peak is usually ${peakHourLabel}`
    : peakHourLabel;

  const lateNight = currentHour >= 22 || currentHour < 5;
  let smartMessage: string;
  if (openOrdersCount > 0) {
    smartMessage = '🍕 People are waiting for others — join now!';
  } else if (lateNight) {
    smartMessage = '🌙 Late night snack? Open the app!';
  } else {
    smartMessage = '🔥 Be the first to start an order near you!';
  }

  const smartTitle =
    openOrdersCount > 0
      ? 'Someone is waiting'
      : lateNight
        ? 'HalfOrder tonight'
        : 'Start near you';

  const shouldSuggestSend = activeUsersCount > 10 && openOrdersCount > 0;

  return {
    computedAtMs: nowMs,
    activeUsersCount,
    nearbyClusterUsersCount,
    openOrdersCount,
    usersWithPushTokenCount,
    activeWithTokenCount,
    peakHourLocal,
    peakHourLabel,
    isPeakHourNow,
    bestTimeHeadline,
    smartTitle,
    smartMessage,
    shouldSuggestSend,
    clusterRadiusKm: CLUSTER_RADIUS_KM,
  };
}

export async function fetchAdminAiNotificationInsights(): Promise<AdminAiNotificationInsights> {
  const [usersSnap, ordersSnap] = await Promise.all([
    getDocs(collection(db, 'users')),
    getDocs(collection(db, 'orders')),
  ]);
  return computeAdminAiNotificationInsights(usersSnap.docs, ordersSnap.docs);
}
