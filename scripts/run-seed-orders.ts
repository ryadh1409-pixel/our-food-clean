/**
 * Seed Firestore `orders` with FOOD_ORDER_SEEDS (10 documents).
 *
 * Prerequisites:
 *   npm install
 *
 * Auth:
 *   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json
 *
 * Project id (optional; defaults to halforfer):
 *   export FIREBASE_PROJECT_ID=your-project-id
 *
 * Host user (required — a real Firebase Auth uid in your project):
 *   export SEED_HOST_UID=xxxxxxxxxxxxxxxx
 *
 * Run:
 *   npm run seed:orders
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import admin from 'firebase-admin';

import {
  FOOD_ORDER_SEEDS,
  buildOrdersSeedPayload,
} from '../services/seedFoodOrders.ts';

function initAdmin(): void {
  if (admin.apps.length > 0) return;
  const projectId =
    process.env.FIREBASE_PROJECT_ID?.trim() ||
    process.env.GCLOUD_PROJECT?.trim() ||
    process.env.GOOGLE_CLOUD_PROJECT?.trim() ||
    'halforfer';
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId,
  });
}

async function main(): Promise<void> {
  const hostUid = process.env.SEED_HOST_UID?.trim();
  if (!hostUid) {
    console.error('Missing SEED_HOST_UID (Firebase Auth uid for createdBy / host).');
    process.exit(1);
  }

  initAdmin();
  const db = admin.firestore();
  const batch = db.batch();
  const createdAt = admin.firestore.FieldValue.serverTimestamp();
  const joinedAt = admin.firestore.Timestamp.now();

  const createdRefs: admin.firestore.DocumentReference[] = [];

  for (const seed of FOOD_ORDER_SEEDS) {
    const ref = db.collection('orders').doc();
    const payload = buildOrdersSeedPayload(seed, hostUid, {
      joinedAt,
      createdAt,
    });
    batch.set(ref, { ...payload, id: ref.id });
    createdRefs.push(ref);
  }

  await batch.commit();

  const outDir = resolve(process.cwd(), 'scripts', '.seed-output');
  try {
    mkdirSync(outDir, { recursive: true });
  } catch {
    /* ignore */
  }
  const ids = createdRefs.map((r) => r.id);
  writeFileSync(
    resolve(outDir, 'last-seed-order-ids.json'),
    `${JSON.stringify({ createdAt: new Date().toISOString(), orderIds: ids }, null, 2)}\n`,
    'utf8',
  );

  console.log(`Seeded ${ids.length} orders. Document IDs:\n${ids.join('\n')}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
