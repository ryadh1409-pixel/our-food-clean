import { useAuth } from '@/services/AuthContext';
import { db } from '@/services/firebase';
import {
  deriveLifecycleForViewer,
  formatOrderCountdown,
  leaveOrderParticipant,
} from '@/services/orderLifecycle';
import { cancelHalfOrder } from '@/services/halfOrderCancel';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  collection,
  doc,
  onSnapshot,
  query,
  updateDoc,
  where,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FoodCardPaymentDisclaimer } from '@/components/FoodCardPaymentDisclaimer';
import { systemConfirm } from '@/components/SystemDialogHost';
import { getUserFriendlyError } from '@/utils/errorHandler';
import { showError } from '@/utils/toast';

const TAB_SPINNER = '#34D399';

type OrderItem = {
  id: string;
  restaurantName: string;
  status: string;
  totalPrice: number;
  createdAt: number | null;
  createdBy: string;
  participants: string[];
  /** HalfOrder `users` (food-card swipe). */
  halfUsers: string[];
  usesHalf: boolean;
  maxPeople: number;
  joinedAtMap: unknown;
  isSuggested?: boolean;
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
  const [loadError, setLoadError] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const uid = user?.uid ?? null;

  useEffect(() => {
    if (!uid) {
      setOrders([]);
      setLoading(false);
      return;
    }

    console.log('UID:', uid);

    setLoading(true);
    const ordersRef = collection(db, 'orders');
    const qParticipants = query(
      ordersRef,
      where('participants', 'array-contains', uid),
    );
    const qUsers = query(ordersRef, where('users', 'array-contains', uid));

    const onListenError = () => {
      setLoadError(true);
      setOrders([]);
      setLoading(false);
    };

    let listPart: OrderItem[] = [];
    let listUsers: OrderItem[] = [];
    let heardPart = false;
    let heardUsers = false;

    function mapOrderDoc(d: QueryDocumentSnapshot): OrderItem {
      const data = d.data() as Record<string, unknown>;
      const rawCreated = data?.createdAt;
      let createdAt: number | null = null;
      if (
        rawCreated &&
        typeof rawCreated === 'object' &&
        'toMillis' in rawCreated &&
        typeof (rawCreated as { toMillis: () => number }).toMillis === 'function'
      ) {
        createdAt = (rawCreated as { toMillis: () => number }).toMillis();
      } else if (typeof rawCreated === 'number') {
        createdAt = rawCreated;
      }
      const createdBy =
        typeof data?.createdBy === 'string' && data.createdBy.trim()
          ? data.createdBy
          : typeof data?.userId === 'string' && data.userId.trim()
            ? data.userId
            : typeof data?.hostId === 'string' && data.hostId.trim()
              ? data.hostId
              : '';
      const participants: string[] = Array.isArray(data?.participants)
        ? data.participants.filter((x): x is string => typeof x === 'string')
        : [];
      const halfUsers: string[] = Array.isArray(data?.users)
        ? data.users.filter((x): x is string => typeof x === 'string')
        : [];
      const usesHalf = halfUsers.length > 0;
      const maxPeople =
        typeof data?.maxPeople === 'number' && data.maxPeople > 0
          ? data.maxPeople
          : typeof data?.maxUsers === 'number' && data.maxUsers > 0
            ? data.maxUsers
            : 2;
      return {
        id: d.id,
        restaurantName:
          typeof data?.restaurantName === 'string' && data.restaurantName.trim()
            ? data.restaurantName
            : typeof data?.foodName === 'string' && String(data.foodName).trim()
              ? String(data.foodName)
              : 'Restaurant',
        status: typeof data?.status === 'string' ? data.status : '—',
        totalPrice: Number(data?.totalPrice ?? 0),
        createdAt,
        createdBy,
        participants,
        halfUsers,
        usesHalf,
        maxPeople,
        joinedAtMap: data?.joinedAtMap,
        isSuggested: data?.isSuggested === true,
      };
    }

    const merge = () => {
      if (!heardPart || !heardUsers) return;
      const byId = new Map<string, OrderItem>();
      [...listPart, ...listUsers].forEach((row) => byId.set(row.id, row));
      const merged = [...byId.values()].sort(
        (a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0),
      );
      setOrders(merged);
      setLoadError(false);
      setLoading(false);
    };

    const unsubPart = onSnapshot(
      qParticipants,
      (snap) => {
        listPart = snap.docs.map(mapOrderDoc);
        heardPart = true;
        merge();
      },
      onListenError,
    );

    const unsubUsers = onSnapshot(
      qUsers,
      (snap) => {
        listUsers = snap.docs.map(mapOrderDoc);
        heardUsers = true;
        merge();
      },
      onListenError,
    );

    return () => {
      unsubPart();
      unsubUsers();
    };
  }, [uid, retryNonce]);

  const handleSignIn = () => {
    router.push('/(auth)/login?redirectTo=/(tabs)/orders');
  };

  const handleOrderPress = (orderId: string) => {
    router.push(`/order/${orderId}` as const);
  };

  const statusLower = (s: string) => s.trim().toLowerCase();
  const activeOrders = orders.filter((order) => {
    const s = statusLower(order.status);
    return (
      s !== 'cancelled' &&
      s !== 'completed' &&
      s !== 'expired'
    );
  });
  const completedOrders = orders.filter(
    (order) => statusLower(order.status) === 'completed',
  );
  const cancelledOrders = orders.filter(
    (order) => statusLower(order.status) === 'cancelled',
  );

  const handleCancelOrLeave = (item: OrderItem) => {
    if (!uid || cancellingId) return;
    const isHost = item.createdBy === uid;
    const raw = item.status.toLowerCase();
    if (raw === 'cancelled' || raw === 'completed' || raw === 'expired') return;

    if (isHost) {
      void (async () => {
        const ok = await systemConfirm({
          title: 'Cancel order',
          message: 'Cancel this order for everyone?',
          confirmLabel: 'Cancel order',
          cancelLabel: 'No',
          destructive: true,
        });
        if (!ok) return;
        setCancellingId(item.id);
        try {
          if (item.usesHalf) {
            await cancelHalfOrder(item.id);
          } else {
            await updateDoc(doc(db, 'orders', item.id), {
              status: 'cancelled',
            });
          }
        } catch (e) {
          showError(getUserFriendlyError(e));
        } finally {
          setCancellingId(null);
        }
      })();
      return;
    }

    void (async () => {
      const ok = await systemConfirm({
        title: 'Leave order',
        message: 'Remove yourself from this order?',
        confirmLabel: 'Leave',
        cancelLabel: 'No',
        destructive: true,
      });
      if (!ok) return;
      setCancellingId(item.id);
      try {
        await leaveOrderParticipant(db, item.id, uid);
      } catch (e) {
        showError(getUserFriendlyError(e));
      } finally {
        setCancellingId(null);
      }
    })();
  };

  const renderOrderCard = (item: OrderItem, disabled = false) => {
    const u = uid ?? '';
    const lifecycleParticipants = item.usesHalf ? item.halfUsers : item.participants;
    const { lifecycle, remainingMs } = deriveLifecycleForViewer({
      uid: u,
      createdBy: item.createdBy,
      participants: lifecycleParticipants,
      joinedAtMap: item.joinedAtMap,
      orderStatus: item.status,
      now: nowTick,
    });
    const lifecycleLabel =
      lifecycle === 'cancelled'
        ? 'cancelled'
        : lifecycle === 'completed'
          ? 'completed'
          : lifecycle === 'waiting'
            ? 'waiting'
            : lifecycle === 'matched'
              ? 'matched'
              : lifecycle === 'expired'
                ? 'expired'
                : 'active';
    const userCount = item.usesHalf ? item.halfUsers.length : item.participants.length;
    const countdownLabel =
      lifecycleParticipants.includes(u) &&
      remainingMs != null &&
      remainingMs > 0
        ? formatOrderCountdown(remainingMs)
        : null;
    const canCancel =
      !disabled &&
      u &&
      item.status.toLowerCase() !== 'expired' &&
      item.status !== 'cancelled' &&
      !(item.usesHalf && item.createdBy !== u);

    return (
      <View style={[styles.orderCardWrap, disabled && styles.orderCardDisabled]}>
        <Pressable
          style={({ pressed }) => [
            styles.orderCard,
            pressed && !disabled && styles.orderCardPressed,
          ]}
          onPress={() => {
            if (!disabled) handleOrderPress(item.id);
          }}
          disabled={disabled}
        >
          <Text style={styles.cardRestaurant} numberOfLines={2}>
            {item.restaurantName}
          </Text>
          {item.isSuggested ? (
            <View style={styles.suggestedBanner}>
              <Text style={styles.suggestedBannerTitle}>Suggested order</Text>
              <Text style={styles.suggestedBannerNote}>
                Others can join once you create it
              </Text>
            </View>
          ) : null}
          <View style={styles.metaRow}>
            <View style={styles.metaPill}>
              <MaterialIcons name="flag" size={14} color="#7DD3FC" />
              <Text style={styles.metaPillText} numberOfLines={1}>
                {lifecycleLabel}
              </Text>
            </View>
            <View style={styles.metaPill}>
              <MaterialIcons name="payments" size={14} color="#A7F3D0" />
              <Text style={styles.metaPillText}>
                ${item.totalPrice.toFixed(2)}
              </Text>
            </View>
            {item.usesHalf ? (
              <View style={styles.metaPill}>
                <MaterialIcons name="people" size={14} color="#FBBF24" />
                <Text style={styles.metaPillText}>
                  {userCount}/{item.maxPeople}
                </Text>
              </View>
            ) : null}
          </View>
          {item.usesHalf ? (
            <Pressable
              style={styles.chatLinkBtn}
              onPress={() => router.push(`/chat/${item.id}` as never)}
            >
              <MaterialIcons name="chat" size={18} color="#7dd3fc" />
              <Text style={styles.chatLinkText}>Order chat</Text>
            </Pressable>
          ) : null}
          {countdownLabel ? (
            <Text style={styles.countdownText}>{countdownLabel}</Text>
          ) : null}
          {disabled ? (
            <Text style={styles.cancelledTag}>Cancelled</Text>
          ) : null}
          <FoodCardPaymentDisclaimer style={styles.orderCardCoordinationNote} />
          <View style={styles.chevronRow}>
            <Text style={styles.openHint}>Open order</Text>
            <MaterialIcons
              name="chevron-right"
              size={20}
              color="rgba(255,255,255,0.35)"
            />
          </View>
        </Pressable>
        {canCancel ? (
          <Pressable
            style={({ pressed }) => [
              styles.cancelBtn,
              pressed && styles.cancelBtnPressed,
              cancellingId === item.id && styles.cancelBtnDisabled,
            ]}
            onPress={() => handleCancelOrLeave(item)}
            disabled={cancellingId !== null}
          >
            <Text style={styles.cancelBtnText}>
              {item.createdBy === u ? 'Cancel order' : 'Cancel'}
            </Text>
          </Pressable>
        ) : null}
      </View>
    );
  };

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
            <Text style={styles.loadingCaption}>Loading your orders…</Text>
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
              <Text style={styles.emptyTitle}>
                {loadError ? 'Could not load orders' : 'No orders yet'}
              </Text>
              <Text style={styles.emptySub}>
                {loadError
                  ? 'Check your network connection, then try again.'
                  : 'No active orders yet — start one and others can join.'}
              </Text>
              {loadError ? (
                <Pressable
                  style={styles.primaryBtn}
                  onPress={() => {
                    setLoadError(false);
                    setLoading(true);
                    setRetryNonce((n) => n + 1);
                  }}
                >
                  <Text style={styles.primaryBtnText}>Try again</Text>
                </Pressable>
              ) : (
                <Pressable
                  style={styles.primaryBtn}
                  onPress={() => router.push('/(tabs)/index')}
                >
                  <Text style={styles.primaryBtnText}>Go to Swipe</Text>
                </Pressable>
              )}
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
        <ScrollView
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.sectionTitle}>Active</Text>
          {activeOrders.length > 0 ? (
            activeOrders.map((order) => (
              <View key={order.id}>{renderOrderCard(order)}</View>
            ))
          ) : (
            <Text style={styles.emptySectionText}>
              No active orders — waiting, matched, or in-progress chats appear here
            </Text>
          )}

          {completedOrders.length > 0 ? (
            <>
              <Text style={styles.sectionTitleMuted}>Completed</Text>
              {completedOrders.map((order) => (
                <View key={order.id}>{renderOrderCard(order, true)}</View>
              ))}
            </>
          ) : null}

          {cancelledOrders.length > 0 ? (
            <>
              <Text style={styles.sectionTitleMuted}>Cancelled</Text>
              {cancelledOrders.map((order) => (
                <View key={order.id}>{renderOrderCard(order, true)}</View>
              ))}
            </>
          ) : null}
        </ScrollView>
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
  loadingCaption: {
    marginTop: 14,
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    fontWeight: '600',
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
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 10,
  },
  sectionTitleMuted: {
    fontSize: 18,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.45)',
    marginTop: 20,
    marginBottom: 10,
  },
  emptySectionText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.45)',
    marginBottom: 8,
  },
  orderCardWrap: {
    marginBottom: 12,
  },
  orderCard: {
    backgroundColor: '#11161F',
    borderRadius: 20,
    padding: 18,
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
  orderCardDisabled: {
    opacity: 0.5,
  },
  countdownText: {
    marginTop: 10,
    color: 'rgba(250, 204, 21, 0.95)',
    fontSize: 14,
    fontWeight: '700',
  },
  chatLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(125, 211, 252, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(125, 211, 252, 0.35)',
  },
  chatLinkText: {
    marginLeft: 8,
    color: '#7dd3fc',
    fontWeight: '700',
    fontSize: 14,
  },
  cancelBtn: {
    marginTop: 10,
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(248, 113, 113, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(248, 113, 113, 0.4)',
  },
  cancelBtnPressed: {
    opacity: 0.85,
  },
  cancelBtnDisabled: {
    opacity: 0.45,
  },
  cancelBtnText: {
    color: '#FCA5A5',
    fontSize: 14,
    fontWeight: '700',
  },
  cardRestaurant: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 12,
    letterSpacing: -0.2,
  },
  suggestedBanner: {
    marginBottom: 12,
    padding: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(52, 211, 153, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.25)',
  },
  suggestedBannerTitle: {
    color: '#A7F3D0',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  suggestedBannerNote: {
    color: 'rgba(248,250,252,0.55)',
    fontSize: 12,
    marginTop: 4,
    fontStyle: 'italic',
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
  orderCardCoordinationNote: {
    marginTop: 12,
    alignSelf: 'stretch',
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
  cancelledTag: {
    marginTop: 10,
    color: 'rgba(255,255,255,0.45)',
    fontSize: 13,
    fontWeight: '700',
  },
});
