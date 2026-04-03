/** Half-order lifecycle stored on `orders.status`. */
export const ORDER_STATUS = {
  WAITING: 'waiting',
  MATCHED: 'matched',
  ACTIVE: 'active',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
} as const;

export type OrderStatusValue = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];

/** How long the host waits for a second person before auto-expire (client-side check). */
export const HALF_ORDER_MATCH_WAIT_MS = 45 * 60 * 1000;

/** Terminal statuses — hide from “Active” lists. */
export const ORDER_TERMINAL_STATUSES = new Set([
  ORDER_STATUS.CANCELLED,
  ORDER_STATUS.COMPLETED,
  ORDER_STATUS.EXPIRED,
]);

export function isTerminalOrderStatus(status: string | undefined | null): boolean {
  if (!status) return false;
  return ORDER_TERMINAL_STATUSES.has(status as OrderStatusValue);
}
