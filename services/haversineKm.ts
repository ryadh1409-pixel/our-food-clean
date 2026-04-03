/** Haversine distance between two WGS84 points, kilometers. */

export type LatLng = { lat: number; lng: number };

/** Alias for app code readability. Safe if inputs are missing (returns NaN). */
export function getDistanceKm(a: LatLng | null | undefined, b: LatLng | null | undefined): number {
  if (!a || !b) return NaN;
  if (!Number.isFinite(a.lat) || !Number.isFinite(a.lng)) return NaN;
  if (!Number.isFinite(b.lat) || !Number.isFinite(b.lng)) return NaN;
  return haversineDistanceKm(a, b);
}

export function haversineDistanceKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const h =
    sinDLat * sinDLat +
    Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return R * c;
}

export function formatDistanceKm(km: number | null | undefined, decimals = 1): string {
  if (km == null || !Number.isFinite(km)) return '—';
  return `${km.toFixed(decimals)} km`;
}
