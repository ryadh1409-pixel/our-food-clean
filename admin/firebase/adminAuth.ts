import type { User } from '@firebase/auth';

const ADMIN_UID = 'KT3LfXRsVgaH4LfRTQaexvj3CRn1';
const RULE_ADMIN_EMAILS = [
  'admin@ourfood.com',
  'support@halforder.app',
  'ryadh1409@gmail.com',
] as const;

export function getAdminEmails(): string[] {
  const raw = process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? '';
  const envEmails = raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set([...RULE_ADMIN_EMAILS, ...envEmails]));
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const admins = getAdminEmails();
  if (admins.length === 0) return false;
  return admins.includes(email.trim().toLowerCase());
}

/** Client route guard. Firestore rules use the same auth uid/email roots. */
export function isAdminAuthUser(
  user: Pick<User, 'uid' | 'email'> | null | undefined,
): boolean {
  if (!user) return false;
  return user.uid === ADMIN_UID || isAdminEmail(user.email);
}
