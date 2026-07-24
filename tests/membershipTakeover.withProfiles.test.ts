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
    projectId: 'demo-with-profiles',
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
    for (const uid of ['host', 'joiner', 'attacker', 'accomplice', 'u1', 'u2', 'u3']) {
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

describe('half-order join membership preservation', () => {
  it('denies attacker replacing host while growing lists by one', async () => {
    await testEnv!.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'orders', 'hijack1'), {
        cardId: 'fc-hijack',
        users: ['host'],
        host: { userId: 'host', name: 'Host', avatar: null, phone: null, expoPushToken: null },
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
      });
    });

    const dbAttacker = testEnv!.authenticatedContext('attacker').firestore();
    await assertFails(
      updateDoc(doc(dbAttacker, 'orders', 'hijack1'), {
        users: ['attacker', 'accomplice'],
        participants: ['attacker', 'accomplice'],
        'joinedAtMap.attacker': serverTimestamp(),
        status: 'matched',
      }),
    );
  });

  it('allows honest arrayUnion join that keeps the host', async () => {
    await testEnv!.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'orders', 'ok1'), {
        cardId: 'fc-ok',
        users: ['host'],
        host: { userId: 'host', name: 'Host', avatar: null, phone: null, expoPushToken: null },
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
      });
    });

    const dbJoiner = testEnv!.authenticatedContext('joiner').firestore();
    await assertSucceeds(
      updateDoc(doc(dbJoiner, 'orders', 'ok1'), {
        users: arrayUnion('joiner'),
        participants: arrayUnion('joiner'),
        'joinedAtMap.joiner': serverTimestamp(),
        status: 'matched',
      }),
    );
  });

  it('denies legacy participants join that swaps out the creator', async () => {
    await testEnv!.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'orders', 'hijack3'), {
        id: 'hijack3',
        foodName: 'Pepperoni Pizza',
        image: 'https://example.com/pizza.jpg',
        pricePerPerson: 10,
        totalPrice: 30,
        maxPeople: 3,
        usersAccepted: [],
        createdBy: 'u1',
        createdAt: serverTimestamp(),
        participants: ['u1'],
        joinedAtMap: { u1: serverTimestamp() },
      });
    });

    const dbU2 = testEnv!.authenticatedContext('u2').firestore();
    await assertFails(
      updateDoc(doc(dbU2, 'orders', 'hijack3'), {
        participants: ['u2', 'u3'],
        'joinedAtMap.u2': serverTimestamp(),
      }),
    );
  });

  it('denies chat users append that drops existing members', async () => {
    await testEnv!.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'chats', 'chat-hijack'), {
        orderId: 'chat-hijack',
        users: ['host'],
        participants: ['host'],
        createdAt: serverTimestamp(),
      });
    });

    const dbAttacker = testEnv!.authenticatedContext('attacker').firestore();
    await assertFails(
      updateDoc(doc(dbAttacker, 'chats', 'chat-hijack'), {
        users: ['attacker', 'accomplice'],
      }),
    );
  });

  it('allows honest chat users append that keeps prior members', async () => {
    await testEnv!.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'chats', 'chat-ok'), {
        orderId: 'chat-ok',
        users: ['host'],
        participants: ['host'],
        createdAt: serverTimestamp(),
      });
    });

    const dbJoiner = testEnv!.authenticatedContext('joiner').firestore();
    await assertSucceeds(
      updateDoc(doc(dbJoiner, 'chats', 'chat-ok'), {
        users: arrayUnion('joiner'),
      }),
    );
  });
});
