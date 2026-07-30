/**
 * Regression: participants must not be able to instantly expire live HalfOrders
 * (or legacy orders before a real deadline).
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
  Timestamp,
  updateDoc,
} from 'firebase/firestore';

let testEnv: RulesTestEnvironment | undefined;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-order-expire',
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
      });
    }
  });
});

describe('order expire grief guards', () => {
  it('denies instant expire of a matched HalfOrder by a participant', async () => {
    await testEnv!.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'orders', 'half-matched'), {
        id: 'half-matched',
        cardId: 'card-1',
        createdBy: 'host',
        hostId: 'host',
        host: { userId: 'host', name: 'Host' },
        maxUsers: 2,
        status: 'matched',
        users: ['host', 'joiner'],
        participants: ['host', 'joiner'],
        joinedAtMap: {
          host: serverTimestamp(),
          joiner: serverTimestamp(),
        },
        createdAt: serverTimestamp(),
        foodName: 'Pizza',
        image: 'https://example.com/p.jpg',
        pricePerPerson: 5,
        totalPrice: 10,
      });
    });

    const dbJoiner = testEnv!.authenticatedContext('joiner').firestore();
    await assertFails(
      updateDoc(doc(dbJoiner, 'orders', 'half-matched'), {
        status: 'expired',
      }),
    );
  });

  it('still allows HalfOrder cancel (timeout / leave path)', async () => {
    await testEnv!.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'orders', 'half-active'), {
        id: 'half-active',
        cardId: 'card-2',
        createdBy: 'host',
        hostId: 'host',
        host: { userId: 'host', name: 'Host' },
        maxUsers: 2,
        status: 'matched',
        users: ['host', 'joiner'],
        participants: ['host', 'joiner'],
        joinedAtMap: {
          host: serverTimestamp(),
          joiner: serverTimestamp(),
        },
        createdAt: serverTimestamp(),
        foodName: 'Pizza',
        image: 'https://example.com/p.jpg',
        pricePerPerson: 5,
        totalPrice: 10,
      });
    });

    const dbJoiner = testEnv!.authenticatedContext('joiner').firestore();
    await assertSucceeds(
      updateDoc(doc(dbJoiner, 'orders', 'half-active'), {
        status: 'cancelled',
        cancelledBy: 'joiner',
        cancelledAt: serverTimestamp(),
        cancelReason: 'wait_timeout',
      }),
    );
  });

  it('denies legacy expire before join-window / expiresAt deadline', async () => {
    const now = Timestamp.now();
    await testEnv!.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'orders', 'legacy-fresh'), {
        id: 'legacy-fresh',
        foodName: 'Pepperoni Pizza',
        image: 'https://example.com/pizza.jpg',
        pricePerPerson: 10,
        totalPrice: 30,
        maxPeople: 2,
        usersAccepted: [],
        createdBy: 'host',
        createdAt: serverTimestamp(),
        status: 'open',
        participants: ['host', 'joiner'],
        joinedAtMap: {
          host: now,
          joiner: now,
        },
        expiresAt: Timestamp.fromMillis(Date.now() + 60 * 60 * 1000),
      });
    });

    const dbJoiner = testEnv!.authenticatedContext('joiner').firestore();
    await assertFails(
      updateDoc(doc(dbJoiner, 'orders', 'legacy-fresh'), {
        status: 'expired',
      }),
    );
  });

  it('allows legacy expire after expiresAt has passed', async () => {
    const past = Timestamp.fromMillis(Date.now() - 60_000);
    await testEnv!.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'orders', 'legacy-due'), {
        id: 'legacy-due',
        foodName: 'Pepperoni Pizza',
        image: 'https://example.com/pizza.jpg',
        pricePerPerson: 10,
        totalPrice: 30,
        maxPeople: 2,
        usersAccepted: [],
        createdBy: 'host',
        createdAt: serverTimestamp(),
        status: 'matched',
        participants: ['host', 'joiner'],
        joinedAtMap: {
          host: past,
          joiner: past,
        },
        expiresAt: past,
      });
    });

    const dbJoiner = testEnv!.authenticatedContext('joiner').firestore();
    await assertSucceeds(
      updateDoc(doc(dbJoiner, 'orders', 'legacy-due'), {
        status: 'expired',
      }),
    );
  });

  it('allows legacy expire after 45m join window when expiresAt is unset', async () => {
    const oldJoin = Timestamp.fromMillis(Date.now() - 46 * 60 * 1000);
    await testEnv!.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'orders', 'legacy-window'), {
        id: 'legacy-window',
        foodName: 'Pepperoni Pizza',
        image: 'https://example.com/pizza.jpg',
        pricePerPerson: 10,
        totalPrice: 30,
        maxPeople: 2,
        usersAccepted: [],
        createdBy: 'host',
        createdAt: serverTimestamp(),
        status: 'open',
        participants: ['host', 'joiner'],
        joinedAtMap: {
          host: oldJoin,
          joiner: oldJoin,
        },
      });
    });

    const dbJoiner = testEnv!.authenticatedContext('joiner').firestore();
    await assertSucceeds(
      updateDoc(doc(dbJoiner, 'orders', 'legacy-window'), {
        status: 'expired',
      }),
    );
  });

  it('denies expire by a non-participant', async () => {
    const past = Timestamp.fromMillis(Date.now() - 60_000);
    await testEnv!.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'orders', 'legacy-stranger'), {
        id: 'legacy-stranger',
        foodName: 'Pepperoni Pizza',
        image: 'https://example.com/pizza.jpg',
        pricePerPerson: 10,
        totalPrice: 30,
        maxPeople: 2,
        usersAccepted: [],
        createdBy: 'host',
        createdAt: serverTimestamp(),
        status: 'open',
        participants: ['host', 'joiner'],
        joinedAtMap: {
          host: past,
          joiner: past,
        },
        expiresAt: past,
      });
    });

    const dbStranger = testEnv!.authenticatedContext('stranger').firestore();
    await assertFails(
      updateDoc(doc(dbStranger, 'orders', 'legacy-stranger'), {
        status: 'expired',
      }),
    );
  });
});
