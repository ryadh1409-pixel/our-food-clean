/**
 * Backfill `orders.host` + `orders.participants` for HalfOrders (`cardId` set) from `users`.
 *
 *   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json
 *   npm run migrate:orders-users
 */
import admin from 'firebase-admin';

import { publicUserToOrderHost } from '../services/orders.ts';
import { mapRawUserDocument } from '../services/users.ts';

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

function normalizeUserIds(users: unknown): string[] {
  if (!Array.isArray(users)) return [];
  return users.filter((x): x is string => typeof x === 'string' && x.length > 0);
}

/**
 * Idempotent: overwrites `host` / `participants` when out of sync or missing `host.name`.
 */
export async function migrateOrdersPopulateUsers(): Promise<void> {
  initAdmin();
  const db = admin.firestore();
  const FieldValue = admin.firestore.FieldValue;
  let updated = 0;
  let scanned = 0;

  const snap = await db.collection('orders').get();
  for (const docSnap of snap.docs) {
    scanned += 1;
    const d = docSnap.data();
    const cardId = typeof d.cardId === 'string' ? d.cardId.trim() : '';
    if (!cardId) continue;

    const userIds = normalizeUserIds(d.users);
    if (userIds.length === 0) continue;

    const hostRaw = d.host;
    const needsHost =
      !hostRaw ||
      typeof hostRaw !== 'object' ||
      typeof (hostRaw as { name?: string }).name !== 'string' ||
      !(hostRaw as { name?: string }).name?.trim();

    const partsRaw = d.participants;
    const partLen = Array.isArray(partsRaw) ? partsRaw.length : 0;
    const needsParticipants = partLen !== userIds.length;

    if (!needsHost && !needsParticipants) continue;

    const participants: Record<string, unknown>[] = [];
    let host: ReturnType<typeof publicUserToOrderHost> | null = null;

    for (let i = 0; i < userIds.length; i += 1) {
      const uid = userIds[i];
      const uSnap = await db.collection('users').doc(uid).get();
      const raw = uSnap.exists
        ? (uSnap.data() as Record<string, unknown>)
        : ({} as Record<string, unknown>);
      const row = mapRawUserDocument(uid, raw);
      if (i === 0) {
        host = publicUserToOrderHost(row);
      }
      if (!uSnap.exists) {
        console.warn('[migrate] missing user', uid, 'for order', docSnap.id);
      }
      participants.push({
        userId: row.userId,
        name: row.name,
        avatar: row.avatar,
        phone: row.phone,
        expoPushToken: row.expoPushToken,
        joinedAt: FieldValue.serverTimestamp(),
        location: row.location,
      });
    }

    if (!host) continue;

    await docSnap.ref.update({
      host,
      participants,
    });
    updated += 1;
    console.info('[migrate] updated', docSnap.id);
  }

  console.info('[migrate] done. scanned=', scanned, 'updated=', updated);
}

migrateOrdersPopulateUsers().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
