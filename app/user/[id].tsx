import { useLocalSearchParams, useRouter } from 'expo-router';
import { doc, onSnapshot, type DocumentData } from 'firebase/firestore';
import React, { useMemo, useState } from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { systemActionSheet, systemConfirm } from '@/components/SystemDialogHost';
import { theme } from '@/constants/theme';
import { getUserFriendlyError } from '@/utils/errorHandler';
import { showError, showSuccess } from '@/utils/toast';
import { useTrustScore } from '@/hooks/useTrustScore';
import { blockUser } from '@/services/blocks';
import { auth, db } from '@/services/firebase';
import {
  reportContentIdUser,
  submitReport,
  type ReportReason,
} from '@/services/reports';

const c = theme.colors;
const BADGE_BG = '#1B2230';
const BADGE_TEXT = '#B8C7FF';
const BADGE_TRUSTED = '🔥 Trusted';
const BADGE_FAST_JOINER = '⚡ Fast Joiner';
const BADGE_COMMUNICATIVE = '💬 Communicative';
const BADGE_FOOD_LOVER = '🍕 Food Lover';

type UserProfileState = {
  name: string;
  imageUrl: string | null;
  totalOrdersCompleted: number;
  cancellationRate: number;
  badges: string[];
};

const REPORT_REASON_OPTIONS: { label: string; value: ReportReason }[] = [
  { label: 'Spam', value: 'spam' },
  { label: 'Abuse', value: 'abuse' },
  { label: 'Inappropriate content', value: 'inappropriate' },
];

function toPercent(rate: number): number {
  if (!Number.isFinite(rate) || rate <= 0) return 0;
  return rate > 1 ? rate : rate * 100;
}

export default function UserProfileScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const userId = String(params.id ?? '');
  const currentUserId = auth.currentUser?.uid ?? null;
  const trust = useTrustScore(userId || null);

  const [profile, setProfile] = useState<UserProfileState | null>(null);
  const [loading, setLoading] = useState(true);
  const [blocking, setBlocking] = useState(false);
  const [reporting, setReporting] = useState(false);

  React.useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    const ref = doc(db, 'users', userId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setProfile(null);
          setLoading(false);
          return;
        }
        const d = snap.data() as DocumentData;
        const displayName =
          (typeof d?.displayName === 'string' && d.displayName.trim()) ||
          (typeof d?.name === 'string' && d.name.trim()) ||
          'User';
        const imageUrl =
          (typeof d?.photoURL === 'string' && d.photoURL.trim()) ||
          (typeof d?.profileImageUrl === 'string' && d.profileImageUrl.trim()) ||
          (typeof d?.avatarUrl === 'string' && d.avatarUrl.trim()) ||
          null;
        const totalOrdersCompleted =
          typeof d?.totalOrdersCompleted === 'number'
            ? d.totalOrdersCompleted
            : typeof d?.ordersCount === 'number'
              ? d.ordersCount
              : 0;
        const cancellationRate =
          typeof d?.cancellationRate === 'number' ? d.cancellationRate : 0;
        const dbBadges = Array.isArray(d?.badges)
          ? d.badges.filter((b: unknown) => typeof b === 'string')
          : [];
        setProfile({
          name: displayName,
          imageUrl,
          totalOrdersCompleted,
          cancellationRate,
          badges: dbBadges,
        });
        setLoading(false);
      },
      () => {
        setProfile(null);
        setLoading(false);
      },
    );
    return () => unsub();
  }, [userId]);

  const badges = useMemo(() => {
    const computed: string[] = [];
    if (trust?.label === 'Trusted User 🔥') computed.push(BADGE_TRUSTED);
    if ((profile?.totalOrdersCompleted ?? 0) >= 5 && toPercent(profile?.cancellationRate ?? 0) <= 10) {
      computed.push(BADGE_FAST_JOINER);
    }
    if ((trust?.average ?? 0) >= 4.5 && (trust?.count ?? 0) >= 3) {
      computed.push(BADGE_COMMUNICATIVE);
    }
    if ((profile?.totalOrdersCompleted ?? 0) >= 20) {
      computed.push(BADGE_FOOD_LOVER);
    }
    const dbBadges = profile?.badges ?? [];
    for (const b of dbBadges) {
      if (!computed.includes(b)) computed.push(b);
    }
    return computed;
  }, [profile?.badges, profile?.cancellationRate, profile?.totalOrdersCompleted, trust?.average, trust?.count, trust?.label]);

  const handleBlockUser = () => {
    if (!currentUserId || !userId || currentUserId === userId || blocking) return;
    void (async () => {
      const ok = await systemConfirm({
        title: 'Block user',
        message: 'Are you sure you want to block this user?',
        confirmLabel: 'Block',
        destructive: true,
      });
      if (!ok) return;
      setBlocking(true);
      try {
        await blockUser(currentUserId, userId);
        showSuccess('User blocked successfully.');
        router.back();
      } catch (e) {
        showError(getUserFriendlyError(e));
      } finally {
        setBlocking(false);
      }
    })();
  };

  const submitReportWithReason = async (reason: ReportReason) => {
    if (!currentUserId || !userId || currentUserId === userId || reporting) return;
    setReporting(true);
    try {
      await submitReport({
        reporterId: currentUserId,
        reportedUserId: userId,
        contentId: reportContentIdUser(userId),
        reason,
      });
      showSuccess('Thanks for helping keep HalfOrder safe.');
    } catch (e) {
      showError(getUserFriendlyError(e));
    } finally {
      setReporting(false);
    }
  };

  const handleReportUser = () => {
    if (!currentUserId || !userId || currentUserId === userId || reporting) return;
    void systemActionSheet({
      title: 'Report user',
      message: 'Choose a reason',
      actions: REPORT_REASON_OPTIONS.map((option) => ({
        label: option.label,
        onPress: () => void submitReportWithReason(option.value),
      })),
    });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.mutedText}>Loading profile...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.mutedText}>User not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          {profile.imageUrl ? (
            <Image source={{ uri: profile.imageUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={styles.avatarFallbackText}>
                {profile.name.slice(0, 1).toUpperCase()}
              </Text>
            </View>
          )}
          <Text style={styles.name}>{profile.name}</Text>
          <Text style={styles.trustText}>
            Trust Score: {(trust?.trustScore ?? 0).toFixed(2)}
          </Text>
          <Text style={styles.ratingText}>
            Rating: ⭐ {(trust?.average ?? 0).toFixed(1)}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.metricText}>
            Completed Orders: {profile.totalOrdersCompleted}
          </Text>
          <Text style={styles.metricText}>
            Cancellation: {toPercent(profile.cancellationRate).toFixed(1)}%
          </Text>
          <Text style={styles.metricText}>
            Reliability: {trust?.label ?? 'New User'}
          </Text>
        </View>

        <View style={styles.badgesWrap}>
          {badges.length > 0 ? (
            badges.map((badge) => (
              <View key={badge} style={styles.badge}>
                <Text style={styles.badgeText}>{badge}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.mutedText}>No badges yet</Text>
          )}
        </View>

        {currentUserId && currentUserId !== userId ? (
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.blockBtn]}
              onPress={handleBlockUser}
              disabled={blocking}
            >
              <Text style={styles.actionBtnText}>
                {blocking ? 'Blocking...' : 'Block user'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.reportBtn]}
              onPress={handleReportUser}
              disabled={reporting}
            >
              <Text style={styles.actionBtnText}>
                {reporting ? 'Reporting...' : 'Report user'}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  content: { padding: 16, gap: 14 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  mutedText: { color: c.textMuted, fontSize: 15 },
  header: {
    alignItems: 'center',
    padding: 18,
    borderRadius: 16,
    backgroundColor: c.surface,
  },
  avatar: { width: 88, height: 88, borderRadius: 44, marginBottom: 10 },
  avatarFallback: {
    backgroundColor: c.chromeWash,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: { color: c.text, fontSize: 28, fontWeight: '700' },
  name: { fontSize: 22, fontWeight: '700', color: c.text, marginBottom: 6 },
  trustText: { color: c.text, fontSize: 15, fontWeight: '600' },
  ratingText: { color: c.textMuted, marginTop: 4, fontSize: 14 },
  card: {
    backgroundColor: c.surface,
    borderRadius: 14,
    padding: 14,
    gap: 8,
  },
  metricText: { color: c.text, fontSize: 15, fontWeight: '600' },
  badgesWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  badge: {
    backgroundColor: BADGE_BG,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  badgeText: { color: BADGE_TEXT, fontWeight: '700', fontSize: 13 },
  actions: { gap: 10, marginTop: 8 },
  actionBtn: {
    minHeight: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  blockBtn: { backgroundColor: c.danger },
  reportBtn: { backgroundColor: c.warning },
  actionBtnText: { color: c.textOnPrimary, fontSize: 16, fontWeight: '700' },
});
