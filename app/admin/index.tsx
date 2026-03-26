import { useAuth } from '@/services/AuthContext';
import { db } from '@/services/firebase';
import { useRouter } from 'expo-router';
import { collection, getDocs } from 'firebase/firestore';
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
import { adminCardShell, adminColors as COLORS } from '@/constants/adminTheme';
import { theme } from '@/constants/theme';

const ADMIN_EMAIL = 'support@halforder.app';

function startOfTodayMs(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function startOfWeekMs(): number {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export default function AdminScreen() {
  const router = useRouter();
  const { user } = useAuth();
  useEffect(() => {
    if (user && user.email !== ADMIN_EMAIL) {
      router.replace('/(tabs)');
    }
  }, [user, router]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [metrics, setMetrics] = useState<{
    totalUsers: number;
    totalOrders: number;
    ordersToday: number;
    ordersThisWeek: number;
    activeUsers: number;
    averageOrderPrice: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = user?.email === ADMIN_EMAIL;

  const fetchMetrics = useCallback(async () => {
    try {
      const [usersSnap, ordersSnap] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'orders')),
      ]);

      const totalUsers = usersSnap.size;
      const totalOrders = ordersSnap.size;

      const todayStart = startOfTodayMs();
      const weekStart = startOfWeekMs();
      const now = Date.now();

      let ordersToday = 0;
      let ordersThisWeek = 0;
      let sumPrice = 0;
      const activeUserIds = new Set<string>();

      ordersSnap.docs.forEach((docSnap) => {
        const data = docSnap.data();
        const createdAt = data?.createdAt;
        const ms =
          typeof createdAt?.toMillis === 'function'
            ? createdAt.toMillis()
            : typeof createdAt?.seconds === 'number'
              ? createdAt.seconds * 1000
              : 0;

        if (ms >= todayStart && ms <= now) ordersToday += 1;
        if (ms >= weekStart && ms <= now) {
          ordersThisWeek += 1;
          const ids = data?.participantIds ?? data?.joinedUsers ?? [];
          const hostId = data?.hostId ?? data?.creatorId ?? data?.userId;
          if (Array.isArray(ids))
            ids.forEach((id: string) => activeUserIds.add(id));
          if (hostId) activeUserIds.add(hostId);
        }

        const price = data?.totalPrice ?? data?.price;
        if (typeof price === 'number' && !Number.isNaN(price))
          sumPrice += price;
      });

      const averageOrderPrice = totalOrders > 0 ? sumPrice / totalOrders : 0;

      setMetrics({
        totalUsers,
        totalOrders,
        ordersToday,
        ordersThisWeek,
        activeUsers: activeUserIds.size,
        averageOrderPrice,
      });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load metrics');
      setMetrics(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (user && isAdmin) {
      fetchMetrics();
    } else {
      setLoading(false);
    }
  }, [user, isAdmin, fetchMetrics]);

  const onRefresh = () => {
    if (!isAdmin) return;
    setRefreshing(true);
    fetchMetrics();
  };

  if (!user) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centered}>
          <Text style={styles.accessDenied}>Sign in to continue.</Text>
          <Text style={styles.hint} onPress={() => router.back()}>
            Go back
          </Text>
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
            You do not have permission to view this page.
          </Text>
          <Text style={styles.link} onPress={() => router.back()}>
            Go back
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (loading && !metrics) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading dashboard...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
          />
        }
      >
        <Text style={styles.title}>Admin Dashboard</Text>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {metrics ? (
          <View style={styles.cards}>
            <View style={styles.card}>
              <Text style={styles.cardLabel}>Total Users</Text>
              <Text style={styles.cardValue}>{metrics.totalUsers}</Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.cardLabel}>Total Orders</Text>
              <Text style={styles.cardValue}>{metrics.totalOrders}</Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.cardLabel}>Orders Today</Text>
              <Text style={styles.cardValue}>{metrics.ordersToday}</Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.cardLabel}>Orders This Week</Text>
              <Text style={styles.cardValue}>{metrics.ordersThisWeek}</Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.cardLabel}>Active Users (this week)</Text>
              <Text style={styles.cardValue}>{metrics.activeUsers}</Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.cardLabel}>Average Order Price</Text>
              <Text style={styles.cardValue}>
                ${metrics.averageOrderPrice.toFixed(2)}
              </Text>
            </View>
          </View>
        ) : null}

        <View style={styles.navSection}>
          <TouchableOpacity
            style={styles.navButton}
            onPress={() => router.push('/admin/dashboard')}
            activeOpacity={0.85}
          >
            <Text style={styles.navButtonText}>Dashboard</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.navButton}
            onPress={() => router.push('/admin-users')}
            activeOpacity={0.85}
          >
            <Text style={styles.navButtonText}>Manage Users</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.navButton}
            onPress={() => router.push('/admin-reports')}
            activeOpacity={0.85}
          >
            <Text style={styles.navButtonText}>User Reports (UGC)</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.navButton}
            onPress={() => router.push('/admin-orders')}
            activeOpacity={0.85}
          >
            <Text style={styles.navButtonText}>Manage Orders</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.navButton}
            onPress={() => router.push('/admin-notifications')}
            activeOpacity={0.85}
          >
            <Text style={styles.navButtonText}>Send Notifications</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.navButton}
            onPress={() => router.push('/admin/notifications')}
            activeOpacity={0.85}
          >
            <Text style={styles.navButtonText}>Notification Tracking</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.navButton}
            onPress={() => router.push('/admin/complaints')}
            activeOpacity={0.85}
          >
            <Text style={styles.navButtonText}>User Complaints</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.navButton}
            onPress={() => router.push('/admin/map')}
            activeOpacity={0.85}
          >
            <Text style={styles.navButtonText}>Activity Map</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.navButton}
            onPress={() => router.push('/admin/broadcast')}
            activeOpacity={0.85}
          >
            <Text style={styles.navButtonText}>Broadcast</Text>
          </TouchableOpacity>
          {__DEV__ ? (
            <TouchableOpacity
              style={styles.navButton}
              onPress={() => router.push('/admin/test-order-flow')}
              activeOpacity={0.85}
            >
              <Text style={styles.navButtonText}>Developer tools</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
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
  link: {
    fontSize: 16,
    color: COLORS.primary,
    fontWeight: '600',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: COLORS.textMuted,
  },
  errorBox: {
    backgroundColor: COLORS.dangerBg,
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 14,
  },
  cards: {
    gap: 12,
  },
  card: {
    ...adminCardShell,
    marginBottom: 12,
  },
  cardLabel: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginBottom: 4,
  },
  cardValue: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.text,
  },
  navSection: {
    marginTop: 24,
    gap: 12,
  },
  navButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    paddingHorizontal: theme.spacing.section,
    borderRadius: theme.radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: theme.spacing.touchMin,
    marginBottom: 12,
  },
  navButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
});
