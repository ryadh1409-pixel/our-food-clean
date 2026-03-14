/**
 * Returns human-readable countdown to expiry, e.g. "23h 45m" or "Expired".
 */
export function getCreditExpiryCountdown(expiresAtMs: number | null): string {
  if (expiresAtMs == null) return '—';
  const now = Date.now();
  if (now >= expiresAtMs) return 'Expired';
  const diff = expiresAtMs - now;
  const hours = Math.floor(diff / (60 * 60 * 1000));
  const minutes = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return '< 1m';
}
