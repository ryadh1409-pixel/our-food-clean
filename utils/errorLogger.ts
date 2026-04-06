/**
 * Developer logging only. Never shows alerts, popups, or in-app UI.
 */
export function logError(error: unknown): void {
  if (__DEV__) {
    console.error(error);
  }
}
