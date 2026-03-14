import { db } from '@/services/firebase';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';

/**
 * Chat ID for an order: orderId + "_" + sorted participant IDs (deterministic).
 */
export function getChatIdForOrder(
  orderId: string,
  participantIds: string[],
): string {
  const sorted = [...participantIds].filter(Boolean).sort();
  return `${orderId}_${sorted.join('_')}`;
}

export type Chat = {
  chatId: string;
  participants: string[];
  orderId: string;
  lastMessage?: string;
  updatedAt: unknown;
};

/**
 * Ensure a chat document exists for this order and participants. Creates it if missing.
 * Call when order has 2 participants (matched).
 */
/**
 * Ensure a chat document exists. Creates it if missing.
 */
export async function getOrCreateChat(
  orderId: string,
  participantIds: string[],
): Promise<string> {
  if (participantIds.length < 2)
    throw new Error('Need at least 2 participants');
  const chatId = getChatIdForOrder(orderId, participantIds);
  const chatRef = doc(db, 'chats', chatId);
  const snap = await getDoc(chatRef);
  if (snap.exists()) return chatId;
  await setDoc(chatRef, {
    chatId,
    participants: participantIds,
    orderId,
    lastMessage: '',
    updatedAt: serverTimestamp(),
  });
  return chatId;
}
