/**
 * UGC safety: Firestore `reports` + `users/.../blockedUsers`.
 */
import { logError } from '@/utils/errorLogger';
import { blockUser as persistBlock } from '@/services/blockService';
import {
  reportContentIdChatMessage,
  reportContentIdOrder,
  reportContentIdUser,
  type ReportReason,
  submitReport,
} from '@/services/reports';

export type ReportPayload = {
  reporterId: string;
  reportedUserId: string;
  orderId?: string | null;
  chatId?: string | null;
  messageId?: string | null;
  reason?: string;
  context?: string;
};

/** Maps free-text / legacy menu strings to `ReportReason`. */
export function coerceReportReason(raw: string | undefined): ReportReason {
  const r = (raw ?? '').trim().toLowerCase();
  if (r.includes('spam') || r.includes('scam')) return 'spam';
  if (
    r.includes('abuse') ||
    r.includes('harass') ||
    r.includes('inappropriate behavior')
  ) {
    return 'abuse';
  }
  if (r.includes('inappropriate')) return 'inappropriate';
  return 'inappropriate';
}

function buildContentId(payload: ReportPayload): string {
  if (payload.chatId && payload.messageId) {
    return reportContentIdChatMessage(payload.chatId, payload.messageId);
  }
  if (payload.orderId?.trim()) {
    return reportContentIdOrder(payload.orderId.trim());
  }
  if (payload.chatId?.trim()) {
    return `chat:${payload.chatId.trim()}`;
  }
  return reportContentIdUser(payload.reportedUserId);
}

export async function submitUserReport(payload: ReportPayload): Promise<void> {
  const reason = coerceReportReason(payload.reason);
  await submitReport({
    reporterId: payload.reporterId,
    reportedUserId: payload.reportedUserId,
    contentId: buildContentId(payload),
    reason,
  });
}

/**
 * `blockerId` blocks `blockedId`.
 * `blockService.blockUser` is `(currentUserId, targetUserId)` — do not swap.
 */
export async function blockUser(
  blockerId: string,
  blockedId: string,
): Promise<void> {
  await persistBlock(blockerId, blockedId);
}

export function handleSafetyError(error: unknown, fallback: string): string {
  logError(error);
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
