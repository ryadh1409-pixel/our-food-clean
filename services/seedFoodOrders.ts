/**
 * Static seed data + builder for Firestore `orders` documents.
 *
 * For production rules-compliant shapes (client creates), see `buildOrdersSeedPayload`.
 * For Admin SDK seeding, use the same builder — it matches a normal "host-only" open order.
 */
import {
  addDoc,
  collection,
  doc,
  serverTimestamp,
  Timestamp,
  updateDoc,
  type Firestore,
} from 'firebase/firestore';

export type FoodOrderSeed = Readonly<{
  foodName: string;
  image: string;
  totalPrice: number;
  maxPeople: 2;
  usersAccepted: readonly string[];
}>;

/** Ten sample shared orders (URLs are Unsplash food photos). */
export const FOOD_ORDER_SEEDS: readonly FoodOrderSeed[] = [
  {
    foodName: 'Margherita pizza',
    image:
      'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=1200&q=80',
    totalPrice: 28,
    maxPeople: 2,
    usersAccepted: [],
  },
  {
    foodName: 'Classic cheeseburger & fries',
    image:
      'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=1200&q=80',
    totalPrice: 22.5,
    maxPeople: 2,
    usersAccepted: [],
  },
  {
    foodName: 'Salmon poke bowl',
    image:
      'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=1200&q=80',
    totalPrice: 31.9,
    maxPeople: 2,
    usersAccepted: [],
  },
  {
    foodName: 'Chicken tikka masala',
    image:
      'https://images.unsplash.com/photo-1588166524941-3bf61a9c41db?auto=format&fit=crop&w=1200&q=80',
    totalPrice: 26,
    maxPeople: 2,
    usersAccepted: [],
  },
  {
    foodName: 'Veggie ramen',
    image:
      'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=1200&q=80',
    totalPrice: 24,
    maxPeople: 2,
    usersAccepted: [],
  },
  {
    foodName: 'Tacos al pastor (4)',
    image:
      'https://images.unsplash.com/photo-1551504734-5ee1c4a1479b?auto=format&fit=crop&w=1200&q=80',
    totalPrice: 19.99,
    maxPeople: 2,
    usersAccepted: [],
  },
  {
    foodName: 'Greek salad & grilled halloumi',
    image:
      'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?auto=format&fit=crop&w=1200&q=80',
    totalPrice: 21.5,
    maxPeople: 2,
    usersAccepted: [],
  },
  {
    foodName: 'Korean fried chicken',
    image:
      'https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?auto=format&fit=crop&w=1200&q=80',
    totalPrice: 29.5,
    maxPeople: 2,
    usersAccepted: [],
  },
  {
    foodName: 'Pad Thai',
    image:
      'https://images.unsplash.com/photo-1559314809-0d155014e29e?auto=format&fit=crop&w=1200&q=80',
    totalPrice: 23,
    maxPeople: 2,
    usersAccepted: [],
  },
  {
    foodName: 'Chocolate lava cake split',
    image:
      'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?auto=format&fit=crop&w=1200&q=80',
    totalPrice: 14,
    maxPeople: 2,
    usersAccepted: [],
  },
] as const;

/** Payload you can pass to `addDoc` / Admin `set`, with timestamps filled by caller. */
export type OrdersSeedFirestorePayload = {
  foodName: string;
  image: string;
  totalPrice: number;
  maxPeople: number;
  usersAccepted: string[];
  pricePerPerson: number;
  peopleJoined: number;
  usersJoined: string[];
  users: {
    uid: string;
    displayName: string;
    photoURL: string | null;
    joinedAt: unknown;
  }[];
  createdBy: string;
  createdAt: unknown;
};

/**
 * Builds a single order document. Pass `joinedAt` and `createdAt` as
 * `serverTimestamp()` (client) or `FieldValue.serverTimestamp()` (Admin).
 */
export function buildOrdersSeedPayload(
  seed: FoodOrderSeed,
  hostUid: string,
  options: {
    displayName?: string;
    photoURL?: string | null;
    joinedAt: unknown;
    createdAt: unknown;
  },
): OrdersSeedFirestorePayload {
  const displayName = options.displayName ?? 'Seed host';
  const total = Number(seed.totalPrice);
  const people = seed.maxPeople;
  return {
    foodName: seed.foodName,
    image: seed.image,
    totalPrice: Number(total.toFixed(2)),
    maxPeople: people,
    usersAccepted: [...seed.usersAccepted],
    pricePerPerson: Number((total / people).toFixed(2)),
    peopleJoined: 1,
    usersJoined: [hostUid],
    users: [
      {
        uid: hostUid,
        displayName,
        photoURL: options.photoURL ?? null,
        joinedAt: options.joinedAt,
      },
    ],
    createdBy: hostUid,
    createdAt: options.createdAt,
  };
}

/**
 * Writes all seed orders using the Firebase **client** SDK (must satisfy security rules:
 * signed-in as `hostUid`).
 */
export async function seedFoodOrdersFromClient(
  db: Firestore,
  hostUid: string,
): Promise<string[]> {
  const ids: string[] = [];
  for (const seed of FOOD_ORDER_SEEDS) {
    const payload = buildOrdersSeedPayload(seed, hostUid, {
      joinedAt: Timestamp.now(),
      createdAt: serverTimestamp(),
    });
    const ref = await addDoc(collection(db, 'orders'), payload);
    await updateDoc(doc(db, 'orders', ref.id), { id: ref.id });
    ids.push(ref.id);
  }
  return ids;
}
