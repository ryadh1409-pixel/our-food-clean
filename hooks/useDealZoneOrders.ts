import type { DealZone } from '@/constants/deal-zones';
import { haversineDistanceKm } from '@/lib/haversine';
import { db } from '@/services/firebase';
import { getUserLocation } from '@/services/location';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { useCallback, useEffect, useState } from 'react';

export type DealZoneOrder = {
  id: string;
  restaurantName: string;
  latitude: number;
  longitude: number;
  participantIds: string[];
  maxParticipants: number;
  distanceFromUserKm: number | null;
};

export function useDealZoneOrders(zone: DealZone) {
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [orders, setOrders] = useState<DealZoneOrder[]>([]);
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
        where('status', 'in', ['active', 'waiting']),
      );
      const snap = await getDocs(q);
      const list: DealZoneOrder[] = [];
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
          const distFromZone = haversineDistanceKm(
            zone.latitude,
            zone.longitude,
            lat,
            lng,
          );
          if (distFromZone <= zone.radiusKm) {
            const participantIds = Array.isArray(data?.participantIds)
              ? data.participantIds
              : [];
            const distFromUser = haversineDistanceKm(
              loc.latitude,
              loc.longitude,
              lat,
              lng,
            );
            list.push({
              id: d.id,
              restaurantName:
                typeof data?.restaurantName === 'string' &&
                data.restaurantName.trim()
                  ? data.restaurantName
                  : 'Restaurant',
              latitude: lat,
              longitude: lng,
              participantIds,
              maxParticipants:
                typeof data?.maxParticipants === 'number'
                  ? data.maxParticipants
                  : 2,
              distanceFromUserKm: distFromUser,
            });
          }
        }
      });
      list.sort(
        (a, b) => (a.distanceFromUserKm ?? 0) - (b.distanceFromUserKm ?? 0),
      );
      setOrders(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [zone.id, zone.latitude, zone.longitude, zone.radiusKm]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const userDistanceFromZone =
    userLocation != null
      ? haversineDistanceKm(
          userLocation.latitude,
          userLocation.longitude,
          zone.latitude,
          zone.longitude,
        )
      : null;
  const userInZone =
    userDistanceFromZone != null && userDistanceFromZone <= zone.radiusKm;

  return { userLocation, userInZone, orders, loading, error, refetch: fetch };
}
