import { useAuth } from '@/services/AuthContext';
import { db } from '@/services/firebase';
import { useRouter } from 'expo-router';
import { collection, getDocs, doc, deleteDoc } from 'firebase/firestore';
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

type OrderRow = {
  id: string;
  restaurantName: string;
  creatorEmail: string;
  createdAt: string;
  status: string;
  participants: number;
};

export default function AdminOrdersScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = user?.email === ADMIN_EMAIL;

  const fetchOrders = useCallback(async () => {
    try {
      const [ordersSnap, usersSnap] = await Promise.all([
        getDocs(collection(db, 'orders')),
        getDocs(collection(db, 'users')),
      ]);

      const emailByUid: Record<string, string> = {};
      usersSnap.docs.forEach((d) => {
        const email = d.data()?.email;
        if (typeof email === 'string') emailByUid[d.id] = email;
      });

      const list: OrderRow[] = [];
      ordersSnap.docs.forEach((d) => {
        const data = d.data();
        const creatorId = data?.hostId ?? data?.creatorId ?? data?.userId ?? '';
        const createdAt = data?.createdAt;
        const ms =
          typeof createdAt?.toMillis === 'function'
            ? createdAt.toMillis()
            : typeof createdAt?.seconds === 'number'
              ? createdAt.seconds * 1000
              : 0;
        const participantIds = Array.isArray(data?.participantIds)
          ? data.participantIds
          : [];
        list.push({
          id: d.id,
          restaurantName:
            typeof data?.restaurantName === 'string'
              ? data.restaurantName
              : '—',
          creatorEmail: (emailByUid[creatorId] ?? creatorId) || '—',
          createdAt: ms ? new Date(ms).toLocaleString() : '—',
          status: typeof data?.status === 'string' ? data.status : '—',
          participants: participantIds.length,
        });
      });
      list.sort((a, b) =>
        b.createdAt !== '—' && a.createdAt !== '—'
          ? b.createdAt.localeCompare(a.createdAt)
          : 0,
      );
      setOrders(list);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load orders');
      setOrders([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (user && isAdmin) {
      fetchOrders();
    } else {
      setLoading(false);
    }
  }, [user, isAdmin, fetchOrders]);

  useEffect(() => {
    if (!user) return;
    if (user.email !== ADMIN_EMAIL) {
      router.replace('/(tabs)');
    }
  }, [user, router]);

  const handleDelete = (orderId: string) => {
    Alert.alert('Delete Order', 'Permanently delete this order?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeletingId(orderId);
          try {
            await deleteDoc(doc(db, 'orders', orderId));
            setOrders((prev) => prev.filter((o) => o.id !== orderId));
          } catch (e) {
            Alert.alert(
              'Error',
              e instanceof Error ? e.message : 'Failed to delete',
            );
          } finally {
            setDeletingId(null);
          }
        },
      },
    ]);
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

  if (loading && orders.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading orders...</Text>
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
              fetchOrders();
            }}
            tintColor={COLORS.primary}
          />
        }
      >
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.link}>← Dashboard</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Orders Management</Text>
        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}
        {orders.map((o) => (
          <View key={o.id} style={styles.card}>
            <Text style={styles.rowLabel}>Restaurant</Text>
            <Text style={styles.rowValue}>{o.restaurantName}</Text>
            <Text style={styles.rowLabel}>Creator email</Text>
            <Text style={styles.rowValue}>{o.creatorEmail}</Text>
            <Text style={styles.rowLabel}>Created</Text>
            <Text style={styles.rowValue}>{o.createdAt}</Text>
            <Text style={styles.rowLabel}>Status</Text>
            <Text style={styles.rowValue}>{o.status}</Text>
            <Text style={styles.rowLabel}>Participants</Text>
            <Text style={styles.rowValue}>{o.participants}</Text>
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={() => handleDelete(o.id)}
              disabled={deletingId === o.id}
            >
              {deletingId === o.id ? (
                <ActivityIndicator size="small" color={COLORS.background} />
              ) : (
                <Text style={styles.deleteButtonText}>Delete Order</Text>
              )}
            </TouchableOpacity>
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
  deleteButton: {
    backgroundColor: COLORS.error,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 4,
  },
  deleteButtonText: { color: '#FFF', fontWeight: '600', fontSize: 14 },
});
