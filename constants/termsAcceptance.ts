import { DeviceEventEmitter } from 'react-native';

/** AsyncStorage key — bump version if Terms materially change and re-prompt is required */
export const TERMS_ACCEPTANCE_STORAGE_KEY = 'halforder_terms_accepted_v2';

/** Root layout listens for immediate navigation after accept (AsyncStorage is async on re-read). */
export const TERMS_ACCEPTED_EVENT = 'halforder_terms_accepted';

export function emitTermsAccepted(): void {
  DeviceEventEmitter.emit(TERMS_ACCEPTED_EVENT);
}

export const TERMS_ACCEPTANCE_REQUIRED = true;

/**
 * Deep-link / post-login path to open after terms acceptance. Blocks open redirects.
 */
export function normalizeReturnPathAfterTerms(raw: string | undefined): string {
  if (raw == null || typeof raw !== 'string') {
    return '/(tabs)';
  }
  let t = raw.trim();
  try {
    t = decodeURIComponent(t);
  } catch {
    return '/(tabs)';
  }
  t = t.trim();
  if (!t.startsWith('/') || t.startsWith('//')) {
    return '/(tabs)';
  }
  const lower = t.toLowerCase();
  if (
    lower.includes('://') ||
    lower.startsWith('javascript:') ||
    lower.startsWith('mailto:')
  ) {
    return '/(tabs)';
  }
  return t;
}
