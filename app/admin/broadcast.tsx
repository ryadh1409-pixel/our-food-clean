import { ADMIN_BROADCAST_TEMPLATES } from '@/constants/adminBroadcastTemplates';
import { adminColors as COLORS } from '@/constants/adminTheme';
import { isAdminUser } from '@/constants/adminUid';
import {
  collectBroadcastRecipientTokens,
  type AdminBroadcastTargetMode,
} from '@/services/adminBroadcastRecipients';
import { useAuth } from '@/services/AuthContext';
import { db } from '@/services/firebase';
import { getUserLocationSafe } from '@/services/location';
import { sendExpoPush } from '@/services/sendExpoPush';
import {
  addDoc,
  collection,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getUserFriendlyError } from '@/utils/errorHandler';
import { logError } from '@/utils/errorLogger';
import { showError, showSuccess } from '@/utils/toast';

export default function AdminSendNotificationScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [targetMode, setTargetMode] = useState<AdminBroadcastTargetMode>('all');
  const [radiusKmText, setRadiusKmText] = useState('');
  const [sending, setSending] = useState(false);

  const isAdmin = isAdminUser(user);

  const applyTemplate = (t: (typeof ADMIN_BROADCAST_TEMPLATES)[number]) => {
    setTitle(t.title);
    setMessage(t.message);
  };

  const handleSend = async () => {
    const adminTitle = title.trim() || 'HalfOrder';
    const adminMessage = message.trim();
    if (!adminMessage) {
      showError('Please enter a notification message.');
      return;
    }
    if (!user || !isAdminUser(user)) return;

    let radiusKm: number | null = null;
    const rParsed = parseFloat(radiusKmText.replace(',', '.'));
    if (radiusKmText.trim() !== '') {
      if (!Number.isFinite(rParsed) || rParsed <= 0) {
        showError(
          'Enter a positive number for kilometers, or leave blank to skip distance filtering.',
        );
        return;
      }
      radiusKm = rParsed;
    }

    setSending(true);
    try {
      let center: { lat: number; lng: number } | null = null;
      if (radiusKm != null) {
        const loc = await getUserLocationSafe();
        if (!loc) {
          showError(
            'Allow location to filter users by distance, or clear the radius field.',
          );
          setSending(false);
          return;
        }
        center = { lat: loc.latitude, lng: loc.longitude };
      }

      const usersSnap = await getDocs(collection(db, 'users'));
      const { tokens, skippedNoToken, skippedFilter } =
        collectBroadcastRecipientTokens(usersSnap.docs, {
          targetMode,
          radiusKm,
          center,
        });

      if (tokens.length === 0) {
        showError(
          'No users with valid Expo push tokens matched your filters. Skipped without token: '
            + skippedNoToken
            + (skippedFilter ? ` · Filtered out: ${skippedFilter}` : ''),
        );
        setSending(false);
        return;
      }

      const result = await sendExpoPush(tokens, adminTitle, adminMessage, {
        type: 'admin_broadcast',
      });

      await addDoc(collection(db, 'admin_notifications'), {
        title: adminTitle,
        message: adminMessage,
        sentToCount: tokens.length,
        deliveredOk: result.sent,
        failedCount: result.failed,
        targetMode,
        radiusKm: radiusKm ?? null,
        skippedNoToken,
        skippedFilter,
        createdAt: serverTimestamp(),
        sentByUid: user.uid,
        sentByEmail: user.email ?? null,
      });

      const okLine = `Notification sent to ${result.sent} users ✅`;
      const detailParts = [
        result.failed > 0
          ? `${result.failed} delivery ticket(s) reported an error (see device logs).`
          : null,
        `Unique tokens targeted: ${tokens.length}.`,
      ].filter(Boolean);

      showSuccess([okLine, ...detailParts].join('\n\n'));
      setMessage('');
    } catch (e) {
      logError(e);
      showError(getUserFriendlyError(e));
    } finally {
      setSending(false);
    }
  };

  if (!user || !isAdmin) {
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
        <Text style={styles.headerTitle}>Send notification</Text>
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.hint}>
          Sends via Expo push. Batches of 100 per request; tokens are deduped.
        </Text>

        <Text style={styles.label}>Quick templates</Text>
        <View style={styles.templateRow}>
          {ADMIN_BROADCAST_TEMPLATES.map((tpl) => (
            <TouchableOpacity
              key={tpl.label}
              style={styles.templateChip}
              onPress={() => applyTemplate(tpl)}
              disabled={sending}
            >
              <Text style={styles.templateChipText}>{tpl.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Title</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Notification title"
          placeholderTextColor={COLORS.textMuted}
          style={styles.input}
          editable={!sending}
        />

        <Text style={styles.label}>Message</Text>
        <TextInput
          value={message}
          onChangeText={setMessage}
          placeholder="What should users hear?"
          placeholderTextColor={COLORS.textMuted}
          style={[styles.input, styles.messageInput]}
          multiline
          editable={!sending}
        />

        <Text style={styles.label}>Audience</Text>
        <View style={styles.segmentRow}>
          <TouchableOpacity
            style={[
              styles.segmentBtn,
              targetMode === 'all' && styles.segmentBtnActive,
            ]}
            onPress={() => setTargetMode('all')}
            disabled={sending}
          >
            <Text
              style={[
                styles.segmentBtnText,
                targetMode === 'all' && styles.segmentBtnTextActive,
              ]}
            >
              All users
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.segmentBtn,
              targetMode === 'active_users' && styles.segmentBtnActive,
            ]}
            onPress={() => setTargetMode('active_users')}
            disabled={sending}
          >
            <Text
              style={[
                styles.segmentBtnText,
                targetMode === 'active_users' && styles.segmentBtnTextActive,
              ]}
            >
              Active (24h)
            </Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.microHint}>
          Active = opened the app in the last 24 hours (`lastActive`).
        </Text>

        <Text style={styles.label}>Optional: within km of you</Text>
        <TextInput
          value={radiusKmText}
          onChangeText={setRadiusKmText}
          placeholder="e.g. 25 (leave empty for worldwide)"
          placeholderTextColor={COLORS.textMuted}
          style={styles.input}
          keyboardType="decimal-pad"
          editable={!sending}
        />
        <Text style={styles.microHint}>
          Uses this device&apos;s location. Users need `latitude` / `longitude`
          (or `location`) saved on their profile.
        </Text>

        <TouchableOpacity
          style={[styles.button, sending && styles.buttonDisabled]}
          onPress={handleSend}
          disabled={sending || !message.trim()}
        >
          <Text style={styles.buttonText}>{sending ? 'Sending…' : 'Send'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },
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
  hint: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginBottom: 16,
    lineHeight: 18,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
    marginTop: 14,
  },
  microHint: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 6,
    lineHeight: 17,
  },
  templateRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  templateChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  templateChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
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
  segmentRow: {
    flexDirection: 'row',
    gap: 10,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    alignItems: 'center',
  },
  segmentBtnActive: {
    borderColor: COLORS.primary,
    backgroundColor: 'rgba(52, 211, 153, 0.12)',
  },
  segmentBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  segmentBtnTextActive: {
    color: COLORS.primary,
  },
  button: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 28,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '700',
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
