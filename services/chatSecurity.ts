import type { Firestore } from 'firebase/firestore';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
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

export async function reportBlockedMessage(
  db: Firestore,
  userId: string,
  message: string,
  reason: string,
): Promise<void> {
  try {
    await addDoc(collection(db, 'reports'), {
      userId,
      reporterId: userId,
      reportedUserId: null,
      orderId: null,
      message,
      reason,
      createdAt: serverTimestamp(),
    });
  } catch {
    // Best-effort; do not block UI
  }
}
