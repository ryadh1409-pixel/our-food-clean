import { readFileSync } from 'node:fs';

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc } from 'firebase/firestore';

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
    projectId: 'demo-food-card-join-takeover',
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

describe('firestore rules: food_cards join preserves user1', () => {
  async function seedAiStyleCard(): Promise<void> {
    await te().withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'food_cards', 'ai1'), {
        title: 'AI Pizza',
        restaurantName: 'AI Pizza',
        image: 'https://example.com/p.jpg',
        price: 16,
        splitPrice: 8,
        status: 'active',
        expiresAt: Date.now() + 45 * 60 * 1000,
        ownerId: 'alice',
        user1: { uid: 'alice', name: 'Alice', photo: null },
        user2: null,
        maxUsers: 2,
        createdAt: Date.now(),
        orderId: 'order-ai1',
        deckSource: 'ai_chat',
      });
    });
  }

  it('denies rewriting user1 while claiming user2 (match takeover)', async () => {
    await seedAiStyleCard();
    const db = te().authenticatedContext('mallory').firestore();
    await assertFails(
      updateDoc(doc(db, 'food_cards', 'ai1'), {
        user1: { uid: 'accomplice', name: 'Accomplice', photo: null },
        user2: { uid: 'mallory', name: 'Mallory', photo: null },
        status: 'matched',
      }),
    );
  });

  it('allows honest user2 claim that preserves user1', async () => {
    await seedAiStyleCard();
    const db = te().authenticatedContext('mallory').firestore();
    await assertSucceeds(
      updateDoc(doc(db, 'food_cards', 'ai1'), {
        user2: { uid: 'mallory', name: 'Mallory', photo: null },
        status: 'matched',
      }),
    );
  });

  it('allows claiming empty user1 without touching user2/status', async () => {
    await te().withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'food_cards', 'open1'), {
        title: 'Open Card',
        restaurantName: 'Deli',
        image: 'https://example.com/d.jpg',
        price: 12,
        splitPrice: 6,
        status: 'active',
        expiresAt: Date.now() + 45 * 60 * 1000,
        user1: null,
        user2: null,
        maxUsers: 2,
        createdAt: Date.now(),
      });
    });
    const db = te().authenticatedContext('mallory').firestore();
    await assertSucceeds(
      updateDoc(doc(db, 'food_cards', 'open1'), {
        user1: { uid: 'mallory', name: 'Mallory', photo: null },
      }),
    );
  });

  it('denies claiming user1 and user2 in one write', async () => {
    await te().withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'food_cards', 'open2'), {
        title: 'Open Card 2',
        restaurantName: 'Deli',
        image: 'https://example.com/d.jpg',
        price: 12,
        splitPrice: 6,
        status: 'active',
        expiresAt: Date.now() + 45 * 60 * 1000,
        user1: null,
        user2: null,
        maxUsers: 2,
        createdAt: Date.now(),
      });
    });
    const db = te().authenticatedContext('mallory').firestore();
    await assertFails(
      updateDoc(doc(db, 'food_cards', 'open2'), {
        user1: { uid: 'mallory', name: 'Mallory', photo: null },
        user2: { uid: 'accomplice', name: 'Accomplice', photo: null },
        status: 'matched',
      }),
    );
  });
});
