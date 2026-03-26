/**
 * Integration test: order create + join flow.
 * Uses Firestore emulator. Start with: firebase emulators:start --only firestore
 * Then: npm test
 */
import { initializeApp } from 'firebase/app';
import {
  addDoc,
  arrayUnion,
  collection,
  connectFirestoreEmulator,
  doc,
  getDoc,
  getFirestore,
  runTransaction,
  serverTimestamp,
  type Firestore,
} from 'firebase/firestore';

const EMULATOR_HOST = 'localhost';
const EMULATOR_PORT = 8080;

const userA = 'user-a-test-' + Date.now();
const userB = 'user-b-test-' + Date.now();

let db: Firestore;

async function joinOrderWithTransaction(
  firestore: Firestore,
  orderId: string,
  user: { uid: string },
): Promise<void> {
  if (!user?.uid) {
    throw new Error('You must be signed in to join.');
  }
  const orderRef = doc(firestore, 'orders', orderId);
  await runTransaction(firestore, async (transaction) => {
    const orderSnap = await transaction.get(orderRef);
    if (!orderSnap.exists()) {
      throw new Error('Order not found');
    }
    const orderData = orderSnap.data();
    if (orderData.status !== 'open') {
      throw new Error('Order is not open');
    }
    const participants: string[] = Array.isArray(orderData.participantIds)
      ? orderData.participantIds
      : [];
    const maxPeople = Number(orderData.maxPeople ?? 0);
    if (participants.includes(user.uid)) {
      throw new Error('You already joined this order');
    }
    if (participants.length >= maxPeople) {
      throw new Error('Order is full');
    }
    const newCount = participants.length + 1;
    transaction.update(orderRef, {
      participantIds: arrayUnion(user.uid),
      status: newCount >= maxPeople ? 'full' : 'open',
    });
  });
}

beforeAll(() => {
  const app = initializeApp(
    { projectId: 'demo-test', apiKey: 'test-api-key' },
    'orderFlowTest',
  );
  db = getFirestore(app);
  connectFirestoreEmulator(db, EMULATOR_HOST, EMULATOR_PORT);
});

const EMULATOR_TIMEOUT_MS = 8000;

describe('order flow integration', () => {
  it(
    'creates order as User A, User B joins, participantIds length 2 and status stays open',
    async () => {
      const ordersRef = collection(db, 'orders');
      const orderData = {
        status: 'open',
        participantIds: [userA],
        maxPeople: 3,
        hostId: userA,
        createdAt: serverTimestamp(),
        restaurantName: 'Test Restaurant',
      };
      let orderId: string;
      try {
        const ref = await Promise.race([
          addDoc(ordersRef, orderData),
          new Promise<never>((_, reject) =>
            setTimeout(
              () =>
                reject(
                  new Error(
                    'Firestore emulator not running. Start with: firebase emulators:start --only firestore',
                  ),
                ),
              EMULATOR_TIMEOUT_MS,
            ),
          ),
        ]);
        orderId = ref.id;
      } catch (e) {
        const msg =
          e instanceof Error ? e.message : 'Failed to create order';
        if (msg.includes('emulator')) throw e;
        throw new Error(
          `${msg}. (Ensure emulator is running: firebase emulators:start --only firestore)`,
        );
      }

    const orderSnap = await getDoc(doc(db, 'orders', orderId));
    if (!orderSnap.exists()) {
      throw new Error('Order was not created');
    }
    const created = orderSnap.data();
    expect(created.status).toBe('open');
    expect(Array.isArray(created.participantIds)).toBe(true);
    expect(created.participantIds).toContain(userA);
    expect(created.participantIds.length).toBe(1);
    expect(created.maxPeople).toBe(3);

    await joinOrderWithTransaction(db, orderId, { uid: userB });

    const afterSnap = await getDoc(doc(db, 'orders', orderId));
    if (!afterSnap.exists()) {
      throw new Error('Order missing after join');
    }
    const after = afterSnap.data();
    expect(after.participantIds.length).toBe(2);
    expect(after.participantIds).toContain(userA);
    expect(after.participantIds).toContain(userB);
    expect(after.status).toBe('open');

      console.log(
        '\n  ✓ Order flow test passed: create (open) -> join -> 2 participants, status open.\n',
      );
    },
    EMULATOR_TIMEOUT_MS + 4000,
  );
});
