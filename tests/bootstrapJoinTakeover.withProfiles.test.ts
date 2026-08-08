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
    projectId: 'demo-bootstrap-join',
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

function seedBootstrapHalfOrder(orderId: string) {
  return testEnv!.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'orders', orderId), {
      cardId: 'fc-bootstrap',
      users: ['host'],
      // Legacy / empty-participants shape still handled by planHalfOrderJoin.
      participants: [],
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
    });
  });
}

describe('half-order bootstrap join membership preservation', () => {
  it('denies replacing the sole users uid while bootstrapping participants', async () => {
    await seedBootstrapHalfOrder('boot-hijack');

    const dbAttacker = testEnv!.authenticatedContext('attacker').firestore();
    await assertFails(
      updateDoc(doc(dbAttacker, 'orders', 'boot-hijack'), {
        users: ['accomplice', 'attacker'],
        participants: ['host', 'attacker'],
        host: {
          userId: 'host',
          name: 'Host',
          avatar: null,
          phone: null,
          expoPushToken: null,
        },
        'joinedAtMap.attacker': serverTimestamp(),
        status: 'matched',
      }),
    );
  });

  it('allows honest bootstrap join that keeps the host in users', async () => {
    await seedBootstrapHalfOrder('boot-ok');

    const dbJoiner = testEnv!.authenticatedContext('joiner').firestore();
    await assertSucceeds(
      updateDoc(doc(dbJoiner, 'orders', 'boot-ok'), {
        users: arrayUnion('joiner'),
        participants: arrayUnion('host', 'joiner'),
        host: {
          userId: 'host',
          name: 'Host',
          avatar: null,
          phone: null,
          expoPushToken: null,
        },
        'joinedAtMap.joiner': serverTimestamp(),
        status: 'matched',
      }),
    );
  });
});
