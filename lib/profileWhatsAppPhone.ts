/** North American WhatsApp field: default +1, display groups, storage = digits only. */

const CC = '1';
const FULL_LEN = 11;

export function profilePhoneDigitsOnly(s: string): string {
  return s.replace(/\D/g, '');
}

/** Value written to Firestore `users.phone` (no spaces). */
export function profilePhoneForFirestore(display: string): string {
  return profilePhoneDigitsOnly(display);
}

export function formatProfileWhatsAppDisplay(digits: string): string {
  let d = digits.replace(/\D/g, '');
  if (d.length === 0) return '+1 ';
  if (!d.startsWith(CC)) {
    d = CC + d;
  }
  d = d.slice(0, FULL_LEN);
  const national = d.slice(1);
  const a = national.slice(0, 3);
  const b = national.slice(3, 6);
  const c = national.slice(6, 10);
  let out = '+1';
  if (a) out += ' ' + a;
  if (b) out += ' ' + b;
  if (c) out += ' ' + c;
  return out;
}

/** Parse TextInput change: strip invalid chars via digits, re-format. */
export function profileWhatsAppOnChangeText(text: string): string {
  const d = text.replace(/\D/g, '');
  if (d.length === 0) return '+1 ';
  return formatProfileWhatsAppDisplay(d);
}

export function isCompleteNaProfilePhone(display: string): boolean {
  const d = profilePhoneDigitsOnly(display);
  return d.length === FULL_LEN && d.startsWith(CC);
}

/** True if user started typing beyond default +1 but number incomplete. */
export function isIncompleteNaProfilePhone(display: string): boolean {
  const d = profilePhoneDigitsOnly(display);
  return d.length > 1 && d.length < FULL_LEN;
}

export function displayFromStoredProfilePhone(stored: string | undefined | null): string {
  if (!stored || !stored.trim()) return '+1 ';
  return formatProfileWhatsAppDisplay(stored);
}

/** Treat as empty / not set (only default country digit or nothing). */
export function isProfilePhoneStorageEmpty(digits: string): boolean {
  return profilePhoneDigitsOnly(digits).length <= 1;
}
