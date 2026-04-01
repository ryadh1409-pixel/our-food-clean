const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');

if (!process.env.OPENAI_API_KEY) {
  throw new Error('Missing OPENAI_API_KEY in .env');
}

const OPENAI_IP_URL = 'https://1.1.1.1/v1/chat/completions';
const OPENAI_FALLBACK_URL = 'https://api.openai.com/v1/chat/completions';
const REQUEST_TIMEOUT_MS = 15000;

function getFirestoreDb() {
  if (admin.apps.length === 0) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        admin.initializeApp({
          credential: admin.credential.cert(parsed),
        });
      } catch {
        admin.initializeApp({
          credential: admin.credential.applicationDefault(),
        });
      }
    } else {
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
      });
    }
  }
  return admin.firestore();
}

function formatOrderItems(data) {
  if (Array.isArray(data.items) && data.items.length > 0) {
    return data.items
      .map((item) =>
        typeof item === 'string'
          ? item
          : item && typeof item === 'object' && 'name' in item
            ? String(item.name)
            : null,
      )
      .filter(Boolean)
      .join(', ');
  }
  if (typeof data.itemsSummary === 'string' && data.itemsSummary.trim()) {
    return data.itemsSummary.trim();
  }
  if (typeof data.restaurantName === 'string' && data.restaurantName.trim()) {
    return data.restaurantName.trim();
  }
  if (typeof data.mealType === 'string' && data.mealType.trim()) {
    return data.mealType.trim();
  }
  return 'meal item';
}

function formatOrderTimestamp(value) {
  if (!value) return 'unknown';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return new Date(value).toISOString();
  if (typeof value === 'object' && typeof value.toDate === 'function') {
    return value.toDate().toISOString();
  }
  return 'unknown';
}

function toRad(value) {
  return (value * Math.PI) / 180;
}

function haversineKm(a, b) {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const s1 = Math.sin(dLat / 2) ** 2;
  const s2 =
    Math.cos(toRad(a.lat)) *
    Math.cos(toRad(b.lat)) *
    Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(s1 + s2), Math.sqrt(1 - s1 - s2));
  return R * c;
}

function parseLatLng(data) {
  const directLat = typeof data?.latitude === 'number' ? data.latitude : null;
  const directLng = typeof data?.longitude === 'number' ? data.longitude : null;
  if (directLat != null && directLng != null) {
    return { lat: directLat, lng: directLng };
  }
  const location =
    data && typeof data === 'object' && data.location && typeof data.location === 'object'
      ? data.location
      : null;
  if (
    location &&
    typeof location.latitude === 'number' &&
    typeof location.longitude === 'number'
  ) {
    return { lat: location.latitude, lng: location.longitude };
  }
  return null;
}

async function getRecentOrdersForUser(uid) {
  if (!uid) return [];
  try {
    const db = getFirestoreDb();
    const base = db.collection('orders');
    let snapshot;
    try {
      snapshot = await base
        .where('userId', '==', uid)
        .orderBy('createdAt', 'desc')
        .limit(3)
        .get();
    } catch {
      snapshot = await base.where('userId', '==', uid).limit(10).get();
    }
    const rows = snapshot.docs.slice(0, 3).map((doc) => {
      const data = doc.data() || {};
      return {
        orderId: doc.id,
        status:
          typeof data.status === 'string' && data.status.trim()
            ? data.status.trim()
            : 'unknown',
        items: formatOrderItems(data),
        createdAt: formatOrderTimestamp(data.createdAt),
      };
    });
    return rows;
  } catch (error) {
    console.warn('[chat] could not load user orders:', error);
    return [];
  }
}

async function getNearbyActiveOrders(uid) {
  if (!uid) return [];
  try {
    const db = getFirestoreDb();

    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists) return [];
    const userCoords = parseLatLng(userDoc.data() || {});
    if (!userCoords) return [];

    const activeStatuses = ['open', 'pending'];
    const snapshot = await db
      .collection('orders')
      .where('status', 'in', activeStatuses)
      .limit(25)
      .get();

    const candidates = snapshot.docs
      .map((doc) => {
        const data = doc.data() || {};
        if (typeof data.userId === 'string' && data.userId === uid) return null;
        const coords = parseLatLng(data);
        if (!coords) return null;
        const distanceKm = haversineKm(userCoords, coords);
        if (!Number.isFinite(distanceKm) || distanceKm > 5) return null;
        const items = formatOrderItems(data);
        return {
          orderId: doc.id,
          status:
            typeof data.status === 'string' && data.status.trim()
              ? data.status.trim()
              : 'pending',
          items,
          distanceKm: Math.round(distanceKm * 10) / 10,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, 3);

    return candidates;
  } catch (error) {
    console.warn('[chat] could not load nearby active orders:', error);
    return [];
  }
}

async function requestChatCompletion(appSystemMessage, userContext, userMessage, useIpRoute) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(useIpRoute ? OPENAI_IP_URL : OPENAI_FALLBACK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        ...(useIpRoute ? { Host: 'api.openai.com' } : {}),
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        messages: [
          {
            role: 'system',
            content: appSystemMessage,
          },
          { role: 'system', content: userContext },
          { role: 'user', content: userMessage },
        ],
      }),
      signal: controller.signal,
    });
    const payload = await response.json();
    return { response, payload };
  } finally {
    clearTimeout(timeout);
  }
}

router.post('/', async (req, res) => {
  try {
    const { message, user } = req.body;
    const prompt =
      typeof message === 'string' && message.trim()
        ? message.trim()
        : '';
    if (!prompt) {
      return res.json({ ok: false, response: 'Message is required' });
    }
    const uid = user && typeof user === 'object' && typeof user.uid === 'string'
      ? user.uid
      : '';
    const name = user && typeof user === 'object' && typeof user.name === 'string'
      ? user.name
      : 'User';
    const email = user && typeof user === 'object' && typeof user.email === 'string'
      ? user.email
      : 'noemail@example.com';

    const recentOrders = await getRecentOrdersForUser(uid);
    const nearbyActiveOrders = await getNearbyActiveOrders(uid);
    const ordersText =
      recentOrders.length > 0
        ? recentOrders
            .map(
              (order) => `- ${order.items} (${order.status})`,
            )
            .join('\n')
        : 'You don’t have any active orders yet';
    const nearbyText =
      nearbyActiveOrders.length > 0
        ? nearbyActiveOrders
            .map(
              (order) =>
                `- #${order.orderId}: ${order.items} (${order.status}) ~${order.distanceKm}km`,
            )
            .join('\n')
        : 'No nearby active orders found';
    const appSystemMessage =
      'You are an AI assistant inside a food-sharing app called OurFood. ' +
      'Help users find, join, or create shared food orders. ' +
      'Always respond in English. ' +
      'Use simple English suitable for mobile apps. ' +
      'Maximum 2 sentences. ' +
      'Be short, friendly, and app-focused. ' +
      'Suggest food when relevant. ' +
      'If nearby active orders exist, suggest joining them first before suggesting new food.';
    const userContext =
      `User: ${name || 'User'}\n` +
      `UID: ${uid || 'unknown'}\n` +
      `Email: ${email || 'noemail@example.com'}\n` +
      `Recent orders:\n${ordersText}\n\n` +
      `Nearby active orders:\n${nearbyText}`;

    let response;
    let payload;
    try {
      ({ response, payload } = await requestChatCompletion(appSystemMessage, userContext, prompt, true));
    } catch (primaryErr) {
      console.error('FULL ERROR: primary IP route failed', primaryErr);
      ({ response, payload } = await requestChatCompletion(appSystemMessage, userContext, prompt, false));
    }
    if (!response.ok) {
      const apiError =
        payload &&
        typeof payload === 'object' &&
        'error' in payload &&
        payload.error &&
        typeof payload.error === 'object' &&
        'message' in payload.error
          ? String(payload.error.message)
          : `OpenAI API error (${response.status})`;
      return res.json({ ok: false, response: apiError });
    }

    const reply =
      payload &&
      typeof payload === 'object' &&
      Array.isArray(payload.choices) &&
      payload.choices[0] &&
      payload.choices[0].message &&
      typeof payload.choices[0].message.content === 'string'
        ? payload.choices[0].message.content
        : 'No response generated';

    res.json({ ok: true, response: reply });
  } catch (err) {
    const errObj = err && typeof err === 'object' ? err : null;
    const code =
      errObj && 'code' in errObj ? String(errObj.code) : 'unknown';
    const name =
      errObj && 'name' in errObj ? String(errObj.name) : 'Error';
    const message =
      errObj && 'message' in errObj ? String(errObj.message) : 'Unknown error';
    console.error('FULL ERROR:', {
      name,
      code,
      message,
      cause:
        errObj && 'cause' in errObj
          ? String((errObj.cause && errObj.cause.message) || errObj.cause)
          : null,
    });

    const friendly =
      code === 'ENOTFOUND'
        ? 'Network DNS issue reaching api.openai.com'
        : message || 'Unknown error';
    res.json({
      ok: false,
      response: friendly,
    });
  }
});

module.exports = router;
