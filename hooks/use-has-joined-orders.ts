import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { auth, db } from '@/services/firebase';

/**
 * Returns true if the current user is a participant in at least one order.
 */
export function useHasJoinedOrders(): boolean {
  const [hasJoined, setHasJoined] = useState(false);

  useEffect(() => {
    const uid = auth.currentUser?.uid ?? '';
    if (!uid) {
      setHasJoined(false);
      return;
    }

    const ordersRef = collection(db, 'orders');
    const q = query(ordersRef, where('participantIds', 'array-contains', uid));

    const unsub = onSnapshot(
      q,
      (snap) => setHasJoined(!snap.empty),
      () => setHasJoined(false),
    );

    return () => unsub();
  }, []);

  return hasJoined;
}
