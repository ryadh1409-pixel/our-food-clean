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

function te(): RulesTestEnvironment {
  if (!testEnv) {
    throw new Error(
      'Rules test environment not initialized (is the Firestore emulator on 127.0.0.1:8080?)',
    );
  }
  return testEnv;
}

async function seedUserProfile(uid: string): Promise<void> {
  await te().withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'users', uid), {
      uid,
      role: 'user',
      banned: false,
      restricted: false,
      totalOrdersCompleted: 10,
      activeOrderCount: 0,
      cancellationCount24h: 0,
    });
  });
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-swipe-accept-takeover',
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
  await seedUserProfile('alice');
  await seedUserProfile('mallory');
  await seedUserProfile('accomplice');
});

describe('firestore rules: swipe usersAccepted membership preserve', () => {
  async function seedLikedOrder(): Promise<void> {
    await te().withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'orders', 'swipe1'), {
        foodName: 'Swipe Pizza',
        image: 'https://example.com/p.jpg',
        totalPrice: 24,
        pricePerPerson: 12,
        maxPeople: 2,
        usersAccepted: ['alice'],
        createdBy: 'alice',
        createdAt: serverTimestamp(),
        participants: ['alice'],
        joinedAtMap: {},
      });
    });
  }

  it('denies replacing an existing liker while adding self (size +1 takeover)', async () => {
    await seedLikedOrder();
    const db = te().authenticatedContext('mallory').firestore();
    await assertFails(
      updateDoc(doc(db, 'orders', 'swipe1'), {
        usersAccepted: ['mallory', 'accomplice'],
      }),
    );
  });

  it('allows honest arrayUnion like that preserves prior likers', async () => {
    await seedLikedOrder();
    const db = te().authenticatedContext('mallory').firestore();
    await assertSucceeds(
      updateDoc(doc(db, 'orders', 'swipe1'), {
        usersAccepted: arrayUnion('mallory'),
      }),
    );
  });

  it('denies dropping the first liker even when new list still includes caller only once', async () => {
    await te().withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'orders', 'swipe2'), {
        foodName: 'Swipe Burger',
        image: 'https://example.com/b.jpg',
        totalPrice: 20,
        pricePerPerson: 10,
        maxPeople: 3,
        usersAccepted: ['alice', 'accomplice'],
        createdBy: 'alice',
        createdAt: serverTimestamp(),
        participants: ['alice'],
        joinedAtMap: {},
      });
    });
    const db = te().authenticatedContext('mallory').firestore();
    await assertFails(
      updateDoc(doc(db, 'orders', 'swipe2'), {
        // size 2 → 3, caller added, but alice removed
        usersAccepted: ['accomplice', 'mallory', 'eve'],
      }),
    );
  });
});
