import { AdminHeader } from '@/components/admin/AdminHeader';
import { adminRoutes } from '@/constants/adminRoutes';
import { adminCardShell, adminColors as COLORS } from '@/constants/adminTheme';
import { theme } from '@/constants/theme';
import { adminError, adminLog } from '@/lib/admin/adminDebug';
import { formatFirestoreTime, reportDetailText } from '@/lib/admin/orderHelpers';
import { db } from '@/services/firebase';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
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
  reportedUserId: string | null;
  reporterId: string;
  reason: string | null;
  preview: string | null;
  createdAt: string;
  adminResolution: string | null;
};

export default function AdminReportsListScreen() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    adminLog('reports', 'subscribe reports query orderBy createdAt desc limit 120');
    const q = query(
      collection(db, 'reports'),
      orderBy('createdAt', 'desc'),
      limit(120),
    );
    const u = onSnapshot(
      q,
      (snap) => {
        adminLog('reports', `reports snapshot: ${snap.size} documents`);
        const list: Row[] = snap.docs.map((d) => {
          const data = d.data() as Record<string, unknown>;
          const full = reportDetailText(data);
          const preview = full ? full.slice(0, 120) : null;
          return {
            id: d.id,
            reportedUserId:
              typeof data.reportedUserId === 'string'
                ? data.reportedUserId
                : null,
            reporterId:
              typeof data.reporterId === 'string' ? data.reporterId : '—',
            reason: typeof data.reason === 'string' ? data.reason : null,
            preview,
            createdAt: formatFirestoreTime(data.createdAt),
            adminResolution:
              typeof data.adminResolution === 'string'
                ? data.adminResolution
                : null,
          };
        });
        setRows(list);
        setReady(true);
      },
      (err) => {
        adminError('reports', 'reports listener error', err);
        setReady(true);
      },
    );
    return () => u();
  }, []);

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <AdminHeader
        title="Reports"
        subtitle="UGC & safety queue · live"
        backTo={adminRoutes.home}
        backLabel="Admin"
      />
      {!ready && rows.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.hint}>Loading reports…</Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(i) => i.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.muted}>No reports in queue.</Text>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.card,
                item.adminResolution ? styles.cardDone : null,
              ]}
              activeOpacity={0.88}
              onPress={() => router.push(adminRoutes.report(item.id) as never)}
            >
              <Text style={styles.time}>{item.createdAt}</Text>
              <Text style={styles.reason}>{item.reason ?? 'Report'}</Text>
              {item.reportedUserId ? (
                <Text style={styles.line} numberOfLines={1}>
                  Reported: {item.reportedUserId}
                </Text>
              ) : null}
              <Text style={styles.line} numberOfLines={1}>
                By: {item.reporterId}
              </Text>
              {item.preview ? (
                <Text style={styles.preview} numberOfLines={2}>
                  {item.preview}
                </Text>
              ) : null}
              {item.adminResolution ? (
                <Text style={styles.badge}>{item.adminResolution}</Text>
              ) : (
                <Text style={styles.cta}>Review →</Text>
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
  hint: { marginTop: 8, color: COLORS.textMuted },
  list: { padding: 16, paddingBottom: 32 },
  card: { ...adminCardShell, marginBottom: 12, padding: theme.spacing.md },
  cardDone: { opacity: 0.88, borderColor: COLORS.successText },
  time: { fontSize: 12, color: COLORS.textMuted, marginBottom: 6 },
  reason: { fontSize: 17, fontWeight: '800', color: COLORS.text },
  line: { fontSize: 13, color: COLORS.textMuted, marginTop: 4 },
  preview: { fontSize: 13, color: COLORS.textMuted, marginTop: 8 },
  badge: {
    marginTop: 10,
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.successText,
  },
  cta: { marginTop: 10, fontWeight: '700', color: COLORS.primary },
  muted: { textAlign: 'center', color: COLORS.textMuted, marginTop: 24 },
});
