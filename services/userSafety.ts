/**
 * Production helpers for reporting users and blocking (Firestore: reports, blocks).
 */
import {
  addDoc,
  collection,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/services/firebase';
import { logError } from '@/utils/errorLogger';
import { blockUser as blockUserService } from '@/services/block';

export type ReportPayload = {
  reporterId: string;
  reportedUserId: string;
  orderId?: string | null;
  reason?: string;
  context?: string;
};

/** Creates a reports document (admin review). Does not block. */
export async function submitUserReport(payload: ReportPayload): Promise<void> {
  await addDoc(collection(db, 'reports'), {
    reporterId: payload.reporterId,
    reportedUserId: payload.reportedUserId,
    orderId: payload.orderId ?? null,
    reason: payload.reason?.trim() || 'user_report',
    context: payload.context?.trim() || null,
    createdAt: serverTimestamp(),
  });
}

/** Blocks another user in `blockedUsers` collection. */
export async function blockUser(
  blockerId: string,
  blockedId: string,
): Promise<void> {
  await blockUserService(blockedId, blockerId);
}

export function handleSafetyError(error: unknown, fallback: string): string {
  logError(error, { alert: false });
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
