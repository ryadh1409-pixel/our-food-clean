import { db } from '@/services/firebase';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';

export type ReportReason = 'spam' | 'inappropriate' | 'scam' | 'other';

export async function submitReport(params: {
  reporterId: string;
  reportedUserId: string;
  reason: ReportReason;
  message: string;
  orderId?: string | null;
}): Promise<void> {
  if (!params.reporterId || !params.reportedUserId) {
    throw new Error('Missing reporter or reported user.');
  }
  if (params.reporterId === params.reportedUserId) {
    throw new Error('You cannot report yourself.');
  }
  await addDoc(collection(db, 'reports'), {
    reporterId: params.reporterId,
    reportedUserId: params.reportedUserId,
    orderId: params.orderId ?? null,
    reason: params.reason,
    message: params.message?.trim() || '',
    createdAt: serverTimestamp(),
  });
}
