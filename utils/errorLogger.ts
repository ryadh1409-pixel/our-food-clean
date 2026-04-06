/**
 * Logs errors for developers only. Never shows alerts, toasts, or other UI.
 * Call sites must surface friendly copy (inline Text, dedicated banners, etc.).
 *
 * The second argument is kept for API compatibility; it is ignored.
 */
export function logError(
  error: unknown,
  _options?: { alert?: boolean },
): void {
  if (__DEV__) {
    console.error('HalfOrder Error:', error);
  }

  // DO NOT show alert to user — removed intentionally for production UX
}
