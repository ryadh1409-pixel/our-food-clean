/**
 * Google Maps Geocoding + Places Nearby Search + Place Photos.
 * Prefer `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`; falls back to `EXPO_PUBLIC_GOOGLE_API_KEY`.
 * Requires enabled APIs + billing on the key.
 */

import {
  getNearbyRestaurants as getMockNearbyRestaurants,
  type LatLng,
  type NearbyRestaurant,
} from '@/services/api';

/** Web service key for Geocoding / Places (Nearby, Photo). */
const PLACES_WEB_KEY = (
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
  process.env.EXPO_PUBLIC_GOOGLE_API_KEY ||
  ''
).trim();

/** Nearby Search for chat: prefer the Maps-named env var (Expo embeds at build time). */
function nearbySearchApiKey(): string {
  return (
    (process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '').trim() ||
    PLACES_WEB_KEY
  );
}

/** Fixed anchor for “North York” while geocoding is optional (per product spec). */
export const NORTH_YORK_FIXED_COORDS = { lat: 43.7615, lng: -79.4111 } as const;

export type PlaceRestaurant = {
  id: string;
  name: string;
  rating: number;
  image: string;
  distance?: string;
};

type NearbySearchResult = {
  results: {
    place_id: string;
    name: string;
    rating?: number;
    price_level?: number;
    vicinity?: string;
    formatted_address?: string;
    photos?: { photo_reference: string }[];
  }[];
  status: string;
  error_message?: string;
};

/** Chat assistant: ranked pick with price level for sorting / UI */
export type ChatRestaurantPick = {
  name: string;
  rating: number;
  priceLevel: number | null;
  address: string;
};

type GeocodeResult = {
  results: {
    geometry: { location: { lat: number; lng: number } };
  }[];
  status: string;
};

/** Unsplash fallback when Places has no photo (always show an image). */
export const PLACE_IMAGE_FALLBACK =
  'https://images.unsplash.com/photo-1594007654729-407eedc4fe24';

/**
 * Maps Place Photo API URL, or the canonical fallback image (spec).
 * `photos[0].photo_reference` from Nearby Search results.
 */
export function getPlacePhoto(
  photos: { photo_reference: string }[] | undefined | null,
): string {
  const key = PLACES_WEB_KEY;
  if (!photos?.length || !key) {
    return PLACE_IMAGE_FALLBACK;
  }
  const ref = photos[0].photo_reference;
  return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${encodeURIComponent(ref)}&key=${encodeURIComponent(key)}`;
}

export async function getCoordinates(
  placeName: string,
): Promise<{ lat: number; lng: number } | null> {
  const key = PLACES_WEB_KEY;
  const q = placeName.trim();
  if (!key || !q) return null;

  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(q)}&key=${encodeURIComponent(key)}`;
  const res = await fetch(url);
  const data = (await res.json()) as GeocodeResult;
  if (data.status !== 'OK' || !data.results?.length) return null;
  return data.results[0].geometry.location;
}

/**
 * Resolves a user-written area to lat/lng. North York uses a fixed anchor for now;
 * other areas use Geocoding.
 */
export async function resolveLocationCoordsForFoodChat(
  locationLabel: string,
): Promise<{ lat: number; lng: number } | null> {
  const q = locationLabel.trim();
  if (!q) return null;
  if (/\bnorth\s+york\b/i.test(q)) {
    return { lat: NORTH_YORK_FIXED_COORDS.lat, lng: NORTH_YORK_FIXED_COORDS.lng };
  }
  return getCoordinates(q);
}

function toPlaceRestaurant(r: NearbyRestaurant): PlaceRestaurant {
  return {
    id: r.id,
    name: r.name,
    rating: r.rating,
    image: r.image,
    distance: r.distance,
  };
}

async function nearbyFromCoords(
  lat: number,
  lng: number,
  keyword: string,
): Promise<PlaceRestaurant[]> {
  const key = PLACES_WEB_KEY;
  if (!key) return [];

  const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=2000&keyword=${encodeURIComponent(keyword)}&key=${encodeURIComponent(key)}`;
  const res = await fetch(url);
  const data = (await res.json()) as NearbySearchResult;

  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    return [];
  }

  return (data.results ?? []).map((place) => ({
    id: place.place_id,
    name: place.name,
    rating: typeof place.rating === 'number' ? place.rating : 4.0,
    image: getPlacePhoto(place.photos),
  }));
}

/**
 * Geocode + nearby search; returns restaurants and coordinates for checkout.
 * Without API key or empty text → mock data + default coords (Toronto centroid).
 */
export async function getNearbyRestaurantsWithCoords(
  locationText: string,
  keyword = 'pizza',
): Promise<{
  restaurants: PlaceRestaurant[];
  coords: LatLng | null;
}> {
  const key = PLACES_WEB_KEY;
  const text = locationText.trim();
  if (!key || !text) {
    const loc: LatLng = { lat: 43.6532, lng: -79.3832 };
    const mock = await getMockNearbyRestaurants(loc, keyword);
    return {
      restaurants: mock.map(toPlaceRestaurant),
      coords: loc,
    };
  }

  const coords = await getCoordinates(text);
  if (!coords) {
    return { restaurants: [], coords: null };
  }

  const restaurants = await nearbyFromCoords(coords.lat, coords.lng, keyword);
  return {
    restaurants,
    coords: { lat: coords.lat, lng: coords.lng },
  };
}

/**
 * Match AI-picked restaurant name to a Places row (fuzzy) for real photos.
 */
export function matchPlaceRestaurantByName(
  places: PlaceRestaurant[],
  aiRestaurantName: string,
): PlaceRestaurant | null {
  if (!places.length) return null;
  const raw = aiRestaurantName.trim();
  if (!raw) return places[0];

  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[''`]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

  const nn = normalize(raw);

  for (const p of places) {
    if (normalize(p.name) === nn) return p;
  }
  for (const p of places) {
    const pn = normalize(p.name);
    if (pn.includes(nn) || nn.includes(pn)) return p;
  }
  const firstWord = nn.split(' ')[0];
  if (firstWord.length > 2) {
    const hit = places.find((p) =>
      normalize(p.name).split(' ').some((w) => w.startsWith(firstWord)),
    );
    if (hit) return hit;
  }
  return places[0];
}

/**
 * Google Places Nearby Search (legacy JSON) for chat — real restaurants only.
 * Uses `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` when set.
 */
async function nearbySearchForChat(
  lat: number,
  lng: number,
  keyword: string,
  limit: number,
): Promise<ChatRestaurantPick[]> {
  const key = nearbySearchApiKey();
  if (!key || !Number.isFinite(lat) || !Number.isFinite(lng)) return [];

  const url =
    `https://maps.googleapis.com/maps/api/place/nearbysearch/json` +
    `?location=${encodeURIComponent(`${lat},${lng}`)}` +
    `&radius=1500` +
    `&type=restaurant` +
    `&keyword=${encodeURIComponent(keyword.trim())}` +
    `&key=${encodeURIComponent(key)}`;

  try {
    const res = await fetch(url);
    const data = (await res.json()) as NearbySearchResult;
    if (__DEV__ && data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      console.warn(
        '[Places nearbysearch]',
        data.status,
        data.error_message ?? '',
      );
    }
    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      return [];
    }

    const rows = data.results ?? [];
    const sorted = [...rows].sort(
      (a, b) => (b.rating ?? 0) - (a.rating ?? 0),
    );

    return sorted.slice(0, limit).map((p) => ({
      name: p.name,
      rating: typeof p.rating === 'number' ? p.rating : 0,
      priceLevel: typeof p.price_level === 'number' ? p.price_level : null,
      address:
        (p.vicinity || p.formatted_address || '').trim() ||
        'Address unavailable',
    }));
  } catch (e) {
    if (__DEV__) console.warn('[Places nearbysearch] fetch failed', e);
    return [];
  }
}

/**
 * Food + area → top 3 restaurants (name, rating, address/vicinity).
 * Coordinates: North York uses a fixed point; other areas use Geocoding.
 */
export async function getNearbyRestaurants(
  food: string,
  location: string,
): Promise<ChatRestaurantPick[]> {
  const f = food.trim();
  const loc = location.trim();
  if (!f || !loc) return [];

  const coords = await resolveLocationCoordsForFoodChat(loc);
  if (!coords) return [];

  return nearbySearchForChat(coords.lat, coords.lng, f, 3);
}

/**
 * Same Nearby Search given coordinates (e.g. profile “near you”).
 */
export async function fetchTopCheapestNearbyForChat(
  lat: number,
  lng: number,
  keyword: string,
  limit = 3,
): Promise<ChatRestaurantPick[]> {
  return nearbySearchForChat(lat, lng, keyword, limit);
}
