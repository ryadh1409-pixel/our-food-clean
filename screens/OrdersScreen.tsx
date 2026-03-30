import { useAuth } from '@/services/AuthContext';
import { db } from '@/services/firebase';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  collection,
  onSnapshot,
  query,
  where,
  type QuerySnapshot,
} from 'firebase/firestore';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const TAB_SPINNER = '#34D399';

type OrderItem = {
  id: string;
  restaurantName: string;
  status: string;
  totalPrice: number;
  createdAt: number | null;
};

function GlassBar({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: object;
}) {
  if (Platform.OS === 'ios') {
    return (
      <BlurView intensity={55} tint="dark" style={[styles.glass, style]}>
        {children}
      </BlurView>
    );
  }
  return (
    <View style={[styles.glass, styles.glassAndroid, style]}>{children}</View>
  );
}

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
        const rawCreated = data?.createdAt;
        let createdAt: number | null = null;
        if (
          rawCreated &&
          typeof rawCreated === 'object' &&
          'toMillis' in rawCreated &&
          typeof (rawCreated as { toMillis: () => number }).toMillis ===
            'function'
        ) {
          createdAt = (rawCreated as { toMillis: () => number }).toMillis();
        } else if (typeof rawCreated === 'number') {
          createdAt = rawCreated;
        }
        byId.set(d.id, {
          id: d.id,
          restaurantName:
            typeof data?.restaurantName === 'string' &&
            data.restaurantName.trim()
              ? data.restaurantName
              : 'Restaurant',
          status: typeof data?.status === 'string' ? data.status : '—',
          totalPrice: Number(data?.totalPrice ?? 0),
          createdAt,
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

  const renderItem = ({ item }: { item: OrderItem }) => (
    <Pressable
      style={({ pressed }) => [
        styles.orderCard,
        pressed && styles.orderCardPressed,
      ]}
      onPress={() => handleOrderPress(item.id)}
    >
      <Text style={styles.cardRestaurant} numberOfLines={2}>
        {item.restaurantName}
      </Text>
      <View style={styles.metaRow}>
        <View style={styles.metaPill}>
          <MaterialIcons name="flag" size={14} color="#7DD3FC" />
          <Text style={styles.metaPillText} numberOfLines={1}>
            {item.status}
          </Text>
        </View>
        <View style={styles.metaPill}>
          <MaterialIcons name="payments" size={14} color="#A7F3D0" />
          <Text style={styles.metaPillText}>
            ${item.totalPrice.toFixed(2)}
          </Text>
        </View>
      </View>
      <View style={styles.chevronRow}>
        <Text style={styles.openHint}>Open order</Text>
        <MaterialIcons
          name="chevron-right"
          size={20}
          color="rgba(255,255,255,0.35)"
        />
      </View>
    </Pressable>
  );

  if (uid == null) {
    return (
      <View style={styles.root}>
        <StatusBar style="light" />
        <SafeAreaView style={styles.safe} edges={['top']}>
          <GlassBar style={styles.headerBar}>
            <View style={styles.headerInner}>
              <Text style={styles.headerTitle}>Orders</Text>
              <Text style={styles.headerSub}>Sign in to see your activity</Text>
            </View>
          </GlassBar>
          <View style={styles.centerBlock}>
            <View style={styles.emptyPanel}>
              <MaterialIcons
                name="receipt-long"
                size={48}
                color="rgba(255,255,255,0.2)"
              />
              <Text style={styles.emptyTitle}>Your orders live here</Text>
              <Text style={styles.emptySub}>
                Sign in to track orders you host or join.
              </Text>
              <Pressable style={styles.primaryBtn} onPress={handleSignIn}>
                <Text style={styles.primaryBtnText}>Sign in</Text>
              </Pressable>
            </View>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.root}>
        <StatusBar style="light" />
        <SafeAreaView style={styles.safe} edges={['top']}>
          <GlassBar style={styles.headerBar}>
            <View style={styles.headerInner}>
              <Text style={styles.headerTitle}>Orders</Text>
            </View>
          </GlassBar>
          <View style={[styles.centerBlock, styles.flexCenter]}>
            <ActivityIndicator size="large" color={TAB_SPINNER} />
          </View>
        </SafeAreaView>
      </View>
    );
  }

  if (orders.length === 0) {
    return (
      <View style={styles.root}>
        <StatusBar style="light" />
        <SafeAreaView style={styles.safe} edges={['top']}>
          <GlassBar style={styles.headerBar}>
            <View style={styles.headerInner}>
              <Text style={styles.headerTitle}>Orders</Text>
              <Text style={styles.headerSub}>Your recent activity</Text>
            </View>
          </GlassBar>
          <View style={styles.centerBlock}>
            <View style={styles.emptyPanel}>
              <MaterialIcons
                name="restaurant"
                size={48}
                color="rgba(255,255,255,0.2)"
              />
              <Text style={styles.emptyTitle}>No orders yet</Text>
              <Text style={styles.emptySub}>
                Create or join an order and it will show up here.
              </Text>
              <Pressable
                style={styles.primaryBtn}
                onPress={() => router.push('/order/create')}
              >
                <Text style={styles.primaryBtnText}>Create order</Text>
              </Pressable>
            </View>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <GlassBar style={styles.headerBar}>
          <View style={styles.headerInner}>
            <Text style={styles.headerTitle}>Orders</Text>
            <Text style={styles.headerSub}>{orders.length} total</Text>
          </View>
        </GlassBar>
        <FlatList
          data={orders}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#06080C',
  },
  safe: {
    flex: 1,
  },
  glass: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  glassAndroid: {
    backgroundColor: 'rgba(18,22,30,0.92)',
  },
  headerBar: {
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 14,
  },
  headerInner: {
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  headerTitle: {
    color: '#F8FAFC',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  headerSub: {
    marginTop: 4,
    color: 'rgba(255,255,255,0.45)',
    fontSize: 14,
    fontWeight: '600',
  },
  centerBlock: {
    flex: 1,
    paddingHorizontal: 18,
  },
  flexCenter: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyPanel: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#0E1218',
    borderRadius: 26,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 24,
  },
  emptyTitle: {
    color: '#F1F5F9',
    fontSize: 20,
    fontWeight: '800',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySub: {
    color: 'rgba(255,255,255,0.48)',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
    paddingHorizontal: 8,
  },
  primaryBtn: {
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(52, 211, 153, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.4)',
  },
  primaryBtnText: {
    color: '#A7F3D0',
    fontWeight: '700',
    fontSize: 16,
  },
  listContent: {
    paddingHorizontal: 18,
    paddingBottom: 28,
  },
  orderCard: {
    backgroundColor: '#11161F',
    borderRadius: 20,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.35,
        shadowRadius: 16,
      },
      android: { elevation: 10 },
      default: {},
    }),
  },
  orderCardPressed: {
    opacity: 0.92,
  },
  cardRestaurant: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 12,
    letterSpacing: -0.2,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  metaPillText: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 13,
    fontWeight: '600',
    maxWidth: 200,
  },
  chevronRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 14,
    gap: 4,
  },
  openHint: {
    color: 'rgba(52, 211, 153, 0.85)',
    fontSize: 13,
    fontWeight: '700',
  },
});
