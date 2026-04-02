/** Prefix logs for admin Firestore / navigation debugging. */
export function adminLog(scope: string, message: string, data?: unknown): void {
  if (data !== undefined) {
    console.log(`[admin:${scope}] ${message}`, data);
  } else {
    console.log(`[admin:${scope}] ${message}`);
  }
}

export function adminError(scope: string, message: string, err?: unknown): void {
  console.error(`[admin:${scope}] ${message}`, err);
}
