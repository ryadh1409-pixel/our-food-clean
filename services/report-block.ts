import { isUserBlocked as isUserBlockedService } from './block';
import { blockUser, submitUserReport } from './userSafety';

/**
 * Order-room combined action. Must use the same `reports` shape as
 * `submitUserReport` (`userId`, `contentId`, `reason`, no extra keys) or
 * Firestore denies the write and the block never runs.
 */
export async function reportAndBlock(
  reporterUid: string,
  reportedUid: string,
  orderId: string,
): Promise<void> {
  await submitUserReport({
    reporterId: reporterUid,
    reportedUserId: reportedUid,
    orderId,
    reason: 'abuse',
  });
  await blockUser(reporterUid, reportedUid);
}

export async function isBlockedByAny(
  blockedUid: string,
  blockerUids: string[],
): Promise<boolean> {
  if (blockerUids.length === 0) return false;
  for (const blockerUid of blockerUids) {
    if (await isUserBlockedService(blockedUid, blockerUid)) return true;
  }
  return false;
}

export async function hasBlockConflict(
  joinerUid: string,
  participants: string[],
): Promise<boolean> {
  for (const participantId of participants) {
    if (!participantId || participantId === joinerUid) continue;
    if (await isUserBlockedService(joinerUid, participantId)) {
      return true;
    }
  }
  return false;
}
