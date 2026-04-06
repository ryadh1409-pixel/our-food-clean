import { useAuth } from '@/services/AuthContext';
import { db } from '@/services/firebase';
import { blockUser, submitUserReport } from '@/services/userSafety';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { systemActionSheet, systemConfirm } from '@/components/SystemDialogHost';
import { theme } from '@/constants/theme';
import { getUserFriendlyError } from '@/utils/errorHandler';
import { showError, showSuccess } from '@/utils/toast';

const c = theme.colors;

type PreviousOrder = {
  id: string;
  restaurantName: string;
  date: string;
  totalPrice: number;
  itemsCount?: number;
  /** Another participant on the order (for report/block). Null if only you or data missing. */
  otherUserId: string | null;
};

const REPORT_REASONS = [
  'Spam',
  'Inappropriate behavior',
  'Scam',
  'Other',
] as const;

export default function HelpScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [orders, setOrders] = useState<PreviousOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const uid = user?.uid ?? null;

  const loadOrders = useCallback(async () => {
    if (!uid) {
      setLoading(false);
      return;
    }
    try {
      const ordersRef = collection(db, 'orders');
      const q = query(
        ordersRef,
        where('participants', 'array-contains', uid),
        where('status', '==', 'completed'),
      );
      const snap = await getDocs(q);
      const list: PreviousOrder[] = [];
      snap.docs.forEach((d) => {
        const data = d.data();
        const createdAt =
          data?.createdAt?.toMillis?.() ?? data?.createdAt ?? Date.now();
        const plist: string[] = Array.isArray(data?.participants)
          ? data.participants.filter((x): x is string => typeof x === 'string')
          : [];
        const hostId =
          typeof data?.hostId === 'string' && data.hostId ? data.hostId : null;
        let otherUserId =
          plist.find((pid) => pid !== uid) ?? null;
        if (!otherUserId && hostId && hostId !== uid) {
          otherUserId = hostId;
        }
        list.push({
          id: d.id,
          restaurantName: data?.restaurantName ?? 'Unknown',
          date: new Date(createdAt).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          }),
          totalPrice:
            typeof data?.totalPrice === 'number' ? data.totalPrice : 0,
          itemsCount:
            typeof data?.itemsCount === 'number' ? data.itemsCount : undefined,
          otherUserId,
        });
      });
      setOrders(list);
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [uid]);

  React.useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const handleReportOrder = (order: PreviousOrder) => {
    void (async () => {
      const ok = await systemConfirm({
        title: 'Report a problem',
        message: `Report an issue with your order at ${order.restaurantName}? You can contact support with your order details.`,
        confirmLabel: 'Contact Support',
      });
      if (!ok) return;
      const subject = encodeURIComponent(
        `Issue with order - ${order.restaurantName}`,
      );
      const body = encodeURIComponent(
        `Order ID: ${order.id}\nRestaurant: ${order.restaurantName}\nDate: ${order.date}\nTotal: $${order.totalPrice.toFixed(2)}`,
      );
      const url = `mailto:support@halforder.app?subject=${subject}&body=${body}`;
      Linking.openURL(url).catch(() => {});
    })();
  };

  const handleReportUser = (order: PreviousOrder) => {
    const reportedId = order.otherUserId;
    if (!uid || !reportedId) return;
    void systemActionSheet({
      title: 'Report user',
      message: 'Select a reason',
      actions: REPORT_REASONS.map((reason) => ({
        label: reason,
        onPress: () => {
          void (async () => {
            try {
              await submitUserReport({
                reporterId: uid,
                reportedUserId: reportedId,
                orderId: order.id,
                reason,
              });
              showSuccess('Report submitted');
            } catch (e) {
              showError(getUserFriendlyError(e));
            }
          })();
        },
      })),
    });
  };

  const handleBlockUser = (order: PreviousOrder) => {
    const blockedId = order.otherUserId;
    if (!uid || !blockedId) return;
    void (async () => {
      const ok = await systemConfirm({
        title: 'Block user',
        message:
          'You will not see each other in join lists. You can still email support about this order.',
        confirmLabel: 'Block',
        destructive: true,
      });
      if (!ok) return;
      try {
        await blockUser(uid, blockedId);
        showSuccess('This user has been blocked.');
        await loadOrders();
      } catch (e) {
        showError(getUserFriendlyError(e));
      }
    })();
  };

  if (!uid) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.centered}>
          <Text style={styles.hint}>
            Sign in to see your orders and get help.
          </Text>
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
        <Text style={styles.headerTitle}>Help</Text>
      </View>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionLabel}>
          Previous orders — report a user, block, or contact support
        </Text>
        {loading ? (
          <ActivityIndicator
            size="large"
            color={c.primary}
            style={{ marginTop: 24 }}
          />
        ) : orders.length === 0 ? (
          <Text style={styles.emptyText}>No completed orders yet.</Text>
        ) : (
          orders.map((order) => (
            <View key={order.id} style={styles.orderCard}>
              <Text style={styles.orderRestaurant}>{order.restaurantName}</Text>
              <Text style={styles.orderDate}>{order.date}</Text>
              <Text style={styles.orderTotal}>
                Total: ${order.totalPrice.toFixed(2)}
              </Text>
              {order.itemsCount != null && (
                <Text style={styles.orderItems}>Items: {order.itemsCount}</Text>
              )}
              {order.otherUserId ? (
                <View style={styles.safetyRow}>
                  <TouchableOpacity
                    style={styles.safetyBtn}
                    onPress={() => handleReportUser(order)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.safetyBtnText}>Report user</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.safetyBtnDanger}
                    onPress={() => handleBlockUser(order)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.safetyBtnTextLight}>Block user</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <Text style={styles.reportHintMuted}>
                  No other participant linked — use email support below.
                </Text>
              )}
              <TouchableOpacity
                style={styles.supportBtn}
                onPress={() => handleReportOrder(order)}
                activeOpacity={0.8}
              >
                <Text style={styles.supportBtnText}>Email support</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  backText: {
    fontSize: 16,
    color: c.primary,
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: c.text,
    marginLeft: 16,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: c.textMuted,
    marginBottom: 12,
  },
  orderCard: {
    backgroundColor: c.background,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  orderRestaurant: {
    fontSize: 16,
    fontWeight: '700',
    color: c.text,
    marginBottom: 4,
  },
  orderDate: {
    fontSize: 14,
    color: c.textMuted,
    marginBottom: 4,
  },
  orderTotal: {
    fontSize: 14,
    fontWeight: '600',
    color: c.text,
    marginBottom: 2,
  },
  orderItems: {
    fontSize: 13,
    color: c.textMuted,
    marginBottom: 8,
  },
  reportHintMuted: {
    fontSize: 12,
    color: c.textMuted,
    marginTop: 8,
    marginBottom: 4,
  },
  safetyRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 12,
  },
  safetyBtn: {
    paddingVertical: 12,
    paddingHorizontal: theme.spacing.sm + 2,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.chromeWash,
    minHeight: theme.spacing.touchMin,
    justifyContent: 'center',
  },
  safetyBtnDanger: {
    paddingVertical: 12,
    paddingHorizontal: theme.spacing.sm + 2,
    borderRadius: theme.radius.sm,
    backgroundColor: c.danger,
    minHeight: theme.spacing.touchMin,
    justifyContent: 'center',
  },
  safetyBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: c.text,
  },
  safetyBtnTextLight: {
    fontSize: 14,
    fontWeight: '600',
    color: c.textOnPrimary,
  },
  supportBtn: {
    marginTop: theme.spacing.tight,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.button,
    borderWidth: 1,
    borderColor: c.primary,
    backgroundColor: c.warningBackground,
    minHeight: theme.spacing.touchMin,
  },
  supportBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: c.warningTextDark,
  },
  emptyText: {
    fontSize: 16,
    color: c.textMuted,
    marginTop: 16,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  hint: {
    fontSize: 16,
    color: c.textMuted,
  },
});
