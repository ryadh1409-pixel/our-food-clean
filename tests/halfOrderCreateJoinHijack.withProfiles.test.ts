import { readFileSync } from 'node:fs';

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, serverTimestamp, setDoc, Timestamp } from 'firebase/firestore';

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
    projectId: 'demo-halforder-create-hijack',
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
  await te().withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users', 'alice'), {
      uid: 'alice',
      displayName: 'Alice',
      role: 'user',
      restricted: false,
      banned: false,
      totalOrdersCompleted: 10,
      activeOrderCount: 0,
    });
    await setDoc(doc(db, 'users', 'bob'), {
      uid: 'bob',
      displayName: 'Bob',
      role: 'user',
      restricted: false,
      banned: false,
      totalOrdersCompleted: 10,
      activeOrderCount: 0,
    });
    await setDoc(doc(db, 'food_cards', '1'), {
      title: 'Catalog Pizza',
      active: true,
      status: 'active',
      maxUsers: 2,
      price: 16,
      splitPrice: 8,
    });
    await setDoc(doc(db, 'food_cards', 'ai-card'), {
      title: 'AI Ramen',
      status: 'active',
      ownerId: 'alice',
      user1: { uid: 'alice', name: 'Alice', photo: null },
      maxUsers: 2,
      deckSource: 'ai_chat',
    });
  });
});

function halfOrderPayload(
  uid: string,
  cardId: string,
  extras: Record<string, unknown> = {},
) {
  return {
    cardId,
    users: [uid],
    host: { userId: uid, name: uid },
    participants: [uid],
    joinedAtMap: { [uid]: serverTimestamp() },
    status: 'waiting',
    maxUsers: 2,
    createdBy: uid,
    hostId: uid,
    createdAt: serverTimestamp(),
    foodName: 'Pizza',
    image: 'https://example.com/p.jpg',
    pricePerPerson: 8,
    totalPrice: 16,
    location: 'Nearby',
    ...extras,
  };
}

describe('HalfOrder create join-queue hijack', () => {
  it('allows a signed-in user to open a waiting HalfOrder on a catalog slot', async () => {
    const db = te().authenticatedContext('alice').firestore();
    await assertSucceeds(
      setDoc(doc(db, 'orders', 'alice-slot-1'), halfOrderPayload('alice', '1')),
    );
  });

  it('allows the AI-card owner to create the linked HalfOrder', async () => {
    const db = te().authenticatedContext('alice').firestore();
    await assertSucceeds(
      setDoc(
        doc(db, 'orders', 'alice-ai'),
        halfOrderPayload('alice', 'ai-card'),
      ),
    );
  });

  it('denies creating a HalfOrder for a food card that does not exist', async () => {
    const db = te().authenticatedContext('bob').firestore();
    await assertFails(
      setDoc(
        doc(db, 'orders', 'ghost'),
        halfOrderPayload('bob', 'no-such-card'),
      ),
    );
  });

  it('denies planting a competing HalfOrder on someone else\'s AI card', async () => {
    const db = te().authenticatedContext('bob').firestore();
    await assertFails(
      setDoc(doc(db, 'orders', 'bob-hijack'), halfOrderPayload('bob', 'ai-card')),
    );
  });

  it('denies backdated createdAt that would win oldest-first join sort', async () => {
    const db = te().authenticatedContext('bob').firestore();
    await assertFails(
      setDoc(
        doc(db, 'orders', 'bob-backdate'),
        halfOrderPayload('bob', '1', {
          createdAt: Timestamp.fromMillis(0),
        }),
      ),
    );
  });

  it('denies inflated maxUsers that would win fuller-first join sort after an accomplice joins', async () => {
    const db = te().authenticatedContext('bob').firestore();
    await assertFails(
      setDoc(
        doc(db, 'orders', 'bob-inflate'),
        halfOrderPayload('bob', '1', { maxUsers: 20 }),
      ),
    );
  });

  it('denies a legacy-shaped create that still carries cardId (cannot bypass HalfOrder checks)', async () => {
    const db = te().authenticatedContext('bob').firestore();
    await assertFails(
      setDoc(doc(db, 'orders', 'bob-hybrid'), {
        ...halfOrderPayload('bob', '1', {
          createdAt: Timestamp.fromMillis(0),
          maxUsers: 20,
        }),
        maxPeople: 2,
        usersAccepted: [],
      }),
    );
  });
});
