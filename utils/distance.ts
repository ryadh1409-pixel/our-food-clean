/**
 * Distance utilities for Auto-Match (500m radius).
 * Uses haversine formula.
 */

import { haversineDistanceKm } from '@/lib/haversine';

const METERS_PER_KM = 1000;

/**
 * Distance between two points in meters.
 */
export function distanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  return haversineDistanceKm(lat1, lon1, lat2, lon2) * METERS_PER_KM;
}

/**
 * Whether two points are within the given radius (meters).
 * Used for Auto-Match limit of 500m.
 */
export function isWithinRadiusMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  radiusMeters: number,
): boolean {
  const m = distanceMeters(lat1, lon1, lat2, lon2);
  return m <= radiusMeters;
}

export const AUTO_MATCH_RADIUS_METERS = 500;
