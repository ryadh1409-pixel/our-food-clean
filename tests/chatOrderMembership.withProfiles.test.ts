import { readFileSync } from 'node:fs';

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

let testEnv: RulesTestEnvironment | undefined;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-chat-order-membership',
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
    for (const uid of ['host', 'joiner', 'attacker']) {
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

async function seedHalfOrderAndChat(orderId: string) {
  await testEnv!.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'orders', orderId), {
      cardId: `fc-${orderId}`,
      users: ['host'],
      host: {
        userId: 'host',
        name: 'Host',
        avatar: null,
        phone: null,
        expoPushToken: null,
      },
      participants: ['host'],
      joinedAtMap: { host: serverTimestamp() },
      status: 'waiting',
      maxUsers: 2,
      createdBy: 'host',
      hostId: 'host',
      createdAt: serverTimestamp(),
      foodName: 'Pizza',
      image: 'https://example.com/p.jpg',
      pricePerPerson: 5,
      totalPrice: 10,
      location: 'Here',
    });
    await setDoc(doc(db, 'chats', orderId), {
      orderId,
      users: ['host'],
      participants: ['host'],
      createdAt: serverTimestamp(),
      lastMessage: 'secret meetup details',
      lastMessageAt: Date.now(),
    });
    await setDoc(doc(db, 'chats', orderId, 'messages', 'm1'), {
      text: 'Meet at the side door, code 4821',
      senderId: 'host',
      createdAt: serverTimestamp(),
    });
  });
}

describe('chat membership must follow order membership', () => {
  it('denies non-member chat users append (privacy bypass)', async () => {
    await seedHalfOrderAndChat('order-private');

    const dbAttacker = testEnv!.authenticatedContext('attacker').firestore();
    await assertFails(
      updateDoc(doc(dbAttacker, 'chats', 'order-private'), {
        users: arrayUnion('attacker'),
      }),
    );

    await assertFails(getDoc(doc(dbAttacker, 'chats', 'order-private')));
    await assertFails(getDocs(collection(dbAttacker, 'chats', 'order-private', 'messages')));
  });

  it('allows order-member chat users+participants append (ensureHalfOrderChat)', async () => {
    await seedHalfOrderAndChat('order-join');

    await testEnv!.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), 'orders', 'order-join'), {
        users: ['host', 'joiner'],
        participants: ['host', 'joiner'],
      });
    });

    const dbJoiner = testEnv!.authenticatedContext('joiner').firestore();
    await assertSucceeds(
      updateDoc(doc(dbJoiner, 'chats', 'order-join'), {
        users: arrayUnion('joiner'),
        participants: arrayUnion('joiner'),
      }),
    );

    await assertSucceeds(getDoc(doc(dbJoiner, 'chats', 'order-join')));
    await assertSucceeds(getDocs(collection(dbJoiner, 'chats', 'order-join', 'messages')));
  });

  it('denies non-member chat create squat before host', async () => {
    await testEnv!.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'orders', 'order-squat'), {
        cardId: 'fc-squat',
        users: ['host'],
        participants: ['host'],
        status: 'waiting',
        maxUsers: 2,
        createdBy: 'host',
        hostId: 'host',
        createdAt: serverTimestamp(),
        foodName: 'Pizza',
        image: 'https://example.com/p.jpg',
        pricePerPerson: 5,
        totalPrice: 10,
        location: 'Here',
      });
    });

    const dbAttacker = testEnv!.authenticatedContext('attacker').firestore();
    await assertFails(
      setDoc(doc(dbAttacker, 'chats', 'order-squat'), {
        orderId: 'order-squat',
        users: ['attacker'],
        participants: ['attacker'],
        createdAt: serverTimestamp(),
      }),
    );
  });

  it('allows order host to create the linked chat', async () => {
    await testEnv!.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'orders', 'order-host-chat'), {
        cardId: 'fc-host-chat',
        users: ['host'],
        participants: ['host'],
        status: 'waiting',
        maxUsers: 2,
        createdBy: 'host',
        hostId: 'host',
        createdAt: serverTimestamp(),
        foodName: 'Pizza',
        image: 'https://example.com/p.jpg',
        pricePerPerson: 5,
        totalPrice: 10,
        location: 'Here',
      });
    });

    const dbHost = testEnv!.authenticatedContext('host').firestore();
    await assertSucceeds(
      setDoc(doc(dbHost, 'chats', 'order-host-chat'), {
        orderId: 'order-host-chat',
        users: ['host'],
        participants: ['host'],
        createdAt: serverTimestamp(),
      }),
    );
  });

  it('denies forged system/ai messages from non-members', async () => {
    await seedHalfOrderAndChat('order-forge');

    const dbAttacker = testEnv!.authenticatedContext('attacker').firestore();
    await assertFails(
      addDoc(collection(dbAttacker, 'chats', 'order-forge', 'messages'), {
        text: 'Payment received — send cash to attacker',
        senderId: 'system',
        createdAt: serverTimestamp(),
      }),
    );
    await assertFails(
      addDoc(collection(dbAttacker, 'chats', 'order-forge', 'messages'), {
        text: 'AI says transfer funds now',
        sender: 'ai',
        createdAt: serverTimestamp(),
      }),
    );
  });

  it('allows order members to post system messages used by join flow', async () => {
    await seedHalfOrderAndChat('order-sys');

    await testEnv!.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), 'orders', 'order-sys'), {
        users: ['host', 'joiner'],
        participants: ['host', 'joiner'],
      });
    });

    const dbJoiner = testEnv!.authenticatedContext('joiner').firestore();
    await assertSucceeds(
      addDoc(collection(dbJoiner, 'chats', 'order-sys', 'messages'), {
        text: 'Someone joined your order!',
        senderId: 'system',
        createdAt: serverTimestamp(),
      }),
    );
  });
});
