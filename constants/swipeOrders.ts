import type { SwipeFilter, SwipeOrder } from '@/types/swipeOrder';

export const SWIPE_FILTERS: SwipeFilter[] = [
  'For You',
  'Pizza',
  'Burgers',
  'Late Night',
  'Food Trucks',
];

// Mock feed shape mirrors what a Firestore-backed list would expose.
export const MOCK_SWIPE_ORDERS: SwipeOrder[] = [
  {
    id: 'order-pizza-1',
    createdBy: 'mock-user-1',
    category: 'Pizza',
    dishName: 'Pepperoni Pizza',
    imageUrl:
      'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=1200&q=80',
    splitPriceCents: 1000,
    savingsPercent: 50,
    distanceKm: 0.5,
    etaMin: 20,
    closingInMin: 5,
    joinedCount: 2,
    maxPeople: 3,
    joinedAvatarUrls: [
      'https://i.pravatar.cc/100?img=31',
      'https://i.pravatar.cc/100?img=12',
    ],
  },
  {
    id: 'order-truck-1',
    createdBy: 'mock-user-2',
    category: 'Food Trucks',
    dishName: 'Spicy Ramen Noodles',
    imageUrl:
      'https://images.unsplash.com/photo-1617093727343-374698b1b08d?auto=format&fit=crop&w=1200&q=80',
    splitPriceCents: 800,
    savingsPercent: 42,
    distanceKm: 0.8,
    etaMin: 16,
    closingInMin: 3,
    joinedCount: 1,
    maxPeople: 3,
    joinedAvatarUrls: ['https://i.pravatar.cc/100?img=45'],
  },
  {
    id: 'order-burger-1',
    createdBy: 'mock-user-3',
    category: 'Burgers',
    dishName: 'Smash Burger Combo',
    imageUrl:
      'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=1200&q=80',
    splitPriceCents: 1100,
    savingsPercent: 48,
    distanceKm: 1.1,
    etaMin: 24,
    closingInMin: 7,
    joinedCount: 2,
    maxPeople: 3,
    joinedAvatarUrls: [
      'https://i.pravatar.cc/100?img=20',
      'https://i.pravatar.cc/100?img=51',
    ],
  },
  {
    id: 'order-latenight-1',
    createdBy: 'mock-user-4',
    category: 'Late Night',
    dishName: 'Chicken Shawarma Box',
    imageUrl:
      'https://images.unsplash.com/photo-1529006557810-274b9b2fc783?auto=format&fit=crop&w=1200&q=80',
    splitPriceCents: 900,
    savingsPercent: 46,
    distanceKm: 1.4,
    etaMin: 28,
    closingInMin: 6,
    joinedCount: 1,
    maxPeople: 2,
    joinedAvatarUrls: ['https://i.pravatar.cc/100?img=14'],
  },
];
