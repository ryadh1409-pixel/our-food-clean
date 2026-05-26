import type { User } from '@firebase/auth';

export const ADMIN_UID = 'KT3LfXRsVgaH4LfRTQaexvj3CRn1';

const BUILT_IN_ADMIN_EMAILS = [
  'admin@ourfood.com',
  'support@halforder.app',
  'ryadh1409@gmail.com',
] as const;

export function getAdminEmails(): string[] {
  const raw = process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? '';
  const fromEnv = raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set([...BUILT_IN_ADMIN_EMAILS, ...fromEnv])];
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const admins = getAdminEmails();
  if (admins.length === 0) return false;
  return admins.includes(email.trim().toLowerCase());
}

/** Route protection must use auth identity/email, not client-writable Firestore profile fields. */
export function getIsAdminUser(user: Pick<User, 'uid' | 'email'> | null): boolean {
  if (!user) return false;
  return user.uid === ADMIN_UID || isAdminEmail(user.email);
}
