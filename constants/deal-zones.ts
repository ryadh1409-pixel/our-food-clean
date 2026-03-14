/**
 * Deal zone: a named area (e.g. mall) with centre coordinates and radius in km.
 * Users and orders within the radius are considered "in" the zone.
 */
export type DealZone = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radiusKm: number;
};

export const EATON_CENTRE: DealZone = {
  id: 'eaton_centre',
  name: 'Eaton Centre',
  latitude: 43.6544,
  longitude: -79.3807,
  radiusKm: 0.5,
};

export const DEAL_ZONES: DealZone[] = [EATON_CENTRE];
