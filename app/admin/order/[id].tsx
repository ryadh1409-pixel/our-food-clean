import { AdminHeader } from '@/components/admin/AdminHeader';
import { adminRoutes } from '@/constants/adminRoutes';
import { adminCardShell, adminColors as COLORS } from '@/constants/adminTheme';
import { theme } from '@/constants/theme';
import { adminLog } from '@/lib/admin/adminDebug';
import { adminDeleteOrderDeep } from '@/lib/admin/deleteOrderAdmin';
import {
  formatFirestoreTime,
  formatMillisToronto,
  formatParticipantPreview,
  orderCreatorUid,
  orderDisplayPriceLabel,
  orderDisplayTitle,
  orderExpiresAtMs,
  orderParticipantUids,
} from '@/lib/admin/orderHelpers';
import { db } from '@/services/firebase';
import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { useLocalSearchParams, useRouter } from 'expo-router';
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

import { systemConfirm } from '@/components/SystemDialogHost';
import { getUserFriendlyError } from '@/utils/errorHandler';
import { showError, showSuccess } from '@/utils/toast';

type Msg = { id: string; text: string; at: string; atMs: number };

export default function AdminOrderDetailScreen() {
  const router = useRouter();
  const { id: raw } = useLocalSearchParams<{ id: string }>();
  const orderId = typeof raw === 'string' ? raw.trim() : '';
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!orderId) {
      setLoading(false);
      return;
    }
    adminLog('order-detail', 'subscribe order + messages', { orderId });
    const od = doc(db, 'orders', orderId);
    const u1 = onSnapshot(od, (snap) => {
      adminLog('order-detail', 'order doc snapshot', {
        orderId,
        exists: snap.exists(),
      });
      setData(snap.exists() ? snap.data() ?? {} : {});
      setLoading(false);
    });
    const u2 = onSnapshot(
      collection(db, 'orders', orderId, 'messages'),
      (snap) => {
        adminLog('order-detail', `messages subcollection size: ${snap.size}`);
        const list: Msg[] = snap.docs.map((d) => {
          const m = d.data();
          const text =
            typeof m.text === 'string'
              ? m.text
              : typeof m.body === 'string'
                ? m.body
                : JSON.stringify(m).slice(0, 80);
          const c = m.createdAt;
          let atMs = 0;
          if (c && typeof c === 'object' && c !== null && 'toMillis' in c) {
            const fn = (c as { toMillis: () => number }).toMillis;
            if (typeof fn === 'function') atMs = fn.call(c);
          }
          return {
            id: d.id,
            text,
            at: formatFirestoreTime(m.createdAt),
            atMs,
          };
        });
        list.sort((a, b) => b.atMs - a.atMs);
        setMessages(list.slice(0, 25));
      },
    );
    return () => {
      u1();
      u2();
    };
  }, [orderId]);

  const setStatus = (next: string, title: string, body: string) => {
    if (!orderId) return;
    void (async () => {
      const ok = await systemConfirm({
        title,
        message: body,
        confirmLabel: 'Confirm',
        destructive: true,
      });
      if (!ok) return;
      setSaving(true);
      try {
        adminLog('order-detail', 'updateDoc order status', { orderId, status: next });
        await updateDoc(doc(db, 'orders', orderId), {
          status: next,
          adminStatusUpdatedAt: serverTimestamp(),
        });
        showSuccess(`Status: ${next}`);
      } catch (e) {
        showError(getUserFriendlyError(e));
      } finally {
        setSaving(false);
      }
    })();
  };

  const confirmDelete = () => {
    if (!orderId) return;
    void (async () => {
      const ok = await systemConfirm({
        title: 'Delete order',
        message:
          'Permanently remove this order and its messages/ratings subcollections?',
        confirmLabel: 'Delete',
        destructive: true,
      });
      if (!ok) return;
      setSaving(true);
      try {
        adminLog('order-detail', 'adminDeleteOrderDeep', { orderId });
        await adminDeleteOrderDeep(orderId);
        showSuccess('Order removed.');
        router.replace(adminRoutes.orders() as never);
      } catch (e) {
        showError(getUserFriendlyError(e));
      } finally {
        setSaving(false);
      }
    })();
  };

  if (!orderId) {
    return (
      <SafeAreaView style={styles.screen}>
        <Text style={styles.muted}>Invalid order</Text>
      </SafeAreaView>
    );
  }

  if (loading && !data) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!data || Object.keys(data).length === 0) {
    return (
      <SafeAreaView style={styles.screen} edges={['bottom']}>
        <AdminHeader title="Order" backTo={adminRoutes.orders()} backLabel="Orders" />
        <Text style={styles.muted}>Not found</Text>
      </SafeAreaView>
    );
  }

  const status = typeof data.status === 'string' ? data.status : '—';
  const record = data as Record<string, unknown>;
  const participantIds = orderParticipantUids(record);
  const creator = orderCreatorUid(record);
  const terminal = ['cancelled', 'completed', 'expired'].includes(status);
  const title = orderDisplayTitle(record, orderId);
  const price = orderDisplayPriceLabel(record);
  const expMs = orderExpiresAtMs(record);

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <AdminHeader
        title="Order"
        subtitle={orderId}
        backTo={adminRoutes.orders()}
        backLabel="Orders"
      />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.card}>
          <Text style={styles.k}>Title</Text>
          <Text style={styles.v}>{title}</Text>
          <Text style={styles.k}>Price</Text>
          <Text style={styles.v}>{price}</Text>
          <Text style={styles.k}>Order id</Text>
          <Text style={styles.mono}>{orderId}</Text>
          <Text style={styles.k}>Status</Text>
          <Text style={styles.v}>{status}</Text>
          <Text style={styles.k}>Created</Text>
          <Text style={styles.v}>{formatFirestoreTime(data.createdAt)}</Text>
          <Text style={styles.k}>Expires</Text>
          <Text style={styles.v}>
            {expMs != null ? formatMillisToronto(expMs) : '—'}
          </Text>
          <Text style={styles.k}>Creator</Text>
          <TouchableOpacity
            disabled={!creator}
            onPress={() =>
              creator
                ? router.push(adminRoutes.user(creator) as never)
                : undefined
            }
          >
            <Text style={[styles.v, !!creator && styles.link]}>
              {creator || '—'}
            </Text>
          </TouchableOpacity>
          <Text style={styles.k}>
            Participants ({participantIds.length}) —{' '}
            {formatParticipantPreview(participantIds, 6)}
          </Text>
          {participantIds.map((p) => (
            <TouchableOpacity
              key={p}
              onPress={() => router.push(adminRoutes.user(p) as never)}
            >
              <Text style={styles.part}>{p}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.section}>Messages (recent)</Text>
        {messages.length === 0 ? (
          <Text style={styles.muted}>No messages in this order thread.</Text>
        ) : (
          messages.map((m) => (
            <View key={m.id} style={styles.msgCard}>
              <Text style={styles.msgAt}>{m.at}</Text>
              <Text style={styles.msgText} numberOfLines={6}>
                {m.text}
              </Text>
            </View>
          ))
        )}

        {!terminal ? (
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.btn, styles.danger]}
              disabled={saving}
              onPress={() =>
                setStatus('cancelled', 'Cancel order', 'Mark this order as cancelled?')
              }
            >
              <Text style={styles.dangerT}>{saving ? '…' : 'Cancel order'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.ok]}
              disabled={saving}
              onPress={() =>
                setStatus(
                  'completed',
                  'Complete order',
                  'Mark this order as completed?',
                )
              }
            >
              <Text style={styles.okT}>{saving ? '…' : 'Mark completed'}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={styles.muted}>Terminal status — cancel/complete disabled.</Text>
        )}

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.btn, styles.deleteBtn]}
            disabled={saving}
            onPress={confirmDelete}
          >
            <Text style={styles.deleteT}>{saving ? '…' : 'Delete order (Firestore)'}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  centered: { flex: 1, justifyContent: 'center' },
  scroll: { padding: 16, paddingBottom: 40 },
  card: { ...adminCardShell, marginBottom: 16, padding: theme.spacing.md },
  k: { fontSize: 12, color: COLORS.textMuted, marginBottom: 2 },
  v: { fontSize: 15, color: COLORS.text, marginBottom: 8 },
  mono: { fontSize: 12, color: COLORS.textMuted, marginBottom: 10, fontFamily: 'Menlo' },
  link: { textDecorationLine: 'underline', color: COLORS.primary },
  part: {
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: '600',
    marginBottom: 6,
    fontFamily: 'Menlo',
  },
  section: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 10,
  },
  msgCard: {
    ...adminCardShell,
    marginBottom: 8,
    padding: 12,
  },
  msgAt: { fontSize: 11, color: COLORS.textMuted, marginBottom: 4 },
  msgText: { fontSize: 14, color: COLORS.text },
  muted: { color: COLORS.textMuted, marginBottom: 8 },
  actions: { gap: 12, marginTop: 16 },
  btn: { paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  danger: { backgroundColor: COLORS.dangerBg },
  dangerT: { fontWeight: '800', color: COLORS.error },
  ok: { backgroundColor: COLORS.successBg },
  okT: { fontWeight: '800', color: COLORS.successText },
  deleteBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.error,
  },
  deleteT: { fontWeight: '800', color: COLORS.error },
});
