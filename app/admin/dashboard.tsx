import { useAuth } from '@/services/AuthContext';
import { db } from '@/services/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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

function startOfTodayMs(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function endOfTodayMs(): number {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

type Stats = {
  totalUsers: number;
  totalOrders: number;
  activeOrders: number;
  complaints: number;
  ordersToday: number;
};

export default function AdminDashboardScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = user?.email === ADMIN_EMAIL;

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    if (user.email !== ADMIN_EMAIL) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchStats() {
      try {
        const [usersSnap, ordersSnap, complaintsSnap] = await Promise.all([
          getDocs(collection(db, 'users')),
          getDocs(collection(db, 'orders')),
          getDocs(collection(db, 'complaints')),
        ]);

        if (cancelled) return;

        const totalUsers = usersSnap.size;
        const totalOrders = ordersSnap.size;
        const complaints = complaintsSnap.size;

        const todayStart = startOfTodayMs();
        const todayEnd = endOfTodayMs();

        let activeOrders = 0;
        let ordersToday = 0;

        ordersSnap.docs.forEach((doc) => {
          const data = doc.data();
          const status = data?.status;
          if (status === 'active') activeOrders += 1;

          const created = data?.createdAt?.toMillis?.() ?? data?.createdAt ?? 0;
          const ms = typeof created === 'number' ? created : Number(created);
          if (ms >= todayStart && ms <= todayEnd) ordersToday += 1;
        });

        setStats({
          totalUsers,
          totalOrders,
          activeOrders,
          complaints,
          ordersToday,
        });
        setError(null);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load stats');
          setStats(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchStats();
    return () => {
      cancelled = true;
    };
  }, [user]);

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

  if (loading && !stats) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading dashboard...</Text>
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
      </View>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>HalfOrder Admin Dashboard</Text>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {stats ? (
          <View style={styles.cards}>
            <View style={styles.card}>
              <Text style={styles.cardLabel}>Total Users</Text>
              <Text style={styles.cardValue}>{stats.totalUsers}</Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.cardLabel}>Total Orders</Text>
              <Text style={styles.cardValue}>{stats.totalOrders}</Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.cardLabel}>Active Orders</Text>
              <Text style={styles.cardValue}>{stats.activeOrders}</Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.cardLabel}>Complaints</Text>
              <Text style={styles.cardValue}>{stats.complaints}</Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.cardLabel}>Orders Today</Text>
              <Text style={styles.cardValue}>{stats.ordersToday}</Text>
            </View>
          </View>
        ) : null}
      </ScrollView>
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
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 24,
  },
  cards: {
    gap: 12,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 20,
    marginBottom: 12,
  },
  cardLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textMuted,
    marginBottom: 6,
  },
  cardValue: {
    fontSize: 28,
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
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: COLORS.textMuted,
  },
  errorBox: {
    backgroundColor: '#FEE2E2',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 14,
    color: COLORS.error,
  },
});
