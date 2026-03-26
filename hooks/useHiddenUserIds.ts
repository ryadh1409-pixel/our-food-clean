import { auth, db } from '@/services/firebase';
import {
  collection,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';

/**
 * User IDs the current user should not see in discovery (blocked either direction).
 */
export function useHiddenUserIds(): Set<string> {
  const uid = auth.currentUser?.uid ?? null;
  const [blockedIds, setBlockedIds] = useState<string[]>([]);
  const [blockerIds, setBlockerIds] = useState<string[]>([]);

  useEffect(() => {
    if (!uid) {
      setBlockedIds([]);
      setBlockerIds([]);
      return;
    }
    const q1 = query(
      collection(db, 'blocks'),
      where('blockerId', '==', uid),
    );
    const q2 = query(
      collection(db, 'blocks'),
      where('blockedId', '==', uid),
    );
    const unsub1 = onSnapshot(
      q1,
      (snap) => {
        setBlockedIds(
          snap.docs.map((d) => String(d.data()?.blockedId ?? '')).filter(Boolean),
        );
      },
      () => setBlockedIds([]),
    );
    const unsub2 = onSnapshot(
      q2,
      (snap) => {
        setBlockerIds(
          snap.docs.map((d) => String(d.data()?.blockerId ?? '')).filter(Boolean),
        );
      },
      () => setBlockerIds([]),
    );
    return () => {
      unsub1();
      unsub2();
    };
  }, [uid]);

  return useMemo(
    () => new Set([...blockedIds, ...blockerIds]),
    [blockedIds, blockerIds],
  );
}
