import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';

import { auth, db } from '@/services/firebase';
import { mapRawUserDocument, type PublicUserFields } from '@/services/users';

/**
 * Live Firestore profile for the signed-in user (`users/{uid}`).
 */
export function useCurrentUser(): {
  uid: string | null;
  profile: PublicUserFields | null;
  loading: boolean;
} {
  const uid = auth.currentUser?.uid ?? null;
  const [profile, setProfile] = useState<PublicUserFields | null>(null);
  const [loading, setLoading] = useState(!!uid);

  useEffect(() => {
    if (!uid) {
      setProfile(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const ref = doc(db, 'users', uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setProfile(null);
          setLoading(false);
          return;
        }
        setProfile(
          mapRawUserDocument(uid, snap.data() as Record<string, unknown>),
        );
        setLoading(false);
      },
      () => {
        setProfile(null);
        setLoading(false);
      },
    );
    return () => unsub();
  }, [uid]);

  return { uid, profile, loading };
}
