import { db } from '@/services/firebase';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';

/** Stored on each `reports` document (Guideline 1.2). */
export type ReportReason = 'spam' | 'abuse' | 'inappropriate';

export const UGC_REPORT_REASONS: { id: ReportReason; label: string }[] = [
  { id: 'spam', label: 'Spam' },
  { id: 'abuse', label: 'Abuse' },
  { id: 'inappropriate', label: 'Inappropriate content' },
];

export function reportContentIdChatMessage(
  chatId: string,
  messageId: string,
): string {
  return `chat:${chatId}:message:${messageId}`;
}

export function reportContentIdOrder(orderId: string): string {
  return `order:${orderId}`;
}

/** Profile / user screen when no message context. */
export function reportContentIdUser(reportedUserId: string): string {
  return `user:${reportedUserId}`;
}

export async function submitReport(params: {
  reporterId: string;
  reportedUserId: string;
  contentId: string;
  reason: ReportReason;
}): Promise<void> {
  if (!params.reporterId || !params.reportedUserId) {
    throw new Error('Missing reporter or reported user.');
  }
  if (params.reporterId === params.reportedUserId) {
    throw new Error('You cannot report yourself.');
  }
  const contentId = params.contentId?.trim() ?? '';
  if (!contentId) {
    throw new Error('Missing content reference.');
  }

  await addDoc(collection(db, 'reports'), {
    /** Reporter (Guideline 1.2 schema); mirrors `reporterId`. */
    userId: params.reporterId,
    reporterId: params.reporterId,
    reportedUserId: params.reportedUserId,
    contentId,
    reason: params.reason,
    createdAt: serverTimestamp(),
  });
}
