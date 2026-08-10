import { readFileSync } from 'node:fs';

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';

let testEnv: RulesTestEnvironment | undefined;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-invite-email-relay',
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
    await setDoc(doc(ctx.firestore(), 'users', 'host'), {
      uid: 'host',
      displayName: 'Host',
      role: 'user',
      restricted: false,
      banned: false,
      totalOrdersCompleted: 10,
      activeOrderCount: 0,
    });
    await setDoc(doc(ctx.firestore(), 'orders', 'order-1'), {
      foodName: 'Pepperoni Pizza',
      image: 'https://example.com/pizza.jpg',
      pricePerPerson: 10,
      totalPrice: 20,
      maxPeople: 2,
      usersAccepted: [],
      createdBy: 'host',
      createdAt: serverTimestamp(),
      users: ['host'],
      participants: ['host'],
      joinedAtMap: { host: serverTimestamp() },
      status: 'waiting',
      cardId: '1',
      maxUsers: 2,
      hostId: 'host',
    });
  });
});

describe('invite email open relay', () => {
  it('denies order members from creating invite docs (CF mail relay)', async () => {
    const dbHost = testEnv!.authenticatedContext('host').firestore();
    await assertFails(
      setDoc(doc(dbHost, 'invites', 'spam-1'), {
        email: 'victim@example.com',
        orderId: 'order-1',
        inviterName: 'Your Bank Security',
        inviterId: 'host',
        createdAt: serverTimestamp(),
      }),
    );
  });

  it('denies invite create even with a well-formed membership-shaped payload', async () => {
    const dbHost = testEnv!.authenticatedContext('host').firestore();
    await assertFails(
      setDoc(doc(dbHost, 'invites', 'spam-2'), {
        email: 'another@example.com',
        orderId: 'order-1',
        inviterName: 'Friend',
        inviterId: 'host',
        createdAt: serverTimestamp(),
      }),
    );
  });

  it('still allows an inviter to read their own legacy invite doc', async () => {
    await testEnv!.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'invites', 'legacy-1'), {
        email: 'friend@example.com',
        orderId: 'order-1',
        inviterName: 'Host',
        inviterId: 'host',
        createdAt: serverTimestamp(),
        status: 'sent',
      });
    });

    const dbHost = testEnv!.authenticatedContext('host').firestore();
    await assertSucceeds(getDoc(doc(dbHost, 'invites', 'legacy-1')));
  });

  it('denies strangers from reading someone else\'s invite', async () => {
    await testEnv!.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', 'stranger'), {
        uid: 'stranger',
        role: 'user',
        restricted: false,
        banned: false,
      });
      await setDoc(doc(ctx.firestore(), 'invites', 'legacy-2'), {
        email: 'friend@example.com',
        orderId: 'order-1',
        inviterName: 'Host',
        inviterId: 'host',
        createdAt: serverTimestamp(),
        status: 'sent',
      });
    });

    const dbStranger = testEnv!.authenticatedContext('stranger').firestore();
    await assertFails(getDoc(doc(dbStranger, 'invites', 'legacy-2')));
  });
});
