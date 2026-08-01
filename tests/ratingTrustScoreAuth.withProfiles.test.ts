/**
 * Regression: top-level `ratings` must not let strangers forge peer ratings.
 * `onRatingCreated` recomputes trustScore / ratingAverage on the receiver.
 */
import { readFileSync } from 'node:fs';

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  addDoc,
  collection,
  doc,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';

let testEnv: RulesTestEnvironment | undefined;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-rating-auth',
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
    for (const uid of ['host', 'joiner', 'stranger', 'victim']) {
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
    await setDoc(doc(ctx.firestore(), 'orders', 'done-1'), {
      id: 'done-1',
      createdBy: 'host',
      hostId: 'host',
      status: 'completed',
      users: ['host', 'joiner'],
      participants: ['host', 'joiner'],
      joinedAtMap: {
        host: serverTimestamp(),
        joiner: serverTimestamp(),
      },
      createdAt: serverTimestamp(),
      completedAt: serverTimestamp(),
      foodName: 'Pizza',
      image: 'https://example.com/p.jpg',
      pricePerPerson: 5,
      totalPrice: 10,
      maxPeople: 2,
    });
    await setDoc(doc(ctx.firestore(), 'orders', 'live-1'), {
      id: 'live-1',
      createdBy: 'host',
      hostId: 'host',
      status: 'matched',
      users: ['host', 'joiner'],
      participants: ['host', 'joiner'],
      joinedAtMap: {
        host: serverTimestamp(),
        joiner: serverTimestamp(),
      },
      createdAt: serverTimestamp(),
      foodName: 'Burger',
      image: 'https://example.com/b.jpg',
      pricePerPerson: 6,
      totalPrice: 12,
      maxPeople: 2,
    });
  });
});

function ratingPayload(
  fromUserId: string,
  toUserId: string,
  orderId: string,
  rating = 1,
) {
  return {
    orderId,
    fromUserId,
    toUserId,
    rating,
    comment: '',
    createdAt: serverTimestamp(),
  };
}

describe('top-level ratings trust-score auth', () => {
  it('allows a completed-order member to rate their peer', async () => {
    const db = testEnv!.authenticatedContext('joiner').firestore();
    await assertSucceeds(
      addDoc(
        collection(db, 'ratings'),
        ratingPayload('joiner', 'host', 'done-1', 5),
      ),
    );
  });

  it('denies rating a user who was not on the order', async () => {
    const db = testEnv!.authenticatedContext('joiner').firestore();
    await assertFails(
      addDoc(
        collection(db, 'ratings'),
        ratingPayload('joiner', 'victim', 'done-1', 1),
      ),
    );
  });

  it('denies strangers forging ratings with a fake or foreign orderId', async () => {
    const db = testEnv!.authenticatedContext('stranger').firestore();
    await assertFails(
      addDoc(
        collection(db, 'ratings'),
        ratingPayload('stranger', 'victim', 'done-1', 1),
      ),
    );
    await assertFails(
      addDoc(
        collection(db, 'ratings'),
        ratingPayload('stranger', 'victim', 'nonexistent-order', 1),
      ),
    );
  });

  it('denies rating before the order is completed', async () => {
    const db = testEnv!.authenticatedContext('joiner').firestore();
    await assertFails(
      addDoc(
        collection(db, 'ratings'),
        ratingPayload('joiner', 'host', 'live-1', 5),
      ),
    );
  });

  it('denies self-ratings even on a completed shared order', async () => {
    const db = testEnv!.authenticatedContext('joiner').firestore();
    await assertFails(
      addDoc(
        collection(db, 'ratings'),
        ratingPayload('joiner', 'joiner', 'done-1', 5),
      ),
    );
  });

  it('denies spoofing fromUserId as another member', async () => {
    const db = testEnv!.authenticatedContext('joiner').firestore();
    await assertFails(
      addDoc(
        collection(db, 'ratings'),
        ratingPayload('host', 'joiner', 'done-1', 1),
      ),
    );
  });
});
