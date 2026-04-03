import { doc, onSnapshot, type DocumentSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';

import { db } from '@/services/firebase';

/**
 * Live `orders/{orderId}` document snapshot.
 */
export function useOrder(orderId: string): {
  snapshot: DocumentSnapshot | null;
  loading: boolean;
} {
  const oid = orderId.trim();
  const [snapshot, setSnapshot] = useState<DocumentSnapshot | null>(null);
  const [loading, setLoading] = useState(!!oid);

  useEffect(() => {
    if (!oid) {
      setSnapshot(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const ref = doc(db, 'orders', oid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setSnapshot(snap);
        setLoading(false);
      },
      () => {
        setSnapshot(null);
        setLoading(false);
      },
    );
    return () => unsub();
  }, [oid]);

  return { snapshot, loading };
}
