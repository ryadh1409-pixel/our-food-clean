import type { Timestamp } from 'firebase/firestore';

/**
 * Normalizes Firestore `users.dateOfBirth` to `YYYY-MM-DD` for inputs.
 */
export function normalizeDateOfBirthFromFirestore(
  raw: unknown,
): string {
  if (typeof raw === 'string') {
    const s = raw.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  }
  if (raw && typeof raw === 'object' && raw !== null && 'toDate' in raw) {
    const fn = (raw as Timestamp).toDate;
    if (typeof fn === 'function') {
      const t = fn.call(raw);
      const y = t.getUTCFullYear();
      const m = String(t.getUTCMonth() + 1).padStart(2, '0');
      const d = String(t.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  }
  return '';
}

/**
 * Profile display: "June 12, 1989" (calendar date, not clock time).
 */
export function formatUserDateOfBirthLong(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (typeof value === 'string') {
    const s = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const [y, m, d] = s.split('-').map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d));
      return dt.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
      });
    }
  }
  if (value && typeof value === 'object' && value !== null && 'toDate' in value) {
    const fn = (value as Timestamp).toDate;
    if (typeof fn === 'function') {
      const t = fn.call(value);
      const dt = new Date(
        Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()),
      );
      return dt.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
      });
    }
  }
  return null;
}

export function isValidOptionalIsoDate(iso: string): boolean {
  const s = iso.trim();
  if (!s) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}
