/**
 * AutoMatch Engine: real-time nearby open orders within 500m.
 * Use from Explore to detect matches and show MatchAlert.
 */

import { distanceMeters, AUTO_MATCH_RADIUS_METERS } from '@/utils/distance';
import { db } from '@/services/firebase';
import { collection, onSnapshot, query, where } from 'firebase/firestore';

export type AutoMatchOrder = {
  id: string;
  orderId: string;
  restaurantName: string;
  mealName: string;
  creatorId: string;
  latitude: number;
  longitude: number;
  distanceMeters: number;
  status: string;
  createdAt: number | null;
};

/**
 * Subscribe to open/active orders and call onMatch when a nearby order appears
 * (within radiusMeters, same restaurant optional, creatorId !== currentUserId).
 * Optional `radiusMeters` overrides the default auto-match radius.
 * Returns unsubscribe function.
 */
export function subscribeToNearbyOpenOrders(
  userLat: number,
  userLng: number,
  currentUserId: string,
  onMatch: (order: AutoMatchOrder) => void,
  options?: { restaurantName?: string; radiusMeters?: number },
): () => void {
  const radiusMeters = options?.radiusMeters ?? AUTO_MATCH_RADIUS_METERS;

  const q = query(
    collection(db, 'orders'),
    where('status', 'in', ['open', 'active', 'waiting']),
  );

  const unsubscribe = onSnapshot(
    q,
    (snap) => {
      snap.docs.forEach((d) => {
        const data = d.data();
        const creatorId = (data?.creatorId ??
          data?.hostId ??
          data?.userId ??
          '') as string;
        if (creatorId === currentUserId) return;

        const lat =
          typeof data?.latitude === 'number'
            ? data.latitude
            : data?.location?.latitude;
        const lng =
          typeof data?.longitude === 'number'
            ? data.longitude
            : data?.location?.longitude;
        if (typeof lat !== 'number' || typeof lng !== 'number') return;

        const meters = distanceMeters(userLat, userLng, lat, lng);
        if (meters > radiusMeters) return;

        const restaurantName =
          typeof data?.restaurantName === 'string' && data.restaurantName.trim()
            ? data.restaurantName
            : '';
        if (
          options?.restaurantName &&
          restaurantName !== options.restaurantName
        )
          return;

        const created =
          data?.createdAt?.toMillis?.() ?? data?.createdAt ?? null;
        onMatch({
          id: d.id,
          orderId: d.id,
          restaurantName,
          mealName:
            typeof data?.mealType === 'string'
              ? data.mealType
              : ((data?.mealName as string) ?? 'Meal'),
          creatorId,
          latitude: lat,
          longitude: lng,
          distanceMeters: Math.round(meters),
          status: (data?.status as string) ?? 'open',
          createdAt: created,
        });
      });
    },
    () => {},
  );

  return () => unsubscribe();
}
