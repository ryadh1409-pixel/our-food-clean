import { AdminHeader } from '@/components/admin/AdminHeader';
import { adminRoutes } from '@/constants/adminRoutes';
import { adminCardShell, adminColors as COLORS } from '@/constants/adminTheme';
import { theme } from '@/constants/theme';
import { adminError, adminLog } from '@/lib/admin/adminDebug';
import {
  formatFirestoreTime,
  isActiveOrderStatus,
  orderCreatorUid,
  orderParticipantUids,
  reportDetailText,
} from '@/lib/admin/orderHelpers';
import { db } from '@/services/firebase';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { systemConfirm } from '@/components/SystemDialogHost';
import { getUserFriendlyError } from '@/utils/errorHandler';
import { showError, showSuccess } from '@/utils/toast';

type OrderRow = {
  id: string;
  title: string;
  status: string;
  role: string;
  createdAt: string;
};

type ReportRow = {
  id: string;
  reason: string | null;
  detail: string | null;
  createdAt: string;
  createdMs: number;
  adminResolution: string | null;
};

export default function AdminUserDetailScreen() {
  const router = useRouter();
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const userId = typeof rawId === 'string' ? rawId.trim() : '';

  const [profile, setProfile] = useState<Record<string, unknown> | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [ordersMap, setOrdersMap] = useState<Map<string, OrderRow>>(new Map());
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [acting, setActing] = useState(false);

  useEffect(() => {
    if (!userId) {
      setProfileLoading(false);
      return;
    }
    adminLog('user-detail', `subscribe user doc: ${userId}`);
    const u = onSnapshot(
      doc(db, 'users', userId),
      (snap) => {
        adminLog('user-detail', 'user doc snapshot', {
          exists: snap.exists(),
          id: userId,
        });
        setProfile(snap.exists() ? snap.data() ?? {} : {});
        setProfileLoading(false);
      },
      (err) => {
        adminError('user-detail', 'user doc listener error', err);
        setProfileLoading(false);
      },
    );
    return () => u();
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    adminLog('user-detail', 'subscribe orders (filter client-side)', { userId });
    const unsub = onSnapshot(
      collection(db, 'orders'),
      (snap) => {
        adminLog('user-detail', `orders snapshot for user: ${snap.size} total docs`);
        const next = new Map<string, OrderRow>();
        snap.docs.forEach((d) => {
          const data = d.data() as Record<string, unknown>;
          const uids = orderParticipantUids(data);
          if (!uids.includes(userId)) return;
          const creator = orderCreatorUid(data);
          const title =
            (typeof data.foodName === 'string' ? data.foodName : null) ??
            (typeof data.restaurantName === 'string' ? data.restaurantName : null) ??
            d.id.slice(0, 8);
          next.set(d.id, {
            id: d.id,
            title,
            status: typeof data.status === 'string' ? data.status : '—',
            role: creator === userId ? 'Host' : 'Participant',
            createdAt: formatFirestoreTime(data.createdAt),
          });
        });
      adminLog('user-detail', `user linked orders: ${next.size}`);
      setOrdersMap(next);
    },
      (err) => adminError('user-detail', 'orders listener error', err),
    );
    return () => unsub();
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    adminLog('user-detail', 'subscribe reports for reportedUserId', { userId });
    const q = query(
      collection(db, 'reports'),
      where('reportedUserId', '==', userId),
    );
    const u = onSnapshot(
      q,
      (snap) => {
        adminLog('user-detail', `reports vs user: ${snap.size}`);
        const list: ReportRow[] = snap.docs.map((d) => {
          const data = d.data() as Record<string, unknown>;
          const c = data.createdAt;
          let createdMs = 0;
          if (c && typeof c === 'object' && c !== null && 'toMillis' in c) {
            const fn = (c as { toMillis: () => number }).toMillis;
            if (typeof fn === 'function') createdMs = fn.call(c);
          }
          return {
            id: d.id,
            reason: typeof data.reason === 'string' ? data.reason : null,
            detail: reportDetailText(data),
            createdAt: formatFirestoreTime(data.createdAt),
            createdMs,
            adminResolution:
              typeof data.adminResolution === 'string'
                ? data.adminResolution
                : null,
          };
        });
        list.sort((a, b) => b.createdMs - a.createdMs);
        setReports(list);
      },
      (err) => adminError('user-detail', 'reports listener error', err),
    );
    return () => u();
  }, [userId]);

  const orderList = useMemo(() => [...ordersMap.values()], [ordersMap]);
  const stats = useMemo(() => {
    let active = 0;
    let completed = 0;
    orderList.forEach((o) => {
      if (o.status === 'completed') completed += 1;
      else if (isActiveOrderStatus(o.status)) active += 1;
    });
    return { active, completed, total: orderList.length };
  }, [orderList]);

  const email = typeof profile?.email === 'string' ? profile.email : null;
  const displayName =
    typeof profile?.displayName === 'string' ? profile.displayName : '—';
  const banned = profile?.banned === true;
  const phone =
    typeof profile?.phoneNumber === 'string' ? profile.phoneNumber : null;

  const toggleBan = () => {
    if (!userId) return;
    void (async () => {
      const ok = await systemConfirm({
        title: banned ? 'Unban user' : 'Ban user',
        message: banned
          ? 'Restore access for this account?'
          : 'They will not be able to create or join orders.',
        confirmLabel: banned ? 'Unban' : 'Ban',
        destructive: !banned,
      });
      if (!ok) return;
      setActing(true);
      try {
        const nextBanned = !banned;
        adminLog('user-detail', 'updateDoc users.banned', {
          userId,
          banned: nextBanned,
        });
        await updateDoc(doc(db, 'users', userId), {
          banned: nextBanned ? true : false,
        });
      } catch (e) {
        showError(getUserFriendlyError(e));
      } finally {
        setActing(false);
      }
    })();
  };

  const deleteUser = () => {
    if (!userId) return;
    void (async () => {
      const ok = await systemConfirm({
        title: 'Delete user document',
        message:
          'Permanently delete this Firestore user profile? Auth account is not deleted.',
        confirmLabel: 'Delete',
        destructive: true,
      });
      if (!ok) return;
      setActing(true);
      try {
        await deleteDoc(doc(db, 'users', userId));
        showSuccess('User document removed.');
        router.replace(adminRoutes.users as never);
      } catch (e) {
        showError(getUserFriendlyError(e));
      } finally {
        setActing(false);
      }
    })();
  };

  if (!userId) {
    return (
      <SafeAreaView style={styles.screen}>
        <Text style={styles.muted}>Invalid user id</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <AdminHeader
        title="User profile"
        backTo={adminRoutes.users}
        backLabel="Users"
      />
      {profileLoading && !profile ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.card}>
            <Text style={styles.k}>Display name</Text>
            <Text style={styles.v}>{displayName}</Text>
            <Text style={styles.k}>Email</Text>
            <Text style={styles.v}>{email ?? '—'}</Text>
            {phone ? (
              <>
                <Text style={styles.k}>Phone</Text>
                <Text style={styles.v}>{phone}</Text>
              </>
            ) : null}
            <Text style={styles.k}>User id</Text>
            <Text style={styles.mono}>{userId}</Text>
            <Text style={styles.k}>Member since</Text>
            <Text style={styles.v}>{formatFirestoreTime(profile?.createdAt)}</Text>
          </View>

          <View style={styles.rowStats}>
            <View style={styles.stat}>
              <Text style={styles.statN}>{stats.total}</Text>
              <Text style={styles.statL}>Total orders</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statN}>{stats.active}</Text>
              <Text style={styles.statL}>Active</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statN}>{stats.completed}</Text>
              <Text style={styles.statL}>Completed</Text>
            </View>
          </View>

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.btn, banned ? styles.btnOk : styles.btnWarn]}
              onPress={toggleBan}
              disabled={acting}
            >
              <Text style={styles.btnText}>
                {banned ? 'Unban user' : 'Ban user'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.btnDanger]}
              onPress={deleteUser}
              disabled={acting}
            >
              <Text style={styles.btnDangerText}>Delete user doc</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.section}>Orders</Text>
          {orderList.length === 0 ? (
            <Text style={styles.muted}>No order activity found.</Text>
          ) : (
            orderList.map((o) => (
              <TouchableOpacity
                key={o.id}
                style={styles.card}
                onPress={() => router.push(adminRoutes.order(o.id) as never)}
              >
                <Text style={styles.orderT}>{o.title}</Text>
                <Text style={styles.meta}>
                  {o.role} · {o.status}
                </Text>
                <Text style={styles.meta}>{o.createdAt}</Text>
                <Text style={styles.link}>Order details →</Text>
              </TouchableOpacity>
            ))
          )}

          <Text style={styles.section}>Reports against this user</Text>
          {reports.length === 0 ? (
            <Text style={styles.muted}>None</Text>
          ) : (
            reports.map((r) => (
              <TouchableOpacity
                key={r.id}
                style={styles.card}
                onPress={() => router.push(adminRoutes.report(r.id) as never)}
              >
                <Text style={styles.meta}>{r.createdAt}</Text>
                <Text style={styles.v}>{r.reason ?? '—'}</Text>
                {r.detail ? (
                  <Text style={styles.preview} numberOfLines={3}>
                    {r.detail}
                  </Text>
                ) : null}
                {r.adminResolution ? (
                  <Text style={styles.res}>{r.adminResolution}</Text>
                ) : null}
                <Text style={styles.link}>Open report →</Text>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { padding: 16, paddingBottom: 40 },
  card: { ...adminCardShell, marginBottom: 12, padding: theme.spacing.md },
  k: { fontSize: 12, color: COLORS.textMuted, marginBottom: 2 },
  v: { fontSize: 16, color: COLORS.text, marginBottom: 10 },
  mono: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginBottom: 10,
    fontFamily: 'Menlo',
  },
  rowStats: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  stat: {
    flex: 1,
    backgroundColor: COLORS.card,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statN: { fontSize: 22, fontWeight: '800', color: COLORS.text },
  statL: { fontSize: 12, color: COLORS.textMuted, marginTop: 4 },
  actions: { gap: 10, marginBottom: 8 },
  btn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  btnOk: { backgroundColor: COLORS.successBg },
  btnWarn: { backgroundColor: COLORS.dangerBg },
  btnDanger: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.error,
  },
  btnText: { fontWeight: '800', color: COLORS.text },
  btnDangerText: { fontWeight: '800', color: COLORS.error },
  section: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
    marginTop: 16,
    marginBottom: 10,
  },
  orderT: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  meta: { fontSize: 13, color: COLORS.textMuted, marginTop: 4 },
  link: { marginTop: 8, color: COLORS.primary, fontWeight: '700' },
  muted: { color: COLORS.textMuted, marginBottom: 8 },
  preview: { fontSize: 13, color: COLORS.textMuted, marginTop: 6 },
  res: { marginTop: 6, color: COLORS.successText, fontWeight: '600' },
});
