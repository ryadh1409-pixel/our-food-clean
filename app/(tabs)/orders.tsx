import { useAuth } from '@/services/AuthContext';
import { db } from '@/services/firebase';
import { useRouter } from 'expo-router';
import {
  collection,
  onSnapshot,
  query,
  where,
  type QuerySnapshot,
} from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { theme } from '@/constants/theme';

type OrderItem = {
  id: string;
  restaurantName: string;
  status: string;
  totalPrice: number;
  createdAt: number | null;
};

export default function OrdersScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);

  const uid = user?.uid ?? null;
  const hostSnapRef = useRef<QuerySnapshot | null>(null);
  const participantSnapRef = useRef<QuerySnapshot | null>(null);
  const userIdSnapRef = useRef<QuerySnapshot | null>(null);

  useEffect(() => {
    if (!uid) {
      setOrders([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const ordersRef = collection(db, 'orders');
    const qHost = query(ordersRef, where('hostId', '==', uid));
    const qParticipant = query(
      ordersRef,
      where('participantIds', 'array-contains', uid),
    );
    const qUserId = query(ordersRef, where('userId', '==', uid));

    const mergeAndSort = () => {
      const hostSnap = hostSnapRef.current;
      const participantSnap = participantSnapRef.current;
      const userIdSnap = userIdSnapRef.current;
      if (!hostSnap || !participantSnap || !userIdSnap) return;
      const byId = new Map<string, OrderItem>();
      const add = (d: { id: string; data: () => Record<string, unknown> }) => {
        const data = d.data();
        const created =
          data?.createdAt?.toMillis?.() ?? data?.createdAt ?? null;
        byId.set(d.id, {
          id: d.id,
          restaurantName:
            typeof data?.restaurantName === 'string' &&
            data.restaurantName.trim()
              ? data.restaurantName
              : 'Restaurant',
          status: typeof data?.status === 'string' ? data.status : '—',
          totalPrice: Number(data?.totalPrice ?? 0),
          createdAt: created,
        });
      };
      hostSnap.docs.forEach(add);
      participantSnap.docs.forEach(add);
      userIdSnap.docs.forEach(add);
      const list = Array.from(byId.values()).sort((a, b) => {
        const aTime = a.createdAt ?? 0;
        const bTime = b.createdAt ?? 0;
        return bTime - aTime;
      });
      setOrders(list);
      setLoading(false);
    };

    const unsubHost = onSnapshot(
      qHost,
      (snap) => {
        hostSnapRef.current = snap;
        mergeAndSort();
      },
      () => {
        setOrders([]);
        setLoading(false);
      },
    );

    const unsubParticipant = onSnapshot(
      qParticipant,
      (snap) => {
        participantSnapRef.current = snap;
        mergeAndSort();
      },
      () => {
        setOrders([]);
        setLoading(false);
      },
    );

    const unsubUserId = onSnapshot(
      qUserId,
      (snap) => {
        userIdSnapRef.current = snap;
        mergeAndSort();
      },
      () => {
        setOrders([]);
        setLoading(false);
      },
    );

    return () => {
      unsubHost();
      unsubParticipant();
      unsubUserId();
    };
  }, [uid]);

  const handleSignIn = () => {
    router.push('/(auth)/login?redirectTo=/(tabs)/orders');
  };

  const handleOrderPress = (orderId: string) => {
    router.push(`/order/${orderId}` as const);
  };

  if (uid == null) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Text style={styles.title}>Orders</Text>
        <View style={styles.content}>
          <View style={styles.illustrationPlaceholder}>
            <Text style={styles.placeholderCaption}>
              Sign in to see your orders
            </Text>
          </View>
          <Text style={styles.mainText}>Your orders will appear here</Text>
          <Text style={styles.subtext}>
            Sign in to see your previous and current orders
          </Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleSignIn}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryButtonText}>Sign In</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Text style={styles.title}>Orders</Text>
        <View style={[styles.content, styles.centered]}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (orders.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Text style={styles.title}>Orders</Text>
        <View style={styles.content}>
          <Text style={styles.mainText}>No orders yet</Text>
          <Text style={styles.subtext}>
            Create or join an order to see it here
          </Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => router.push('/order/create')}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryButtonText}>Create Order</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const renderItem = ({ item }: { item: OrderItem }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => handleOrderPress(item.id)}
      activeOpacity={0.85}
    >
      <Text style={styles.cardRestaurant}>{item.restaurantName}</Text>
      <View style={styles.cardRow}>
        <Text style={styles.cardLabel}>Status: </Text>
        <Text style={styles.cardValue}>{item.status}</Text>
      </View>
      <View style={styles.cardRow}>
        <Text style={styles.cardLabel}>Total: </Text>
        <Text style={styles.cardValue}>${item.totalPrice.toFixed(2)}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Text style={styles.title}>Orders</Text>
      <FlatList
        data={orders}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.colors.text,
    paddingHorizontal: theme.spacing.screen,
    paddingTop: 24,
    paddingBottom: 16,
  },
  content: {
    flex: 1,
    paddingHorizontal: theme.spacing.screen,
    alignItems: 'center',
    paddingTop: 24,
  },
  centered: { justifyContent: 'center' },
  illustrationPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
    minHeight: 80,
  },
  placeholderCaption: {
    fontSize: 14,
    color: theme.colors.textMuted,
  },
  mainText: {
    fontSize: 17,
    fontWeight: '600',
    color: theme.colors.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtext: {
    fontSize: 15,
    color: theme.colors.textMuted,
    textAlign: 'center',
    marginBottom: 28,
  },
  primaryButton: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: theme.radius.button,
  },
  primaryButtonText: {
    color: theme.colors.textOnPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  listContent: {
    paddingHorizontal: theme.spacing.screen,
    paddingBottom: 24,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.card,
    padding: 16,
    marginBottom: 12,
  },
  cardRestaurant: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 8,
  },
  cardRow: { flexDirection: 'row', marginBottom: 4 },
  cardLabel: { fontSize: 14, color: theme.colors.textMuted },
  cardValue: { fontSize: 14, fontWeight: '600', color: theme.colors.text },
});
