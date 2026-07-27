import { readFileSync } from 'node:fs';

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

let testEnv: RulesTestEnvironment | undefined;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-creator-order-rewrite',
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
    for (const uid of ['host', 'joiner']) {
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

async function seedMatchedHalfOrder(orderId: string) {
  await testEnv!.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'orders', orderId), {
      cardId: `fc-${orderId}`,
      users: ['host', 'joiner'],
      host: {
        userId: 'host',
        name: 'Host',
        avatar: null,
        phone: null,
        expoPushToken: null,
      },
      participants: ['host', 'joiner'],
      joinedAtMap: {
        host: serverTimestamp(),
        joiner: serverTimestamp(),
      },
      status: 'matched',
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

describe('creator cannot rewrite HalfOrder membership or prices', () => {
  it('denies host dropping joiner from users after match', async () => {
    await seedMatchedHalfOrder('ho-kick');

    const dbHost = testEnv!.authenticatedContext('host').firestore();
    await assertFails(
      updateDoc(doc(dbHost, 'orders', 'ho-kick'), {
        users: ['host'],
      }),
    );

    const snap = await testEnv!.withSecurityRulesDisabled(async (ctx) =>
      getDoc(doc(ctx.firestore(), 'orders', 'ho-kick')),
    );
    expect(snap.data()?.users).toEqual(['host', 'joiner']);
  });

  it('denies host rewriting prices after match', async () => {
    await seedMatchedHalfOrder('ho-price');

    const dbHost = testEnv!.authenticatedContext('host').firestore();
    await assertFails(
      updateDoc(doc(dbHost, 'orders', 'ho-price'), {
        pricePerPerson: 0.01,
        totalPrice: 0.01,
      }),
    );
  });

  it('denies host transferring createdBy / hostId after match', async () => {
    await seedMatchedHalfOrder('ho-transfer');

    const dbHost = testEnv!.authenticatedContext('host').firestore();
    await assertFails(
      updateDoc(doc(dbHost, 'orders', 'ho-transfer'), {
        createdBy: 'joiner',
        hostId: 'joiner',
      }),
    );
  });

  it('still allows dedicated HalfOrder cancel by a member', async () => {
    await seedMatchedHalfOrder('ho-cancel');

    const dbHost = testEnv!.authenticatedContext('host').firestore();
    await assertSucceeds(
      updateDoc(doc(dbHost, 'orders', 'ho-cancel'), {
        status: 'cancelled',
        cancelledBy: 'host',
        cancelReason: 'user',
        cancelledAt: serverTimestamp(),
      }),
    );
  });

  it('still allows legacy creator metadata update without cardId', async () => {
    await testEnv!.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'orders', 'legacy-1'), {
        foodName: 'Pepperoni Pizza',
        image: 'https://example.com/pizza.jpg',
        pricePerPerson: 10,
        totalPrice: 30,
        maxPeople: 3,
        usersAccepted: [],
        createdBy: 'host',
        createdAt: serverTimestamp(),
        participants: ['host'],
        joinedAtMap: { host: serverTimestamp() },
        status: 'open',
      });
    });

    const dbHost = testEnv!.authenticatedContext('host').firestore();
    await assertSucceeds(
      updateDoc(doc(dbHost, 'orders', 'legacy-1'), {
        image: 'https://example.com/new.jpg',
      }),
    );

    await assertFails(
      updateDoc(doc(dbHost, 'orders', 'legacy-1'), {
        users: ['host', 'joiner'],
        maxPeople: 99,
      }),
    );
  });
});
