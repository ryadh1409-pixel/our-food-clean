/**
 * Seed Firestore `orders` with 10 swipe-style food rows (random $10–50 totals).
 *
 *   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json
 *   npm run seed:orders
 *
 * Optional: FIREBASE_PROJECT_ID (defaults to halforfer)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import admin from 'firebase-admin';

import {
  generateTenSwipeFoodOrders,
  swipeOrderAdminFields,
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
  initAdmin();
  const db = admin.firestore();
  const batch = db.batch();
  const createdAt = admin.firestore.FieldValue.serverTimestamp();
  const seeds = generateTenSwipeFoodOrders();
  const createdRefs: admin.firestore.DocumentReference[] = [];

  for (const seed of seeds) {
    const ref = db.collection('orders').doc();
    const payload = swipeOrderAdminFields(seed, createdAt);
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

  console.log(`Seeded ${ids.length} orders. IDs:\n${ids.join('\n')}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
