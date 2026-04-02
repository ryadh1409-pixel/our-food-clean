import { AdminHeader } from '@/components/admin/AdminHeader';
import { adminRoutes } from '@/constants/adminRoutes';
import { adminCardShell, adminColors as COLORS } from '@/constants/adminTheme';
import { theme } from '@/constants/theme';
import { adminError, adminLog } from '@/lib/admin/adminDebug';
import { formatMillisToronto } from '@/lib/admin/orderHelpers';
import { db } from '@/services/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
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

type AnalyticsState = {
  users: number;
  orders: number;
  foodWaiting: number;
  foodMatched: number;
  reports: number;
} | null;

export default function AdminAnalyticsScreen() {
  const router = useRouter();
  const [data, setData] = useState<AnalyticsState>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      adminLog('analytics', 'fetch aggregates');
      const [
        usersSnap,
        ordersSnap,
        waitingSnap,
        matchedSnap,
        reportsSnap,
      ] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'orders')),
        getDocs(
          query(collection(db, 'food_cards'), where('status', '==', 'waiting')),
        ),
        getDocs(
          query(collection(db, 'food_cards'), where('status', '==', 'matched')),
        ),
        getDocs(collection(db, 'reports')),
      ]);
      const payload = {
        users: usersSnap.size,
        orders: ordersSnap.size,
        foodWaiting: waitingSnap.size,
        foodMatched: matchedSnap.size,
        reports: reportsSnap.size,
      };
      adminLog('analytics', 'fetch done', payload);
      setData(payload);
      setError(null);
    } catch (e) {
      adminError('analytics', 'load failed', e);
      setError(e instanceof Error ? e.message : 'Failed to load');
      setData(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    void load();
  };

  const now = formatMillisToronto(Date.now());

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <AdminHeader
        title="Analytics"
        subtitle={`Snapshot · ${now}`}
        backTo={adminRoutes.home}
        backLabel="Admin"
      />
      {loading && !data ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.hint}>Loading Firestore aggregates…</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity style={styles.retry} onPress={() => void load()}>
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          {data ? (
            <View style={styles.grid}>
              <TouchableOpacity
                style={styles.card}
                activeOpacity={0.88}
                onPress={() => router.push(adminRoutes.users)}
              >
                <Text style={styles.label}>Users</Text>
                <Text style={styles.value}>{data.users}</Text>
                <Text style={styles.cta}>Open directory →</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.card}
                activeOpacity={0.88}
                onPress={() => router.push(adminRoutes.orders())}
              >
                <Text style={styles.label}>Orders</Text>
                <Text style={styles.value}>{data.orders}</Text>
                <Text style={styles.cta}>Manage orders →</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.card}
                activeOpacity={0.88}
                onPress={() => router.push(adminRoutes.orders())}
              >
                <Text style={styles.label}>Food cards (waiting)</Text>
                <Text style={styles.value}>{data.foodWaiting}</Text>
                <Text style={styles.cta}>Orders hub →</Text>
              </TouchableOpacity>
              <View style={styles.card}>
                <Text style={styles.label}>Total matches (food_cards · matched)</Text>
                <Text style={styles.value}>{data.foodMatched}</Text>
                <Text style={styles.hintSmall}>Pull down to refresh counts</Text>
              </View>
              <TouchableOpacity
                style={styles.card}
                activeOpacity={0.88}
                onPress={() => router.push(adminRoutes.reports)}
              >
                <Text style={styles.label}>Reports</Text>
                <Text style={styles.value}>{data.reports}</Text>
                <Text style={styles.cta}>Moderation →</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  hint: { marginTop: 10, color: COLORS.textMuted },
  scroll: { padding: 16, paddingBottom: 32 },
  grid: { gap: 12 },
  card: { ...adminCardShell, padding: theme.spacing.md },
  label: { fontSize: 13, color: COLORS.textMuted, marginBottom: 6 },
  value: { fontSize: 28, fontWeight: '800', color: COLORS.text },
  cta: { marginTop: 8, fontSize: 14, fontWeight: '700', color: COLORS.primary },
  errorBox: {
    backgroundColor: COLORS.dangerBg,
    padding: 14,
    borderRadius: 12,
    marginBottom: 16,
  },
  errorText: { color: COLORS.error, marginBottom: 10 },
  retry: { alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 14 },
  retryText: { color: COLORS.primary, fontWeight: '700' },
  hintSmall: { marginTop: 8, fontSize: 13, color: COLORS.textMuted },
});
