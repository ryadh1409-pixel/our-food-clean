const INVITE_BASE = 'https://halforder.app/join';
const ORDER_BASE = 'https://halforder.app/order';

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
  const path = `${ORDER_BASE}/${orderId}`;
  if (refUserId?.trim())
    return `${path}?ref=${encodeURIComponent(refUserId.trim())}`;
  return path;
}

export const REFERRAL_STORAGE_KEY = 'halforder_referral_uid';
export const REFERRAL_ORDER_ID_KEY = 'halforder_referral_order_id';
