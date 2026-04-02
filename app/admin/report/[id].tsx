import { AdminHeader } from '@/components/admin/AdminHeader';
import { adminRoutes } from '@/constants/adminRoutes';
import { adminCardShell, adminColors as COLORS } from '@/constants/adminTheme';
import { theme } from '@/constants/theme';
import { adminError, adminLog } from '@/lib/admin/adminDebug';
import { formatFirestoreTime, reportDetailText } from '@/lib/admin/orderHelpers';
import { db } from '@/services/firebase';
import {
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function AdminReportDetailScreen() {
  const router = useRouter();
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const reportId = typeof rawId === 'string' ? rawId.trim() : '';

  const [report, setReport] = useState<Record<string, unknown> | null>(null);
  const [userInfo, setUserInfo] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  useEffect(() => {
    if (!reportId) {
      setLoading(false);
      return;
    }
    adminLog('report-detail', 'subscribe report doc', { reportId });
    const u = onSnapshot(
      doc(db, 'reports', reportId),
      (snap) => {
        adminLog('report-detail', 'report snapshot', {
          reportId,
          exists: snap.exists(),
        });
        setReport(snap.exists() ? snap.data() ?? {} : {});
        setLoading(false);
      },
      (err) => {
        adminError('report-detail', 'report listener error', err);
        setLoading(false);
      },
    );
    return () => u();
  }, [reportId]);

  const reportedUserId =
    report && typeof report.reportedUserId === 'string'
      ? report.reportedUserId
      : null;
  const resolved =
    report && typeof report.adminResolution === 'string'
      ? report.adminResolution
      : null;

  useEffect(() => {
    if (!reportedUserId) {
      setUserInfo(null);
      return;
    }
    adminLog('report-detail', 'subscribe reported user doc', { reportedUserId });
    const u = onSnapshot(
      doc(db, 'users', reportedUserId),
      (snap) => {
        adminLog('report-detail', 'reported user snapshot', { exists: snap.exists() });
        setUserInfo(snap.exists() ? snap.data() ?? {} : {});
      },
      (err) => adminError('report-detail', 'reported user listener error', err),
    );
    return () => u();
  }, [reportedUserId]);

  const markIgnored = () => {
    if (!reportId) return;
    Alert.alert('Ignore report', 'Close without action?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Ignore',
        onPress: async () => {
          setActing(true);
          try {
            adminLog('report-detail', 'ignore report', { reportId });
            await updateDoc(doc(db, 'reports', reportId), {
              adminResolution: 'ignored',
              adminResolvedAt: serverTimestamp(),
            });
          } catch (e) {
            Alert.alert('Error', e instanceof Error ? e.message : 'Failed');
          } finally {
            setActing(false);
          }
        },
      },
    ]);
  };

  const banUser = () => {
    if (!reportId || !reportedUserId) return;
    Alert.alert(
      'Ban user',
      `Ban ${reportedUserId.slice(0, 10)}… and resolve this report?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Ban',
          style: 'destructive',
          onPress: async () => {
            setActing(true);
          try {
            adminLog('report-detail', 'ban user from report', { reportedUserId });
            await updateDoc(doc(db, 'users', reportedUserId), {
              banned: true,
            });
            await updateDoc(doc(db, 'reports', reportId), {
                adminResolution: 'banned_reported_user',
                adminResolvedAt: serverTimestamp(),
              });
              Alert.alert('Done', 'User banned.');
            } catch (e) {
              Alert.alert('Error', e instanceof Error ? e.message : 'Failed');
            } finally {
              setActing(false);
            }
          },
        },
      ],
    );
  };

  if (!reportId) {
    return (
      <SafeAreaView style={styles.screen}>
        <Text style={styles.muted}>Invalid report</Text>
      </SafeAreaView>
    );
  }

  if (loading && !report) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!report || Object.keys(report).length === 0) {
    return (
      <SafeAreaView style={styles.screen} edges={['bottom']}>
        <AdminHeader title="Report" backTo={adminRoutes.reports} backLabel="Reports" />
        <Text style={styles.muted}>Not found</Text>
      </SafeAreaView>
    );
  }

  const detail = report ? reportDetailText(report as Record<string, unknown>) : null;

  const uEmail =
    userInfo && typeof userInfo.email === 'string' ? userInfo.email : null;
  const uName =
    userInfo && typeof userInfo.displayName === 'string'
      ? userInfo.displayName
      : null;

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <AdminHeader title="Report detail" backTo={adminRoutes.reports} backLabel="Reports" />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.card}>
          <Text style={styles.k}>Created</Text>
          <Text style={styles.v}>{formatFirestoreTime(report.createdAt)}</Text>
          <Text style={styles.k}>Reason</Text>
          <Text style={styles.v}>
            {typeof report.reason === 'string' ? report.reason : '—'}
          </Text>
          <Text style={styles.k}>Reporter</Text>
          <Text style={styles.v}>
            {typeof report.reporterId === 'string' ? report.reporterId : '—'}
          </Text>
          <Text style={styles.k}>Reported user</Text>
          {reportedUserId ? (
            <TouchableOpacity
              onPress={() =>
                router.push(adminRoutes.user(reportedUserId) as never)
              }
            >
              <Text style={[styles.v, styles.link]}>{reportedUserId}</Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.v}>—</Text>
          )}
          {typeof report.orderId === 'string' ? (
            <>
              <Text style={styles.k}>Order</Text>
              <TouchableOpacity
                onPress={() =>
                  router.push(adminRoutes.order(report.orderId as string) as never)
                }
              >
                <Text style={[styles.v, styles.link]}>{report.orderId}</Text>
              </TouchableOpacity>
            </>
          ) : null}
          {detail ? (
            <>
              <Text style={styles.k}>Details</Text>
              <Text style={styles.detail}>{detail}</Text>
            </>
          ) : null}
          {resolved ? (
            <Text style={styles.resolved}>Resolution: {resolved}</Text>
          ) : null}
        </View>

        {reportedUserId ? (
          <View style={styles.card}>
            <Text style={styles.section}>Reported user (Firestore)</Text>
            <Text style={styles.v}>{uName ?? '—'}</Text>
            <Text style={styles.meta}>{uEmail ?? '—'}</Text>
          </View>
        ) : null}

        {!resolved ? (
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.btn, styles.ignore]}
              disabled={acting}
              onPress={markIgnored}
            >
              <Text style={styles.ignoreT}>Ignore report</Text>
            </TouchableOpacity>
            {reportedUserId ? (
              <TouchableOpacity
                style={[styles.btn, styles.ban]}
                disabled={acting}
                onPress={banUser}
              >
                <Text style={styles.banT}>Ban reported user</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  centered: { flex: 1, justifyContent: 'center' },
  scroll: { padding: 16, paddingBottom: 40 },
  card: { ...adminCardShell, marginBottom: 14, padding: theme.spacing.md },
  k: { fontSize: 12, color: COLORS.textMuted, marginBottom: 2 },
  v: { fontSize: 15, color: COLORS.text, marginBottom: 8 },
  link: { color: COLORS.primary, fontWeight: '700' },
  detail: { fontSize: 15, color: COLORS.text, lineHeight: 22 },
  resolved: {
    marginTop: 12,
    fontWeight: '700',
    color: COLORS.successText,
  },
  section: { fontSize: 16, fontWeight: '800', marginBottom: 8 },
  meta: { fontSize: 14, color: COLORS.textMuted },
  muted: { color: COLORS.textMuted, padding: 16 },
  actions: { gap: 12 },
  btn: { paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  ignore: { backgroundColor: COLORS.border },
  ignoreT: { fontWeight: '800', color: COLORS.text },
  ban: { backgroundColor: COLORS.dangerBg },
  banT: { fontWeight: '800', color: COLORS.error },
});
