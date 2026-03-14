import { doc, getDoc, setDoc, updateDoc, increment } from 'firebase/firestore';
import { db } from './firebase';

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function incrementGrowthOrders(): Promise<void> {
  try {
    const key = todayKey();
    const ref = doc(db, 'growthMetrics', key);
    const snap = await getDoc(ref);
    const current = snap.exists() ? snap.data() : {};
    await setDoc(
      ref,
      {
        date: key,
        referralUsers: Number(current?.referralUsers) || 0,
        orders: (Number(current?.orders) || 0) + 1,
        matches: Number(current?.matches) || 0,
      },
      { merge: true },
    );
  } catch (e) {
    console.warn('growthMetrics orders update failed:', e);
  }
}

export async function incrementGrowthMatches(): Promise<void> {
  try {
    const key = todayKey();
    const ref = doc(db, 'growthMetrics', key);
    const snap = await getDoc(ref);
    const current = snap.exists() ? snap.data() : {};
    await setDoc(
      ref,
      {
        date: key,
        referralUsers: Number(current?.referralUsers) || 0,
        orders: Number(current?.orders) || 0,
        matches: (Number(current?.matches) || 0) + 1,
      },
      { merge: true },
    );
  } catch (e) {
    console.warn('growthMetrics matches update failed:', e);
  }
}
