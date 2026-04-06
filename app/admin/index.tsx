import {
  AdminFoodCatalogFab,
  AdminFoodCatalogList,
  AdminFoodCatalogProvider,
} from './components/AdminFoodCatalog';
import { AdminCardsDashboard } from './components/AdminCardsDashboard';
import { adminRoutes } from '@/constants/adminRoutes';
import { ADMIN_PANEL_EMAIL, isAdminUser } from '@/constants/adminUid';
import { adminError, adminLog } from '@/lib/admin/adminDebug';
import { adminCardShell, adminColors as COLORS } from '@/constants/adminTheme';
import { theme } from '@/constants/theme';
import { useAuth } from '@/services/AuthContext';
import { auth, db, storage } from '@/services/firebase';
import { generateFoodCardAiDescription } from '@/services/foodCardAiDescription';
import {
  countFoodCardsWithStatus,
  countVisibleActiveFoodCardsInSnapshot,
  foodCardExpiresAtFromNow,
} from '@/services/foodCards';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { addDoc, collection, getDocs, serverTimestamp } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<{
    totalUsers: number;
    totalOrders: number;
    ordersToday: number;
    ordersThisWeek: number;
    activeUsers: number;
    averageOrderPrice: number;
    activeCards: number;
    totalMatches: number;
    completedOrders: number;
  } | null>(null);

  const isAdmin = isAdminUser(user);

  useEffect(() => {
    if (user && !isAdmin) {
      router.replace('/(tabs)');
    }
  }, [isAdmin, router, user]);

  const fetchMetrics = useCallback(async () => {
    try {
      adminLog('admin-home', 'fetchMetrics: users, orders, food_cards');
      const [usersSnap, ordersSnap, cardsSnap] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'orders')),
        getDocs(collection(db, 'food_cards')),
      ]);

      const totalUsers = usersSnap.size;
      const totalOrders = ordersSnap.size;
      const todayStart = startOfTodayMs();
      const weekStart = startOfWeekMs();
      const now = Date.now();
      let ordersToday = 0;
      let ordersThisWeek = 0;
      let sumPrice = 0;
      let completedOrders = 0;
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
          const ids = Array.isArray(data?.participants) ? data.participants : [];
          const hostId = data?.hostId ?? data?.creatorId ?? data?.userId;
          if (Array.isArray(ids)) ids.forEach((id: string) => activeUserIds.add(id));
          if (hostId) activeUserIds.add(hostId);
        }

        const orderPrice = data?.totalPrice ?? data?.price;
        if (typeof orderPrice === 'number' && !Number.isNaN(orderPrice)) {
          sumPrice += orderPrice;
        }
        if (data?.status === 'completed') completedOrders += 1;
      });

      const activeCards = countVisibleActiveFoodCardsInSnapshot(cardsSnap, now);
      const totalMatches = countFoodCardsWithStatus(cardsSnap, 'matched');

      const nextMetrics = {
        totalUsers,
        totalOrders,
        ordersToday,
        ordersThisWeek,
        activeUsers: activeUserIds.size,
        averageOrderPrice: totalOrders > 0 ? sumPrice / totalOrders : 0,
        activeCards,
        totalMatches,
        completedOrders,
      };
      adminLog('admin-home', 'metrics loaded', nextMetrics);
      setMetrics(nextMetrics);
      setError(null);
    } catch (e) {
      adminError('admin-home', 'fetchMetrics failed', e);
      setMetrics(null);
      setError(e instanceof Error ? e.message : 'Failed to load metrics');
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
  }, [fetchMetrics, isAdmin, user]);

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
          <Text style={styles.link} onPress={() => router.back()}>
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
            You do not have permission to view this page. Admin sign-in:{' '}
            {ADMIN_PANEL_EMAIL}
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
          <Text style={styles.loadingText}>Loading admin...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <AdminFoodCatalogProvider enabled={isAdmin}>
        <View style={styles.mainCol}>
          <ScrollView
            style={styles.scrollView}
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

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Home menu catalog</Text>
              <Text style={styles.cardHint}>
                Up to 10 templates · Shown on the Home tab (when visible) · Use
                + to add
              </Text>
              <AdminFoodCatalogList />
            </View>

            {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
            ) : null}

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Food cards (10 slots)</Text>
              <Text style={styles.cardHint}>
                Edit cards 1–10. Toggle active to show or hide in the app.
              </Text>
              <AdminCardsDashboard />
            </View>

            {metrics ? (
              <View style={styles.cards}>
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.85}
              onPress={() => router.push(adminRoutes.users)}
            >
              <Text style={styles.cardLabel}>Total Users</Text>
              <Text style={styles.cardValue}>{metrics.totalUsers}</Text>
              <Text style={styles.cardCta}>View users →</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.85}
              onPress={() => router.push(adminRoutes.orders())}
            >
              <Text style={styles.cardLabel}>Total Orders</Text>
              <Text style={styles.cardValue}>{metrics.totalOrders}</Text>
              <Text style={styles.cardCta}>View orders →</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.85}
              onPress={() =>
                router.push(adminRoutes.orders({ filter: 'today' }))
              }
            >
              <Text style={styles.cardLabel}>Orders Today</Text>
              <Text style={styles.cardValue}>{metrics.ordersToday}</Text>
              <Text style={styles.cardCta}>Today orders →</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.85}
              onPress={() => router.push(adminRoutes.orders())}
            >
              <Text style={styles.cardLabel}>Orders This Week</Text>
              <Text style={styles.cardValue}>{metrics.ordersThisWeek}</Text>
              <Text style={styles.cardCta}>All orders (scroll) →</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.85}
              onPress={() => router.push(adminRoutes.users)}
            >
              <Text style={styles.cardLabel}>Active Users (this week)</Text>
              <Text style={styles.cardValue}>{metrics.activeUsers}</Text>
              <Text style={styles.cardCta}>User directory →</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.85}
              onPress={() => router.push(adminRoutes.orders())}
            >
              <Text style={styles.cardLabel}>Average Order Price</Text>
              <Text style={styles.cardValue}>
                ${metrics.averageOrderPrice.toFixed(2)}
              </Text>
              <Text style={styles.cardCta}>Orders data →</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.85}
              onPress={() => router.push(adminRoutes.orders())}
            >
              <Text style={styles.cardLabel}>Active Cards</Text>
              <Text style={styles.cardValue}>{metrics.activeCards}</Text>
              <Text style={styles.cardCta}>Open orders (admin) →</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.85}
              onPress={() => router.push(adminRoutes.analytics)}
            >
              <Text style={styles.cardLabel}>Total Matches</Text>
              <Text style={styles.cardValue}>{metrics.totalMatches}</Text>
              <Text style={styles.cardCta}>Admin analytics →</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.85}
              onPress={() =>
                router.push(adminRoutes.orders({ filter: 'completed' }))
              }
            >
              <Text style={styles.cardLabel}>Completed Orders</Text>
              <Text style={styles.cardValue}>{metrics.completedOrders}</Text>
              <Text style={styles.cardCta}>Completed filter →</Text>
            </TouchableOpacity>
              </View>
            ) : null}

            <View style={styles.navSection}>
              <TouchableOpacity
                style={styles.navButton}
                onPress={() => router.push(adminRoutes.aiInsights as never)}
                activeOpacity={0.85}
              >
                <Text style={styles.navButtonText}>AI Insights</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.navButton}
                onPress={() => router.push(adminRoutes.sendNotification as never)}
                activeOpacity={0.85}
              >
                <Text style={styles.navButtonText}>Send notification</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.navButton} onPress={() => router.push('/admin/dashboard' as never)} activeOpacity={0.85}>
                <Text style={styles.navButtonText}>Dashboard</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.navButton} onPress={() => router.push(adminRoutes.users as never)} activeOpacity={0.85}>
                <Text style={styles.navButtonText}>Manage Users</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.navButton} onPress={() => router.push(adminRoutes.orders() as never)} activeOpacity={0.85}>
                <Text style={styles.navButtonText}>Manage Orders</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.navButton} onPress={() => router.push(adminRoutes.reports as never)} activeOpacity={0.85}>
                <Text style={styles.navButtonText}>User Reports (UGC)</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
          <AdminFoodCatalogFab />
        </View>
      </AdminFoodCatalogProvider>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  mainCol: { flex: 1, position: 'relative' },
  scrollView: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  scrollContent: { padding: 20, paddingBottom: 100 },
  title: { fontSize: 24, fontWeight: '700', color: COLORS.text, marginBottom: 20, textAlign: 'center' },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text, marginBottom: 12 },
  accessDenied: { fontSize: 18, fontWeight: '600', color: COLORS.error, marginBottom: 8, textAlign: 'center' },
  hint: { fontSize: 14, color: COLORS.textMuted, textAlign: 'center', marginBottom: 16 },
  link: { fontSize: 16, color: COLORS.primary, fontWeight: '600' },
  loadingText: { marginTop: 12, fontSize: 14, color: COLORS.textMuted },
  errorBox: { backgroundColor: COLORS.dangerBg, padding: 12, borderRadius: 8, marginBottom: 16 },
  errorText: { color: COLORS.error, fontSize: 14 },
  cards: { gap: 12 },
  card: { ...adminCardShell, marginBottom: 12 },
  cardLabel: { fontSize: 13, color: COLORS.textMuted, marginBottom: 4 },
  cardValue: { fontSize: 22, fontWeight: '700', color: COLORS.text },
  cardCta: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary,
  },
  cardHint: {
    marginTop: 8,
    fontSize: 13,
    color: COLORS.textMuted,
  },
  navSection: { marginTop: 24, gap: 12 },
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
  navButtonText: { fontSize: 16, fontWeight: '600', color: COLORS.text },
});
