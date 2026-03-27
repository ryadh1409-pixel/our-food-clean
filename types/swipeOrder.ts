export type SwipeFilter =
  | 'For You'
  | 'Pizza'
  | 'Burgers'
  | 'Late Night'
  | 'Food Trucks';

export type SwipeOrder = {
  id: string;
  createdBy: string;
  category: Exclude<SwipeFilter, 'For You'>;
  dishName: string;
  imageUrl: string;
  splitPriceCents: number;
  savingsPercent: number;
  distanceKm: number;
  etaMin: number;
  closingInMin: number;
  joinedCount: number;
  maxPeople: number;
  joinedAvatarUrls: string[];
};

export function formatSplitPrice(cents: number): string {
  return `$${(cents / 100).toFixed(0)} each`;
}

export function buildSpotLeftLabel(order: SwipeOrder): string {
  const spotsLeft = Math.max(order.maxPeople - order.joinedCount, 0);
  return spotsLeft === 1 ? '1 spot left' : `${spotsLeft} spots left`;
}
