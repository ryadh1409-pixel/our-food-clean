const functions = require('firebase-functions');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');

const { notifyUsersExpo } = require('./lib/expoPush');

admin.initializeApp();

/** Inbound address for feedback + daily report (not secret). */
const SUPPORT_INBOX = 'support@halforder.app';

/**
 * Nodemailer → Gmail using Firebase runtime config (recommended).
 * Run: `firebase functions:config:set gmail.email="you@gmail.com" gmail.password="xxxx xxxx xxxx xxxx"`
 *
 * For local emulator only, you may set GMAIL_USER + GMAIL_APP_PASSWORD instead.
 */
function getMailTransporter() {
  const gmailCfg = functions.config().gmail || {};
  const user =
    gmailCfg.email || process.env.GMAIL_USER || process.env.SMTP_USER || '';
  const pass =
    gmailCfg.password ||
    process.env.GMAIL_APP_PASSWORD ||
    process.env.SMTP_PASS ||
    '';
  if (!user || !pass) {
    throw new Error(
      'Mail not configured: set functions.config gmail.email and gmail.password',
    );
  }
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });
}

const ADMIN_FCM_TOKEN = process.env.ADMIN_FCM_TOKEN || '';

const BADGE_TRUSTED = '🔥 Trusted';
const BADGE_FAST_JOINER = '⚡ Fast Joiner';
const BADGE_COMMUNICATIVE = '💬 Communicative';
const BADGE_FOOD_LOVER = '🍕 Food Lover';
const MAX_CANCELLATIONS_PER_24H = 3;
const REPORT_RESTRICTION_THRESHOLD = 5;

function computeTrustScore({
  averageRating = 0,
  totalOrdersCompleted = 0,
  cancellationRate = 0,
  reportCount = 0,
}) {
  const normalizedCancellation =
    cancellationRate > 1 ? cancellationRate / 100 : cancellationRate;
  return Number(
    (
      averageRating * 0.5 +
      totalOrdersCompleted * 0.3 -
      normalizedCancellation * 0.1 -
      reportCount * 0.1
    ).toFixed(2),
  );
}

function computeBadges({
  averageRating = 0,
  totalOrdersCompleted = 0,
  ordersJoined = 0,
  messagesSent = 0,
}) {
  const badges = [];
  if (averageRating >= 4.5 && totalOrdersCompleted >= 8) {
    badges.push(BADGE_TRUSTED);
  }
  if (ordersJoined >= 10) {
    badges.push(BADGE_FAST_JOINER);
  }
  if (messagesSent >= 30) {
    badges.push(BADGE_COMMUNICATIVE);
  }
  if (totalOrdersCompleted >= 20) {
    badges.push(BADGE_FOOD_LOVER);
  }
  return badges;
}

function arraysEqual(a = [], b = []) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function normalizeCancellationRate(value = 0) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 0;
  return value > 1 ? value / 100 : value;
}

function sameStringArray(a = [], b = []) {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

function computeSuspiciousSignals({
  reportCount = 0,
  cancellationRate = 0,
  cancellationCount24h = 0,
  totalOrdersCompleted = 0,
}) {
  const signals = [];
  const normalizedCancelRate = normalizeCancellationRate(cancellationRate);
  if (reportCount >= 3) signals.push('high_reports');
  if (normalizedCancelRate >= 0.5 && totalOrdersCompleted >= 4) {
    signals.push('high_cancellation_rate');
  }
  if (cancellationCount24h >= MAX_CANCELLATIONS_PER_24H) {
    signals.push('frequent_daily_cancellations');
  }
  return signals;
}

async function refreshUserDerivedFields(db, userId) {
  const userRef = db.doc(`users/${userId}`);
  const userSnap = await userRef.get();
  const userData = userSnap.exists ? userSnap.data() : {};

  const averageRating =
    typeof userData?.averageRating === 'number' ? userData.averageRating : 0;
  const totalOrdersCompleted =
    typeof userData?.totalOrdersCompleted === 'number'
      ? userData.totalOrdersCompleted
      : typeof userData?.ordersCount === 'number'
        ? userData.ordersCount
        : 0;
  const cancellationRate =
    typeof userData?.cancellationRate === 'number' ? userData.cancellationRate : 0;
  const reportCount = typeof userData?.reportCount === 'number' ? userData.reportCount : 0;
  const ordersJoined = typeof userData?.ordersJoined === 'number' ? userData.ordersJoined : 0;
  const messagesSent = typeof userData?.messagesSent === 'number' ? userData.messagesSent : 0;
  const cancellationCount24h =
    typeof userData?.cancellationCount24h === 'number' ? userData.cancellationCount24h : 0;

  const trustScore = computeTrustScore({
    averageRating,
    totalOrdersCompleted,
    cancellationRate,
    reportCount,
  });
  const badges = computeBadges({
    averageRating,
    totalOrdersCompleted,
    ordersJoined,
    messagesSent,
  });
  const currentBadges = Array.isArray(userData?.badges)
    ? userData.badges.filter((x) => typeof x === 'string')
    : [];
  const suspiciousSignals = computeSuspiciousSignals({
    reportCount,
    cancellationRate,
    cancellationCount24h,
    totalOrdersCompleted,
  });
  const suspicious = suspiciousSignals.length > 0;
  const shouldRestrictForReports = reportCount >= REPORT_RESTRICTION_THRESHOLD;
  const alreadyRestricted = userData?.restricted === true;

  const needsUpdate =
    trustScore !== (typeof userData?.trustScore === 'number' ? userData.trustScore : 0) ||
    !arraysEqual(currentBadges, badges) ||
    userData?.suspicious !== suspicious ||
    !sameStringArray(
      Array.isArray(userData?.suspiciousSignals)
        ? userData.suspiciousSignals.filter((x) => typeof x === 'string')
        : [],
      suspiciousSignals,
    ) ||
    (shouldRestrictForReports && !alreadyRestricted);

  if (!needsUpdate) return;
  const updates = {
    trustScore,
    badges,
    suspicious,
    suspiciousSignals,
  };
  if (shouldRestrictForReports && !alreadyRestricted) {
    updates.restricted = true;
    updates.restrictedReason = 'Too many reports';
    updates.restrictedAt = admin.firestore.FieldValue.serverTimestamp();
  }
  await userRef.set(updates, { merge: true });
}

function resolveOrderOwnerId(orderData = {}) {
  if (typeof orderData.createdBy === 'string' && orderData.createdBy) {
    return orderData.createdBy;
  }
  if (typeof orderData.hostId === 'string' && orderData.hostId) {
    return orderData.hostId;
  }
  if (typeof orderData.userId === 'string' && orderData.userId) {
    return orderData.userId;
  }
  return null;
}

exports.onSupportMessage = functions.firestore
  .document('support_chats/{userId}/messages/{messageId}')
  .onCreate(async (snap, context) => {
    const data = snap.data();
    const sender = data?.sender;

    if (sender !== 'user') return null;

    if (!ADMIN_FCM_TOKEN) {
      console.warn('ADMIN_FCM_TOKEN not set, skipping notification');
      return null;
    }

    const text =
      typeof data?.text === 'string' ? data.text.slice(0, 100) : 'New message';

    await admin.messaging().send({
      token: ADMIN_FCM_TOKEN,
      notification: {
        title: 'Support: New message',
        body: text,
      },
      data: {
        userId: context.params.userId,
      },
    });

    return null;
  });

exports.sendOrderInvite = functions.firestore
  .document('invites/{inviteId}')
  .onCreate(async (snap, context) => {
    const inviteId = context.params.inviteId;
    const data = snap.data();
    const email = typeof data?.email === 'string' ? data.email : '';
    const orderId = typeof data?.orderId === 'string' ? data.orderId : '';
    const inviterName =
      typeof data?.inviterName === 'string' ? data.inviterName : 'Someone';

    if (!email || !orderId) {
      console.error('sendOrderInvite: missing email or orderId', {
        inviteId,
        email,
        orderId,
      });
      await snap.ref
        .update({ status: 'failed', error: 'missing email or orderId' })
        .catch((err) => console.error(err));
      return null;
    }

    const inviteLink = `https://halforder.app/order/${orderId}`;
    const subject = 'You were invited to join an order';
    const body = `Hi,\n\n${inviterName} invited you to join a shared order on HalfOrder.\n\nClick here to join:\n${inviteLink}`;

    try {
      await transporter.sendMail({
        from: '"HalfOrder" <noreply@halforder.app>',
        to: email,
        subject,
        text: body,
      });
      await snap.ref.update({ status: 'sent' });
    } catch (err) {
      console.error('sendOrderInvite: failed to send email', inviteId, err);
      await snap.ref
        .update({ status: 'failed', error: err?.message || String(err) })
        .catch((e) => console.error(e));
    }
    return null;
  });

/**
 * When a rating is created, update the receiver's user document with
 * ratingAverage and ratingCount (recomputed from all ratings for that user).
 */
exports.onRatingCreated = functions.firestore
  .document('ratings/{ratingId}')
  .onCreate(async (snap, context) => {
    const data = snap.data();
    const toUserId = typeof data?.toUserId === 'string' ? data.toUserId : null;
    if (!toUserId) return null;

    const db = admin.firestore();
    const ratingsSnap = await db
      .collection('ratings')
      .where('toUserId', '==', toUserId)
      .get();
    let sum = 0;
    let count = 0;
    ratingsSnap.docs.forEach((d) => {
      const r = d.data().rating;
      if (typeof r === 'number') {
        sum += r;
        count += 1;
      }
    });
    const ratingAverage = count > 0 ? Math.round((sum / count) * 10) / 10 : 0;
    const userRef = db.doc(`users/${toUserId}`);
    const userSnap = await userRef.get();
    const userData = userSnap.exists ? userSnap.data() : {};
    const totalOrdersCompleted =
      typeof userData?.totalOrdersCompleted === 'number'
        ? userData.totalOrdersCompleted
        : typeof userData?.ordersCount === 'number'
          ? userData.ordersCount
          : 0;
    const cancellationRate =
      typeof userData?.cancellationRate === 'number' ? userData.cancellationRate : 0;
    const reportCount = typeof userData?.reportCount === 'number' ? userData.reportCount : 0;
    const trustScore = computeTrustScore({
      averageRating: ratingAverage,
      totalOrdersCompleted,
      cancellationRate,
      reportCount,
    });

    await userRef.set(
      {
        ratingAverage,
        ratingCount: count,
        averageRating: ratingAverage,
        totalRatings: count,
        totalOrdersCompleted,
        cancellationRate,
        reportCount,
        trustScore,
      },
      { merge: true },
    );
    await refreshUserDerivedFields(db, toUserId);
    return null;
  });

exports.onReportCreated = functions.firestore
  .document('reports/{reportId}')
  .onCreate(async (snap) => {
    const data = snap.data();
    const reportedUserId =
      typeof data?.reportedUserId === 'string' ? data.reportedUserId : null;
    if (!reportedUserId) return null;

    const db = admin.firestore();
    const userRef = db.doc(`users/${reportedUserId}`);
    const userSnap = await userRef.get();
    const userData = userSnap.exists ? userSnap.data() : {};

    const averageRating =
      typeof userData?.averageRating === 'number' ? userData.averageRating : 0;
    const totalOrdersCompleted =
      typeof userData?.totalOrdersCompleted === 'number'
        ? userData.totalOrdersCompleted
        : typeof userData?.ordersCount === 'number'
          ? userData.ordersCount
          : 0;
    const cancellationRate =
      typeof userData?.cancellationRate === 'number' ? userData.cancellationRate : 0;
    const reportCount = (typeof userData?.reportCount === 'number' ? userData.reportCount : 0) + 1;

    const trustScore = computeTrustScore({
      averageRating,
      totalOrdersCompleted,
      cancellationRate,
      reportCount,
    });

    await userRef.set(
      {
        reportCount,
        trustScore,
      },
      { merge: true },
    );
    await refreshUserDerivedFields(db, reportedUserId);
    return null;
  });

exports.onOrderMessageCreated = functions.firestore
  .document('orders/{orderId}/messages/{messageId}')
  .onCreate(async (snap) => {
    const data = snap.data();
    const senderId = typeof data?.senderId === 'string' ? data.senderId : null;
    if (!senderId) return null;

    const db = admin.firestore();
    const userRef = db.doc(`users/${senderId}`);
    await userRef.set(
      {
        messagesSent: admin.firestore.FieldValue.increment(1),
      },
      { merge: true },
    );
    await refreshUserDerivedFields(db, senderId);
    return null;
  });

exports.onUserMetricsUpdated = functions.firestore
  .document('users/{userId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data() || {};
    const after = change.after.data() || {};
    const watched = [
      'averageRating',
      'totalOrdersCompleted',
      'ordersCount',
      'cancellationRate',
      'reportCount',
      'ordersJoined',
      'messagesSent',
    ];
    const changed = watched.some((k) => before[k] !== after[k]);
    if (!changed) return null;
    const db = admin.firestore();
    await refreshUserDerivedFields(db, context.params.userId);
    return null;
  });

exports.onOrderCreated = functions.firestore
  .document('orders/{orderId}')
  .onCreate(async (snap) => {
    const data = snap.data() || {};
    const ownerId = resolveOrderOwnerId(data);
    if (!ownerId) return null;
    const db = admin.firestore();
    await db.doc(`users/${ownerId}`).set(
      {
        activeOrderCount: admin.firestore.FieldValue.increment(1),
      },
      { merge: true },
    );
    await refreshUserDerivedFields(db, ownerId);
    return null;
  });

exports.onOrderDeleted = functions.firestore
  .document('orders/{orderId}')
  .onDelete(async (snap) => {
    const data = snap.data() || {};
    const ownerId = resolveOrderOwnerId(data);
    if (!ownerId) return null;
    const db = admin.firestore();
    const userRef = db.doc(`users/${ownerId}`);
    await db.runTransaction(async (tx) => {
      const userSnap = await tx.get(userRef);
      const current = userSnap.exists
        ? userSnap.data()?.activeOrderCount
        : 0;
      const currentCount = typeof current === 'number' ? current : 0;
      tx.set(
        userRef,
        { activeOrderCount: Math.max(0, currentCount - 1) },
        { merge: true },
      );
    });
    await refreshUserDerivedFields(db, ownerId);
    return null;
  });

exports.onOrderUpdatedSafety = functions.firestore
  .document('orders/{orderId}')
  .onUpdate(async (change) => {
    const before = change.before.data() || {};
    const after = change.after.data() || {};
    const beforeOwnerId = resolveOrderOwnerId(before);
    const afterOwnerId = resolveOrderOwnerId(after);
    const db = admin.firestore();

    // if owner changes (rare), move active order ownership count
    if (beforeOwnerId && afterOwnerId && beforeOwnerId !== afterOwnerId) {
      const beforeRef = db.doc(`users/${beforeOwnerId}`);
      const afterRef = db.doc(`users/${afterOwnerId}`);
      await db.runTransaction(async (tx) => {
        const [beforeSnap, afterSnap] = await Promise.all([
          tx.get(beforeRef),
          tx.get(afterRef),
        ]);
        const beforeCount = typeof beforeSnap.data()?.activeOrderCount === 'number'
          ? beforeSnap.data().activeOrderCount
          : 0;
        const afterCount = typeof afterSnap.data()?.activeOrderCount === 'number'
          ? afterSnap.data().activeOrderCount
          : 0;
        tx.set(beforeRef, { activeOrderCount: Math.max(0, beforeCount - 1) }, { merge: true });
        tx.set(afterRef, { activeOrderCount: Math.max(0, afterCount + 1) }, { merge: true });
      });
      await Promise.all([
        refreshUserDerivedFields(db, beforeOwnerId),
        refreshUserDerivedFields(db, afterOwnerId),
      ]);
      return null;
    }

    const ownerId = afterOwnerId || beforeOwnerId;
    if (!ownerId) return null;

    const beforeStatus = typeof before.status === 'string' ? before.status : '';
    const afterStatus = typeof after.status === 'string' ? after.status : '';
    const userRef = db.doc(`users/${ownerId}`);

    // Count cancellations in rolling 24h window and keep a rate hint.
    if (beforeStatus !== 'cancelled' && afterStatus === 'cancelled') {
      await db.runTransaction(async (tx) => {
        const userSnap = await tx.get(userRef);
        const d = userSnap.exists ? userSnap.data() : {};
        const nowMs = Date.now();
        const windowStartMs =
          typeof d?.cancellationWindowStartMs === 'number'
            ? d.cancellationWindowStartMs
            : nowMs;
        const count24hRaw =
          typeof d?.cancellationCount24h === 'number' ? d.cancellationCount24h : 0;
        const withinWindow = nowMs - windowStartMs <= 24 * 60 * 60 * 1000;
        const cancellationCount24h = withinWindow ? count24hRaw + 1 : 1;
        const nextWindowStart = withinWindow ? windowStartMs : nowMs;
        const cancelledOrdersTotal =
          (typeof d?.cancelledOrders === 'number' ? d.cancelledOrders : 0) + 1;
        const completed =
          typeof d?.totalOrdersCompleted === 'number'
            ? d.totalOrdersCompleted
            : typeof d?.ordersCount === 'number'
              ? d.ordersCount
              : 0;
        const totalAttempts = completed + cancelledOrdersTotal;
        const cancellationRate = totalAttempts > 0
          ? cancelledOrdersTotal / totalAttempts
          : 0;
        tx.set(
          userRef,
          {
            cancellationCount24h,
            cancellationWindowStartMs: nextWindowStart,
            cancelledOrders: cancelledOrdersTotal,
            cancellationRate,
            lastCancelledAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      });
    }

    // If order moves to terminal status, release one active slot.
    const becameTerminal =
      !['completed', 'cancelled', 'closed', 'expired'].includes(beforeStatus) &&
      ['completed', 'cancelled', 'closed', 'expired'].includes(afterStatus);
    if (becameTerminal) {
      await db.runTransaction(async (tx) => {
        const userSnap = await tx.get(userRef);
        const d = userSnap.exists ? userSnap.data() : {};
        const count = typeof d?.activeOrderCount === 'number' ? d.activeOrderCount : 0;
        tx.set(
          userRef,
          { activeOrderCount: Math.max(0, count - 1) },
          { merge: true },
        );
      });
    }
    await refreshUserDerivedFields(db, ownerId);
    return null;
  });

/**
 * When a new chat message is created, notify the other participant via Expo push.
 */
exports.onNewChatMessage = functions.firestore
  .document('messages/{messageId}')
  .onCreate(async (snap, context) => {
    const data = snap.data();
    const chatId = typeof data?.chatId === 'string' ? data.chatId : null;
    const senderId = typeof data?.senderId === 'string' ? data.senderId : null;
    if (!chatId || !senderId) return null;
    const db = admin.firestore();

    const chatSnap = await db.doc(`chats/${chatId}`).get();
    if (!chatSnap.exists()) return null;
    const participants = chatSnap.data()?.participants;
    if (!Array.isArray(participants) || participants.length < 2) return null;
    const receiverId = participants.find((id) => id !== senderId);
    if (!receiverId) return null;

    const userSnap = await db.doc(`users/${receiverId}`).get();
    if (!userSnap.exists()) return null;
    const userData = userSnap.data();
    const token =
      userData?.fcmToken ?? userData?.expoPushToken ?? userData?.pushToken;
    if (typeof token !== 'string' || !token) return null;
    if (userData?.notificationsEnabled === false) return null;

    try {
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: token,
          sound: 'default',
          title: 'New message',
          body: 'You received a message in HalfOrder',
          data: {
            type: 'chat_message',
            chatId,
            messageId: context.params.messageId,
          },
        }),
      });
      if (!response.ok) {
        console.warn('onNewChatMessage push failed', await response.text());
      }
    } catch (err) {
      console.warn('onNewChatMessage push error', err);
    }
    return null;
  });

/**
 * When a user submits a complaint, send an Expo push notification to the admin.
 * Admin push token is stored in Firestore: admins collection, document with email "support@halforder.app".
 */
exports.notifyAdminOnComplaint = functions.firestore
  .document('complaints/{complaintId}')
  .onCreate(async (snap, context) => {
    const db = admin.firestore();
    const adminSnapshot = await db
      .collection('admins')
      .where('email', '==', 'support@halforder.app')
      .limit(1)
      .get();

    if (adminSnapshot.empty) {
      console.warn(
        'notifyAdminOnComplaint: no admin document found for support@halforder.app',
      );
      return null;
    }

    const pushToken = adminSnapshot.docs[0].data()?.pushToken;
    if (typeof pushToken !== 'string' || !pushToken) {
      console.warn(
        'notifyAdminOnComplaint: admin pushToken missing or invalid',
      );
      return null;
    }

    const message = {
      to: pushToken,
      sound: 'default',
      title: 'New HalfOrder Message',
      body: 'A user sent a complaint or inquiry',
      data: { type: 'complaint', complaintId: context.params.complaintId },
    };

    try {
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      });
      if (!response.ok) {
        console.warn(
          'notifyAdminOnComplaint push failed',
          await response.text(),
        );
      }
    } catch (err) {
      console.warn('notifyAdminOnComplaint push error', err);
    }
    return null;
  });

/**
 * Inactive user reminder: run every hour.
 * Find users with lastActive older than 48h, send push reminder.
 * Skip if user already received inactive_reminder in last 48h.
 */
const INACTIVE_HOURS = 48;
const REMINDER_TITLE = 'HalfOrder';
const REMINDER_BODY = 'Hungry? Find someone to split a meal with 🍔';

/**
 * New chat message under HalfOrder / order thread: `chats/{chatId}/messages/*`.
 * Sends via Expo Push API (not FCM directly).
 */
exports.sendMessageNotification = functions.firestore
  .document('chats/{chatId}/messages/{messageId}')
  .onCreate(async (snap, context) => {
    const data = snap.data() || {};
    if (data.notificationSent === true) return null;
    const senderId = typeof data.senderId === 'string' ? data.senderId : null;
    if (!senderId || senderId === 'system') return null;
    if (data.sender === 'ai') return null;

    const db = admin.firestore();
    const chatId = context.params.chatId;
    const chatSnap = await db.doc(`chats/${chatId}`).get();
    if (!chatSnap.exists) return null;
    const c = chatSnap.data() || {};
    const participants = Array.isArray(c.participants)
      ? c.participants.filter((x) => typeof x === 'string')
      : [];
    const users = Array.isArray(c.users) ? c.users.filter((x) => typeof x === 'string') : [];
    const members = participants.length > 0 ? participants : users;
    if (members.length === 0) return null;

    const recipients = members.filter((id) => id !== senderId);
    if (recipients.length === 0) return null;

    const bodyText =
      typeof data.text === 'string' && data.text.trim()
        ? data.text.trim().slice(0, 200)
        : 'New message';

    const senderNameRaw =
      (typeof data.userName === 'string' && data.userName.trim()) ||
      (typeof data.senderName === 'string' && data.senderName.trim()) ||
      '';
    const title = senderNameRaw || 'Someone';

    await notifyUsersExpo(db, recipients, title, bodyText, {
      type: 'chat_message',
      chatId,
      messageId: context.params.messageId,
    });

    return null;
  });

/** Member uids: rich `participants` maps, legacy string `participants`, or HalfOrder `users`. */
function orderMemberIds(data) {
  const p = Array.isArray(data?.participants) ? data.participants : [];
  const ids = [];
  for (const x of p) {
    if (typeof x === 'string' && x) ids.push(x);
    else if (x && typeof x === 'object' && typeof x.userId === 'string') ids.push(x.userId);
  }
  if (ids.length > 0) return ids;
  return Array.isArray(data?.users) ? data.users.filter((x) => typeof x === 'string') : [];
}

/**
 * Someone removed from order participants/users — notify remaining members via Expo.
 */
exports.joinCancelledNotification = functions.firestore
  .document('orders/{orderId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data() || {};
    const after = change.after.data() || {};
    const db = admin.firestore();
    const orderId = context.params.orderId;

    if (before.status !== 'cancelled' && after.status === 'cancelled') {
      if (after.cancelPushSent === true) return null;
      const members = orderMemberIds(after);
      const cancelledBy =
        typeof after.cancelledBy === 'string' && after.cancelledBy
          ? after.cancelledBy
          : null;
      const cancelReason =
        typeof after.cancelReason === 'string' ? after.cancelReason : '';

      let targets = [];
      let title = 'Order cancelled';
      let body = 'The other person cancelled this half order.';

      if (cancelReason === 'wait_timeout') {
        title = 'HalfOrder';
        body = 'No one joined your order.';
        targets = members.filter(Boolean);
      } else if (cancelledBy) {
        targets = members.filter((id) => id && id !== cancelledBy);
      } else {
        targets = members.filter(Boolean);
      }

      if (targets.length > 0) {
        await notifyUsersExpo(db, targets, title, body, {
          type: 'order_cancelled',
          orderId,
        });
      }

      try {
        await change.after.ref.update({ cancelPushSent: true });
      } catch (e) {
        console.warn('[joinCancelledNotification] cancelPushSent', e?.message || e);
      }
      return null;
    }

    const beforeMembers = orderMemberIds(before);
    const afterMembers = orderMemberIds(after);
    const leavers = beforeMembers.filter((id) => !afterMembers.includes(id));
    if (leavers.length === 0) return null;

    const notifyIds = [...new Set(afterMembers)].filter(Boolean);
    if (notifyIds.length === 0) return null;

    await notifyUsersExpo(db, notifyIds, 'Order Update ❌', 'Someone left the order', {
      type: 'order_member_left',
      orderId: context.params.orderId,
    });

    return null;
  });

exports.inactiveUserReminder = functions.pubsub
  .schedule('every 1 hours')
  .timeZone('America/Toronto')
  .onRun(async () => {
    const db = admin.firestore();
    const now = Date.now();
    const cutoffMs = now - INACTIVE_HOURS * 60 * 60 * 1000;
    const cutoffTimestamp = admin.firestore.Timestamp.fromMillis(cutoffMs);

    const usersSnap = await db
      .collection('users')
      .where('lastActive', '<', cutoffTimestamp)
      .get();
    const toNotify = [];

    for (const doc of usersSnap.docs) {
      const uid = doc.id;
      const data = doc.data();
      const token = data?.fcmToken ?? data?.expoPushToken ?? data?.pushToken;
      if (typeof token !== 'string' || !token) continue;
      if (data?.notificationsEnabled === false) continue;

      const logsSnap = await db
        .collection('notification_logs')
        .where('userId', '==', uid)
        .where('type', '==', 'inactive_reminder')
        .where('time', '>=', cutoffTimestamp)
        .limit(1)
        .get();

      if (!logsSnap.empty) continue;

      toNotify.push({ uid, token, email: data?.email ?? '' });
    }

    for (const { uid, token } of toNotify) {
      try {
        const res = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            to: token,
            title: REMINDER_TITLE,
            body: REMINDER_BODY,
            sound: 'default',
          }),
        });
        if (!res.ok) {
          console.warn(
            'inactiveUserReminder push failed for',
            uid,
            await res.text(),
          );
          continue;
        }
        await db.collection('notification_logs').add({
          userId: uid,
          type: 'inactive_reminder',
          time: admin.firestore.FieldValue.serverTimestamp(),
        });
      } catch (err) {
        console.warn('inactiveUserReminder error for', uid, err);
      }
    }

    return null;
  });

/**
 * Firestore `feedback/{id}` onCreate → email support (one send per new doc).
 */
exports.sendFeedbackEmail = functions.firestore
  .document('feedback/{feedbackId}')
  .onCreate(async (snap) => {
    const d = snap.data() || {};
    const userName = typeof d.userName === 'string' ? d.userName : 'Unknown';
    const message = typeof d.message === 'string' ? d.message : '';
    const textBody = `User: ${userName}\nMessage: ${message}`;
    try {
      const transport = getMailTransporter();
      await transport.sendMail({
        from: '"HalfOrder" <noreply@halforder.app>',
        to: SUPPORT_INBOX,
        subject: 'New Feedback',
        text: textBody,
      });
      console.log('[sendFeedbackEmail] success', snap.id);
    } catch (err) {
      console.error('[sendFeedbackEmail] failure', snap.id, err);
    }
    return null;
  });

/**
 * Scheduled daily metrics email — 14:00 America/Toronto.
 */
exports.dailyReport = functions.pubsub
  .schedule('0 14 * * *')
  .timeZone('America/Toronto')
  .onRun(async () => {
    const db = admin.firestore();
    try {
      const [usersSnap, ordersSnap, feedbackSnap] = await Promise.all([
        db.collection('users').get(),
        db.collection('orders').get(),
        db.collection('feedback').get(),
      ]);
      const users = usersSnap.size;
      const orders = ordersSnap.size;
      const feedback = feedbackSnap.size;
      const body = `Users: ${users}\nOrders: ${orders}\nFeedback: ${feedback}`;
      const transport = getMailTransporter();
      await transport.sendMail({
        from: '"HalfOrder Reports" <noreply@halforder.app>',
        to: SUPPORT_INBOX,
        subject: 'HalfOrder Daily Report',
        text: body,
      });
      console.log('[dailyReport] success', { users, orders, feedback });
    } catch (err) {
      console.error('[dailyReport] failure', err);
    }
    return null;
  });
