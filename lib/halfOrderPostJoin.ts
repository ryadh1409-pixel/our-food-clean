/**
 * Write shapes for HalfOrder chat + order_members after a membership commit.
 *
 * Chat reads are member-only, so the joiner cannot `get` the chat before joining it.
 * Chat updates may change only `users` (+1, caller is the new uid). A combined
 * `users` + `participants` update is denied and used to fail the join after the
 * order write had already committed.
 */

function uniqueSortedIds(userIds: readonly string[]): string[] {
  const unique: string[] = [];
  for (const raw of userIds) {
    if (typeof raw !== 'string') continue;
    const id = raw.trim();
    if (!id || unique.includes(id)) continue;
    unique.push(id);
  }
  unique.sort();
  return unique;
}

/**
 * Existing-chat update. Rules allow only `users` to change, and only by +1
 * with the caller as the new member. Do not add `participants` here.
 */
export function halfOrderChatUsersAppendUpdate(memberIds: readonly string[]): {
  users: string[];
} {
  return { users: [...memberIds] };
}

/** Member list for a chat create/append. Null when the caller is not in it. */
export function halfOrderChatMemberIds(
  userIds: readonly string[],
  callerUid: string,
): string[] | null {
  const caller = callerUid.trim();
  if (!caller) return null;
  const unique = uniqueSortedIds(userIds);
  if (!unique.includes(caller)) return null;
  return unique;
}

/**
 * Only the signed-in user may write `orders/{id}/order_members/{uid}`.
 * Syncing the rest of the pair throws permission-denied after a successful join.
 */
export function orderMemberIdsCallerCanSync(
  userIds: readonly string[],
  callerUid: string | null | undefined,
): string[] {
  const caller = typeof callerUid === 'string' ? callerUid.trim() : '';
  if (!caller) return [];
  const unique = uniqueSortedIds(userIds);
  return unique.includes(caller) ? [caller] : [];
}
