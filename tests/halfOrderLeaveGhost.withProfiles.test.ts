/**
 * HalfOrder joiner leave must not be a participants-only update.
 * That leaves a ghost uid in `users` so the pair stays full.
 */
import { readFileSync } from 'node:fs';

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  deleteField,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

let testEnv: RulesTestEnvironment | undefined;

function te(): RulesTestEnvironment {
  if (!testEnv) {
    throw new Error(
      'Rules test environment not initialized (is the Firestore emulator on 127.0.0.1:8080?)',
    );
  }
  return testEnv;
}

async function seedProfile(uid: string): Promise<void> {
  await te().withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'users', uid), {
      uid,
      displayName: uid,
      role: 'user',
      banned: false,
      restricted: false,
      totalOrdersCompleted: 10,
      activeOrderCount: 0,
      cancellationCount24h: 0,
    });
  });
}

function matchedHalfOrder() {
  const ts = serverTimestamp();
  return {
    cardId: 'card-leave-ghost',
    users: ['host', 'joiner'],
    participants: ['host', 'joiner'],
    joinedAtMap: { host: ts, joiner: ts },
    status: 'matched' as const,
    maxUsers: 2,
    createdBy: 'host',
    hostId: 'host',
    host: { userId: 'host', name: 'Host', avatar: null, phone: null, expoPushToken: null },
    createdAt: serverTimestamp(),
    foodName: 'Pizza',
    image: 'https://example.com/p.jpg',
    pricePerPerson: 5,
    totalPrice: 10,
    location: 'Here',
  };
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-half-leave-ghost',
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
  await te().clearFirestore();
  await seedProfile('host');
  await seedProfile('joiner');
});

describe('HalfOrder leave must not leave a ghost in users', () => {
  it('denies joiner participants-only leave on a matched HalfOrder', async () => {
    await te().withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'orders', 'ho-ghost'), matchedHalfOrder());
    });

    const dbJoiner = te().authenticatedContext('joiner').firestore();
    await assertFails(
      updateDoc(doc(dbJoiner, 'orders', 'ho-ghost'), {
        participants: ['host'],
        'joinedAtMap.joiner': deleteField(),
      }),
    );
  });

  it('allows the joiner to cancel the HalfOrder instead', async () => {
    await te().withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'orders', 'ho-cancel'), matchedHalfOrder());
    });

    const dbJoiner = te().authenticatedContext('joiner').firestore();
    await assertSucceeds(
      updateDoc(doc(dbJoiner, 'orders', 'ho-cancel'), {
        status: 'cancelled',
        cancelledBy: 'joiner',
        cancelReason: 'user',
        cancelledAt: serverTimestamp(),
      }),
    );
  });

  it('still allows a legacy (no cardId) joiner to leave participants', async () => {
    await te().withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'orders', 'legacy-leave'), {
        foodName: 'Pizza',
        image: 'https://example.com/p.jpg',
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

    const dbJoiner = te().authenticatedContext('joiner').firestore();
    await assertSucceeds(
      updateDoc(doc(dbJoiner, 'orders', 'legacy-leave'), {
        participants: ['host'],
        'joinedAtMap.joiner': deleteField(),
      }),
    );
  });
});
