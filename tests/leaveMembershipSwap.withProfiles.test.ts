import { readFileSync } from 'node:fs';

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  arrayRemove,
  deleteField,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

let testEnv: RulesTestEnvironment | undefined;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-leave-membership',
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
    for (const uid of ['host', 'joiner', 'victim', 'accomplice']) {
      await setDoc(doc(ctx.firestore(), 'users', uid), {
        uid,
        displayName: uid,
        role: 'user',
        restricted: false,
        banned: false,
        totalOrdersCompleted: 10,
        activeOrderCount: 0,
      });
    }
  });
});

describe('legacy participants leave membership preservation', () => {
  it('denies leave that swaps host for an accomplice', async () => {
    await testEnv!.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'orders', 'leave-hijack'), {
        id: 'leave-hijack',
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

    const dbJoiner = testEnv!.authenticatedContext('joiner').firestore();
    await assertFails(
      updateDoc(doc(dbJoiner, 'orders', 'leave-hijack'), {
        participants: ['accomplice'],
        'joinedAtMap.joiner': deleteField(),
      }),
    );
  });

  it('denies leave that drops a peer and injects a stranger', async () => {
    await testEnv!.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'orders', 'leave-swap'), {
        id: 'leave-swap',
        foodName: 'Pepperoni Pizza',
        image: 'https://example.com/pizza.jpg',
        pricePerPerson: 10,
        totalPrice: 30,
        maxPeople: 3,
        usersAccepted: [],
        createdBy: 'host',
        createdAt: serverTimestamp(),
        status: 'open',
        participants: ['host', 'joiner', 'victim'],
        joinedAtMap: {
          host: serverTimestamp(),
          joiner: serverTimestamp(),
          victim: serverTimestamp(),
        },
      });
    });

    const dbJoiner = testEnv!.authenticatedContext('joiner').firestore();
    await assertFails(
      updateDoc(doc(dbJoiner, 'orders', 'leave-swap'), {
        participants: ['host', 'accomplice'],
        'joinedAtMap.joiner': deleteField(),
      }),
    );
  });

  it('denies leave that also forces an arbitrary status', async () => {
    await testEnv!.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'orders', 'leave-status'), {
        id: 'leave-status',
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

    const dbJoiner = testEnv!.authenticatedContext('joiner').firestore();
    await assertFails(
      updateDoc(doc(dbJoiner, 'orders', 'leave-status'), {
        participants: arrayRemove('joiner'),
        'joinedAtMap.joiner': deleteField(),
        status: 'completed',
      }),
    );
  });

  it('allows honest arrayRemove leave that keeps remaining members', async () => {
    await testEnv!.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'orders', 'leave-ok'), {
        id: 'leave-ok',
        foodName: 'Pepperoni Pizza',
        image: 'https://example.com/pizza.jpg',
        pricePerPerson: 10,
        totalPrice: 30,
        maxPeople: 3,
        usersAccepted: [],
        createdBy: 'host',
        createdAt: serverTimestamp(),
        status: 'open',
        participants: ['host', 'joiner', 'victim'],
        joinedAtMap: {
          host: serverTimestamp(),
          joiner: serverTimestamp(),
          victim: serverTimestamp(),
        },
      });
    });

    const dbJoiner = testEnv!.authenticatedContext('joiner').firestore();
    await assertSucceeds(
      updateDoc(doc(dbJoiner, 'orders', 'leave-ok'), {
        participants: arrayRemove('joiner'),
        'joinedAtMap.joiner': deleteField(),
      }),
    );
  });

  it('allows leave that reopens a closed order when under capacity', async () => {
    await testEnv!.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'orders', 'leave-reopen'), {
        id: 'leave-reopen',
        foodName: 'Pepperoni Pizza',
        image: 'https://example.com/pizza.jpg',
        pricePerPerson: 10,
        totalPrice: 30,
        maxPeople: 3,
        usersAccepted: [],
        createdBy: 'host',
        createdAt: serverTimestamp(),
        status: 'closed',
        participants: ['host', 'joiner', 'victim'],
        joinedAtMap: {
          host: serverTimestamp(),
          joiner: serverTimestamp(),
          victim: serverTimestamp(),
        },
      });
    });

    const dbJoiner = testEnv!.authenticatedContext('joiner').firestore();
    await assertSucceeds(
      updateDoc(doc(dbJoiner, 'orders', 'leave-reopen'), {
        participants: arrayRemove('joiner'),
        'joinedAtMap.joiner': deleteField(),
        status: 'open',
      }),
    );
  });
});
