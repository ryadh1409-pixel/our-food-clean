/**
 * Maps unknown errors to a single safe string for Alert.toast (no raw Firebase internals).
 */
export function friendlyErrorMessage(_error: unknown): string {
  return 'Something went wrong. Please try again.';
}
