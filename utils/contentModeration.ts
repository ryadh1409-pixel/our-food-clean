/**
 * User-generated content moderation for App Store UGC guidelines.
 * Use before persisting messages, bios, or other free-text fields.
 */

/** Shown when text matches the banned-word list (case-insensitive). */
export const CONTENT_NOT_ALLOWED = 'Content not allowed';

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
      return { ok: false, reason: CONTENT_NOT_ALLOWED };
    }
  }
  for (const frag of LINKISH) {
    if (lower.includes(frag)) {
      return { ok: false, reason: 'Links are not allowed in this field.' };
    }
  }
  return { ok: true, text };
}

/** Fast junk / flooding heuristics (in addition to banned words / links). */
function detectSpamPatterns(text: string): string | null {
  const t = text.trim();
  if (t.length > 15 && t === t.toUpperCase() && /[A-Z]/.test(t)) {
    return 'Please avoid typing in all caps.';
  }
  if (/(.)\1{14,}/.test(t)) {
    return 'Please avoid spamming repeated characters.';
  }
  const words = t
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 1);
  if (words.length >= 5) {
    const counts = new Map<string, number>();
    for (const w of words) {
      counts.set(w, (counts.get(w) ?? 0) + 1);
    }
    for (const c of counts.values()) {
      if (c >= 5) {
        return 'Please avoid repeating the same word many times.';
      }
    }
  }
  return null;
}

/**
 * Moderation for live chat / assistant input: length, banned terms, links, spam shapes.
 */
export function moderateChatMessage(
  raw: string,
  options: { maxLength: number },
): ModerationResult {
  const base = moderateUserContent(raw, { maxLength: options.maxLength });
  if (!base.ok) {
    return base;
  }
  const spam = detectSpamPatterns(base.text);
  if (spam) {
    return { ok: false, reason: spam };
  }
  return { ok: true, text: base.text };
}
