import { db } from '@/services/firebase';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';

export function useBlockedUserIds(currentUserId: string | null): Set<string> {
  const [blocked, setBlocked] = useState<string[]>([]);
  const [blockers, setBlockers] = useState<string[]>([]);

  useEffect(() => {
    if (!currentUserId) {
      setBlocked([]);
      setBlockers([]);
      return;
    }
    const qBlocked = query(
      collection(db, 'blocks'),
      where('blockerId', '==', currentUserId),
    );
    const qBlockers = query(
      collection(db, 'blocks'),
      where('blockedUserId', '==', currentUserId),
    );
    const unsub1 = onSnapshot(
      qBlocked,
      (snap) => {
        setBlocked(
          snap.docs
            .map((d) => String(d.data()?.blockedUserId ?? ''))
            .filter(Boolean),
        );
      },
      () => setBlocked([]),
    );
    const unsub2 = onSnapshot(
      qBlockers,
      (snap) => {
        setBlockers(
          snap.docs
            .map((d) => String(d.data()?.blockerId ?? ''))
            .filter(Boolean),
        );
      },
      () => setBlockers([]),
    );
    return () => {
      unsub1();
      unsub2();
    };
  }, [currentUserId]);

  return useMemo(() => new Set([...blocked, ...blockers]), [blocked, blockers]);
}
