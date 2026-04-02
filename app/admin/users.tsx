import { AdminHeader } from '@/components/admin/AdminHeader';
import { adminRoutes } from '@/constants/adminRoutes';
import { adminCardShell, adminColors as COLORS } from '@/constants/adminTheme';
import { theme } from '@/constants/theme';
import { adminError, adminLog } from '@/lib/admin/adminDebug';
import {
  formatFirestoreTime,
  orderParticipantUids,
} from '@/lib/admin/orderHelpers';
import { db } from '@/services/firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type UserDoc = {
  id: string;
  email: string | null;
  displayName: string;
  createdAt: string;
  createdMs: number;
  banned: boolean;
};

type OrderLite = { id: string; data: Record<string, unknown> };

function mergeTouches(orders: OrderLite[]): Record<string, number> {
  const touches: Record<string, number> = {};
  orders.forEach(({ data }) => {
    orderParticipantUids(data).forEach((uid) => {
      touches[uid] = (touches[uid] ?? 0) + 1;
    });
  });
  return touches;
}

export default function AdminUsersScreen() {
  const router = useRouter();
  const [users, setUsers] = useState<UserDoc[]>([]);
  const [orders, setOrders] = useState<OrderLite[]>([]);
  const [usersReady, setUsersReady] = useState(false);
  const [ordersReady, setOrdersReady] = useState(false);

  useEffect(() => {
    adminLog('users', 'subscribe users collection');
    const u = onSnapshot(
      collection(db, 'users'),
      (snap) => {
        adminLog('users', `users snapshot: ${snap.size} documents`);
        const list: UserDoc[] = snap.docs.map((d) => {
          const data = d.data();
          const c = data.createdAt;
          let ms = 0;
          if (c && typeof c === 'object' && 'toMillis' in c) {
            const fn = (c as { toMillis: () => number }).toMillis;
            if (typeof fn === 'function') ms = fn.call(c);
          }
          return {
            id: d.id,
            email: typeof data.email === 'string' ? data.email : null,
            displayName:
              typeof data.displayName === 'string' ? data.displayName : '—',
            createdAt: formatFirestoreTime(data.createdAt),
            createdMs: ms,
            banned: data.banned === true,
          };
        });
        list.sort((a, b) => b.createdMs - a.createdMs);
        setUsers(list);
        setUsersReady(true);
      },
      (err) => {
        adminError('users', 'users listener error', err);
        setUsersReady(true);
      },
    );
    return () => u();
  }, []);

  useEffect(() => {
    adminLog('users', 'subscribe orders collection (for touch counts)');
    const o = onSnapshot(
      collection(db, 'orders'),
      (snap) => {
        adminLog('users', `orders snapshot: ${snap.size} documents`);
        setOrders(
          snap.docs.map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> })),
        );
        setOrdersReady(true);
      },
      (err) => {
        adminError('users', 'orders listener error', err);
        setOrdersReady(true);
      },
    );
    return () => o();
  }, []);

  const rows = useMemo(() => {
    const touches = mergeTouches(orders);
    return users.map((u) => ({
      ...u,
      totalOrderTouches: touches[u.id] ?? 0,
    }));
  }, [users, orders]);

  const loading = !usersReady || !ordersReady;

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <AdminHeader
        title="Users"
        subtitle="Live data · tap for details"
        backTo={adminRoutes.home}
        backLabel="Admin"
      />
      {loading && rows.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.hint}>Syncing Firestore…</Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(i) => i.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            loading ? null : (
              <Text style={styles.empty}>No users in Firestore yet.</Text>
            )
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.card, item.banned && styles.cardBanned]}
              activeOpacity={0.88}
              onPress={() => router.push(adminRoutes.user(item.id) as never)}
            >
              <Text style={styles.name} numberOfLines={1}>
                {item.displayName}
              </Text>
              <Text style={styles.email} numberOfLines={1}>
                {item.email ?? 'No email'}
              </Text>
              <View style={styles.metaRow}>
                <Text style={styles.meta}>Orders: {item.totalOrderTouches}</Text>
                <Text style={styles.meta}> · Joined {item.createdAt}</Text>
              </View>
              {item.banned ? (
                <Text style={styles.badge}>Banned</Text>
              ) : (
                <Text style={styles.cta}>Open profile →</Text>
              )}
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  hint: { marginTop: 10, color: COLORS.textMuted },
  empty: {
    textAlign: 'center',
    color: COLORS.textMuted,
    marginTop: 32,
    fontSize: 15,
  },
  list: { padding: 16, paddingBottom: 32 },
  card: {
    ...adminCardShell,
    marginBottom: 12,
    padding: theme.spacing.md,
  },
  cardBanned: { borderColor: COLORS.error },
  name: { fontSize: 17, fontWeight: '800', color: COLORS.text },
  email: { fontSize: 14, color: COLORS.textMuted, marginTop: 4 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 },
  meta: { fontSize: 13, color: COLORS.textMuted },
  badge: {
    marginTop: 10,
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.error,
  },
  cta: {
    marginTop: 10,
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primary,
  },
});
