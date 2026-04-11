/**
 * Nearby restaurant discovery for guided ordering (mock-ready for real API).
 */

export type LatLng = { lat: number; lng: number };

export type NearbyRestaurant = {
  id: string;
  name: string;
  rating: number;
  distance: string;
  image: string;
};

const MOCK_PIZZA_SPOTS: NearbyRestaurant[] = [
  {
    id: '1',
    name: 'Pizza Pizza',
    rating: 4.2,
    distance: '0.3 km',
    image:
      'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=800&q=80',
  },
  {
    id: '2',
    name: 'Pizzaiolo',
    rating: 4.5,
    distance: '0.5 km',
    image:
      'https://images.unsplash.com/photo-1594007654729-407eedc4fe24?auto=format&fit=crop&w=800&q=80',
  },
  {
    id: '3',
    name: 'Libretto',
    rating: 4.7,
    distance: '0.8 km',
    image:
      'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?auto=format&fit=crop&w=800&q=80',
  },
  {
    id: '4',
    name: 'Domino’s',
    rating: 4.1,
    distance: '1.1 km',
    image:
      'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=800&q=80',
  },
];

/**
 * Returns mock restaurants near `location` for `cuisine` (e.g. "pizza").
 * Swap body for Places API / backend when ready.
 */
export async function getNearbyRestaurants(
  _location: LatLng,
  cuisine: string,
): Promise<NearbyRestaurant[]> {
  void _location;
  void cuisine;
  await new Promise((r) => setTimeout(r, 450));
  return [...MOCK_PIZZA_SPOTS];
}

export type PopularPizza = {
  id: string;
  name: string;
  price: number;
  image: string;
};

export const POPULAR_PIZZAS: PopularPizza[] = [
  {
    id: 'p1',
    name: 'Classic Pepperoni',
    price: 18.99,
    image:
      'https://images.unsplash.com/photo-1628840042765-356cda07504e?auto=format&fit=crop&w=600&q=80',
  },
  {
    id: 'p2',
    name: 'Margherita Fresca',
    price: 16.5,
    image:
      'https://images.unsplash.com/photo-1571997478779-2adcbbe9ab2f?auto=format&fit=crop&w=600&q=80',
  },
  {
    id: 'p3',
    name: 'Truffle Mushroom',
    price: 21.0,
    image:
      'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=600&q=80',
  },
];
