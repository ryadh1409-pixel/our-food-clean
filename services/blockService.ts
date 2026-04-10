/**
 * Production block API — consistent argument order:
 * `blockUser(currentUserId, targetUserId)` = signed-in user blocks `targetUserId`.
 *
 * Persists `users/{currentUserId}.blockedUsers` (array + subcollection) and legacy `blocks` docs.
 */
import { isUserBlocked as isUserBlockedFirestore } from '@/services/block';
import type { BlockFilterCurrentUser } from '@/utils/filter';
import {
  blockUser as blockUserPersist,
  unblockUser as unblockUserPersist,
} from '@/services/blocks';

export type { BlockFilterCurrentUser } from '@/utils/filter';

export async function blockUser(
  currentUserId: string,
  targetUserId: string,
): Promise<void> {
  return blockUserPersist(currentUserId, targetUserId);
}

export async function unblockUser(
  currentUserId: string,
  targetUserId: string,
): Promise<void> {
  return unblockUserPersist(currentUserId, targetUserId);
}

/**
 * **Sync (instant UI):** pass `{ uid, hiddenUserIds }` from `useHiddenUserIds()`.
 * True if `targetUserId` is in the hidden set (blocked either direction).
 *
 * **Async (server):** pass two strings — full Firestore check (arrays, subcollections, legacy `blocks`).
 */
export function isUserBlocked(
  currentUser: BlockFilterCurrentUser,
  targetUserId: string,
): boolean;
export function isUserBlocked(
  currentUserId: string,
  targetUserId: string,
): Promise<boolean>;
export function isUserBlocked(
  currentUser: BlockFilterCurrentUser | string,
  targetUserId: string,
): boolean | Promise<boolean> {
  if (typeof currentUser === 'string') {
    return isUserBlockedFirestore(currentUser, targetUserId);
  }
  if (!targetUserId) return false;
  if (currentUser.uid && targetUserId === currentUser.uid) return false;
  return currentUser.hiddenUserIds.has(targetUserId);
}
