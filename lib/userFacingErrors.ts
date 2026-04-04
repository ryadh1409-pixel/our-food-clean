/**
 * Ensures alerts never show raw Firebase / SDK / stack strings.
 */
import { JOIN_ORDER_USER_FACING_MESSAGES } from '@/lib/joinOrderFirestore';

/** Safe copy for generic failures. */
export const USER_ERROR_GENERIC = 'Something went wrong. Please try again.';

export const USER_ERROR_JOIN = 'Unable to join. Please try again.';

/**
 * Use a message in an alert only if allowlisted; otherwise fallback (no raw SDK text).
 */
export function safeAlertBody(
  message: string | undefined | null,
  fallback: string = USER_ERROR_GENERIC,
): string {
  const m = typeof message === 'string' ? message.trim() : '';
  if (!m) return fallback;
  if (JOIN_ORDER_USER_FACING_MESSAGES.has(m)) return m;
  return fallback;
}
