export type SwipeMainTab = 'for-you' | 'pizza' | 'noodles';

export type FoodOrderType = 'pizza' | 'noodles';

/** High-quality hero images by food category (full-bleed cards). */
export const FOOD_HERO_IMAGE_BY_TYPE: Record<FoodOrderType, string> = {
  pizza:
    'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=1600&q=85',
  noodles:
    'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=1600&q=85',
};

export function getHeroImageUrlForType(type: FoodOrderType): string {
  return FOOD_HERO_IMAGE_BY_TYPE[type];
}

/** Single swipe card — mock contract; hero image comes from `type` in UI. */
export type MockFoodCard = {
  id: string;
  title: string;
  type: FoodOrderType;
  price: number;
  time: string;
  distance: string;
  peopleJoined: number;
  spotsLeft: number;
  categories: SwipeMainTab[];
};

export const SWIPE_MAIN_TABS: { key: SwipeMainTab; label: string }[] = [
  { key: 'for-you', label: 'For You' },
  { key: 'pizza', label: 'Pizza' },
  { key: 'noodles', label: 'Noodles' },
];

/** Exactly 10 items: 5 pizza, 5 noodles. */
export const mockOrders: MockFoodCard[] = [
  {
    id: '1',
    title: 'Pepperoni Pizza',
    type: 'pizza',
    price: 10,
    time: '20 min',
    distance: '0.5 km',
    peopleJoined: 2,
    spotsLeft: 1,
    categories: ['for-you', 'pizza'],
  },
  {
    id: '2',
    title: 'Cheese Pizza',
    type: 'pizza',
    price: 9,
    time: '18 min',
    distance: '0.7 km',
    peopleJoined: 1,
    spotsLeft: 2,
    categories: ['for-you', 'pizza'],
  },
  {
    id: '3',
    title: 'Veggie Pizza',
    type: 'pizza',
    price: 11,
    time: '22 min',
    distance: '1 km',
    peopleJoined: 3,
    spotsLeft: 1,
    categories: ['for-you', 'pizza'],
  },
  {
    id: '4',
    title: 'BBQ Chicken Pizza',
    type: 'pizza',
    price: 12,
    time: '25 min',
    distance: '0.8 km',
    peopleJoined: 2,
    spotsLeft: 2,
    categories: ['for-you', 'pizza'],
  },
  {
    id: '5',
    title: 'Margherita Pizza',
    type: 'pizza',
    price: 8,
    time: '15 min',
    distance: '0.6 km',
    peopleJoined: 1,
    spotsLeft: 1,
    categories: ['for-you', 'pizza'],
  },
  {
    id: '6',
    title: 'Chicken Noodles',
    type: 'noodles',
    price: 9,
    time: '15 min',
    distance: '0.4 km',
    peopleJoined: 2,
    spotsLeft: 1,
    categories: ['for-you', 'noodles'],
  },
  {
    id: '7',
    title: 'Beef Noodles',
    type: 'noodles',
    price: 11,
    time: '18 min',
    distance: '0.9 km',
    peopleJoined: 1,
    spotsLeft: 2,
    categories: ['for-you', 'noodles'],
  },
  {
    id: '8',
    title: 'Spicy Noodles',
    type: 'noodles',
    price: 10,
    time: '17 min',
    distance: '0.5 km',
    peopleJoined: 3,
    spotsLeft: 1,
    categories: ['for-you', 'noodles'],
  },
  {
    id: '9',
    title: 'Shrimp Noodles',
    type: 'noodles',
    price: 12,
    time: '20 min',
    distance: '1.2 km',
    peopleJoined: 2,
    spotsLeft: 2,
    categories: ['for-you', 'noodles'],
  },
  {
    id: '10',
    title: 'Veggie Noodles',
    type: 'noodles',
    price: 8,
    time: '14 min',
    distance: '0.3 km',
    peopleJoined: 1,
    spotsLeft: 1,
    categories: ['for-you', 'noodles'],
  },
];

/** @deprecated Use `mockOrders` */
export const MOCK_FOOD_CARDS = mockOrders;

export function filterCardsByTab(
  cards: MockFoodCard[],
  tab: SwipeMainTab,
): MockFoodCard[] {
  if (tab === 'for-you') return cards;
  return cards.filter((c) => c.categories.includes(tab));
}

/** First minutes digit sequence in `time` (e.g. "20 min" → 20) for countdown UI. */
export function parseMinutesFromTimeLabel(time: string): number {
  const m = /(\d+)/.exec(time);
  if (!m) return 30;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 ? Math.min(120, n) : 30;
}
