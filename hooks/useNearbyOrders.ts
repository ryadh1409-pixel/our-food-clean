import { haversineDistanceKm } from '@/lib/haversine';
import { db } from '@/services/firebase';
import { getUserLocation } from '@/services/location';
import {
  collection,
  getDocs,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { useCallback, useEffect, useRef, useState } from 'react';

const DEFAULT_RADIUS_KM = 3;

/** 500m for Live Demand Map and Auto-Match */
export const AUTO_MATCH_RADIUS_KM = 0.5;
export const DEMAND_MAP_RADIUS_KM = 0.5;

export type NearbyOrder = {
  id: string;
  restaurantName: string;
  mealType: string;
  mealName?: string;
  totalPrice: number;
  sharePrice: number;
  userName: string;
  creatorId?: string;
  latitude: number;
  longitude: number;
  participantIds: string[];
  maxParticipants: number;
  status?: string;
};

export type UserLocation = {
  latitude: number;
  longitude: number;
};

export function useNearbyOrders(radiusKm: number = DEFAULT_RADIUS_KM) {
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [orders, setOrders] = useState<NearbyOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const loc = await getUserLocation();
      setUserLocation({ latitude: loc.latitude, longitude: loc.longitude });

      const q = query(
        collection(db, 'orders'),
        where('status', 'in', ['open', 'active', 'waiting']),
      );
      const snap = await getDocs(q);
      const list: NearbyOrder[] = [];
      const now = Date.now();
      snap.docs.forEach((d) => {
        const data = d.data();
        const lat =
          typeof data?.latitude === 'number'
            ? data.latitude
            : data?.location?.latitude;
        const lng =
          typeof data?.longitude === 'number'
            ? data.longitude
            : data?.location?.longitude;
        if (typeof lat === 'number' && typeof lng === 'number') {
          const exp =
            typeof data?.expiresAt === 'number' ? data.expiresAt : null;
          if (exp != null && exp <= now) {
            // Skip expired orders
            return;
          }
          const distance = haversineDistanceKm(
            loc.latitude,
            loc.longitude,
            lat,
            lng,
          );
          if (distance <= radiusKm) {
            const participantIds = Array.isArray(data?.participantIds)
              ? data.participantIds
              : [];
            list.push({
              id: d.id,
              restaurantName:
                typeof data?.restaurantName === 'string' &&
                data.restaurantName.trim()
                  ? data.restaurantName
                  : 'Not specified',
              mealType:
                typeof data?.mealType === 'string' ? data.mealType : 'N/A',
              mealName:
                typeof data?.mealType === 'string' ? data.mealType : undefined,
              totalPrice: Number(data?.totalPrice ?? 0),
              sharePrice: Number(data?.sharePrice ?? 0),
              userName:
                typeof data?.userName === 'string' ? data.userName : 'User',
              creatorId:
                typeof data?.creatorId === 'string'
                  ? data.creatorId
                  : data?.hostId,
              latitude: lat,
              longitude: lng,
              participantIds,
              maxParticipants:
                typeof data?.maxParticipants === 'number'
                  ? data.maxParticipants
                  : 2,
              status:
                typeof data?.status === 'string' ? data.status : undefined,
            });
          }
        }
      });
      setOrders(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [radiusKm]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { userLocation, orders, loading, error, refetch: fetch };
}

/**
 * Real-time nearby orders via Firestore onSnapshot.
 * Use for Live Demand Map: orders within radiusKm (default 500m), status = open/active/waiting.
 */
export function useNearbyOrdersRealtime(
  radiusKm: number = DEMAND_MAP_RADIUS_KM,
) {
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [orders, setOrders] = useState<NearbyOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const userLocRef = useRef<UserLocation | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const loc = await getUserLocation();
        if (cancelled) return;
        const ul = { latitude: loc.latitude, longitude: loc.longitude };
        userLocRef.current = ul;
        setUserLocation(ul);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Location failed');
          setLoading(false);
        }
        return;
      }

      const q = query(
        collection(db, 'orders'),
        where('status', 'in', ['open', 'active', 'waiting']),
      );
      const unsub = onSnapshot(
        q,
        (snap) => {
          if (cancelled) return;
          const loc = userLocRef.current;
          if (!loc) return;
          const list: NearbyOrder[] = [];
          const now = Date.now();
          snap.docs.forEach((d) => {
            const data = d.data();
            const lat =
              typeof data?.latitude === 'number'
                ? data.latitude
                : data?.location?.latitude;
            const lng =
              typeof data?.longitude === 'number'
                ? data.longitude
                : data?.location?.longitude;
            if (typeof lat !== 'number' || typeof lng !== 'number') return;
            const exp =
              typeof data?.expiresAt === 'number' ? data.expiresAt : null;
            if (exp != null && exp <= now) {
              // Skip expired orders
              return;
            }
            const distance = haversineDistanceKm(
              loc.latitude,
              loc.longitude,
              lat,
              lng,
            );
            if (distance > radiusKm) return;
            const participantIds = Array.isArray(data?.participantIds)
              ? data.participantIds
              : [];
            list.push({
              id: d.id,
              restaurantName:
                typeof data?.restaurantName === 'string' &&
                data.restaurantName.trim()
                  ? data.restaurantName
                  : 'Not specified',
              mealType:
                typeof data?.mealType === 'string' ? data.mealType : 'N/A',
              mealName:
                typeof data?.mealType === 'string' ? data.mealType : undefined,
              totalPrice: Number(data?.totalPrice ?? 0),
              sharePrice: Number(data?.sharePrice ?? 0),
              userName:
                typeof data?.userName === 'string' ? data.userName : 'User',
              creatorId:
                typeof data?.creatorId === 'string'
                  ? data.creatorId
                  : data?.hostId,
              latitude: lat,
              longitude: lng,
              participantIds,
              maxParticipants:
                typeof data?.maxParticipants === 'number'
                  ? data.maxParticipants
                  : 2,
              status:
                typeof data?.status === 'string' ? data.status : undefined,
            });
          });
          setOrders(list);
          setLoading(false);
        },
        () => {
          if (!cancelled) setLoading(false);
        },
      );
      unsubRef.current = unsub;
    })();
    return () => {
      cancelled = true;
      if (unsubRef.current) {
        unsubRef.current();
        unsubRef.current = null;
      }
    };
  }, [radiusKm]);

  const refetch = useCallback(async () => {
    setError(null);
    try {
      const loc = await getUserLocation();
      setUserLocation({ latitude: loc.latitude, longitude: loc.longitude });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Location failed');
    }
  }, []);

  return { userLocation, orders, loading, error, refetch };
}
