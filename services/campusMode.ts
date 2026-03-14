/**
 * Campus Mode: special matching when user is inside a university campus zone.
 * Match radius becomes 150m instead of 500m.
 */

import { distanceMeters } from '@/utils/distance';

export type CampusZone = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radiusMeters: number;
};

export const CAMPUS_ZONES: CampusZone[] = [
  {
    id: 'uoft',
    name: 'University of Toronto',
    lat: 43.6629,
    lng: -79.3957,
    radiusMeters: 600,
  },
];

/** When Campus Mode is active, match radius is 150m. */
export const CAMPUS_MATCH_RADIUS_METERS = 150;

/**
 * Check if a point (user location) is inside any campus zone.
 */
export function isInsideCampus(
  userLat: number,
  userLng: number,
): { isInside: boolean; campus: CampusZone | null } {
  for (const campus of CAMPUS_ZONES) {
    const d = distanceMeters(userLat, userLng, campus.lat, campus.lng);
    if (d <= campus.radiusMeters) {
      return { isInside: true, campus };
    }
  }
  return { isInside: false, campus: null };
}
