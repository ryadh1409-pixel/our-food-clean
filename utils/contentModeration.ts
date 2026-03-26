/**
 * User-generated content moderation for App Store UGC guidelines.
 * Use before persisting messages, bios, or other free-text fields.
 */

export const BANNED_WORDS = [
  'kill yourself',
  'kys',
  'nazi',
  'terror',
  'child porn',
  'rape',
  'telegram',
  'crypto',
  'bitcoin',
  'forex',
  'investment scam',
  'whatsapp.com/phone',
] as const;

const LINKISH = [
  'http://',
  'https://',
  'www.',
  '.tk/',
  '.ru/',
] as const;

export type ModerationResult =
  | { ok: true; text: string }
  | { ok: false; reason: string };

const DEFAULT_MAX_LENGTH = 2000;

export type ModerateOptions = {
  maxLength?: number;
};

/**
 * Returns moderated trimmed text or a rejection reason.
 */
export function moderateUserContent(
  raw: string,
  options?: ModerateOptions,
): ModerationResult {
  const maxLen = options?.maxLength ?? DEFAULT_MAX_LENGTH;
  const text = raw.trim();
  if (!text) {
    return { ok: false, reason: 'Content cannot be empty.' };
  }
  if (text.length > maxLen) {
    return {
      ok: false,
      reason: `Content is too long (max ${maxLen} characters).`,
    };
  }
  const lower = text.toLowerCase().replace(/\s+/g, ' ');
  for (const word of BANNED_WORDS) {
    if (lower.includes(word.toLowerCase())) {
      return { ok: false, reason: 'This content is not allowed on HalfOrder.' };
    }
  }
  for (const frag of LINKISH) {
    if (lower.includes(frag)) {
      return { ok: false, reason: 'Links are not allowed in this field.' };
    }
  }
  return { ok: true, text };
}
