/**
 * When another user joins your split match, they write `users/{you}/splitPoke/{them}`.
 * Clear `isLookingToSplit` locally and remove the poke doc.
 */
import { onAuthStateChanged } from 'firebase/auth';
import { collection, deleteDoc, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { useEffect } from 'react';

import { auth, db } from '@/services/firebase';

export function useSplitPokeListener() {
  useEffect(() => {
    let snapUnsub: (() => void) | undefined;

    const authUnsub = onAuthStateChanged(auth, (user) => {
      snapUnsub?.();
      snapUnsub = undefined;
      if (!user) return;

      const ref = collection(db, 'users', user.uid, 'splitPoke');
      snapUnsub = onSnapshot(ref, async (snap) => {
        if (snap.empty) return;
        try {
          await setDoc(
            doc(db, 'users', user.uid),
            { isLookingToSplit: false },
            { merge: true },
          );
          await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
        } catch {
          /* ignore */
        }
      });
    });

    return () => {
      snapUnsub?.();
      authUnsub();
    };
  }, []);
}
