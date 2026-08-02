/**
 * Regression: HalfOrder "Order Shared" completion must succeed for either member
 * without peer user-doc writes, and must include completedAt.
 */
import { readFileSync } from 'node:fs';

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

let testEnv: RulesTestEnvironment | undefined;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-order-complete',
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules: readFileSync('firestore.rules', 'utf8'),
    },
  });
});

afterAll(async () => {
  if (testEnv) await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv!.clearFirestore();
  await testEnv!.withSecurityRulesDisabled(async (ctx) => {
    for (const uid of ['host', 'joiner', 'stranger']) {
      await setDoc(doc(ctx.firestore(), 'users', uid), {
        uid,
        displayName: uid,
        role: 'user',
        restricted: false,
        banned: false,
        totalOrdersCompleted: 10,
        activeOrderCount: 0,
        cancellationCount24h: 0,
        ordersCount: 0,
        firstOrderCompleted: false,
        credits: 0,
      });
    }
    await setDoc(doc(ctx.firestore(), 'orders', 'matched-1'), {
      id: 'matched-1',
      createdBy: 'host',
      hostId: 'host',
      cardId: 'card-1',
      status: 'matched',
      users: ['host', 'joiner'],
      participants: ['host', 'joiner'],
      maxUsers: 2,
      joinedAtMap: {
        host: serverTimestamp(),
        joiner: serverTimestamp(),
      },
      createdAt: serverTimestamp(),
      foodName: 'Pizza',
      image: 'https://example.com/p.jpg',
      pricePerPerson: 5,
      totalPrice: 10,
      maxPeople: 2,
    });
  });
});

describe('half-order complete auth (Order Shared path)', () => {
  it('allows joiner to complete with status + completedAt', async () => {
    const db = testEnv!.authenticatedContext('joiner').firestore();
    await assertSucceeds(
      updateDoc(doc(db, 'orders', 'matched-1'), {
        status: 'completed',
        completedAt: serverTimestamp(),
      }),
    );
  });

  it('denies joiner complete that only sets status (missing completedAt)', async () => {
    const db = testEnv!.authenticatedContext('joiner').firestore();
    await assertFails(
      updateDoc(doc(db, 'orders', 'matched-1'), {
        status: 'completed',
      }),
    );
  });

  it('allows host to complete with status + completedAt', async () => {
    const db = testEnv!.authenticatedContext('host').firestore();
    await assertSucceeds(
      updateDoc(doc(db, 'orders', 'matched-1'), {
        status: 'completed',
        completedAt: serverTimestamp(),
      }),
    );
  });

  it('denies stranger complete', async () => {
    const db = testEnv!.authenticatedContext('stranger').firestore();
    await assertFails(
      updateDoc(doc(db, 'orders', 'matched-1'), {
        status: 'completed',
        completedAt: serverTimestamp(),
      }),
    );
  });

  it('allows caller to increment own tax-gift counters', async () => {
    const db = testEnv!.authenticatedContext('joiner').firestore();
    await assertSucceeds(
      setDoc(
        doc(db, 'users', 'joiner'),
        {
          ordersCount: 1,
          taxGiftEligible: false,
          lastOrderDate: serverTimestamp(),
        },
        { merge: true },
      ),
    );
  });

  it('denies caller writing peer tax-gift / first-order fields', async () => {
    const db = testEnv!.authenticatedContext('joiner').firestore();
    await assertFails(
      setDoc(
        doc(db, 'users', 'host'),
        {
          ordersCount: 1,
          taxGiftEligible: false,
          lastOrderDate: serverTimestamp(),
          firstOrderCompleted: true,
          credits: 3,
        },
        { merge: true },
      ),
    );
  });

  it('allows joiner cancel with cancelledBy/cancelledAt (Not Shared path)', async () => {
    const db = testEnv!.authenticatedContext('joiner').firestore();
    await assertSucceeds(
      updateDoc(doc(db, 'orders', 'matched-1'), {
        status: 'cancelled',
        cancelledBy: 'joiner',
        cancelReason: 'user',
        cancelledAt: serverTimestamp(),
      }),
    );
  });

  it('denies joiner cancel that only sets status + reason', async () => {
    const db = testEnv!.authenticatedContext('joiner').firestore();
    await assertFails(
      updateDoc(doc(db, 'orders', 'matched-1'), {
        status: 'cancelled',
        reason: 'Users reported order not shared',
      }),
    );
  });
});
