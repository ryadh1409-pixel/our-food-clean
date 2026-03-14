const functions = require('firebase-functions');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');

admin.initializeApp();

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER || process.env.GMAIL_USER,
    pass: process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD,
  },
});

const ADMIN_FCM_TOKEN = process.env.ADMIN_FCM_TOKEN || '';

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

    await db.doc(`users/${toUserId}`).set(
      {
        ratingAverage,
        ratingCount: count,
        averageRating: ratingAverage,
        totalRatings: count,
      },
      { merge: true },
    );
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

    const chatSnap = await db.doc(`chats/${chatId}`).get();
    if (!chatSnap.exists()) return null;
    const participants = chatSnap.data()?.participants;
    if (!Array.isArray(participants) || participants.length < 2) return null;
    const receiverId = participants.find((id) => id !== senderId);
    if (!receiverId) return null;

    const userSnap = await db.doc(`users/${receiverId}`).get();
    if (!userSnap.exists()) return null;
    const userData = userSnap.data();
    const token = userData?.expoPushToken ?? userData?.pushToken;
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
      const token = data?.expoPushToken ?? data?.pushToken;
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
