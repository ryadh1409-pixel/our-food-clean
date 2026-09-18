import { isAdminFoodCardSlotId } from '@/constants/adminFoodCards';

export type OrderDetailSource = 'order' | 'food_card';

export type ResolvedOrderDetail<T> =
  | { source: OrderDetailSource; row: T }
  | { source: null; row: null };

/**
 * Catalog swipe invites use `/order/{1-10}`. A same-id `orders` doc or a
 * client-written `food_cards.orderId` would steal that join. Always show the
 * card so join-by-cardId can pick the real waiting HalfOrder.
 *
 * AI cards may legitimately store `orderId` at create time; follow that pointer
 * when the URL is the card id, but ignore `orders/{cardId}` squats.
 */
export function resolveOrderDetailSource<T>(input: {
  urlId: string;
  primaryOrder: T | null;
  linkedOrder: T | null;
  foodCard: T | null;
}): ResolvedOrderDetail<T> {
  const { urlId, primaryOrder, linkedOrder, foodCard } = input;
  const catalogSlot = isAdminFoodCardSlotId(urlId);

  if (catalogSlot) {
    if (foodCard) return { source: 'food_card', row: foodCard };
    return { source: null, row: null };
  }

  if (foodCard) {
    if (linkedOrder) return { source: 'order', row: linkedOrder };
    return { source: 'food_card', row: foodCard };
  }

  if (primaryOrder) return { source: 'order', row: primaryOrder };
  if (linkedOrder) return { source: 'order', row: linkedOrder };
  return { source: null, row: null };
}

/** Invite / details URL id: catalog slots must stay the card id. */
export function foodCardInviteTargetId(card: {
  id: string;
  orderId?: string | null;
}): string {
  if (isAdminFoodCardSlotId(card.id)) return card.id;
  const linked = card.orderId?.trim();
  return linked || card.id;
}
