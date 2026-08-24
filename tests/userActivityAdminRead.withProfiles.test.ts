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
    projectId: 'demo-user-activity-admin-read',
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
    await setDoc(doc(ctx.firestore(), 'user_activity', 'trail-1'), {
      userId: 'victim',
      userEmail: 'victim@example.com',
      latitude: 43.6532,
      longitude: -79.3832,
      time: serverTimestamp(),
    });
  });
});

describe('user_activity reads are admin-only', () => {
  it('denies a signed-in non-admin from reading another user GPS trail', async () => {
    const db = testEnv!.authenticatedContext('attacker').firestore();
    await assertFails(getDoc(doc(db, 'user_activity', 'trail-1')));
    await assertFails(getDocs(collection(db, 'user_activity')));
  });

  it('denies the activity owner from listing the collection (admin map only)', async () => {
    const db = testEnv!.authenticatedContext('victim').firestore();
    await assertFails(getDoc(doc(db, 'user_activity', 'trail-1')));
    await assertFails(getDocs(collection(db, 'user_activity')));
  });

  it('allows an admin to read the activity map query', async () => {
    const db = testEnv!.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(getDoc(doc(db, 'user_activity', 'trail-1')));
    const snap = await assertSucceeds(getDocs(collection(db, 'user_activity')));
    expect(snap.docs.map((d) => d.id)).toContain('trail-1');
  });

  it('still allows a signed-in user to append their own activity point', async () => {
    const db = testEnv!.authenticatedContext('attacker').firestore();
    await assertSucceeds(
      addDoc(collection(db, 'user_activity'), {
        userId: 'attacker',
        userEmail: 'attacker@example.com',
        latitude: 43.65,
        longitude: -79.38,
        time: serverTimestamp(),
      }),
    );
  });

  it('denies creating activity points attributed to another user', async () => {
    const db = testEnv!.authenticatedContext('attacker').firestore();
    await assertFails(
      addDoc(collection(db, 'user_activity'), {
        userId: 'victim',
        userEmail: 'victim@example.com',
        latitude: 43.65,
        longitude: -79.38,
        time: serverTimestamp(),
      }),
    );
  });
});
