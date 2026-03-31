const express = require('express');
const admin = require('firebase-admin');
const OpenAI = require('openai');

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

const SUPPORT_PROMPT = `You are a support agent for OurFood app.
The app allows users to share meals and split cost.

Answer briefly and clearly.
If user asks about:
- orders -> guide them
- problems -> ask for orderId
- refund -> explain process`;

app.post('/ai-support-reply', async (req, res) => {
  const { message } = req.body ?? {};
  if (typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ ok: false, error: 'message_required' });
  }
  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ ok: false, error: 'openai_key_missing' });
  }

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: 0.2,
      max_tokens: 120,
      messages: [
        { role: 'system', content: SUPPORT_PROMPT },
        { role: 'user', content: message.trim() },
      ],
    });
    const aiResponse =
      completion.choices?.[0]?.message?.content?.trim() ||
      'Thanks for your message. A support specialist will follow up shortly.';
    return res.status(200).json({ ok: true, aiResponse });
  } catch (error) {
    console.error('[AI support] OpenAI request failed:', error);
    return res.status(500).json({ ok: false, error: 'ai_request_failed' });
  }
});

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
