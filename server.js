const express = require('express');
const admin = require('firebase-admin');

const PORT = Number(process.env.PORT || 3000);

function parseServiceAccountFromEnv() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed.project_id === 'string'
    ) {
      return parsed;
    }
  } catch {
    // ignored; fallback below
  }
  return null;
}

function initializeFirebaseAdmin() {
  if (admin.apps.length > 0) {
    return admin.app();
  }

  const serviceAccount = parseServiceAccountFromEnv();
  if (serviceAccount) {
    return admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  }

  // Falls back to GOOGLE_APPLICATION_CREDENTIALS / ADC in production environments.
  return admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}

initializeFirebaseAdmin();
const db = admin.firestore();

const app = express();
app.use(express.json({ limit: '1mb' }));

app.post('/tidio-webhook', async (req, res) => {
  console.log('Webhook received');
  console.log('[Tidio webhook payload]', req.body);

  const payload =
    req.body && typeof req.body === 'object' ? req.body : { raw: req.body };

  const maybeMessage =
    (typeof payload.message === 'string' && payload.message) ||
    (typeof payload.content === 'string' && payload.content) ||
    (typeof payload.text === 'string' && payload.text) ||
    '';
  const message = maybeMessage.trim() || '[no-message]';

  const tsRaw = payload.createdAt ?? payload.timestamp ?? payload.created_at;
  let createdAt = admin.firestore.FieldValue.serverTimestamp();
  if (typeof tsRaw === 'string' || typeof tsRaw === 'number') {
    const date = new Date(tsRaw);
    if (!Number.isNaN(date.getTime())) {
      createdAt = admin.firestore.Timestamp.fromDate(date);
    }
  }

  try {
    await db.collection('chats').add({
      message,
      createdAt,
      source: 'tidio',
      rawData: payload,
    });
    console.log('Saved to Firebase');
    return res.status(200).json({ ok: true });
  } catch (error) {
    // Keep server stable and always acknowledge receipt for retries policy control.
    console.error('[Tidio webhook] Firestore save failed:', error);
    return res.status(500).json({ ok: false, error: 'firestore_write_failed' });
  }
});

app.use((err, _req, res, _next) => {
  console.error('[Webhook server] Unhandled error:', err);
  res.status(500).json({ ok: false, error: 'internal_error' });
});

app.listen(PORT, () => {
  console.log(`Tidio webhook server running on port ${PORT}`);
});
