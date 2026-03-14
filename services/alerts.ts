import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

export type AlertType =
  | 'new_order'
  | 'order_matched'
  | 'high_activity'
  | 'new_user'
  | 'order_joined'
  | 'auto_match_join';

export async function createAlert(
  type: AlertType,
  message: string,
  extra?: {
    orderId?: string;
    hostId?: string;
    creatorId?: string;
    restaurantName?: string;
  },
): Promise<void> {
  try {
    const data: Record<string, unknown> = {
      type,
      message,
      createdAt: serverTimestamp(),
      status: 'new',
    };
    if (extra?.orderId) data.orderId = extra.orderId;
    if (extra?.hostId) data.hostId = extra.hostId;
    if (extra?.creatorId) data.creatorId = extra.creatorId;
    if (extra?.restaurantName) data.restaurantName = extra.restaurantName;
    await addDoc(collection(db, 'alerts'), data);
  } catch (e) {
    console.warn('Failed to create alert:', e);
  }
}
