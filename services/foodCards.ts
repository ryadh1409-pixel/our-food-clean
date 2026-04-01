import { auth, db } from '@/services/firebase';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';

export type FoodCard = {
  id: string;
  title: string;
  image: string;
  restaurantName: string;
  price: number;
  splitPrice: number;
  location: { latitude: number; longitude: number } | null;
  createdAt: Timestamp | null;
  expiresAt: number;
  status: 'waiting' | 'matched';
  user1?: { uid: string; name: string; photo: string | null } | null;
  user2?: { uid: string; name: string; photo: string | null } | null;
};

const FOOD_CARDS = 'food_cards';
const ADMIN_EMAIL = 'support@halforder.app';

export function subscribeWaitingFoodCards(
  onData: (cards: FoodCard[]) => void,
): () => void {
  const q = query(
    collection(db, FOOD_CARDS),
    where('status', '==', 'waiting'),
  );
  return onSnapshot(
    q,
    (snap) => {
      const now = Date.now();
      const cards = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<FoodCard, 'id'>) }))
        .filter((card) => (card.expiresAt ?? 0) > now);
      console.log('[food_cards] fetched cards:', cards);
      onData(cards);
    },
    () => onData([]),
  );
}

export async function joinFoodCard(cardId: string): Promise<{
  matched: boolean;
  chatId?: string;
  otherUser?: { uid: string; name: string; photo: string | null };
}> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in required');
  const userName =
    auth.currentUser?.displayName?.trim() ||
    auth.currentUser?.email?.split('@')[0] ||
    'User';
  const userPhoto = auth.currentUser?.photoURL ?? null;
  const cardRef = doc(db, FOOD_CARDS, cardId);
  const self = { uid, name: userName, photo: userPhoto };

  const txResult = await runTransaction(db, async (tx) => {
    const snap = await tx.get(cardRef);
    if (!snap.exists()) throw new Error('Card not found');
    const data = snap.data() as Omit<FoodCard, 'id'>;
    if (data.status !== 'waiting') throw new Error('Card no longer available');

    if (!data.user1?.uid) {
      tx.update(cardRef, {
        user1: self,
      });
      return { matched: false as const };
    }
    if (data.user1.uid === uid) {
      return { matched: false as const };
    }
    if (data.user2?.uid) {
      throw new Error('Card already matched');
    }

    tx.update(cardRef, {
      user2: self,
      status: 'matched',
    });
    return { matched: true as const };
  });

  if (!txResult.matched) {
    return { matched: false };
  }

  const refreshedSnap = await getDoc(cardRef);
  if (!refreshedSnap.exists()) {
    return { matched: false };
  }
  const refreshed = refreshedSnap.data() as Omit<FoodCard, 'id'>;
  const user1 = refreshed.user1 ?? null;
  const user2 = refreshed.user2 ?? null;
  if (!user1?.uid || !user2?.uid) {
    return { matched: false };
  }

  const other = user1.uid === uid ? user2 : user1;
  const ids = [other.uid, uid].sort();
  const chatId = cardId;
  const now = Date.now();
  await setDoc(
    doc(db, 'chats', chatId),
    {
      users: ids,
      participants: ids,
      usersData: [other, self],
      user1,
      user2,
      orderId: cardId,
      type: 'food_card',
      lastMessage: 'Match created',
      lastMessageAt: now,
      createdAt: now,
      typing: null,
      unreadCount: 0,
    },
    { merge: true },
  );

  const existingMessages = await getDocs(
    query(collection(db, 'chats', chatId, 'messages'), limit(1)),
  );
  if (existingMessages.empty) {
    const firstMessage = 'You both joined this order 🍕';
    const aiMessage = 'Hey! I can help you coordinate your order 🍕';
    await addDoc(collection(db, 'chats', chatId, 'messages'), {
      text: firstMessage,
      senderId: 'system',
      sender: 'system',
      userName: 'System',
      createdAt: now,
      delivered: true,
      seen: false,
      system: true,
    }).catch(() => {});
    await updateDoc(doc(db, 'chats', chatId), {
      lastMessage: firstMessage,
      lastMessageAt: Date.now(),
    }).catch(() => {});
    await addDoc(collection(db, 'chats', chatId, 'messages'), {
      text: aiMessage,
      senderId: 'ai',
      sender: 'ai',
      userName: 'AI Assistant',
      createdAt: Date.now(),
      delivered: true,
      seen: false,
      system: true,
    }).catch(() => {});
    await updateDoc(doc(db, 'chats', chatId), {
      lastMessage: aiMessage,
      lastMessageAt: Date.now(),
    }).catch(() => {});
  }

  return { matched: true, chatId, otherUser: other };
}

export async function createFoodCard(input: {
  title: string;
  image: string;
  restaurantName: string;
  price: number;
  splitPrice: number;
  latitude?: number | null;
  longitude?: number | null;
}) {
  const email = auth.currentUser?.email?.toLowerCase() ?? '';
  if (email !== ADMIN_EMAIL) throw new Error('Admin only');
  const activeSnap = await getDocs(
    query(collection(db, FOOD_CARDS), where('status', '==', 'waiting')),
  );
  if (activeSnap.size >= 10) throw new Error('Max 10 active cards');
  const now = Date.now();
  return addDoc(collection(db, FOOD_CARDS), {
    title: input.title.trim(),
    image: input.image.trim(),
    restaurantName: input.restaurantName.trim(),
    price: input.price,
    splitPrice: input.splitPrice,
    location:
      input.latitude != null && input.longitude != null
        ? { latitude: input.latitude, longitude: input.longitude }
        : null,
    createdAt: serverTimestamp(),
    expiresAt: now + 45 * 60 * 1000,
    status: 'waiting',
    user1: null,
    user2: null,
  });
}

async function duplicateCard(cardId: string) {
  const snap = await getDoc(doc(db, FOOD_CARDS, cardId));
  if (!snap.exists()) return;
  const data = snap.data();
  const now = Date.now();
  await addDoc(collection(db, FOOD_CARDS), {
    title: data.title ?? 'Food card',
    image: data.image ?? '',
    restaurantName: data.restaurantName ?? '',
    price: Number(data.price) || 0,
    splitPrice: Number(data.splitPrice) || 0,
    location: data.location ?? null,
    createdAt: serverTimestamp(),
    expiresAt: now + 45 * 60 * 1000,
    status: 'waiting',
    user1: null,
    user2: null,
    regeneratedFrom: cardId,
  });
}

export async function runFoodCardAutomationOnce(): Promise<void> {
  const now = Date.now();
  const waitingSnap = await getDocs(
    query(collection(db, FOOD_CARDS), where('status', '==', 'waiting')),
  );
  const matchedSnap = await getDocs(
    query(collection(db, FOOD_CARDS), where('status', '==', 'matched')),
  );

  const tasks: Promise<unknown>[] = [];
  waitingSnap.docs.forEach((d) => {
    const data = d.data();
    if (typeof data.expiresAt === 'number' && data.expiresAt <= now) {
      tasks.push(
        duplicateCard(d.id).finally(() => deleteDoc(doc(db, FOOD_CARDS, d.id))),
      );
    }
  });
  matchedSnap.docs.forEach((d) => {
    const data = d.data();
    if (!data.regenerated) {
      tasks.push(
        duplicateCard(d.id).finally(() =>
          updateDoc(doc(db, FOOD_CARDS, d.id), {
            regenerated: true,
            adminNotification: `Match completed: ${data.title ?? 'Food'} - 2 users joined`,
          }),
        ),
      );
    }
  });
  if (tasks.length) await Promise.allSettled(tasks);
}

export async function skipFoodCard(_cardId: string): Promise<void> {
  // Skip is local-only for feed UX. No write needed.
}

export function startFoodCardAutomation(): () => void {
  const id = setInterval(() => {
    runFoodCardAutomationOnce().catch(() => {});
  }, 60 * 1000);
  return () => clearInterval(id);
}
