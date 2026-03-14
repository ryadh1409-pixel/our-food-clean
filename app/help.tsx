import { useAuth } from '@/services/AuthContext';
import { db } from '@/services/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import React, { useCallback, useState } from 'react';
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

const COLORS = {
  background: '#FFFFFF',
  primary: '#FFD54F',
  text: '#1A1A1A',
  textMuted: '#6B7280',
  border: '#E5E7EB',
} as const;

type PreviousOrder = {
  id: string;
  restaurantName: string;
  date: string;
  totalPrice: number;
  itemsCount?: number;
};

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
        where('participantIds', 'array-contains', uid),
        where('status', '==', 'completed'),
      );
      const snap = await getDocs(q);
      const list: PreviousOrder[] = [];
      snap.docs.forEach((d) => {
        const data = d.data();
        const createdAt =
          data?.createdAt?.toMillis?.() ?? data?.createdAt ?? Date.now();
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
    Alert.alert(
      'Report a problem',
      `Report an issue with your order at ${order.restaurantName}? You can contact support with your order details.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Contact Support',
          onPress: () => {
            const subject = encodeURIComponent(
              `Issue with order - ${order.restaurantName}`,
            );
            const body = encodeURIComponent(
              `Order ID: ${order.id}\nRestaurant: ${order.restaurantName}\nDate: ${order.date}\nTotal: $${order.totalPrice.toFixed(2)}`,
            );
            const url = `mailto:support@halforder.app?subject=${subject}&body=${body}`;
            Linking.openURL(url).catch(() => {});
          },
        },
      ],
    );
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
          Previous orders — tap to report a problem
        </Text>
        {loading ? (
          <ActivityIndicator
            size="large"
            color={COLORS.primary}
            style={{ marginTop: 24 }}
          />
        ) : orders.length === 0 ? (
          <Text style={styles.emptyText}>No completed orders yet.</Text>
        ) : (
          orders.map((order) => (
            <TouchableOpacity
              key={order.id}
              style={styles.orderCard}
              onPress={() => handleReportOrder(order)}
              activeOpacity={0.8}
            >
              <Text style={styles.orderRestaurant}>{order.restaurantName}</Text>
              <Text style={styles.orderDate}>{order.date}</Text>
              <Text style={styles.orderTotal}>
                Total: ${order.totalPrice.toFixed(2)}
              </Text>
              {order.itemsCount != null && (
                <Text style={styles.orderItems}>Items: {order.itemsCount}</Text>
              )}
              <Text style={styles.reportHint}>Tap to report a problem</Text>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backText: {
    fontSize: 16,
    color: COLORS.primary,
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    marginLeft: 16,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textMuted,
    marginBottom: 12,
  },
  orderCard: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  orderRestaurant: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 4,
  },
  orderDate: {
    fontSize: 14,
    color: COLORS.textMuted,
    marginBottom: 4,
  },
  orderTotal: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 2,
  },
  orderItems: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginBottom: 8,
  },
  reportHint: {
    fontSize: 12,
    color: COLORS.primary,
    fontWeight: '600',
  },
  emptyText: {
    fontSize: 16,
    color: COLORS.textMuted,
    marginTop: 16,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  hint: {
    fontSize: 16,
    color: COLORS.textMuted,
  },
});
