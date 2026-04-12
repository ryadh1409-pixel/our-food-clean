/**
 * Creates a real `food_cards` + `orders` pair from AI assistant place picks (Swipe + Join flow).
 */
import {
  collection,
  doc,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';

import { HALF_ORDER_MATCH_WAIT_MS } from '@/constants/orderStatus';
import { ORDER_STATUS } from '@/constants/orderStatus';
import { autoInvite } from '@/services/autoInvite';
import { db } from '@/services/firebase';
import { ensureHalfOrderChat } from '@/services/halfOrderChat';
import { loadHalfOrderCreatorProfiles } from '@/services/orders';
import { syncOrderMemberProfilesForOrder } from '@/services/orderMemberProfile';

export const FOOD_CARD_DECK_SOURCE_AI_CHAT = 'ai_chat';

/** Same TTL as `FOOD_CARD_TTL_MS` in `foodCards.ts` (avoid circular import). */
const FOOD_CARD_TTL_MS = 45 * 60 * 1000;

const DEFAULT_HERO_IMAGE =
  'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=1200&q=80';

export type CreateAiPlaceOrderInput = {
  uid: string;
  placeName: string;
  address: string;
  displayName: string;
  photoUrl: string | null;
  lat?: number | null;
  lng?: number | null;
};

export type CreateAiPlaceOrderResult = {
  cardId: string;
  orderId: string;
};

/**
 * Writes `food_cards` (deck) + `orders` (HalfOrder) so Swipe + joinOrder behave like catalog cards.
 */
export async function createAiPlaceFoodCardAndOrder(
  input: CreateAiPlaceOrderInput,
): Promise<CreateAiPlaceOrderResult> {
  const placeName = input.placeName.trim();
  const address = input.address.trim();
  if (!placeName) throw new Error('Missing place name');

  const profiles = await loadHalfOrderCreatorProfiles(input.uid);
  if (!profiles) throw new Error('Could not load your profile');

  const user1 = {
    uid: input.uid,
    name: input.displayName.trim() || 'Host',
    photo: input.photoUrl,
  };

  const price = 16;
  const split = 8;
  const expiresAt = Date.now() + FOOD_CARD_TTL_MS;
  const hasGeo =
    input.lat != null &&
    input.lng != null &&
    Number.isFinite(input.lat) &&
    Number.isFinite(input.lng);

  const cardRef = doc(collection(db, 'food_cards'));
  const orderRef = doc(collection(db, 'orders'));

  const batch = writeBatch(db);

  batch.set(cardRef, {
    title: placeName,
    restaurantName: placeName,
    image: DEFAULT_HERO_IMAGE,
    price,
    splitPrice: split,
    sharingPrice: split,
    location: hasGeo
      ? { latitude: input.lat as number, longitude: input.lng as number }
      : address || 'Nearby',
    status: 'active',
    expiresAt,
    ownerId: input.uid,
    user1,
    maxUsers: 2,
    createdAt: serverTimestamp(),
    deckSource: FOOD_CARD_DECK_SOURCE_AI_CHAT,
    orderId: orderRef.id,
    aiDescription: `Shared order · ${address || 'See details'}`.slice(0, 400),
  });

  batch.set(orderRef, {
    cardId: cardRef.id,
    users: [input.uid],
    status: ORDER_STATUS.WAITING,
    matchWaitDeadlineAt: Date.now() + HALF_ORDER_MATCH_WAIT_MS,
    maxUsers: 2,
    createdBy: input.uid,
    hostId: input.uid,
    host: profiles.host,
    createdAt: serverTimestamp(),
    foodName: placeName,
    image: DEFAULT_HERO_IMAGE,
    pricePerPerson: split,
    totalPrice: price,
    location: address || placeName,
    restaurantName: placeName,
    participants: [input.uid],
    joinedAtMap: { [input.uid]: serverTimestamp() },
    ...(hasGeo
      ? { latitude: input.lat as number, longitude: input.lng as number }
      : {}),
  });

  await batch.commit();

  await ensureHalfOrderChat(orderRef.id, [input.uid]);
  await syncOrderMemberProfilesForOrder(orderRef.id, [input.uid]).catch(() => {});

  void autoInvite({
    id: orderRef.id,
    foodName: placeName,
    creatorUid: input.uid,
    latitude: hasGeo ? (input.lat as number) : null,
    longitude: hasGeo ? (input.lng as number) : null,
  });

  return { cardId: cardRef.id, orderId: orderRef.id };
}
