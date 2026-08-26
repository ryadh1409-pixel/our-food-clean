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
    projectId: 'demo-notification-logs-admin-read',
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
    await setDoc(doc(ctx.firestore(), 'notifications', 'campaign-1'), {
      title: 'HalfOrder',
      body: 'Someone near you is sharing food',
      createdAt: serverTimestamp(),
      sentTo: ['victim', 'attacker'],
    });
    await setDoc(doc(ctx.firestore(), 'notification_logs', 'log-1'), {
      notificationId: 'campaign-1',
      userId: 'victim',
      userEmail: 'victim@example.com',
      status: 'opened',
      time: serverTimestamp(),
    });
  });
});

function attackerDb() {
  return testEnv!
    .authenticatedContext('attacker', { email: 'attacker@example.com' })
    .firestore();
}

describe('notification campaign + log reads are admin-only', () => {
  it('denies a signed-in non-admin from reading campaign docs and delivery logs', async () => {
    const db = attackerDb();
    await assertFails(getDoc(doc(db, 'notifications', 'campaign-1')));
    await assertFails(getDocs(collection(db, 'notifications')));
    await assertFails(getDoc(doc(db, 'notification_logs', 'log-1')));
    await assertFails(getDocs(collection(db, 'notification_logs')));
  });

  it('denies the log subject from reading their own delivery row (admin inbox only)', async () => {
    const db = testEnv!
      .authenticatedContext('victim', { email: 'victim@example.com' })
      .firestore();
    await assertFails(getDoc(doc(db, 'notification_logs', 'log-1')));
    await assertFails(getDocs(collection(db, 'notification_logs')));
  });

  it('allows an admin to read campaigns and delivery logs', async () => {
    const db = testEnv!.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(getDoc(doc(db, 'notifications', 'campaign-1')));
    const campaigns = await assertSucceeds(
      getDocs(collection(db, 'notifications')),
    );
    expect(campaigns.docs.map((d) => d.id)).toContain('campaign-1');
    await assertSucceeds(getDoc(doc(db, 'notification_logs', 'log-1')));
    const logs = await assertSucceeds(
      getDocs(collection(db, 'notification_logs')),
    );
    expect(logs.docs.map((d) => d.id)).toContain('log-1');
  });

  it('still allows a signed-in user to log their own received/opened event', async () => {
    const db = attackerDb();
    await assertSucceeds(
      addDoc(collection(db, 'notification_logs'), {
        notificationId: 'campaign-1',
        userId: 'attacker',
        userEmail: 'attacker@example.com',
        status: 'received',
        time: serverTimestamp(),
      }),
    );
    await assertSucceeds(
      addDoc(collection(db, 'notification_logs'), {
        notificationId: 'campaign-1',
        userId: 'attacker',
        userEmail: 'attacker@example.com',
        status: 'opened',
        time: serverTimestamp(),
      }),
    );
  });

  it('denies creating a delivery log attributed to another user', async () => {
    const db = attackerDb();
    await assertFails(
      addDoc(collection(db, 'notification_logs'), {
        notificationId: 'campaign-1',
        userId: 'victim',
        userEmail: 'victim@example.com',
        status: 'opened',
        time: serverTimestamp(),
      }),
    );
  });

  it('denies spoofing another user email on a self-attributed log', async () => {
    const db = attackerDb();
    await assertFails(
      addDoc(collection(db, 'notification_logs'), {
        notificationId: 'campaign-1',
        userId: 'attacker',
        userEmail: 'victim@example.com',
        status: 'opened',
        time: serverTimestamp(),
      }),
    );
  });

  it('denies a signed-in non-admin from creating a notification campaign', async () => {
    const db = attackerDb();
    await assertFails(
      addDoc(collection(db, 'notifications'), {
        title: 'phish',
        body: 'tap this link',
        createdAt: serverTimestamp(),
        sentTo: ['victim'],
      }),
    );
  });

  it('allows an admin to create a notification campaign', async () => {
    const db = testEnv!.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(
      addDoc(collection(db, 'notifications'), {
        title: 'HalfOrder',
        body: 'Dinner nearby',
        createdAt: serverTimestamp(),
        sentTo: ['victim'],
      }),
    );
  });
});
