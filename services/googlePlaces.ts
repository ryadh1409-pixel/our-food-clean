/**
 * Google Maps Geocoding + Places Nearby Search + Place Photos.
 * Requires EXPO_PUBLIC_GOOGLE_API_KEY and enabled APIs + billing on the key.
 */

import {
  getNearbyRestaurants as getMockNearbyRestaurants,
  type LatLng,
  type NearbyRestaurant,
} from '@/services/api';

const GOOGLE_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_API_KEY ?? '';

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
    photos?: { photo_reference: string }[];
  }[];
  status: string;
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
  const key = GOOGLE_API_KEY.trim();
  if (!photos?.length || !key) {
    return PLACE_IMAGE_FALLBACK;
  }
  const ref = photos[0].photo_reference;
  return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${encodeURIComponent(ref)}&key=${encodeURIComponent(key)}`;
}

export async function getCoordinates(
  placeName: string,
): Promise<{ lat: number; lng: number } | null> {
  const key = GOOGLE_API_KEY.trim();
  const q = placeName.trim();
  if (!key || !q) return null;

  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(q)}&key=${encodeURIComponent(key)}`;
  const res = await fetch(url);
  const data = (await res.json()) as GeocodeResult;
  if (data.status !== 'OK' || !data.results?.length) return null;
  return data.results[0].geometry.location;
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
  const key = GOOGLE_API_KEY.trim();
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
  const key = GOOGLE_API_KEY.trim();
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

/** Keyword search near a place name (e.g. pizza). Same as WithCoords but only rows. */
export async function getNearbyRestaurants(
  locationText: string,
  keyword = 'pizza',
): Promise<PlaceRestaurant[]> {
  const { restaurants } = await getNearbyRestaurantsWithCoords(
    locationText,
    keyword,
  );
  return restaurants;
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
