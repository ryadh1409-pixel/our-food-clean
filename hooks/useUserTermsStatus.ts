import { db } from '@/services/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';

/**
 * Live `users/{uid}.hasAcceptedTerms` for post-login Terms gating (Firestore source of truth).
 */
export function useUserTermsStatus(uid: string | undefined | null): {
  ready: boolean;
  accepted: boolean;
} {
  const [ready, setReady] = useState(!uid);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    if (!uid) {
      setReady(true);
      setAccepted(false);
      return;
    }
    setReady(false);
    const ref = doc(db, 'users', uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const v = snap.exists()
          ? snap.data()?.hasAcceptedTerms === true
          : false;
        setAccepted(v);
        setReady(true);
      },
      () => {
        setAccepted(false);
        setReady(true);
      },
    );
    return unsub;
  }, [uid]);

  return { ready, accepted };
}
