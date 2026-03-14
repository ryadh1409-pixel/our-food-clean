/**
 * Invite link generation for sharing orders.
 * Link format: halforder.app/order/{orderId}
 */

const ORDER_BASE = 'https://halforder.app/order';

/**
 * Generate order link for invite sharing.
 * When opened, app navigates to /order/{orderId} (Join Order screen).
 */
export function getOrderLink(orderId: string): string {
  if (!orderId?.trim()) return '';
  return `${ORDER_BASE}/${orderId.trim()}`;
}

/**
 * Message template for sharing an order invite.
 */
export function getShareMessage(
  restaurantName: string,
  orderLink: string,
): string {
  const restaurant = restaurantName?.trim() || 'a restaurant';
  const link = orderLink?.trim() || '';
  return `I'm ordering from ${restaurant}.\nWant to split the order?\n\nJoin here:\n${link}`;
}
