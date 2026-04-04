/** Fixed catalog slots — Firestore doc ids `1` … `10`. */
export const ADMIN_FOOD_CARD_SLOT_IDS = [
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
] as const;

export type AdminFoodCardSlotId =
  (typeof ADMIN_FOOD_CARD_SLOT_IDS)[number];

export const ADMIN_FOOD_CARD_SLOT_COUNT =
  ADMIN_FOOD_CARD_SLOT_IDS.length;

/** Half-order member cap for admin catalog / food-card flow (enforced client-side). */
export const FOOD_CARD_ORDER_MAX_USERS = 2;

const SLOT_ID_SET = new Set<string>(ADMIN_FOOD_CARD_SLOT_IDS);

export function isAdminFoodCardSlotId(id: string): boolean {
  return SLOT_ID_SET.has(id);
}
