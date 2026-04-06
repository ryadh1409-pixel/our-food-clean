import { useAuth } from '@/services/AuthContext';
import { db } from '@/services/firebase';
import { sendExpoPush } from '@/services/sendExpoPush';
import { useRouter } from 'expo-router';
import {
  addDoc,
  collection,
  getDocs,
  query,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { isAdminUser } from '@/constants/adminUid';
import { adminCardShell, adminColors as COLORS } from '@/constants/adminTheme';
import { showError } from '@/utils/toast';

function getToken(data: {
  expoPushToken?: unknown;
  pushToken?: unknown;
}): string | null {
  const t = data?.expoPushToken ?? data?.pushToken;
  return typeof t === 'string' && t.length > 0 ? t : null;
}

export default function AdminNotificationsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [sendingAll, setSendingAll] = useState(false);
  const [sendingOne, setSendingOne] = useState(false);
  const [sendingActive, setSendingActive] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = isAdminUser(user);

  useEffect(() => {
    if (user && !isAdminUser(user)) {
      router.replace('/(tabs)');
    }
  }, [user, router]);

  const showFeedback = (msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(null), 4000);
  };

  const sendToAll = async () => {
    const t = (title || 'HalfOrder').trim();
    const b = (message || '').trim();
    if (!b) {
      showError('Enter a message.');
      return;
    }
    setSendingAll(true);
    setError(null);
    try {
      const snap = await getDocs(collection(db, 'users'));
      const tokens: string[] = [];
      const sentTo: string[] = [];
      snap.docs.forEach((d) => {
        const token = getToken(d.data());
        if (token) {
          tokens.push(token);
          sentTo.push(d.id);
        }
      });
      if (tokens.length === 0) {
        showFeedback('No push tokens found.');
        return;
      }
      const notifRef = await addDoc(collection(db, 'notifications'), {
        title: t,
        body: b,
        createdAt: serverTimestamp(),
        sentTo,
      });
      const result = await sendExpoPush(tokens, t, b, {
        notificationId: notifRef.id,
      });
      showFeedback(
        `Sent: ${result.sent}, Failed: ${result.failed}${result.error ? ` (${result.error})` : ''}`,
      );
      if (result.error) setError(result.error);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to send';
      setError(msg);
      showFeedback(msg);
    } finally {
      setSendingAll(false);
    }
  };

  const sendToOne = async () => {
    const email = userEmail.trim().toLowerCase();
    if (!email) {
      showError('Enter user email.');
      return;
    }
    const t = (title || 'HalfOrder').trim();
    const b = (message || '').trim();
    if (!b) {
      showError('Enter a message.');
      return;
    }
    setSendingOne(true);
    setError(null);
    try {
      const q = query(collection(db, 'users'), where('email', '==', email));
      const snap = await getDocs(q);
      if (snap.empty) {
        showFeedback('User not found.');
        return;
      }
      const userDoc = snap.docs[0];
      const token = getToken(userDoc.data());
      if (!token) {
        showFeedback('User has no push token.');
        return;
      }
      const notifRef = await addDoc(collection(db, 'notifications'), {
        title: t,
        body: b,
        createdAt: serverTimestamp(),
        sentTo: [userDoc.id],
      });
      const result = await sendExpoPush([token], t, b, {
        notificationId: notifRef.id,
      });
      showFeedback(
        result.sent > 0
          ? 'Notification sent.'
          : `Failed: ${result.error ?? 'unknown'}`,
      );
      if (result.error) setError(result.error);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to send';
      setError(msg);
      showFeedback(msg);
    } finally {
      setSendingOne(false);
    }
  };

  const sendToActive = async () => {
    const t = (title || 'HalfOrder').trim();
    const b = (message || '').trim();
    if (!b) {
      showError('Enter a message.');
      return;
    }
    setSendingActive(true);
    setError(null);
    try {
      const snap = await getDocs(collection(db, 'users'));
      const sevenDaysAgoMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const tokens: string[] = [];
      const sentTo: string[] = [];
      snap.docs.forEach((d) => {
        const data = d.data();
        const token = getToken(data);
        if (!token) return;
        const lastActive = data?.lastActive;
        const ms =
          typeof (lastActive as { toMillis?: () => number })?.toMillis ===
          'function'
            ? (lastActive as { toMillis: () => number }).toMillis()
            : typeof (lastActive as { seconds?: number })?.seconds === 'number'
              ? (lastActive as { seconds: number }).seconds * 1000
              : 0;
        if (ms >= sevenDaysAgoMs) {
          tokens.push(token);
          sentTo.push(d.id);
        }
      });
      if (tokens.length === 0) {
        showFeedback('No active users with push tokens (last 7 days).');
        return;
      }
      const notifRef = await addDoc(collection(db, 'notifications'), {
        title: t,
        body: b,
        createdAt: serverTimestamp(),
        sentTo,
      });
      const result = await sendExpoPush(tokens, t, b, {
        notificationId: notifRef.id,
      });
      showFeedback(
        `Sent to ${result.sent} active users, Failed: ${result.failed}${result.error ? ` (${result.error})` : ''}`,
      );
      if (result.error) setError(result.error);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to send';
      setError(msg);
      showFeedback(msg);
    } finally {
      setSendingActive(false);
    }
  };

  if (!user) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centered}>
          <Text style={styles.accessDenied}>Sign in to continue.</Text>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.link}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centered}>
          <Text style={styles.accessDenied}>Access denied</Text>
          <Text style={styles.hint}>
            Only the configured admin account can access this page.
          </Text>
          <TouchableOpacity onPress={() => router.replace('/(tabs)')}>
            <Text style={styles.link}>Go to Home</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.link}>← Dashboard</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Send Notifications</Text>

        {feedback ? (
          <View style={styles.feedbackBox}>
            <Text style={styles.feedbackText}>{feedback}</Text>
          </View>
        ) : null}
        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>1. Send to ALL users</Text>
          <Text style={styles.label}>Title</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. HalfOrder"
            placeholderTextColor={COLORS.textMuted}
          />
          <Text style={styles.label}>Message</Text>
          <TextInput
            style={[styles.input, styles.inputMultiline]}
            value={message}
            onChangeText={setMessage}
            placeholder="Notification message"
            placeholderTextColor={COLORS.textMuted}
            multiline
          />
          <TouchableOpacity
            style={[styles.primaryButton, sendingAll && styles.buttonDisabled]}
            onPress={sendToAll}
            disabled={sendingAll}
          >
            {sendingAll ? (
              <ActivityIndicator size="small" color={COLORS.text} />
            ) : (
              <Text style={styles.primaryButtonText}>Send to All Users</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>2. Send to ONE user</Text>
          <Text style={styles.label}>User email</Text>
          <TextInput
            style={styles.input}
            value={userEmail}
            onChangeText={setUserEmail}
            placeholder="user@example.com"
            placeholderTextColor={COLORS.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <Text style={styles.hintText}>
            Uses the same Title and Message above.
          </Text>
          <TouchableOpacity
            style={[styles.primaryButton, sendingOne && styles.buttonDisabled]}
            onPress={sendToOne}
            disabled={sendingOne}
          >
            {sendingOne ? (
              <ActivityIndicator size="small" color={COLORS.text} />
            ) : (
              <Text style={styles.primaryButtonText}>Send to This User</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>3. Send to ACTIVE users</Text>
          <Text style={styles.hintText}>
            Users active in the last 7 days (lastActive).
          </Text>
          <TouchableOpacity
            style={[
              styles.primaryButton,
              sendingActive && styles.buttonDisabled,
            ]}
            onPress={sendToActive}
            disabled={sendingActive}
          >
            {sendingActive ? (
              <ActivityIndicator size="small" color={COLORS.text} />
            ) : (
              <Text style={styles.primaryButtonText}>Send to Active Users</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  scrollContent: { padding: 20, paddingBottom: 40 },
  backBtn: { marginBottom: 12 },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 20,
    textAlign: 'center',
  },
  accessDenied: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.error,
    marginBottom: 8,
    textAlign: 'center',
  },
  hint: {
    fontSize: 14,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginBottom: 16,
  },
  hintText: { fontSize: 13, color: COLORS.textMuted, marginBottom: 12 },
  link: { fontSize: 16, color: COLORS.primary, fontWeight: '600' },
  feedbackBox: {
    backgroundColor: COLORS.successBg,
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  feedbackText: { fontSize: 14, color: COLORS.successText },
  errorBox: {
    backgroundColor: COLORS.dangerBg,
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: { color: COLORS.error, fontSize: 14 },
  card: {
    ...adminCardShell,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 12,
  },
  label: { fontSize: 13, color: COLORS.textMuted, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: COLORS.text,
    marginBottom: 12,
  },
  inputMultiline: { minHeight: 80, textAlignVertical: 'top' },
  primaryButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonDisabled: { opacity: 0.7 },
  primaryButtonText: { fontSize: 16, fontWeight: '600', color: COLORS.text },
});
