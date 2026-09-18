import { readFileSync } from 'node:fs';

import {
  assertFails,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
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

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-food-card-hijack',
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
});

async function seedUser(uid: string) {
  await te().withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'users', uid), {
      role: 'user',
      totalOrdersCompleted: 10,
      activeOrderCount: 0,
    });
  });
}

async function seedCatalogSlot(slotId: string) {
  await te().withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'food_cards', slotId), {
      active: true,
      title: 'Pizza',
      image: 'https://example.com/p.jpg',
      price: 20,
      sharingPrice: 10,
      maxUsers: 2,
    });
  });
}

function halfOrderCreateFields(uid: string, cardId: string) {
  return {
    cardId,
    users: [uid],
    host: { userId: uid, name: 'Host' },
    participants: [uid],
    joinedAtMap: { [uid]: serverTimestamp() },
    status: 'waiting' as const,
    maxUsers: 2,
    createdBy: uid,
    hostId: uid,
    createdAt: serverTimestamp(),
    foodName: 'Pizza',
    image: 'https://example.com/p.jpg',
    pricePerPerson: 10,
    totalPrice: 20,
  };
}

describe('catalog food-card invite hijack', () => {
  it('denies HalfOrder create that squats a catalog slot id (orders/1)', async () => {
    await seedUser('u1');
    await seedCatalogSlot('1');
    const db = te().authenticatedContext('u1').firestore();
    await assertFails(
      setDoc(doc(db, 'orders', '1'), halfOrderCreateFields('u1', '1')),
    );
  });

  it('denies legacy order create that squats a catalog slot id', async () => {
    await seedUser('u1');
    await seedCatalogSlot('1');
    const db = te().authenticatedContext('u1').firestore();
    await assertFails(
      setDoc(doc(db, 'orders', '1'), {
        createdBy: 'u1',
        maxPeople: 2,
        participants: ['u1'],
        joinedAtMap: { u1: serverTimestamp() },
        usersAccepted: [],
        foodName: 'Pizza',
        image: 'https://example.com/p.jpg',
        pricePerPerson: 10,
        totalPrice: 20,
        createdAt: serverTimestamp(),
      }),
    );
  });

  it('denies planting food_cards.orderId onto a catalog slot', async () => {
    await seedUser('u1');
    await seedCatalogSlot('1');
    await te().withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), 'orders', 'attacker-ho'),
        halfOrderCreateFields('u1', '1'),
      );
    });
    const db = te().authenticatedContext('u1').firestore();
    await assertFails(
      updateDoc(doc(db, 'food_cards', '1'), { orderId: 'attacker-ho' }),
    );
  });
});
