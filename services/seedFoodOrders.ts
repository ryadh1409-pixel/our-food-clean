/**
 * Swipe / food-match seed data for Firestore `orders`.
 * Admin writes bypass rules; use `scripts/run-seed-orders.ts`.
 */
import {
  addDoc,
  collection,
  doc,
  serverTimestamp,
  Timestamp,
  updateDoc,
  type FieldValue,
  type Firestore,
} from 'firebase/firestore';

export type SwipeFoodOrderSeed = {
  foodName: string;
  image: string;
  totalPrice: number;
  maxPeople: 2;
  usersAccepted: string[];
};

/** Base catalog (name + image). Prices filled by `generateTenSwipeFoodOrders`. */
const SWIPE_FOOD_CATALOG: readonly { foodName: string; image: string }[] = [
  {
    foodName: 'Wood-fired pepperoni pizza',
    image:
      'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=1200&q=80',
  },
  {
    foodName: 'Smash burger & truffle fries',
    image:
      'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=1200&q=80',
  },
  {
    foodName: 'Rainbow sushi platter',
    image:
      'https://images.unsplash.com/photo-1579584425555-c3ce17fd4351?auto=format&fit=crop&w=1200&q=80',
  },
  {
    foodName: 'Chicken tikka masala & naan',
    image:
      'https://images.unsplash.com/photo-1588166524941-3bf61a9c41db?auto=format&fit=crop&w=1200&q=80',
  },
  {
    foodName: 'Tonkotsu ramen (extra egg)',
    image:
      'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=1200&q=80',
  },
  {
    foodName: 'Carne asada tacos',
    image:
      'https://images.unsplash.com/photo-1551504734-5ee1c4a1479b?auto=format&fit=crop&w=1200&q=80',
  },
  {
    foodName: 'Mediterranean mezze box',
    image:
      'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?auto=format&fit=crop&w=1200&q=80',
  },
  {
    foodName: 'Korean double-fried wings',
    image:
      'https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?auto=format&fit=crop&w=1200&q=80',
  },
  {
    foodName: 'Shrimp pad thai',
    image:
      'https://images.unsplash.com/photo-1559314809-0d155014e29e?auto=format&fit=crop&w=1200&q=80',
  },
  {
    foodName: 'Molten chocolate soufflé',
    image:
      'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?auto=format&fit=crop&w=1200&q=80',
  },
] as const;

/** Integer USD totals in [10, 50] — randomized per call (new set each run). */
export function generateTenSwipeFoodOrders(): SwipeFoodOrderSeed[] {
  return SWIPE_FOOD_CATALOG.map((row) => ({
    foodName: row.foodName,
    image: row.image,
    totalPrice: 10 + Math.floor(Math.random() * 41),
    maxPeople: 2 as const,
    usersAccepted: [],
  }));
}

/** Minimal order shape for Admin seeding (matches swipe + match feature spec). */
export function swipeOrderAdminFields(
  seed: SwipeFoodOrderSeed,
  createdAt: unknown,
): Record<string, unknown> {
  return {
    foodName: seed.foodName,
    image: seed.image,
    totalPrice: Number(seed.totalPrice.toFixed(2)),
    maxPeople: seed.maxPeople,
    usersAccepted: [...seed.usersAccepted],
    createdAt,
  };
}

/**
 * Optional: still-valid client create shape for manual testing (host order rules).
 * Includes `usersAccepted: []` for swipe consistency.
 */
export function buildHostedOrderWithSwipeField(opts: {
  foodName: string;
  image: string;
  totalPrice: number;
  maxPeople: number;
  hostUid: string;
  displayName: string;
  photoURL: string | null;
  joinedAt: Timestamp;
  createdAt: FieldValue;
}) {
  const people = Math.max(opts.maxPeople, 2);
  const total = Number(opts.totalPrice);
  return {
    foodName: opts.foodName.trim(),
    image: opts.image.trim(),
    pricePerPerson: Number((total / people).toFixed(2)),
    totalPrice: Number(total.toFixed(2)),
    peopleJoined: 1,
    maxPeople: people,
    usersAccepted: [] as string[],
    usersJoined: [opts.hostUid],
    users: [
      {
        uid: opts.hostUid,
        displayName: opts.displayName,
        photoURL: opts.photoURL,
        joinedAt: opts.joinedAt,
      },
    ],
    createdBy: opts.hostUid,
    createdAt: opts.createdAt,
  };
}

/** Client seed helper for dev: creates hosted orders that also support swipe likes. */
export async function seedFoodOrdersFromClient(
  db: Firestore,
  hostUid: string,
  displayName: string,
  photoURL: string | null,
): Promise<string[]> {
  const ids: string[] = [];
  for (const seed of generateTenSwipeFoodOrders()) {
    const createdAt = serverTimestamp();
    const payload = buildHostedOrderWithSwipeField({
      foodName: seed.foodName,
      image: seed.image,
      totalPrice: seed.totalPrice,
      maxPeople: seed.maxPeople,
      hostUid,
      displayName,
      photoURL,
      joinedAt: Timestamp.now(),
      createdAt,
    });
    const ref = await addDoc(collection(db, 'orders'), payload);
    await updateDoc(doc(db, 'orders', ref.id), { id: ref.id });
    ids.push(ref.id);
  }
  return ids;
}
