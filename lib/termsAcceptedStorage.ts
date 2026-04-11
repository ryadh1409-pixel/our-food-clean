/**
 * Legacy device-local Terms flags (AsyncStorage).
 *
 * **Signed-in gating** uses Firestore `users/{uid}.hasAcceptedTerms` (`useUserTermsStatus`,
 * `acceptTermsOfService`). These helpers remain for migration / any offline-only reads.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  ACCEPTED_TERMS_KEY,
  TERMS_ACCEPTANCE_STORAGE_KEY,
} from '@/constants/termsAcceptance';

export async function getTermsAcceptedAsync(): Promise<boolean> {
  try {
    const [primary, legacy] = await Promise.all([
      AsyncStorage.getItem(ACCEPTED_TERMS_KEY),
      AsyncStorage.getItem(TERMS_ACCEPTANCE_STORAGE_KEY),
    ]);
    if (typeof primary === 'string' && primary.trim().length > 0) {
      return true;
    }
    if (typeof legacy === 'string' && legacy.trim().length > 0) {
      await AsyncStorage.setItem(ACCEPTED_TERMS_KEY, legacy.trim());
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** Persist acceptance; writes both keys so older code paths stay consistent. */
export async function setTermsAcceptedAsync(isoTimestamp: string): Promise<void> {
  const v = isoTimestamp.trim();
  await AsyncStorage.multiSet([
    [ACCEPTED_TERMS_KEY, v],
    [TERMS_ACCEPTANCE_STORAGE_KEY, v],
  ]);
}
