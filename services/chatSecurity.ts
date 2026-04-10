import type { Firestore } from 'firebase/firestore';
import { moderateUserContent } from '@/utils/contentModeration';

const CHAT_MAX_CHARS = 200;

export type MessageSafetyResult =
  | { safe: true }
  | { safe: false; reason: string };

export function isMessageSafe(text: string): MessageSafetyResult {
  const result = moderateUserContent(text, { maxLength: CHAT_MAX_CHARS });
  if (!result.ok) {
    return { safe: false, reason: result.reason };
  }
  return { safe: true };
}

/**
 * Firestore `reports` requires a real `reportedUserId` (see `firestore.rules`).
 * Automated moderation blocks should not write invalid docs — log only.
 */
export async function reportBlockedMessage(
  _db: Firestore,
  userId: string,
  message: string,
  reason: string,
): Promise<void> {
  if (__DEV__) {
    console.warn('[UGC] Blocked message (not persisted to reports):', {
      userId,
      reason,
      preview: message.slice(0, 80),
    });
  }
}
