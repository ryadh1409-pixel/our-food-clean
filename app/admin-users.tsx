import { useAuth } from '@/services/AuthContext';
import { db } from '@/services/firebase';
import { useRouter } from 'expo-router';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
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

type UserRow = {
  id: string;
  email: string | null;
  displayName: string;
  createdAt: string;
  totalOrders: number;
  banned: boolean;
};

function getCreatedAtStr(data: { createdAt?: unknown }): string {
  const c = data?.createdAt;
  const ms =
    typeof (c as { toMillis?: () => number })?.toMillis === 'function'
      ? (c as { toMillis: () => number }).toMillis()
      : typeof (c as { seconds?: number })?.seconds === 'number'
        ? (c as { seconds: number }).seconds * 1000
        : 0;
  return ms ? new Date(ms).toLocaleString() : '—';
}

export default function AdminUsersScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [banningId, setBanningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = user?.email === ADMIN_EMAIL;

  const fetchUsers = useCallback(async () => {
    try {
      const [usersSnap, ordersSnap] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'orders')),
      ]);
      const orderCountByUid: Record<string, number> = {};
      ordersSnap.docs.forEach((d) => {
        const data = d.data();
        const hostId = data?.hostId ?? data?.creatorId ?? data?.userId;
        if (hostId)
          orderCountByUid[hostId] = (orderCountByUid[hostId] ?? 0) + 1;
        const ids = data?.participantIds ?? data?.joinedUsers ?? [];
        if (Array.isArray(ids))
          ids.forEach((id: string) => {
            orderCountByUid[id] = (orderCountByUid[id] ?? 0) + 1;
          });
      });
      const list: UserRow[] = [];
      usersSnap.docs.forEach((d) => {
        const data = d.data();
        list.push({
          id: d.id,
          email: typeof data?.email === 'string' ? data.email : null,
          displayName:
            typeof data?.displayName === 'string' ? data.displayName : '—',
          createdAt: getCreatedAtStr(data),
          totalOrders: orderCountByUid[d.id] ?? 0,
          banned: data?.banned === true,
        });
      });
      list.sort((a, b) =>
        b.createdAt !== '—' && a.createdAt !== '—'
          ? b.createdAt.localeCompare(a.createdAt)
          : 0,
      );
      setUsers(list);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load users');
      setUsers([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (user && isAdmin) fetchUsers();
    else setLoading(false);
  }, [user, isAdmin, fetchUsers]);

  useEffect(() => {
    if (!user) return;
    if (user.email !== ADMIN_EMAIL) router.replace('/(tabs)');
  }, [user, router]);

  const handleBan = (userId: string) => {
    Alert.alert(
      'Ban User',
      'This user will not be able to create or join orders. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Ban',
          style: 'destructive',
          onPress: async () => {
            setBanningId(userId);
            try {
              await updateDoc(doc(db, 'users', userId), { banned: true });
              await fetchUsers();
            } catch (e) {
              Alert.alert(
                'Error',
                e instanceof Error ? e.message : 'Failed to ban',
              );
            } finally {
              setBanningId(null);
            }
          },
        },
      ],
    );
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
            Only support@halforder.app can access this page.
          </Text>
          <TouchableOpacity onPress={() => router.replace('/(tabs)')}>
            <Text style={styles.link}>Go to Home</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (loading && users.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading users...</Text>
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
            onRefresh={() => {
              setRefreshing(true);
              fetchUsers();
            }}
            tintColor={COLORS.primary}
          />
        }
      >
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.link}>← Dashboard</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Users Management</Text>
        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}
        {users.map((u) => (
          <View key={u.id} style={styles.card}>
            <Text style={styles.rowLabel}>Email</Text>
            <Text style={styles.rowValue}>{u.email ?? '—'}</Text>
            <Text style={styles.rowLabel}>Display name</Text>
            <Text style={styles.rowValue}>{u.displayName}</Text>
            <Text style={styles.rowLabel}>Created</Text>
            <Text style={styles.rowValue}>{u.createdAt}</Text>
            <Text style={styles.rowLabel}>Total orders</Text>
            <Text style={styles.rowValue}>{u.totalOrders}</Text>
            {u.banned ? (
              <Text style={styles.bannedBadge}>Banned</Text>
            ) : (
              <TouchableOpacity
                style={styles.banButton}
                onPress={() => handleBan(u.id)}
                disabled={banningId === u.id}
              >
                {banningId === u.id ? (
                  <ActivityIndicator size="small" color={COLORS.background} />
                ) : (
                  <Text style={styles.banButtonText}>Ban User</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        ))}
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
  link: { fontSize: 16, color: COLORS.primary, fontWeight: '600' },
  loadingText: { marginTop: 12, fontSize: 14, color: COLORS.textMuted },
  errorBox: {
    backgroundColor: '#FEE2E2',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: { color: COLORS.error, fontSize: 14 },
  card: {
    backgroundColor: COLORS.card,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 12,
  },
  rowLabel: { fontSize: 13, color: COLORS.textMuted, marginBottom: 2 },
  rowValue: { fontSize: 16, color: COLORS.text, marginBottom: 12 },
  bannedBadge: { fontSize: 14, fontWeight: '600', color: COLORS.error },
  banButton: {
    backgroundColor: COLORS.error,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 4,
  },
  banButtonText: { color: '#FFF', fontWeight: '600', fontSize: 14 },
});
