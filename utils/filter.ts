/**
 * Global filter layer: remove blocked users from any in-memory list.
 * Use `hiddenUserIds` from `useHiddenUserIds()` (bidirectional hide).
 */

/** Pass-through from hooks: current user id + live hidden set. */
export type BlockFilterCurrentUser = {
  uid?: string | null;
  hiddenUserIds: Set<string>;
};

export type HiddenUserIdsInput =
  | Set<string>
  | BlockFilterCurrentUser
  | { hiddenUserIds: Set<string> };

export function resolveHiddenUserIds(input: HiddenUserIdsInput): Set<string> {
  if (input instanceof Set) return input;
  return input.hiddenUserIds;
}

/**
 * Removes rows whose associated user id is in the hidden set.
 *
 * @param list — any array (orders, matches, search hits, …)
 * @param currentUser — `{ hiddenUserIds }` from `useHiddenUserIds()` (and optional `uid`), or a raw `Set`
 * @param getUserId — pluck the user id to test from each item (e.g. `o => o.hostId`)
 *
 * Items with no user id are kept; narrow the list first if you need to drop them.
 */
export function filterBlockedUsers<T>(
  list: readonly T[],
  currentUser: HiddenUserIdsInput,
  getUserId: (item: T) => string | null | undefined,
): T[] {
  const hidden = resolveHiddenUserIds(currentUser);
  return list.filter((item) => {
    const id = getUserId(item);
    if (id == null || id === '') return true;
    return !hidden.has(id);
  });
}

export function filterBlockedUserIds(
  userIds: readonly string[],
  hiddenUserIds: Set<string>,
): string[] {
  return userIds.filter((id) => id && !hiddenUserIds.has(id));
}
