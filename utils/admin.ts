import type { User } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';

import { db } from '@/services/firebase';

/** Emails that receive admin access through client/rules allowlists. */
export const ADMIN_EMAILS = [
  'support@halforder.app',
  'ryadh1409@gmail.com',
] as const;

function normalizeAdminEmail(email?: string | null): string {
  return (email ?? '').trim().toLowerCase();
}

export function isAdminEmail(email?: string | null): boolean {
  if (!email?.trim()) return false;
  return (ADMIN_EMAILS as readonly string[]).includes(normalizeAdminEmail(email));
}

/** Keeps the profile email fresh; admin access is not derived from user documents. */
export async function syncUserRoleToFirestore(user: User): Promise<void> {
  if (!user.uid || user.isAnonymous) return;
  const payload: Record<string, unknown> = {};
  if (user.email) {
    payload.email = user.email;
  }
  if (Object.keys(payload).length === 0) return;
  await setDoc(doc(db, 'users', user.uid), payload, { merge: true });
}
