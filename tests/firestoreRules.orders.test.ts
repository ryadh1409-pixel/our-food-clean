import { readFileSync } from 'node:fs';

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  arrayUnion,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  Timestamp,
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
    projectId: 'demo-test',
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

function baseOrderFields(createdByUid: string) {
  return {
    id: 'o1',
    foodName: 'Pepperoni Pizza',
    image: 'https://example.com/pizza.jpg',
    pricePerPerson: 10,
    totalPrice: 30,
    maxPeople: 3,
    usersAccepted: [] as string[],
    createdBy: createdByUid,
    createdAt: serverTimestamp(),
  };
}

describe('firestore rules: orders create + participants join', () => {
  it('allows valid order create by owner', async () => {
    const db = te().authenticatedContext('u1').firestore();
    await assertSucceeds(
      setDoc(doc(db, 'orders', 'o1'), {
        ...baseOrderFields('u1'),
        participants: ['u1'],
        joinedAtMap: { u1: serverTimestamp() },
      }),
    );
  });

  it('denies create when creator is not in participants', async () => {
    const db = te().authenticatedContext('u1').firestore();
    await assertFails(
      setDoc(doc(db, 'orders', 'o1'), {
        ...baseOrderFields('u1'),
        participants: ['u2'],
        joinedAtMap: { u2: serverTimestamp() },
      }),
    );
  });

  it('allows one valid join update (+1 participant and joinedAtMap for joiner)', async () => {
    await te().withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'orders', 'o1'), {
        ...baseOrderFields('u1'),
        participants: ['u1'],
        joinedAtMap: { u1: serverTimestamp() },
      });
    });

    const dbU2 = te().authenticatedContext('u2').firestore();
    await assertSucceeds(
      updateDoc(doc(dbU2, 'orders', 'o1'), {
        participants: arrayUnion('u2'),
        'joinedAtMap.u2': serverTimestamp(),
      }),
    );
  });

  it('denies duplicate join by same user', async () => {
    await te().withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'orders', 'o1'), {
        ...baseOrderFields('u1'),
        participants: ['u1'],
        joinedAtMap: { u1: serverTimestamp() },
        maxPeople: 3,
      });
    });

    const dbU1 = te().authenticatedContext('u1').firestore();
    await assertFails(
      updateDoc(doc(dbU1, 'orders', 'o1'), {
        participants: arrayUnion('u1'),
        'joinedAtMap.u1': serverTimestamp(),
      }),
    );
  });

  it('denies overfill when participants would exceed maxPeople', async () => {
    await te().withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'orders', 'o1'), {
        ...baseOrderFields('u1'),
        participants: ['u1', 'u2'],
        joinedAtMap: {
          u1: serverTimestamp(),
          u2: serverTimestamp(),
        },
        maxPeople: 2,
      });
    });

    const dbU3 = te().authenticatedContext('u3').firestore();
    await assertFails(
      updateDoc(doc(dbU3, 'orders', 'o1'), {
        participants: arrayUnion('u3'),
        'joinedAtMap.u3': serverTimestamp(),
      }),
    );
  });

  it('denies changing unrelated fields during join update', async () => {
    await te().withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'orders', 'o1'), {
        ...baseOrderFields('u1'),
        participants: ['u1'],
        joinedAtMap: { u1: serverTimestamp() },
        maxPeople: 3,
      });
    });

    const dbU2 = te().authenticatedContext('u2').firestore();
    await assertFails(
      updateDoc(doc(dbU2, 'orders', 'o1'), {
        participants: arrayUnion('u2'),
        'joinedAtMap.u2': serverTimestamp(),
        foodName: 'Changed',
      }),
    );
  });

  it('creator can still perform non-join update', async () => {
    await te().withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'orders', 'o1'), {
        ...baseOrderFields('u1'),
        participants: ['u1'],
        joinedAtMap: { u1: serverTimestamp() },
        maxPeople: 3,
      });
    });
    const dbU1 = te().authenticatedContext('u1').firestore();
    await assertSucceeds(
      updateDoc(doc(dbU1, 'orders', 'o1'), {
        image: 'https://example.com/new.jpg',
      }),
    );
    const snap = await getDoc(doc(dbU1, 'orders', 'o1'));
    expect(snap.data()?.image).toBe('https://example.com/new.jpg');
  });
});

describe('firestore rules: swipe usersAccepted + food matches', () => {
  it('allows a signed-in user to add themselves once to usersAccepted', async () => {
    await te().withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'orders', 'sw1'), {
        foodName: 'Swipe Pizza',
        image: 'https://example.com/p.jpg',
        totalPrice: 24,
        maxPeople: 2,
        usersAccepted: [],
        createdAt: serverTimestamp(),
      });
    });

    const dbU1 = te().authenticatedContext('u1').firestore();
    await assertSucceeds(
      updateDoc(doc(dbU1, 'orders', 'sw1'), {
        usersAccepted: arrayUnion('u1'),
      }),
    );
  });

  it('allows a second user to like, then either user can create a match doc', async () => {
    await te().withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'orders', 'sw1'), {
        foodName: 'Swipe Pizza',
        image: 'https://example.com/p.jpg',
        totalPrice: 24,
        maxPeople: 2,
        usersAccepted: ['u1', 'u2'],
        createdAt: serverTimestamp(),
      });
    });

    const dbU1 = te().authenticatedContext('u1').firestore();
    await assertSucceeds(
      setDoc(doc(dbU1, 'matches', 'sw1_u1_u2'), {
        orderId: 'sw1',
        users: ['u1', 'u2'],
        status: 'matched',
        createdAt: serverTimestamp(),
      }),
    );
  });

  it('denies match create when match id does not match canonical pattern', async () => {
    await te().withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'orders', 'sw1'), {
        foodName: 'Swipe Pizza',
        image: 'https://example.com/p.jpg',
        totalPrice: 24,
        maxPeople: 2,
        usersAccepted: ['u1', 'u2'],
        createdAt: serverTimestamp(),
      });
    });

    const dbU1 = te().authenticatedContext('u1').firestore();
    await assertFails(
      setDoc(doc(dbU1, 'matches', 'wrong-id'), {
        orderId: 'sw1',
        users: ['u1', 'u2'],
        status: 'matched',
        createdAt: serverTimestamp(),
      }),
    );
  });
});

describe('firestore rules: HalfOrder pair-join notified ack', () => {
  function halfOrderPairDoc() {
    const ts = serverTimestamp();
    return {
      cardId: 'fc1',
      users: ['u1', 'u2'],
      host: { userId: 'u1', name: 'User One', avatar: null, phone: null, expoPushToken: null },
      participants: ['u1', 'u2'],
      joinedAtMap: { u1: ts, u2: ts },
      status: 'active' as const,
      maxUsers: 2,
      createdBy: 'u1',
      hostId: 'u1',
      createdAt: serverTimestamp(),
      foodName: 'Pizza',
      image: 'https://example.com/p.jpg',
      pricePerPerson: 5,
      totalPrice: 10,
      location: 'Here',
    };
  }

  it('allows an order member to set notified once', async () => {
    await te().withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'orders', 'ho1'), halfOrderPairDoc());
    });
    const dbU2 = te().authenticatedContext('u2').firestore();
    await assertSucceeds(
      updateDoc(doc(dbU2, 'orders', 'ho1'), {
        notified: true,
        notifiedAt: serverTimestamp(),
      }),
    );
  });

  it('denies duplicate notified when already true', async () => {
    await te().withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'orders', 'ho1'), {
        ...halfOrderPairDoc(),
        notified: true,
        notifiedAt: serverTimestamp(),
      });
    });
    const dbU2 = te().authenticatedContext('u2').firestore();
    await assertFails(
      updateDoc(doc(dbU2, 'orders', 'ho1'), {
        notified: true,
        notifiedAt: serverTimestamp(),
      }),
    );
  });

  it('denies notified ack when caller is not in users', async () => {
    await te().withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'orders', 'ho1'), halfOrderPairDoc());
    });
    const dbU3 = te().authenticatedContext('u3').firestore();
    await assertFails(
      updateDoc(doc(dbU3, 'orders', 'ho1'), {
        notified: true,
        notifiedAt: serverTimestamp(),
      }),
    );
  });
});

describe('firestore rules: HalfOrder cancel + order_members', () => {
  function halfOrderActivePair() {
    const ts = serverTimestamp();
    return {
      cardId: 'fc2',
      users: ['u1', 'u2'],
      host: { userId: 'u1', name: 'User One', avatar: null, phone: null, expoPushToken: null },
      participants: ['u1', 'u2'],
      joinedAtMap: { u1: ts, u2: ts },
      status: 'active' as const,
      maxUsers: 2,
      createdBy: 'u1',
      hostId: 'u1',
      createdAt: serverTimestamp(),
      foodName: 'Pizza',
      image: 'https://example.com/p.jpg',
      pricePerPerson: 5,
      totalPrice: 10,
      location: 'Here',
    };
  }

  it('allows a member to cancel a HalfOrder with cancelledBy + cancelledAt', async () => {
    await te().withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'orders', 'ho2'), halfOrderActivePair());
    });
    const dbU2 = te().authenticatedContext('u2').firestore();
    await assertSucceeds(
      updateDoc(doc(dbU2, 'orders', 'ho2'), {
        status: 'cancelled',
        cancelledBy: 'u2',
        cancelledAt: serverTimestamp(),
      }),
    );
  });

  it('denies cancel when cancelledBy does not match caller', async () => {
    await te().withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'orders', 'ho3'), halfOrderActivePair());
    });
    const dbU3 = te().authenticatedContext('u3').firestore();
    await assertFails(
      updateDoc(doc(dbU3, 'orders', 'ho3'), {
        status: 'cancelled',
        cancelledBy: 'u2',
        cancelledAt: serverTimestamp(),
      }),
    );
  });

  it('allows order member to upsert their order_members profile', async () => {
    await te().withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'orders', 'ho4'), {
        ...halfOrderActivePair(),
        users: ['u1', 'u2'],
      });
    });
    const dbU1 = te().authenticatedContext('u1').firestore();
    await assertSucceeds(
      setDoc(doc(dbU1, 'orders', 'ho4', 'order_members', 'u1'), {
        userId: 'u1',
        name: 'Alice',
        avatar: null,
        phone: null,
        pushToken: null,
        joinedAt: Timestamp.now(),
        location: { lat: 1, lng: 2 },
      }),
    );
  });

  it('denies order_members write for non-member', async () => {
    await te().withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'orders', 'ho5'), {
        ...halfOrderActivePair(),
        users: ['u1', 'u2'],
      });
    });
    const dbU3 = te().authenticatedContext('u3').firestore();
    await assertFails(
      setDoc(doc(dbU3, 'orders', 'ho5', 'order_members', 'u3'), {
        userId: 'u3',
        name: 'Eve',
        avatar: null,
        phone: null,
        pushToken: null,
        joinedAt: Timestamp.now(),
        location: null,
      }),
    );
  });
});
