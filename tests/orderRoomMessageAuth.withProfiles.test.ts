/**
 * Regression: order-room messages must not allow members to spoof senders,
 * edit history, or wipe live chat before the order is terminal.
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
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

let testEnv: RulesTestEnvironment | undefined;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-order-messages',
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
    for (const uid of ['host', 'joiner', 'stranger']) {
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
    await setDoc(doc(ctx.firestore(), 'orders', 'room-1'), {
      id: 'room-1',
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
      foodName: 'Pizza',
      image: 'https://example.com/p.jpg',
      pricePerPerson: 5,
      totalPrice: 10,
      maxPeople: 2,
    });
    await setDoc(doc(ctx.firestore(), 'orders', 'room-1', 'messages', 'm1'), {
      text: 'hello from host',
      senderId: 'host',
      senderName: 'host',
      createdAt: serverTimestamp(),
    });
  });
});

describe('order room message auth', () => {
  it('allows a member to send a self-authored message', async () => {
    const db = testEnv!.authenticatedContext('joiner').firestore();
    await assertSucceeds(
      addDoc(collection(db, 'orders', 'room-1', 'messages'), {
        text: 'on my way',
        senderId: 'joiner',
        senderName: 'joiner',
        createdAt: serverTimestamp(),
      }),
    );
  });

  it('allows honest system notices used by join / chat init', async () => {
    const db = testEnv!.authenticatedContext('joiner').firestore();
    await assertSucceeds(
      addDoc(collection(db, 'orders', 'room-1', 'messages'), {
        text: 'You both joined this order 🍕',
        senderId: 'system',
        senderName: 'System',
        type: 'system',
        createdAt: serverTimestamp(),
      }),
    );
    await assertSucceeds(
      addDoc(collection(db, 'orders', 'room-1', 'messages'), {
        type: 'system',
        text: 'A participant joined',
        senderId: '',
        senderName: '',
        createdAt: serverTimestamp(),
      }),
    );
    await assertSucceeds(
      addDoc(collection(db, 'orders', 'room-1', 'messages'), {
        senderId: 'joiner',
        senderName: 'joiner',
        text: 'You joined this shared order',
        type: 'system',
        createdAt: serverTimestamp(),
      }),
    );
  });

  it('denies spoofing another member as senderId', async () => {
    const db = testEnv!.authenticatedContext('joiner').firestore();
    await assertFails(
      addDoc(collection(db, 'orders', 'room-1', 'messages'), {
        text: 'fake host message',
        senderId: 'host',
        senderName: 'host',
        createdAt: serverTimestamp(),
      }),
    );
  });

  it('denies editing an existing message', async () => {
    const db = testEnv!.authenticatedContext('joiner').firestore();
    await assertFails(
      updateDoc(doc(db, 'orders', 'room-1', 'messages', 'm1'), {
        text: 'rewritten history',
      }),
    );
  });

  it('denies wiping messages while the order is still live', async () => {
    const db = testEnv!.authenticatedContext('joiner').firestore();
    await assertFails(
      deleteDoc(doc(db, 'orders', 'room-1', 'messages', 'm1')),
    );
  });

  it('allows message cleanup after the order is completed', async () => {
    await testEnv!.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), 'orders', 'room-1'), {
        status: 'completed',
      });
    });
    const db = testEnv!.authenticatedContext('host').firestore();
    await assertSucceeds(
      deleteDoc(doc(db, 'orders', 'room-1', 'messages', 'm1')),
    );
  });

  it('denies non-members from creating messages', async () => {
    const db = testEnv!.authenticatedContext('stranger').firestore();
    await assertFails(
      addDoc(collection(db, 'orders', 'room-1', 'messages'), {
        text: 'intruder',
        senderId: 'stranger',
        senderName: 'stranger',
        createdAt: serverTimestamp(),
      }),
    );
  });
});
