import { haversineDistanceKm } from './haversine';

const RADIUS_KM = 1; // 1000 meters

export type OrderForStats = {
  id: string;
  createdAtMs: number;
  latitude?: number;
  longitude?: number;
  location?: { latitude?: number; longitude?: number };
  status?: string;
  participantIds?: string[];
  joinedUsers?: string[];
};

export function getOrderLatLng(
  order: OrderForStats,
): { lat: number; lng: number } | null {
  const lat = order.latitude ?? order.location?.latitude;
  const lng = order.longitude ?? order.location?.longitude;
  if (typeof lat === 'number' && typeof lng === 'number') return { lat, lng };
  return null;
}

export function countOrdersAndMatchesInRadius(
  orders: OrderForStats[],
  campaignLat: number,
  campaignLng: number,
  startTimeMs: number,
  endTimeMs?: number,
): { ordersCreated: number; matchesCreated: number } {
  let ordersCreated = 0;
  let matchesCreated = 0;
  for (const order of orders) {
    const latLng = getOrderLatLng(order);
    if (!latLng) continue;
    if (order.createdAtMs < startTimeMs) continue;
    if (endTimeMs != null && order.createdAtMs > endTimeMs) continue;
    const dist = haversineDistanceKm(
      campaignLat,
      campaignLng,
      latLng.lat,
      latLng.lng,
    );
    if (dist > RADIUS_KM) continue;
    ordersCreated += 1;
    const participants = order.participantIds ?? order.joinedUsers ?? [];
    const isMatch = order.status === 'matched' || participants.length >= 2;
    if (isMatch) matchesCreated += 1;
  }
  return { ordersCreated, matchesCreated };
}
