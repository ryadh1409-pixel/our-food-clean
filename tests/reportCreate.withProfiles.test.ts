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
    projectId: 'demo-report-create',
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
    for (const uid of ['alice', 'bob']) {
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

function aliceDb() {
  return testEnv!.authenticatedContext('alice').firestore();
}

describe('reports create matches submitUserReport / reportAndBlock', () => {
  it('allows the legal submitUserReport shape', async () => {
    const db = aliceDb();
    await assertSucceeds(
      addDoc(collection(db, 'reports'), {
        userId: 'alice',
        reporterId: 'alice',
        reportedUserId: 'bob',
        contentId: 'order:order-99',
        reason: 'abuse',
        createdAt: serverTimestamp(),
      }),
    );
  });

  it('denies the legacy reportAndBlock payload (orderId extra, missing required keys)', async () => {
    const db = aliceDb();
    await assertFails(
      addDoc(collection(db, 'reports'), {
        reporterId: 'alice',
        reportedUserId: 'bob',
        orderId: 'order-99',
        createdAt: serverTimestamp(),
      }),
    );
  });
});
