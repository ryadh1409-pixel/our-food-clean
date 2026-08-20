import { readFileSync } from 'node:fs';

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  arrayUnion,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

let testEnv: RulesTestEnvironment | undefined;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-halforder-legacy-join',
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
    for (const uid of ['host', 'joiner', 'attacker', 'accomplice']) {
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

function waitingHalfOrder() {
  return {
    cardId: 'slot-1',
    users: ['host'],
    host: { userId: 'host', name: 'Host' },
    participants: ['host'],
    joinedAtMap: { host: serverTimestamp() },
    status: 'waiting',
    maxUsers: 2,
    createdBy: 'host',
    hostId: 'host',
    createdAt: serverTimestamp(),
    foodName: 'Pizza',
    image: 'https://example.com/p.jpg',
    pricePerPerson: 5,
    totalPrice: 10,
    location: 'Here',
  };
}

async function seedWaitingHalfOrder(orderId: string) {
  await testEnv!.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'orders', orderId), waitingHalfOrder());
  });
}

describe('legacy participant-join must not apply to HalfOrders', () => {
  it('denies cancelling a waiting HalfOrder via join-with-extras', async () => {
    await seedWaitingHalfOrder('ho-cancel');

    const dbAttacker = testEnv!.authenticatedContext('attacker').firestore();
    await assertFails(
      updateDoc(doc(dbAttacker, 'orders', 'ho-cancel'), {
        participants: arrayUnion('attacker'),
        'joinedAtMap.attacker': serverTimestamp(),
        status: 'cancelled',
        user2Id: 'attacker',
        user2Name: 'Attacker',
      }),
    );
  });

  it('denies completing a waiting HalfOrder via join-with-extras', async () => {
    await seedWaitingHalfOrder('ho-complete');

    const dbAttacker = testEnv!.authenticatedContext('attacker').firestore();
    await assertFails(
      updateDoc(doc(dbAttacker, 'orders', 'ho-complete'), {
        participants: arrayUnion('attacker'),
        'joinedAtMap.attacker': serverTimestamp(),
        status: 'completed',
      }),
    );
  });

  it('denies fake-matching a waiting HalfOrder without joining users', async () => {
    await seedWaitingHalfOrder('ho-fake-match');

    const dbAttacker = testEnv!.authenticatedContext('attacker').firestore();
    await assertFails(
      updateDoc(doc(dbAttacker, 'orders', 'ho-fake-match'), {
        participants: arrayUnion('attacker'),
        'joinedAtMap.attacker': serverTimestamp(),
        status: 'matched',
        user2Id: 'attacker',
        user2Name: 'Attacker',
      }),
    );
  });

  it('denies participants-only join that skips HalfOrder users', async () => {
    await seedWaitingHalfOrder('ho-participants-only');

    const dbAttacker = testEnv!.authenticatedContext('attacker').firestore();
    await assertFails(
      updateDoc(doc(dbAttacker, 'orders', 'ho-participants-only'), {
        participants: arrayUnion('attacker'),
        'joinedAtMap.attacker': serverTimestamp(),
      }),
    );
  });

  it('denies size-only participant takeover that drops the host', async () => {
    await seedWaitingHalfOrder('ho-takeover');

    const dbAttacker = testEnv!.authenticatedContext('attacker').firestore();
    await assertFails(
      updateDoc(doc(dbAttacker, 'orders', 'ho-takeover'), {
        participants: ['attacker', 'accomplice'],
        'joinedAtMap.attacker': serverTimestamp(),
      }),
    );
  });

  it('allows honest HalfOrder incremental join (users + participants)', async () => {
    await seedWaitingHalfOrder('ho-honest');

    const dbJoiner = testEnv!.authenticatedContext('joiner').firestore();
    await assertSucceeds(
      updateDoc(doc(dbJoiner, 'orders', 'ho-honest'), {
        users: arrayUnion('joiner'),
        participants: arrayUnion('joiner'),
        'joinedAtMap.joiner': serverTimestamp(),
        status: 'matched',
      }),
    );
  });

  it('still allows legacy participant join on orders without cardId', async () => {
    await testEnv!.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'orders', 'legacy-ok'), {
        foodName: 'Pepperoni Pizza',
        image: 'https://example.com/pizza.jpg',
        pricePerPerson: 10,
        totalPrice: 20,
        maxPeople: 2,
        usersAccepted: [],
        createdBy: 'host',
        createdAt: serverTimestamp(),
        participants: ['host'],
        joinedAtMap: { host: serverTimestamp() },
        status: 'open',
      });
    });

    const dbJoiner = testEnv!.authenticatedContext('joiner').firestore();
    await assertSucceeds(
      updateDoc(doc(dbJoiner, 'orders', 'legacy-ok'), {
        participants: arrayUnion('joiner'),
        'joinedAtMap.joiner': serverTimestamp(),
      }),
    );
  });
});
