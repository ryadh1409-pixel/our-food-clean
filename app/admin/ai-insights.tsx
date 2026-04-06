import { adminRoutes } from '@/constants/adminRoutes';
import { adminCardShell, adminColors as COLORS } from '@/constants/adminTheme';
import { isAdminUser } from '@/constants/adminUid';
import {
  ACTIVE_2H_MS,
  collectBroadcastRecipientTokens,
} from '@/services/adminBroadcastRecipients';
import {
  fetchAdminAiNotificationInsights,
  type AdminAiNotificationInsights,
} from '@/services/adminAiNotificationInsights';
import { useAuth } from '@/services/AuthContext';
import { db } from '@/services/firebase';
import { sendExpoPush } from '@/services/sendExpoPush';
import {
  addDoc,
  collection,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getUserFriendlyError } from '@/utils/errorHandler';
import { logError } from '@/utils/errorLogger';
import { showError, showSuccess } from '@/utils/toast';

function MetricCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: string;
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricIcon}>{icon}</Text>
      <View style={styles.metricBody}>
        <Text style={styles.metricLabel}>{label}</Text>
        <Text style={styles.metricValue}>{value}</Text>
        {hint ? <Text style={styles.metricHint}>{hint}</Text> : null}
      </View>
    </View>
  );
}

export default function AdminAiInsightsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [insights, setInsights] = useState<AdminAiNotificationInsights | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = isAdminUser(user);

  const load = useCallback(async () => {
    setError(null);
    try {
      const next = await fetchAdminAiNotificationInsights();
      setInsights(next);
    } catch (e) {
      setInsights(null);
      setError(e instanceof Error ? e.message : 'Failed to load insights');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) void load();
    else setLoading(false);
  }, [isAdmin, load]);

  const onRefresh = () => {
    setRefreshing(true);
    void load();
  };

  const handleSendSmart = async () => {
    if (!insights || !user || !isAdminUser(user)) return;
    setSending(true);
    try {
      const usersSnap = await getDocs(collection(db, 'users'));
      const { tokens, skippedNoToken, skippedFilter } =
        collectBroadcastRecipientTokens(usersSnap.docs, {
          targetMode: 'active_users',
          activeWindowMs: ACTIVE_2H_MS,
        });

      if (tokens.length === 0) {
        showError('No active (2h) users with Expo push tokens.');
        setSending(false);
        return;
      }

      const result = await sendExpoPush(
        tokens,
        insights.smartTitle,
        insights.smartMessage,
        { type: 'admin_ai_smart', openOrdersCount: insights.openOrdersCount },
      );

      await addDoc(collection(db, 'admin_notifications'), {
        title: insights.smartTitle,
        message: insights.smartMessage,
        sentToCount: tokens.length,
        deliveredOk: result.sent,
        failedCount: result.failed,
        targetMode: 'active_users_2h',
        source: 'ai_insights',
        skippedNoToken,
        skippedFilter,
        openOrdersAtSend: insights.openOrdersCount,
        activeUsersAtSend: insights.activeUsersCount,
        createdAt: serverTimestamp(),
        sentByUid: user.uid,
        sentByEmail: user.email ?? null,
      });

      showSuccess(
        `Notification sent to ${result.sent} users ✅\n\nActive window: last 2 hours.`,
      );
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
          <Text style={styles.unauthorized}>Admin only</Text>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.link}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (loading && !insights) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.back}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>AI Insights</Text>
        </View>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.muted}>Analyzing activity…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>AI Insights</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <Text style={styles.subtitle}>
          Smart control center for push timing &amp; copy
        </Text>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {insights ? (
          <>
            {insights.shouldSuggestSend ? (
              <View style={styles.suggestBanner}>
                <Text style={styles.suggestBannerTitle}>Suggested moment</Text>
                <Text style={styles.suggestBannerBody}>
                  High activity and open waiting orders — a nudge may convert
                  well.
                </Text>
              </View>
            ) : null}

            <View style={styles.grid}>
              <MetricCard
                icon="👥"
                label="Active users"
                value={insights.activeUsersCount}
                hint="Last 2 hours"
              />
              <MetricCard
                icon="📍"
                label="Nearby clusters"
                value={insights.nearbyClusterUsersCount}
                hint={`Within ${insights.clusterRadiusKm} km of another active user`}
              />
              <MetricCard
                icon="🍕"
                label="Open orders"
                value={insights.openOrdersCount}
                hint="Half-orders: waiting for a partner"
              />
              <MetricCard
                icon="🔔"
                label="Users w/ push token"
                value={insights.usersWithPushTokenCount}
                hint="All profiles"
              />
              <MetricCard
                icon="⏰"
                label="Best time"
                value={insights.isPeakHourNow ? 'Now' : insights.peakHourLabel}
                hint={
                  insights.isPeakHourNow
                    ? `Peak hour ${insights.peakHourLabel} (local)`
                    : `Peak (local): ${insights.peakHourLabel}`
                }
              />
            </View>

            <View style={styles.suggestionCard}>
              <Text style={styles.suggestionLabel}>Smart suggestion</Text>
              <Text style={styles.suggestionTitle}>{insights.smartTitle}</Text>
              <Text style={styles.suggestionBody}>{insights.smartMessage}</Text>
              <Text style={styles.suggestionMeta}>
                Reach ≈ {insights.activeWithTokenCount} active users with a
                valid token (2h).
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.cta, sending && styles.ctaDisabled]}
              onPress={handleSendSmart}
              disabled={sending}
            >
              <Text style={styles.ctaText}>
                {sending ? 'Sending…' : 'Send smart notification'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => router.push(adminRoutes.sendNotification as never)}
            >
              <Text style={styles.secondaryBtnText}>
                Custom broadcast →
              </Text>
            </TouchableOpacity>

            <View style={styles.footerNote}>
              <Text style={styles.footerNoteText}>
                History is saved to Firestore as{' '}
                <Text style={styles.mono}>admin_notifications</Text> (opens /
                CTR can be layered on later).
              </Text>
            </View>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  back: { fontSize: 16, color: COLORS.primary, fontWeight: '600' },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
    marginLeft: 14,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textMuted,
    marginBottom: 16,
    lineHeight: 20,
  },
  scroll: { padding: 20, paddingBottom: 48 },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  muted: { marginTop: 10, color: COLORS.textMuted, fontSize: 14 },
  unauthorized: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.error,
    marginBottom: 12,
  },
  link: { fontSize: 16, color: COLORS.primary, fontWeight: '600' },
  errorBox: {
    backgroundColor: COLORS.dangerBg,
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  errorText: { color: COLORS.error, fontSize: 14 },
  suggestBanner: {
    backgroundColor: 'rgba(52, 211, 153, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.4)',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  suggestBannerTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.successText,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  suggestBannerBody: { fontSize: 14, color: COLORS.text, lineHeight: 20 },
  grid: { gap: 12 },
  metricCard: {
    ...adminCardShell,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  metricIcon: { fontSize: 22, lineHeight: 26 },
  metricBody: { flex: 1 },
  metricLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  metricValue: {
    fontSize: 26,
    fontWeight: '800',
    color: COLORS.text,
    marginTop: 4,
  },
  metricHint: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 6,
    lineHeight: 16,
  },
  suggestionCard: {
    ...adminCardShell,
    marginTop: 20,
    borderColor: COLORS.accentBlue,
  },
  suggestionLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.accentBlue,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  suggestionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 8,
  },
  suggestionBody: {
    fontSize: 15,
    color: COLORS.text,
    lineHeight: 22,
    fontWeight: '600',
  },
  suggestionMeta: {
    marginTop: 12,
    fontSize: 13,
    color: COLORS.textMuted,
    lineHeight: 18,
  },
  cta: {
    marginTop: 22,
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  ctaDisabled: { opacity: 0.65 },
  ctaText: { fontSize: 16, fontWeight: '800', color: COLORS.onPrimary },
  secondaryBtn: { marginTop: 12, paddingVertical: 14, alignItems: 'center' },
  secondaryBtnText: { fontSize: 15, fontWeight: '700', color: COLORS.primary },
  footerNote: { marginTop: 24 },
  footerNoteText: { fontSize: 12, color: COLORS.textMuted, lineHeight: 18 },
  mono: { fontFamily: 'monospace', color: COLORS.textMuted },
});
