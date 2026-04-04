/**
 * WhatsApp deep links for HalfOrder (wa.me — digits only, no + or spaces).
 */

import * as Linking from 'expo-linking';

/** Default when opening a match conversation from the order screen. */
export const WHATSAPP_MATCH_DEFAULT_MESSAGE =
  "Hey, we matched on HalfOrder. Let's coordinate pickup.";

/** Strip everything except digits (removes +, spaces, dashes). */
export function sanitizeWhatsAppDigits(phone: string | null | undefined): string {
  if (!phone) return '';
  return phone.replace(/\D/g, '');
}

export function buildWhatsAppMeUrl(
  phoneDigits: string,
  message: string = WHATSAPP_MATCH_DEFAULT_MESSAGE,
): string {
  const d = sanitizeWhatsAppDigits(phoneDigits);
  if (!d) return '';
  const q =
    message.trim().length > 0 ? `?text=${encodeURIComponent(message.trim())}` : '';
  return `https://wa.me/${d}${q}`;
}

/** Opens WhatsApp chat; returns false if phone invalid or open fails. */
export async function openWhatsAppWithMessage(
  phone: string | null | undefined,
  message: string = WHATSAPP_MATCH_DEFAULT_MESSAGE,
): Promise<boolean> {
  const url = buildWhatsAppMeUrl(phone ?? '', message);
  if (!url) return false;
  try {
    const supported = await Linking.canOpenURL(url);
    if (!supported) return false;
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}
