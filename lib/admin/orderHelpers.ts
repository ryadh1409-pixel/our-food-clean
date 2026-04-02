/** Creator / host uid for `orders` documents (schema varies). */
export function orderCreatorUid(data: Record<string, unknown>): string {
  const v =
    data.createdBy ?? data.hostId ?? data.creatorId ?? data.userId ?? '';
  return typeof v === 'string' ? v : '';
}

/** Distinct participant UIDs for an order (host + `participants` array). */
export function orderParticipantUids(data: Record<string, unknown>): string[] {
  const creator = orderCreatorUid(data);
  const parts = Array.isArray(data.participants)
    ? data.participants.filter((x): x is string => typeof x === 'string')
    : [];
  const set = new Set<string>();
  if (creator) set.add(creator);
  parts.forEach((id) => set.add(id));
  return [...set];
}

export function shortenUid(uid: string, head = 6): string {
  if (!uid || uid.length <= head + 2) return uid || '—';
  return `${uid.slice(0, head)}…`;
}

export function formatParticipantPreview(ids: string[], maxShow = 3): string {
  if (ids.length === 0) return '—';
  const shown = ids.slice(0, maxShow).map((id) => shortenUid(id));
  const more = ids.length > maxShow ? ` +${ids.length - maxShow}` : '';
  return `${shown.join(', ')}${more}`;
}

/** Report body text — prefers `details`, then `message`, `context`. */
export function reportDetailText(data: Record<string, unknown>): string | null {
  if (typeof data.details === 'string' && data.details.trim()) return data.details.trim();
  if (typeof data.message === 'string' && data.message.trim()) return data.message.trim();
  if (typeof data.context === 'string' && data.context.trim()) return data.context.trim();
  return null;
}

export function isActiveOrderStatus(status: string): boolean {
  return [
    'open',
    'active',
    'matched',
    'full',
    'locked',
    'ready_to_pay',
  ].includes(status);
}

/** All admin-visible timestamps use Toronto (product region). */
const TORONTO_LOCALE: Intl.DateTimeFormatOptions = {
  timeZone: 'America/Toronto',
};

export function firestoreTimeToMs(v: unknown): number | null {
  if (v && typeof v === 'object' && v !== null && 'toMillis' in v) {
    const fn = (v as { toMillis?: () => number }).toMillis;
    if (typeof fn === 'function') {
      const ms = fn.call(v);
      return typeof ms === 'number' && Number.isFinite(ms) ? ms : null;
    }
  }
  if (typeof v === 'number' && Number.isFinite(v)) {
    return v;
  }
  if (typeof v === 'string' && v.trim() && !Number.isNaN(Date.parse(v))) {
    return Date.parse(v);
  }
  return null;
}

export function formatFirestoreTime(v: unknown): string {
  const ms = firestoreTimeToMs(v);
  if (ms == null) return '—';
  return new Date(ms).toLocaleString('en-CA', TORONTO_LOCALE);
}

export function formatMillisToronto(ms: number): string {
  if (!Number.isFinite(ms)) return '—';
  return new Date(ms).toLocaleString('en-CA', TORONTO_LOCALE);
}

export function orderDisplayTitle(
  data: Record<string, unknown>,
  fallbackDocId: string,
): string {
  const food =
    typeof data.foodName === 'string' && data.foodName.trim()
      ? data.foodName.trim()
      : '';
  const title =
    typeof data.title === 'string' && data.title.trim() ? data.title.trim() : '';
  const rest =
    typeof data.restaurantName === 'string' && data.restaurantName.trim()
      ? data.restaurantName.trim()
      : '';
  return food || title || rest || fallbackDocId.slice(0, 8);
}

export function orderDisplayPriceLabel(data: Record<string, unknown>): string {
  const total = data.totalPrice ?? data.price;
  const split = data.splitPrice ?? data.sharePrice;
  if (typeof total === 'number' && Number.isFinite(total)) {
    return `$${total.toFixed(2)} total`;
  }
  if (typeof split === 'number' && Number.isFinite(split)) {
    return `$${split.toFixed(2)} / share`;
  }
  return '—';
}

export function orderExpiresAtMs(data: Record<string, unknown>): number | null {
  const exp = data.expiresAt;
  if (typeof exp === 'number' && Number.isFinite(exp)) return exp;
  const ms = firestoreTimeToMs(exp);
  return ms;
}
