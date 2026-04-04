/**
 * Food-card join: Firestore composite index failures and safe handling for UI.
 */

export class JoinOrderFirestoreHandledError extends Error {
  constructor() {
    super('JOIN_ORDER_FIRESTORE_HANDLED');
    this.name = 'JoinOrderFirestoreHandledError';
  }
}

/** Client SDK rejects `serverTimestamp()` (and similar) inside array elements. */
export function isFirestoreArrayServerTimestampError(error: unknown): boolean {
  const msg = (
    error instanceof Error ? error.message : String(error)
  ).toLowerCase();
  return (
    (msg.includes('server') &&
      msg.includes('timestamp') &&
      (msg.includes('array') || msg.includes('arrays'))) ||
    msg.includes('cannot be used inside arrays')
  );
}

export function isFirestoreCompositeIndexError(error: unknown): boolean {
  const msg =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : '';
  const lower = msg.toLowerCase();
  if (lower.includes('requires an index')) return true;
  const code =
    error &&
    typeof error === 'object' &&
    'code' in error &&
    typeof (error as { code?: unknown }).code === 'string'
      ? (error as { code: string }).code
      : null;
  if (
    code === 'failed-precondition' &&
    (lower.includes('index') || lower.includes('indexes'))
  ) {
    return true;
  }
  return false;
}

/**
 * Developer-only: short console line + optional index URL. Never pass to Alert/UI.
 */
export function logFirestoreIndexError(
  context: string,
  error: unknown,
): void {
  const msg =
    error instanceof Error
      ? error.message.split('\n')[0]
      : typeof error === 'string'
        ? error
        : 'Unknown error';
  console.warn(`[${context}] Firestore query issue (will retry if applicable):`, msg);
  const urlMatch = msg.match(/https:\/\/[^\s)'"]+/);
  if (urlMatch) {
    console.warn(`[${context}] Index console link (devs only):`, urlMatch[0]);
  }
}

/** User-facing messages thrown inside `joinOrder` after auth/profile checks. */
export const JOIN_ORDER_USER_FACING_MESSAGES = new Set([
  'Card not found',
  'Invalid card',
  'Sign in required',
  'Not authorized',
  'Could not load your profile to join.',
  'Could not load your profile to create this order.',
  'This card is not available',
  'This order is not open for joining',
  'This card has expired',
  'You cannot join your own card',
  'You cannot join this order due to a block.',
  'Order is full',
  'Host profile could not be loaded for this order.',
  'Order data out of sync. Try again shortly.',
  'You must be signed in to join an order.',
  'Order not found.',
  'Invalid order.',
  'Use the standard join flow for this order.',
  'Order no longer exists.',
  'Your account has been restricted. You cannot join orders.',
  'Order is already full.',
  'Order is not open',
]);

export function isJoinOrderUserFacingError(error: unknown): boolean {
  return (
    error instanceof Error &&
    JOIN_ORDER_USER_FACING_MESSAGES.has(error.message)
  );
}
