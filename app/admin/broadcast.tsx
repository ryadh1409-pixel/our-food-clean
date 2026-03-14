import { useAuth } from '@/services/AuthContext';
import { db } from '@/services/firebase';
import {
  addDoc,
  collection,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { sendExpoPush } from '@/services/sendExpoPush';

const ADMIN_EMAIL = 'support@halforder.app';

const COLORS = {
  background: '#F5F5F5',
  card: '#FFFFFF',
  text: '#000000',
  textMuted: '#666666',
  primary: '#FFD700',
  border: '#E5E5E5',
  error: '#B91C1C',
} as const;

function getPushToken(data: {
  expoPushToken?: unknown;
  pushToken?: unknown;
}): string | null {
  const t = data?.expoPushToken ?? data?.pushToken;
  return typeof t === 'string' && t.length > 0 ? t : null;
}

export default function AdminBroadcastScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const isAdmin = user?.email === ADMIN_EMAIL;

  const handleSendBroadcast = async () => {
    const t = title.trim() || 'HalfOrder';
    const b = message.trim();
    if (!b) {
      Alert.alert('Error', 'Please enter a message.');
      return;
    }
    if (!user || user.email !== ADMIN_EMAIL) return;

    setSending(true);
    try {
      const usersSnap = await getDocs(collection(db, 'users'));
      const tokens: string[] = [];
      usersSnap.docs.forEach((doc) => {
        const token = getPushToken(doc.data());
        if (token) tokens.push(token);
      });

      if (tokens.length === 0) {
        Alert.alert('No recipients', 'No user push tokens found.');
        setSending(false);
        return;
      }

      const result = await sendExpoPush(tokens, t, b, { type: 'broadcast' });

      await addDoc(collection(db, 'broadcasts'), {
        title: t,
        message: b,
        sentBy: ADMIN_EMAIL,
        sentAt: serverTimestamp(),
        totalUsers: tokens.length,
      });

      Alert.alert(
        'Success',
        `Broadcast sent successfully.\nSent: ${result.sent}${result.failed > 0 ? `, Failed: ${result.failed}` : ''}`,
      );
      setMessage('');
    } catch (e) {
      Alert.alert(
        'Error',
        e instanceof Error ? e.message : 'Failed to send broadcast.',
      );
    } finally {
      setSending(false);
    }
  };

  if (!user) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centered}>
          <Text style={styles.unauthorized}>You are not authorized</Text>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backBtn}
          >
            <Text style={styles.backBtnText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centered}>
          <Text style={styles.unauthorized}>You are not authorized</Text>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backBtn}
          >
            <Text style={styles.backBtnText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Admin Broadcast</Text>
      </View>
      <View style={styles.content}>
        <Text style={styles.label}>Notification title</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="e.g. HalfOrder"
          placeholderTextColor={COLORS.textMuted}
          style={styles.input}
          editable={!sending}
        />
        <Text style={styles.label}>Notification message</Text>
        <TextInput
          value={message}
          onChangeText={setMessage}
          placeholder="Enter your message..."
          placeholderTextColor={COLORS.textMuted}
          style={[styles.input, styles.messageInput]}
          multiline
          numberOfLines={4}
          editable={!sending}
        />
        <TouchableOpacity
          style={[styles.button, sending && styles.buttonDisabled]}
          onPress={handleSendBroadcast}
          disabled={sending || !message.trim()}
        >
          <Text style={styles.buttonText}>
            {sending ? 'Sending...' : 'Send Broadcast'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  backText: {
    fontSize: 16,
    color: COLORS.primary,
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    marginLeft: 16,
  },
  content: {
    padding: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: COLORS.text,
    backgroundColor: COLORS.card,
  },
  messageInput: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  button: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 24,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  unauthorized: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.error,
    textAlign: 'center',
    marginBottom: 16,
  },
  backBtn: {
    marginTop: 8,
  },
  backBtnText: {
    fontSize: 16,
    color: COLORS.primary,
    fontWeight: '600',
  },
});
