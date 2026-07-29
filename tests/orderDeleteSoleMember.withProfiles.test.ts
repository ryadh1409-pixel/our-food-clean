import { readFileSync } from 'node:fs';

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';

let testEnv: RulesTestEnvironment | undefined;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-order-delete',
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

describe('order delete sole-member guard', () => {
  it('denies creator delete when a peer is still on participants', async () => {
    await testEnv!.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'orders', 'shared-legacy'), {
        id: 'shared-legacy',
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
          host: serverTimestamp(),
          joiner: serverTimestamp(),
        },
      });
    });

    const dbHost = testEnv!.authenticatedContext('host').firestore();
    await assertFails(deleteDoc(doc(dbHost, 'orders', 'shared-legacy')));
  });

  it('denies creator delete when a peer is still on half-order users', async () => {
    await testEnv!.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'orders', 'shared-half'), {
        id: 'shared-half',
        cardId: 'card-1',
        createdBy: 'host',
        hostId: 'host',
        host: {
          userId: 'host',
          name: 'Host',
          photoURL: '',
        },
        maxUsers: 2,
        status: 'matched',
        users: ['host', 'joiner'],
        participants: ['host', 'joiner'],
        joinedAtMap: {
          host: serverTimestamp(),
          joiner: serverTimestamp(),
        },
        createdAt: serverTimestamp(),
      });
    });

    const dbHost = testEnv!.authenticatedContext('host').firestore();
    await assertFails(deleteDoc(doc(dbHost, 'orders', 'shared-half')));
  });

  it('allows creator delete of a sole-member legacy order', async () => {
    await testEnv!.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'orders', 'solo-legacy'), {
        id: 'solo-legacy',
        foodName: 'Pepperoni Pizza',
        image: 'https://example.com/pizza.jpg',
        pricePerPerson: 10,
        totalPrice: 30,
        maxPeople: 2,
        usersAccepted: [],
        createdBy: 'host',
        createdAt: serverTimestamp(),
        status: 'open',
        participants: ['host'],
        joinedAtMap: {
          host: serverTimestamp(),
        },
      });
    });

    const dbHost = testEnv!.authenticatedContext('host').firestore();
    await assertSucceeds(deleteDoc(doc(dbHost, 'orders', 'solo-legacy')));
  });

  it('allows creator delete of a sole-member half-order', async () => {
    await testEnv!.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'orders', 'solo-half'), {
        id: 'solo-half',
        cardId: 'card-2',
        createdBy: 'host',
        hostId: 'host',
        host: {
          userId: 'host',
          name: 'Host',
          photoURL: '',
        },
        maxUsers: 2,
        status: 'waiting',
        users: ['host'],
        participants: ['host'],
        joinedAtMap: {
          host: serverTimestamp(),
        },
        createdAt: serverTimestamp(),
      });
    });

    const dbHost = testEnv!.authenticatedContext('host').firestore();
    await assertSucceeds(deleteDoc(doc(dbHost, 'orders', 'solo-half')));
  });

  it('denies non-creator delete even when sole member', async () => {
    await testEnv!.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'orders', 'not-yours'), {
        id: 'not-yours',
        foodName: 'Pepperoni Pizza',
        image: 'https://example.com/pizza.jpg',
        pricePerPerson: 10,
        totalPrice: 30,
        maxPeople: 2,
        usersAccepted: [],
        createdBy: 'host',
        createdAt: serverTimestamp(),
        status: 'open',
        participants: ['host'],
        joinedAtMap: {
          host: serverTimestamp(),
        },
      });
    });

    const dbStranger = testEnv!.authenticatedContext('stranger').firestore();
    await assertFails(deleteDoc(doc(dbStranger, 'orders', 'not-yours')));
  });
});
