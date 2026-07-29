import type { DocumentData } from 'firebase/firestore';

function stringUidList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === 'string' && x.length > 0);
}

/** True when the order has no other members besides `uid` (or is empty). */
export function orderHasOnlyUidAsMember(
  data: DocumentData,
  uid: string,
): boolean {
  const users = stringUidList(data.users);
  const participants = stringUidList(data.participants);
  if (users.length > 1 || participants.length > 1) return false;
  if (users.length === 1 && users[0] !== uid) return false;
  if (participants.length === 1 && participants[0] !== uid) return false;
  return true;
}
