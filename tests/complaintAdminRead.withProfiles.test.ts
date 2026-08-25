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
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';

/** Must match hardcoded uid in `firestore.rules` `isAdmin()`. */
const ADMIN_UID = 'KT3LfXRsVgaH4LfRTQaexvj3CRn1';

let testEnv: RulesTestEnvironment | undefined;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-complaint-admin-read',
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
    for (const uid of ['victim', 'attacker', ADMIN_UID]) {
      await setDoc(doc(ctx.firestore(), 'users', uid), {
        uid,
        displayName: uid,
        role: uid === ADMIN_UID ? 'admin' : 'user',
        restricted: false,
        banned: false,
        totalOrdersCompleted: 10,
        activeOrderCount: 0,
      });
    }
    await setDoc(doc(ctx.firestore(), 'users', 'restricted-user'), {
      uid: 'restricted-user',
      displayName: 'restricted-user',
      role: 'user',
      restricted: true,
      banned: false,
      totalOrdersCompleted: 10,
      activeOrderCount: 0,
    });
    await setDoc(doc(ctx.firestore(), 'complaints', 'ticket-1'), {
      userId: 'victim',
      userEmail: 'victim@example.com',
      message: 'My pair never showed up',
      createdAt: serverTimestamp(),
      status: 'new',
    });
  });
});

function attackerDb() {
  return testEnv!
    .authenticatedContext('attacker', { email: 'attacker@example.com' })
    .firestore();
}

describe('complaints reads are admin-only', () => {
  it('denies a signed-in non-admin from reading another user support ticket', async () => {
    const db = attackerDb();
    await assertFails(getDoc(doc(db, 'complaints', 'ticket-1')));
    await assertFails(getDocs(collection(db, 'complaints')));
  });

  it('denies the ticket owner from listing the collection (admin inbox only)', async () => {
    const db = testEnv!
      .authenticatedContext('victim', { email: 'victim@example.com' })
      .firestore();
    await assertFails(getDoc(doc(db, 'complaints', 'ticket-1')));
    await assertFails(getDocs(collection(db, 'complaints')));
  });

  it('allows an admin to read the complaints inbox query', async () => {
    const db = testEnv!.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(getDoc(doc(db, 'complaints', 'ticket-1')));
    const snap = await assertSucceeds(getDocs(collection(db, 'complaints')));
    expect(snap.docs.map((d) => d.id)).toContain('ticket-1');
  });

  it('still allows a signed-in user to submit their own complaint', async () => {
    const db = attackerDb();
    await assertSucceeds(
      addDoc(collection(db, 'complaints'), {
        userId: 'attacker',
        userEmail: 'attacker@example.com',
        message: 'The restaurant was closed',
        createdAt: serverTimestamp(),
        status: 'new',
      }),
    );
  });

  it('denies creating a complaint attributed to another user', async () => {
    const db = attackerDb();
    await assertFails(
      addDoc(collection(db, 'complaints'), {
        userId: 'victim',
        userEmail: 'victim@example.com',
        message: 'spoofed ticket',
        createdAt: serverTimestamp(),
        status: 'new',
      }),
    );
  });

  it('denies spoofing another user email on a self-attributed ticket', async () => {
    const db = attackerDb();
    await assertFails(
      addDoc(collection(db, 'complaints'), {
        userId: 'attacker',
        userEmail: 'victim@example.com',
        message: 'please refund',
        createdAt: serverTimestamp(),
        status: 'new',
      }),
    );
  });

  it('denies a restricted user from creating complaints', async () => {
    const db = testEnv!
      .authenticatedContext('restricted-user', {
        email: 'restricted@example.com',
      })
      .firestore();
    await assertFails(
      addDoc(collection(db, 'complaints'), {
        userId: 'restricted-user',
        userEmail: 'restricted@example.com',
        message: 'still spamming',
        createdAt: serverTimestamp(),
        status: 'new',
      }),
    );
  });
});
