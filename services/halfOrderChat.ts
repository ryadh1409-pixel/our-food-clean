/**
 * HalfOrder: `chats/{orderId}` mirrors `orders/{orderId}.users` for match chat.
 */
import {
  addDoc,
  collection,
  doc,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';

import {
  halfOrderChatMemberIds,
  halfOrderChatUsersAppendUpdate,
} from '@/lib/halfOrderPostJoin';
import { auth, db } from '@/services/firebase';

/**
 * Create or append `chats/{orderId}` so it includes every uid in `userIds`.
 *
 * Does not read the chat first: non-members are denied `get`, including the
 * creator before the doc exists. An existing chat may only gain `users`
 * (`isChatUsersAppendUpdate`); writing `participants` in that update is denied.
 */
export async function ensureHalfOrderChat(
  orderId: string,
  userIds: string[],
): Promise<void> {
  const t = orderId.trim();
  const caller = auth.currentUser?.uid ?? '';
  const unique = halfOrderChatMemberIds(userIds, caller);
  if (!t || !unique) return;

  const chatRef = doc(db, 'chats', t);
  try {
    await setDoc(chatRef, {
      orderId: t,
      users: unique,
      /** Initial create can set both lists. Later joins may only append `users`. */
      participants: unique,
      createdAt: serverTimestamp(),
      lastMessage: '',
      lastMessageAt: Date.now(),
    });
    return;
  } catch {
    // Doc already exists — full overwrite is not an allowed update.
  }

  try {
    await setDoc(chatRef, halfOrderChatUsersAppendUpdate(unique), { merge: true });
  } catch (e) {
    console.warn('[ensureHalfOrderChat] users append failed', e);
  }
}

export async function postHalfOrderChatSystemMessage(
  orderId: string,
  text: string,
): Promise<void> {
  const t = orderId.trim();
  if (!t) return;
  try {
    await addDoc(collection(db, 'chats', t, 'messages'), {
      text,
      senderId: 'system',
      createdAt: serverTimestamp(),
    });
    await setDoc(
      doc(db, 'chats', t),
      {
        lastMessage: text,
        lastMessageAt: Date.now(),
      },
      { merge: true },
    );
  } catch (e) {
    // Membership is already committed; a chat notice must not fail the join.
    console.warn('[postHalfOrderChatSystemMessage]', e);
  }
}
