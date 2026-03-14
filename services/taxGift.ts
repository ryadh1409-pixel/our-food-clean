import { db } from '@/services/firebase';
import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';

/**
 * Tax Gift Every 3rd Order — Firestore user schema:
 *
 * User document fields used by this feature:
 * - ordersCount: number — total completed orders (if missing, treated as 0)
 * - taxGiftEligible: boolean — true when this order is the 3rd, 6th, 9th, etc.
 * - lastOrderDate: timestamp — when the user last completed an order
 *
 * New users get ordersCount = 0, taxGiftEligible = false (set in AuthContext).
 */

export type TaxGiftResult = {
  taxGiftEligible: boolean;
  newCount: number;
};

/**
 * Called when a user completes an order. Uses a transaction so counts stay correct.
 *
 * Steps:
 * 1. Read the user document (ordersCount; default 0 if missing).
 * 2. Increment ordersCount by 1.
 * 3. If newCount % 3 === 0 → taxGiftEligible = true (this order gets the gift); else false.
 * 4. Update the user document with ordersCount, taxGiftEligible, lastOrderDate (merge: true so other fields are preserved).
 * 5. Return { taxGiftEligible, newCount } for the caller to store on the order and show in UI.
 */
export async function checkTaxGift(userId: string): Promise<TaxGiftResult> {
  const userRef = doc(db, 'users', userId);

  return runTransaction(db, async (tx) => {
    const snap = await tx.get(userRef);
    const data = snap.exists() ? snap.data() : {};
    const currentCount =
      typeof data?.ordersCount === 'number' ? data.ordersCount : 0;
    const newCount = currentCount + 1;
    const taxGiftEligible = newCount % 3 === 0;

    // Merge only these three fields; do not overwrite other user fields (displayName, email, etc.)
    tx.set(
      userRef,
      {
        ordersCount: newCount,
        taxGiftEligible,
        lastOrderDate: serverTimestamp(),
      },
      { merge: true },
    );

    return { taxGiftEligible, newCount };
  });
}
