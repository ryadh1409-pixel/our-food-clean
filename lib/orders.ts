import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
  type Timestamp,
} from 'firebase/firestore';
import { db } from '@/services/firebase';
import { autoInvite } from '@/services/autoInvite';

export type ParticipantStatus = 'joined' | 'left' | 'paid';

export type Participant = {
  userId: string;
  shareAmount: number;
  status: ParticipantStatus;
};

export type Restaurant = {
  id: string;
  name: string;
  address: string;
};

export type OrderItem = {
  name: string;
  quantity: number;
  price: number;
};

export type DeliveryMethod = 'pickup' | 'delivery_external';

export type OrderStatus = 'open' | 'confirmed' | 'completed' | 'cancelled';

export type Order = {
  id: string;
  creatorId: string;
  participants: Participant[];
  restaurant: Restaurant;
  items: OrderItem[];
  totalAmount: number;
  status: OrderStatus;
  deliveryMethod: DeliveryMethod;
  pickupLocation: string;
  scheduledTime: Timestamp | null;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
};

export type CreateOrderInput = {
  creatorId: string;
  restaurant: Restaurant;
  items: OrderItem[];
  totalAmount: number;
  pickupLocation: string;
  scheduledTime?: Timestamp | null;
  deliveryMethod?: DeliveryMethod;
};

function totalAmountFromItems(items: OrderItem[]): number {
  return items.reduce((sum, item) => sum + item.quantity * item.price, 0);
}

function computeShareAmounts(
  totalAmount: number,
  participants: Participant[],
): number[] {
  const joined = participants.filter((p) => p.status === 'joined');
  if (joined.length === 0) return [];
  const share = Math.round((totalAmount / joined.length) * 100) / 100;
  const remainder =
    Math.round((totalAmount - share * joined.length) * 100) / 100;
  return joined.map((_, i) => (i === 0 ? share + remainder : share));
}

export async function createOrder(input: CreateOrderInput): Promise<string> {
  const total =
    input.totalAmount > 0
      ? input.totalAmount
      : totalAmountFromItems(input.items);
  const creatorParticipant: Participant = {
    userId: input.creatorId,
    shareAmount: total,
    status: 'joined',
  };
  const participants: Participant[] = [creatorParticipant];
  const ref = await addDoc(collection(db, 'orders'), {
    creatorId: input.creatorId,
    participants,
    restaurant: input.restaurant,
    items: input.items,
    totalAmount: total,
    status: 'open' as OrderStatus,
    deliveryMethod: input.deliveryMethod ?? 'pickup',
    pickupLocation: input.pickupLocation,
    scheduledTime: input.scheduledTime ?? null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  void autoInvite({
    id: ref.id,
    foodName: input.restaurant?.name,
    creatorUid: input.creatorId,
  });
  return ref.id;
}

export async function joinOrder(
  orderId: string,
  userId: string,
): Promise<void> {
  const orderRef = doc(db, 'orders', orderId);
  const snap = await getDoc(orderRef);
  if (!snap.exists()) {
    throw new Error('Order not found');
  }
  const data = snap.data();
  const participants: Participant[] = Array.isArray(data.participants)
    ? (data.participants as Participant[])
    : [];
  const totalAmount = Number(data.totalAmount ?? 0);
  const existingIndex = participants.findIndex((p) => p.userId === userId);
  if (existingIndex >= 0) {
    if (participants[existingIndex].status === 'joined') {
      return;
    }
    participants[existingIndex] = {
      ...participants[existingIndex],
      status: 'joined',
    };
  } else {
    participants.push({
      userId,
      shareAmount: 0,
      status: 'joined',
    });
  }
  const shareAmounts = computeShareAmounts(totalAmount, participants);
  let idx = 0;
  participants.forEach((p) => {
    if (p.status === 'joined') {
      p.shareAmount = shareAmounts[idx++] ?? 0;
    }
  });
  await updateDoc(orderRef, {
    participants,
    updatedAt: serverTimestamp(),
  });
}

export async function updateOrderStatus(
  orderId: string,
  status: OrderStatus,
): Promise<void> {
  const orderRef = doc(db, 'orders', orderId);
  const snap = await getDoc(orderRef);
  if (!snap.exists()) {
    throw new Error('Order not found');
  }
  await updateDoc(orderRef, {
    status,
    updatedAt: serverTimestamp(),
  });
}
