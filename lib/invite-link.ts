const INVITE_BASE = 'https://halforder.app/join';
const ORDER_BASE = 'https://halforder.app/order';

/** Universal link that opens the app join flow (`/join` + `orderId` query). */
export function buildJoinOrderWebUrl(orderId: string): string {
  const id = orderId.trim();
  if (!id) return INVITE_BASE;
  return `${INVITE_BASE}?orderId=${encodeURIComponent(id)}`;
}

/** WhatsApp one-tap share: HalfOrder copy + join deep link. */
export function buildViralWhatsAppInviteLink(orderId: string): string {
  const inviteLink = buildJoinOrderWebUrl(orderId);
  const message = `Hey 🍕 I started an order on HalfOrder — join me here:\n${inviteLink}`;
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

/** Public web URL for an order (universal links / share). */
export function buildOrderWebUrl(orderId: string): string {
  const id = orderId.trim();
  if (!id) return ORDER_BASE;
  return `${ORDER_BASE}/${encodeURIComponent(id)}`;
}

/** WhatsApp share with prefilled “Join my order” + web link. */
export function buildOrderWhatsAppInviteLink(orderId: string): string {
  return buildViralWhatsAppInviteLink(orderId);
}

/**
 * Returns a clean invite link for sharing (no exp:// or local IP).
 * Format: https://halforder.app/join/{orderId} or ...?ref={userId} for referral.
 */
export function generateInviteLink(
  orderId: string,
  refUserId?: string | null,
): string {
  const path = `${INVITE_BASE}/${orderId}`;
  if (refUserId?.trim())
    return `${path}?ref=${encodeURIComponent(refUserId.trim())}`;
  return path;
}

/**
 * Share Order link for Social Spread: https://halforder.app/order/{orderId}?ref={userId}
 */
export function generateOrderShareLink(
  orderId: string,
  refUserId: string | null | undefined,
): string {
  const path = buildOrderWebUrl(orderId);
  if (refUserId?.trim())
    return `${path}?ref=${encodeURIComponent(refUserId.trim())}`;
  return path;
}

export const REFERRAL_STORAGE_KEY = 'halforder_referral_uid';
export const REFERRAL_ORDER_ID_KEY = 'halforder_referral_order_id';
