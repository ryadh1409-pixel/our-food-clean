import { AdminHeader } from '@/components/admin/AdminHeader';
import { adminRoutes } from '@/constants/adminRoutes';
import { adminCardShell, adminColors as COLORS } from '@/constants/adminTheme';
import { theme } from '@/constants/theme';
import { adminError, adminLog } from '@/lib/admin/adminDebug';
import {
  formatFirestoreTime,
  formatParticipantPreview,
  isActiveOrderStatus,
  orderParticipantUids,
} from '@/lib/admin/orderHelpers';
import { db } from '@/services/firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { useLocalSearchParams, useRouter } from 'expo-router';
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

type Row = {
  id: string;
  status: string;
  participantCount: number;
  participantPreview: string;
  createdAt: string;
  createdMs: number;
};

function startOfTodayMs(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export default function AdminOrdersScreen() {
  const router = useRouter();
  const { filter: filterRaw } = useLocalSearchParams<{ filter?: string }>();
  const filter =
    typeof filterRaw === 'string'
      ? filterRaw
      : Array.isArray(filterRaw)
        ? filterRaw[0]
        : 'all';
  const effective = !filter || filter === '' ? 'all' : filter;

  const [rows, setRows] = useState<Row[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    adminLog('orders', 'subscribe orders collection');
    const u = onSnapshot(
      collection(db, 'orders'),
      (snap) => {
        adminLog('orders', `orders snapshot: ${snap.size} documents`);
        const list: Row[] = snap.docs.map((d) => {
          const data = d.data() as Record<string, unknown>;
          const ids = orderParticipantUids(data);
          const c = data.createdAt;
          let ms = 0;
          if (c && typeof c === 'object' && c !== null && 'toMillis' in c) {
            const fn = (c as { toMillis: () => number }).toMillis;
            if (typeof fn === 'function') ms = fn.call(c);
          }
          return {
            id: d.id,
            status: typeof data.status === 'string' ? data.status : '—',
            participantCount: ids.length,
            participantPreview: formatParticipantPreview(ids),
            createdAt: formatFirestoreTime(data.createdAt),
            createdMs: ms,
          };
        });
        list.sort((a, b) => b.createdMs - a.createdMs);
        setRows(list);
        setReady(true);
      },
      (err) => {
        adminError('orders', 'orders listener error', err);
        setReady(true);
      },
    );
    return () => u();
  }, []);

  const filtered = useMemo(() => {
    const todayStart = startOfTodayMs();
    if (effective === 'today') {
      return rows.filter((r) => r.createdMs >= todayStart);
    }
    if (effective === 'active') {
      return rows.filter((r) => isActiveOrderStatus(r.status));
    }
    if (effective === 'completed') {
      return rows.filter((r) => r.status === 'completed');
    }
    return rows;
  }, [rows, effective]);

  const setFilter = (key: string) => {
    if (key === 'all') router.replace(adminRoutes.orders() as never);
    else router.replace(adminRoutes.orders({ filter: key }) as never);
  };

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <AdminHeader
        title={`Orders · ${effective === 'all' ? 'All' : effective}`}
        subtitle="Live · tap row for detail"
        backTo={adminRoutes.home}
        backLabel="Admin"
      />
      <View style={styles.chips}>
        {(
          [
            ['all', 'All'],
            ['today', 'Today'],
            ['active', 'Active'],
            ['completed', 'Done'],
          ] as const
        ).map(([key, label]) => (
          <TouchableOpacity
            key={key}
            style={[
              styles.chip,
              (effective === key || (key === 'all' && effective === 'all')) &&
                styles.chipOn,
            ]}
            onPress={() => setFilter(key)}
          >
            <Text
              style={[
                styles.chipT,
                (effective === key || (key === 'all' && effective === 'all')) &&
                  styles.chipTOn,
              ]}
            >
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {!ready && filtered.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(i) => i.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            !ready ? null : (
              <Text style={styles.empty}>
                No orders match this filter (or Firestore has no orders).
              </Text>
            )
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.88}
              onPress={() => router.push(adminRoutes.order(item.id) as never)}
            >
              <Text style={styles.id}>{item.id}</Text>
              <Text style={styles.meta}>
                Status: <Text style={styles.em}>{item.status}</Text>
              </Text>
              <Text style={styles.meta}>
                Participants ({item.participantCount}): {item.participantPreview}
              </Text>
              <Text style={styles.meta}>{item.createdAt}</Text>
              <Text style={styles.cta}>Details →</Text>
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
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chipOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipT: { fontSize: 13, fontWeight: '600', color: COLORS.textMuted },
  chipTOn: { color: COLORS.onPrimary },
  list: { padding: 16, paddingTop: 0, paddingBottom: 32 },
  card: { ...adminCardShell, marginBottom: 12, padding: theme.spacing.md },
  id: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.primary,
    fontFamily: 'Menlo',
    marginBottom: 6,
  },
  meta: { fontSize: 14, color: COLORS.textMuted, marginTop: 2 },
  em: { fontWeight: '700', color: COLORS.text },
  cta: { marginTop: 10, fontWeight: '700', color: COLORS.primary },
  empty: {
    textAlign: 'center',
    color: COLORS.textMuted,
    marginTop: 24,
    paddingHorizontal: 16,
    fontSize: 15,
  },
});
