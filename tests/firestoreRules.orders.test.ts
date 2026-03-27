import { readFileSync } from 'node:fs';

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';

let testEnv: RulesTestEnvironment;

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
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

describe('firestore rules: orders create + join safety', () => {
  it('allows valid order create by owner', async () => {
    const db = testEnv.authenticatedContext('u1').firestore();
    await assertSucceeds(
      setDoc(doc(db, 'orders', 'o1'), {
        id: 'o1',
        foodName: 'Pepperoni Pizza',
        image: 'https://example.com/pizza.jpg',
        pricePerPerson: 10,
        totalPrice: 30,
        peopleJoined: 1,
        maxPeople: 3,
        usersJoined: ['u1'],
        createdBy: 'u1',
        createdAt: serverTimestamp(),
      }),
    );
  });

  it('denies create when usersJoined does not include creator', async () => {
    const db = testEnv.authenticatedContext('u1').firestore();
    await assertFails(
      setDoc(doc(db, 'orders', 'o1'), {
        id: 'o1',
        foodName: 'Pepperoni Pizza',
        image: 'https://example.com/pizza.jpg',
        pricePerPerson: 10,
        totalPrice: 30,
        peopleJoined: 1,
        maxPeople: 3,
        usersJoined: ['u2'],
        createdBy: 'u1',
        createdAt: serverTimestamp(),
      }),
    );
  });

  it('allows one valid join update (+1 peopleJoined and append uid)', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'orders', 'o1'), {
        id: 'o1',
        foodName: 'Pepperoni Pizza',
        image: 'https://example.com/pizza.jpg',
        pricePerPerson: 10,
        totalPrice: 30,
        peopleJoined: 1,
        maxPeople: 2,
        usersJoined: ['u1'],
        createdBy: 'u1',
        createdAt: serverTimestamp(),
      });
    });

    const dbU2 = testEnv.authenticatedContext('u2').firestore();
    await assertSucceeds(
      updateDoc(doc(dbU2, 'orders', 'o1'), {
        peopleJoined: 2,
        usersJoined: ['u1', 'u2'],
      }),
    );
  });

  it('denies duplicate join by same user', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'orders', 'o1'), {
        id: 'o1',
        foodName: 'Pepperoni Pizza',
        image: 'https://example.com/pizza.jpg',
        pricePerPerson: 10,
        totalPrice: 30,
        peopleJoined: 1,
        maxPeople: 3,
        usersJoined: ['u1'],
        createdBy: 'u1',
        createdAt: serverTimestamp(),
      });
    });

    const dbU1 = testEnv.authenticatedContext('u1').firestore();
    await assertFails(
      updateDoc(doc(dbU1, 'orders', 'o1'), {
        peopleJoined: 2,
        usersJoined: ['u1', 'u1'],
      }),
    );
  });

  it('denies overfill update when peopleJoined exceeds maxPeople', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'orders', 'o1'), {
        id: 'o1',
        foodName: 'Pepperoni Pizza',
        image: 'https://example.com/pizza.jpg',
        pricePerPerson: 10,
        totalPrice: 20,
        peopleJoined: 2,
        maxPeople: 2,
        usersJoined: ['u1', 'u2'],
        createdBy: 'u1',
        createdAt: serverTimestamp(),
      });
    });

    const dbU3 = testEnv.authenticatedContext('u3').firestore();
    await assertFails(
      updateDoc(doc(dbU3, 'orders', 'o1'), {
        peopleJoined: 3,
        usersJoined: ['u1', 'u2', 'u3'],
      }),
    );
  });

  it('denies changing unrelated fields during join update', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'orders', 'o1'), {
        id: 'o1',
        foodName: 'Pepperoni Pizza',
        image: 'https://example.com/pizza.jpg',
        pricePerPerson: 10,
        totalPrice: 30,
        peopleJoined: 1,
        maxPeople: 3,
        usersJoined: ['u1'],
        createdBy: 'u1',
        createdAt: serverTimestamp(),
      });
    });

    const dbU2 = testEnv.authenticatedContext('u2').firestore();
    await assertFails(
      updateDoc(doc(dbU2, 'orders', 'o1'), {
        peopleJoined: 2,
        usersJoined: ['u1', 'u2'],
        foodName: 'Changed',
      }),
    );
  });

  it('creator can still perform non-join update', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'orders', 'o1'), {
        id: 'o1',
        foodName: 'Pepperoni Pizza',
        image: 'https://example.com/pizza.jpg',
        pricePerPerson: 10,
        totalPrice: 30,
        peopleJoined: 1,
        maxPeople: 3,
        usersJoined: ['u1'],
        createdBy: 'u1',
        createdAt: serverTimestamp(),
      });
    });
    const dbU1 = testEnv.authenticatedContext('u1').firestore();
    await assertSucceeds(updateDoc(doc(dbU1, 'orders', 'o1'), { image: 'https://example.com/new.jpg' }));
    const snap = await getDoc(doc(dbU1, 'orders', 'o1'));
    expect(snap.data()?.image).toBe('https://example.com/new.jpg');
  });
});
