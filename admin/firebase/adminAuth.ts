const ADMIN_UID = 'KT3LfXRsVgaH4LfRTQaexvj3CRn1';
const DEFAULT_ADMIN_EMAILS = [
  'admin@ourfood.com',
  'support@halforder.app',
  'ryadh1409@gmail.com',
] as const;

export function getAdminEmails(): string[] {
  const raw = process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? '';
  const configured = raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set([...DEFAULT_ADMIN_EMAILS, ...configured]));
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const admins = getAdminEmails();
  if (admins.length === 0) return false;
  return admins.includes(email.trim().toLowerCase());
}

/** Prefer immutable auth identity; Firestore role is a legacy display field only. */
export async function getIsAdminByRole(
  uid: string,
  email?: string | null,
): Promise<boolean> {
  if (uid === ADMIN_UID || isAdminEmail(email)) return true;
  return false;
}
