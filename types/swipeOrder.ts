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
  return `$${(cents / 100).toFixed(2)} / person`;
}

/** Stable pseudo-random in [min, max] from a string (for mock distance / ETA). */
export function mockNumericFromId(
  id: string,
  salt: string,
  min: number,
  max: number,
  decimals: number = 1,
): number {
  const s = `${id}:${salt}`;
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  const t = (Math.abs(h) % 10000) / 10000;
  const v = min + t * (max - min);
  const p = 10 ** decimals;
  return Math.round(v * p) / p;
}

export function buildSpotLeftLabel(order: SwipeOrder): string {
  const spotsLeft = Math.max(order.maxPeople - order.joinedCount, 0);
  return spotsLeft === 1 ? '1 spot left' : `${spotsLeft} spots left`;
}
