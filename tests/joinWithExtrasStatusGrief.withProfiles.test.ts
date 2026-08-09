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
    projectId: 'demo-join-extras-status',
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
    for (const uid of ['host', 'joiner', 'attacker']) {
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

async function seedLegacyOpen(orderId: string, maxPeople = 2) {
  await testEnv!.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'orders', orderId), {
      foodName: 'Pepperoni Pizza',
      image: 'https://example.com/pizza.jpg',
      pricePerPerson: 10,
      totalPrice: 20,
      maxPeople,
      usersAccepted: [],
      createdBy: 'host',
      createdAt: serverTimestamp(),
      participants: ['host'],
      joinedAtMap: { host: serverTimestamp() },
      status: 'open',
    });
  });
}

describe('legacy join-with-extras status grief', () => {
  it('denies cancelling a live order while joining', async () => {
    await seedLegacyOpen('join-cancel');

    const dbAttacker = testEnv!.authenticatedContext('attacker').firestore();
    await assertFails(
      updateDoc(doc(dbAttacker, 'orders', 'join-cancel'), {
        participants: arrayUnion('attacker'),
        'joinedAtMap.attacker': serverTimestamp(),
        status: 'cancelled',
        user2Id: 'attacker',
        user2Name: 'Attacker',
      }),
    );
  });

  it('denies completing a live order while joining', async () => {
    await seedLegacyOpen('join-complete');

    const dbAttacker = testEnv!.authenticatedContext('attacker').firestore();
    await assertFails(
      updateDoc(doc(dbAttacker, 'orders', 'join-complete'), {
        participants: arrayUnion('attacker'),
        'joinedAtMap.attacker': serverTimestamp(),
        status: 'completed',
      }),
    );
  });

  it('denies expiring a live order while joining', async () => {
    await seedLegacyOpen('join-expire');

    const dbAttacker = testEnv!.authenticatedContext('attacker').firestore();
    await assertFails(
      updateDoc(doc(dbAttacker, 'orders', 'join-expire'), {
        participants: arrayUnion('attacker'),
        'joinedAtMap.attacker': serverTimestamp(),
        status: 'expired',
      }),
    );
  });

  it('denies spoofing user2Id to a different uid on join', async () => {
    await seedLegacyOpen('join-spoof-user2');

    const dbAttacker = testEnv!.authenticatedContext('attacker').firestore();
    await assertFails(
      updateDoc(doc(dbAttacker, 'orders', 'join-spoof-user2'), {
        participants: arrayUnion('attacker'),
        'joinedAtMap.attacker': serverTimestamp(),
        status: 'matched',
        user2Id: 'host',
        user2Name: 'Host',
      }),
    );
  });

  it('denies marking full before the order reaches maxPeople', async () => {
    await seedLegacyOpen('join-early-full', 4);

    const dbAttacker = testEnv!.authenticatedContext('attacker').firestore();
    await assertFails(
      updateDoc(doc(dbAttacker, 'orders', 'join-early-full'), {
        participants: arrayUnion('attacker'),
        'joinedAtMap.attacker': serverTimestamp(),
        status: 'full',
      }),
    );
  });

  it('allows honest matched join with caller user2Id', async () => {
    await seedLegacyOpen('join-matched-ok');

    const dbJoiner = testEnv!.authenticatedContext('joiner').firestore();
    await assertSucceeds(
      updateDoc(doc(dbJoiner, 'orders', 'join-matched-ok'), {
        participants: arrayUnion('joiner'),
        'joinedAtMap.joiner': serverTimestamp(),
        status: 'matched',
        user2Id: 'joiner',
        user2Name: 'Joiner',
      }),
    );
  });

  it('allows honest full join when capacity is reached', async () => {
    await seedLegacyOpen('join-full-ok', 2);

    const dbJoiner = testEnv!.authenticatedContext('joiner').firestore();
    await assertSucceeds(
      updateDoc(doc(dbJoiner, 'orders', 'join-full-ok'), {
        participants: arrayUnion('joiner'),
        'joinedAtMap.joiner': serverTimestamp(),
        status: 'full',
      }),
    );
  });

  it('allows honest open join under capacity', async () => {
    await seedLegacyOpen('join-open-ok', 4);

    const dbJoiner = testEnv!.authenticatedContext('joiner').firestore();
    await assertSucceeds(
      updateDoc(doc(dbJoiner, 'orders', 'join-open-ok'), {
        participants: arrayUnion('joiner'),
        'joinedAtMap.joiner': serverTimestamp(),
        status: 'open',
      }),
    );
  });
});
