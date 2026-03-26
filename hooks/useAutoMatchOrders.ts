import { haversineDistanceKm } from '@/lib/haversine';
import { db } from '@/services/firebase';
import { getUserLocation } from '@/services/location';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { useCallback, useEffect, useState } from 'react';

const AUTO_MATCH_RADIUS_KM = 1;
const AUTO_MATCH_MAX_AGE_MS = 15 * 60 * 1000; // 15 minutes
const AUTO_MATCH_TOP = 5;

export type AutoMatchOrder = {
  id: string;
  restaurantName: string;
  latitude: number;
  longitude: number;
  participantIds: string[];
  maxParticipants: number;
  createdAtMs: number;
  hostId: string;
  distanceKm: number;
  status: string;
};

export function useAutoMatchOrders() {
  const [orders, setOrders] = useState<AutoMatchOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const loc = await getUserLocation();
      const q = query(
        collection(db, 'orders'),
        where('status', 'in', ['active', 'waiting', 'open']),
      );
      const snap = await getDocs(q);
      const now = Date.now();
      const cutoff = now - AUTO_MATCH_MAX_AGE_MS;
      const list: AutoMatchOrder[] = [];
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
        const distanceKm = haversineDistanceKm(
          loc.latitude,
          loc.longitude,
          lat,
          lng,
        );
        if (distanceKm > AUTO_MATCH_RADIUS_KM) return;
        const createdAt = data?.createdAt;
        const createdAtMs =
          createdAt?.toMillis?.() ??
          (typeof createdAt?.seconds === 'number'
            ? createdAt.seconds * 1000
            : 0);
        if (createdAtMs < cutoff) return;
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
          latitude: lat,
          longitude: lng,
          participantIds,
          maxParticipants:
            typeof data?.maxParticipants === 'number'
              ? data.maxParticipants
              : 2,
          createdAtMs,
          hostId: (data?.hostId ??
            data?.creatorId ??
            data?.userId ??
            '') as string,
          distanceKm,
          status: (data?.status as string) ?? 'active',
        });
      });
      list.sort((a, b) => {
        if (Math.abs(a.distanceKm - b.distanceKm) > 0.001)
          return a.distanceKm - b.distanceKm;
        return b.createdAtMs - a.createdAtMs; // newer first when distance tie
      });
      setOrders(list.slice(0, AUTO_MATCH_TOP));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { orders, loading, error, refetch: fetch };
}
