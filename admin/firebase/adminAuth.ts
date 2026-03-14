import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/firebase/config';

export const ADMIN_ROLE = 'admin';

export function getAdminEmails(): string[] {
  const raw = process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? '';
  return raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const admins = getAdminEmails();
  if (admins.length === 0) return false;
  return admins.includes(email.trim().toLowerCase());
}

/** Check Firestore users/{uid} for role === "admin". Use this for route protection. */
export async function getIsAdminByRole(uid: string): Promise<boolean> {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    const data = snap.data();
    return data?.role === ADMIN_ROLE;
  } catch {
    return false;
  }
}
