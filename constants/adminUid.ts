import { isAdminEmail } from '@/utils/admin';

/**
 * Firebase Auth uid for the admin account. Must match `isAdmin()` in
 * `firestore.rules`.
 */
export const ADMIN_UID = 'KT3LfXRsVgaH4LfRTQaexvj3CRn1';

/** Email admins may sign in with (must match Storage/Firestore rules). */
export const ADMIN_PANEL_EMAIL = 'admin@ourfood.com';

function normalizeEmail(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase();
}

/** Client-side admin gate. Firestore profile fields are client-writable and not authority. */
export function isAdminUser(
  user: { uid: string; email?: string | null } | null | undefined,
  _firestoreRole?: string | null,
): boolean {
  if (!user) return false;
  if (user.uid === ADMIN_UID) return true;
  if (normalizeEmail(user.email) === ADMIN_PANEL_EMAIL) return true;
  if (isAdminEmail(user.email)) return true;
  return false;
}
