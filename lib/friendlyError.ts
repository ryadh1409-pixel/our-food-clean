import { USER_ERROR_GENERIC } from '@/lib/userFacingErrors';

/**
 * Maps unknown errors to a single safe string for alerts (no Firebase codes or stack text).
 */
export function friendlyErrorMessage(_error: unknown): string {
  return USER_ERROR_GENERIC;
}
