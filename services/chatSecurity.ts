import type { Firestore } from 'firebase/firestore';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';

const FORBIDDEN_PATTERNS = [
  'http',
  'https',
  'www.',
  '.com',
  '.net',
  '.org',
  '.ru',
  '.xyz',
];

const BANNED_WORDS = ['telegram', 'crypto', 'bitcoin', 'investment', 'forex'];

export type MessageSafetyResult =
  | { safe: true }
  | { safe: false; reason: string };

export function isMessageSafe(text: string): MessageSafetyResult {
  const lower = text.toLowerCase();

  if (text.length > 200) {
    return { safe: false, reason: 'Message too long' };
  }

  for (const pattern of FORBIDDEN_PATTERNS) {
    if (lower.includes(pattern)) {
      return { safe: false, reason: 'Links are not allowed' };
    }
  }

  for (const word of BANNED_WORDS) {
    if (lower.includes(word)) {
      return { safe: false, reason: 'Message contains blocked words' };
    }
  }

  return { safe: true };
}

export async function reportBlockedMessage(
  db: Firestore,
  userId: string,
  message: string,
  reason: string,
): Promise<void> {
  try {
    await addDoc(collection(db, 'reports'), {
      userId,
      message,
      reason,
      createdAt: serverTimestamp(),
    });
  } catch {
    // Best-effort; do not block UI
  }
}
