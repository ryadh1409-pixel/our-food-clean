import { useAuth } from '@/services/AuthContext';
import { db } from '@/services/firebase';
import { useRouter } from 'expo-router';
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  Timestamp,
} from 'firebase/firestore';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { adminCardShell, adminColors as C } from '@/constants/adminTheme';

const ADMIN_EMAIL = 'support@halforder.app';

type ReportRow = {
  id: string;
  reporterId: string;
  reportedUserId: string | null;
  orderId: string | null;
  reason: string | null;
  context: string | null;
  message: string | null;
  createdAtLabel: string;
};

function formatTime(v: unknown): string {
  if (v instanceof Timestamp) {
    return v.toDate().toLocaleString();
  }
  return '—';
}

export default function AdminReportsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = user?.email === ADMIN_EMAIL;

  const load = useCallback(async () => {
    if (!isAdmin) return;
    setError(null);
    try {
      const q = query(
        collection(db, 'reports'),
        orderBy('createdAt', 'desc'),
        limit(80),
      );
      const snap = await getDocs(q);
      const list: ReportRow[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          reporterId: typeof data?.reporterId === 'string' ? data.reporterId : '—',
          reportedUserId:
            typeof data?.reportedUserId === 'string' ? data.reportedUserId : null,
          orderId: typeof data?.orderId === 'string' ? data.orderId : null,
          reason: typeof data?.reason === 'string' ? data.reason : null,
          context: typeof data?.context === 'string' ? data.context : null,
          message: typeof data?.message === 'string' ? data.message : null,
          createdAtLabel: formatTime(data?.createdAt),
        };
      });
      setRows(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load reports');
      setRows([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (user && user.email !== ADMIN_EMAIL) {
      router.replace('/(tabs)');
    }
  }, [user, router]);

  useEffect(() => {
    if (isAdmin) {
      void load();
    } else {
      setLoading(false);
    }
  }, [isAdmin, load]);

  if (!user) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centered}>
          <Text style={styles.muted}>Sign in to continue.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centered}>
          <Text style={styles.muted}>Access denied.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
          />
        }
      >
        <Text style={styles.title}>User reports</Text>
        <Text style={styles.sub}>
          Submitted from Report / Report user flows and blocked-message telemetry.
          Restrict accounts from Manage Users when appropriate.
        </Text>

        {loading && rows.length === 0 ? (
          <ActivityIndicator size="large" style={{ marginTop: 24 }} />
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {rows.map((r) => (
          <View key={r.id} style={styles.card}>
            <Text style={styles.cardTime}>{r.createdAtLabel}</Text>
            <Text style={styles.cardLine}>
              <Text style={styles.cardLabel}>Reporter: </Text>
              {r.reporterId}
            </Text>
            {r.reportedUserId ? (
              <Text style={styles.cardLine}>
                <Text style={styles.cardLabel}>Reported user: </Text>
                {r.reportedUserId}
              </Text>
            ) : null}
            {r.orderId ? (
              <Text style={styles.cardLine}>
                <Text style={styles.cardLabel}>Order: </Text>
                {r.orderId}
              </Text>
            ) : null}
            {r.reason ? (
              <Text style={styles.cardLine}>
                <Text style={styles.cardLabel}>Reason: </Text>
                {r.reason}
              </Text>
            ) : null}
            {r.context ? (
              <Text style={styles.cardLine}>{r.context}</Text>
            ) : null}
            {r.message ? (
              <Text style={styles.cardPreview} numberOfLines={4}>
                {r.message}
              </Text>
            ) : null}
            <Text style={styles.idTiny}>Doc: {r.id}</Text>
          </View>
        ))}

        {!loading && rows.length === 0 && !error ? (
          <Text style={styles.muted}>No reports yet.</Text>
        ) : null}

        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          activeOpacity={0.8}
        >
          <Text style={styles.backBtnText}>Back</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { padding: 16, paddingBottom: 32 },
  title: { fontSize: 22, fontWeight: '700', color: C.text },
  sub: {
    fontSize: 14,
    color: C.textMuted,
    marginTop: 8,
    marginBottom: 16,
    lineHeight: 20,
  },
  muted: { fontSize: 15, color: C.textMuted },
  error: { color: C.error, marginVertical: 12 },
  card: {
    ...adminCardShell,
    marginBottom: 12,
  },
  cardTime: { fontSize: 12, color: C.textMuted, marginBottom: 8 },
  cardLine: { fontSize: 14, color: C.text, marginBottom: 4 },
  cardLabel: { fontWeight: '700', color: C.text },
  cardPreview: {
    fontSize: 13,
    color: C.textMuted,
    marginTop: 6,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  idTiny: { fontSize: 11, color: C.textMuted, marginTop: 8 },
  backBtn: { marginTop: 20, padding: 14, alignItems: 'center' },
  backBtnText: { fontSize: 16, color: C.accentBlue, fontWeight: '600' },
});
