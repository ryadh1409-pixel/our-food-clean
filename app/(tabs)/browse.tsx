import AppLogo from '@/components/AppLogo';
import MatchAlert from '@/components/MatchAlert';
import { ScreenFadeIn } from '@/components/ScreenFadeIn';
import { ShimmerSkeleton } from '@/components/ShimmerSkeleton';
import { theme } from '@/constants/theme';
import { useHiddenUserIds } from '@/hooks/useHiddenUserIds';
import { haversineDistanceKm } from '@/lib/haversine';
import { getTimeAgo } from '@/lib/time-ago';
import {
  subscribeToNearbyOpenOrders,
  type AutoMatchOrder,
} from '@/services/autoMatch';
import { createAlert } from '@/services/alerts';
import { isUserBanned } from '@/services/adminGuard';
import { trackOrderJoined } from '@/services/analytics';
import { isUserBlocked } from '@/services/block';
import { getOrCreateChat } from '@/services/chat';
import { auth, db } from '@/services/firebase';
import { getUserLocation } from '@/services/location';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import React, { useCallback, useEffect, useRef, useState } from 'react';
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

type BrowseOrder = {
  id: string;
  restaurantName: string;
  creatorId: string;
  status: string;
  createdAt: number | null;
  latitude: number | null;
  longitude: number | null;
  distanceKm: number | null;
};

const ACCENT = '#34D399';
const D = {
  bg: '#06080C',
  card: '#11161F',
  border: 'rgba(255,255,255,0.1)',
  text: '#F8FAFC',
  muted: 'rgba(248,250,252,0.55)',
  panel: '#141A22',
};

export default function BrowseScreen() {
  const router = useRouter();
  const [orders, setOrders] = useState<BrowseOrder[]>([]);
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [matchAlertOrder, setMatchAlertOrder] = useState<AutoMatchOrder | null>(
    null,
  );
  const [joiningMatchId, setJoiningMatchId] = useState<string | null>(null);
  const dismissedMatchIds = useRef<Set<string>>(new Set());
  const currentMatchIdRef = useRef<string | null>(null);
  const hasActiveOrderRef = useRef<boolean>(false);
  const fetchUserLocation = useCallback(async () => {
    setLocationError(null);
    try {
      const loc = await getUserLocation();
      setUserLocation(loc);
    } catch {
      setLocationError('Location needed to show nearby orders.');
    }
  }, []);

  useEffect(() => {
    fetchUserLocation();
  }, [fetchUserLocation]);

  const uid = auth.currentUser?.uid ?? '';
  const hiddenUserIds = useHiddenUserIds();

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    (async () => {
      try {
        const q = query(
          collection(db, 'orders'),
          where('status', 'in', ['open', 'active', 'matched']),
        );
        const snap = await getDocs(q);
        if (cancelled) return;
        const hasActive = snap.docs.some((d) => {
          const data = d.data();
          const creatorId = data?.creatorId ?? data?.hostId ?? data?.userId;
          const participantIds = Array.isArray(data?.participantIds)
            ? data.participantIds
            : [];
          return creatorId === uid || participantIds.includes(uid);
        });
        hasActiveOrderRef.current = hasActive;
      } catch {
        if (!cancelled) hasActiveOrderRef.current = false;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid]);

  useEffect(() => {
    if (!uid || !userLocation) return;
    const unsub = subscribeToNearbyOpenOrders(
      userLocation.latitude,
      userLocation.longitude,
      uid,
      (order) => {
        if (hasActiveOrderRef.current) return;
        if (dismissedMatchIds.current.has(order.id)) return;
        if (currentMatchIdRef.current) return;
        currentMatchIdRef.current = order.id;
        setMatchAlertOrder(order);
      },
    );
    return () => unsub();
  }, [uid, userLocation?.latitude, userLocation?.longitude]);

  const handleMatchJoin = async () => {
    const order = matchAlertOrder;
    if (!order || !uid) return;
    if (await isUserBlocked(uid, order.creatorId)) {
      Alert.alert('Unavailable', 'You cannot join this order.');
      setMatchAlertOrder(null);
      return;
    }
    if (await isUserBanned(uid)) {
      Alert.alert(
        'Access denied',
        'Your account has been restricted. You cannot join orders.',
      );
      setMatchAlertOrder(null);
      return;
    }
    setJoiningMatchId(order.id);
    try {
      const orderRef = doc(db, 'orders', order.id);
      const displayName =
        auth.currentUser?.displayName ||
        auth.currentUser?.email?.split('@')[0] ||
        'User';
      await updateDoc(orderRef, {
        status: 'matched',
        joinedUserId: uid,
        participantIds: arrayUnion(uid),
        user2Id: uid,
        user2Name: displayName,
      });
      await createAlert(
        'auto_match_join',
        `Someone nearby wants to share a ${order.restaurantName} order!`,
        {
          orderId: order.id,
          hostId: order.creatorId,
          creatorId: order.creatorId,
          restaurantName: order.restaurantName,
        },
      );
      const { incrementGrowthMatches } =
        await import('@/services/growthMetrics');
      await incrementGrowthMatches();
      const messagesRef = collection(db, 'orders', order.id, 'messages');
      await addDoc(messagesRef, {
        userId: uid,
        userName: displayName,
        text: 'Joined the order',
        createdAt: serverTimestamp(),
        type: 'system',
      });
      setMatchAlertOrder(null);
      currentMatchIdRef.current = null;
      router.push(`/match/${order.id}` as const);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to join');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    } finally {
      setJoiningMatchId(null);
    }
  };

  const handleMatchIgnore = () => {
    if (matchAlertOrder) {
      dismissedMatchIds.current.add(matchAlertOrder.id);
      currentMatchIdRef.current = null;
      setMatchAlertOrder(null);
    }
  };

  useEffect(() => {
    const q = query(
      collection(db, 'orders'),
      where('status', 'in', ['open', 'active', 'waiting']),
    );
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const list: BrowseOrder[] = snap.docs.map((d) => {
          const data = d.data();
          const rawCreated = data?.createdAt;
          let created: number | null = null;
          if (
            rawCreated &&
            typeof rawCreated === 'object' &&
            'toMillis' in rawCreated &&
            typeof (rawCreated as { toMillis: () => number }).toMillis ===
              'function'
          ) {
            created = (rawCreated as { toMillis: () => number }).toMillis();
          } else if (typeof rawCreated === 'number') {
            created = rawCreated;
          }
          const lat =
            typeof data?.latitude === 'number'
              ? data.latitude
              : (data?.location?.latitude ?? null);
          const lng =
            typeof data?.longitude === 'number'
              ? data.longitude
              : (data?.location?.longitude ?? null);
          return {
            id: d.id,
            restaurantName:
              typeof data?.restaurantName === 'string' &&
              data.restaurantName.trim()
                ? data.restaurantName
                : 'Restaurant',
            creatorId:
              typeof data?.creatorId === 'string'
                ? data.creatorId
                : (data?.hostId ?? data?.userId ?? ''),
            status: typeof data?.status === 'string' ? data.status : 'active',
            createdAt: created,
            latitude: lat,
            longitude: lng,
            distanceKm: null,
          };
        });
        setOrders(
          list.filter(
            (o) =>
              !!o.creatorId &&
              o.creatorId !== uid &&
              !hiddenUserIds.has(o.creatorId),
          ),
        );
        setLoading(false);
      },
      () => {
        setOrders([]);
        setLoading(false);
      },
    );
    return () => unsubscribe();
  }, [hiddenUserIds, uid]);

  const RADAR_RADIUS_KM = 5;

  const ordersWithDistance = React.useMemo(() => {
    if (!userLocation) return [];
    const withDist = orders.map((o) => {
      let distanceKm: number | null = null;
      if (o.latitude != null && o.longitude != null) {
        distanceKm = haversineDistanceKm(
          userLocation.latitude,
          userLocation.longitude,
          o.latitude,
          o.longitude,
        );
      }
      return { ...o, distanceKm };
    });
    const withinRadius = withDist.filter(
      (o) => o.distanceKm != null && o.distanceKm <= RADAR_RADIUS_KM,
    );
    const sorted = [...withinRadius].sort((a, b) => {
      const aDist = a.distanceKm ?? Infinity;
      const bDist = b.distanceKm ?? Infinity;
      if (Math.abs(aDist - bDist) > 0.001) return aDist - bDist;
      const aTime = a.createdAt ?? 0;
      const bTime = b.createdAt ?? 0;
      return bTime - aTime;
    });
    return sorted;
  }, [orders, userLocation]);

  const handleJoinOrder = async (orderId: string) => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      router.push('/(auth)/login?redirectTo=/(tabs)/browse');
      return;
    }
    if (await isUserBanned(uid)) {
      Alert.alert(
        'Access denied',
        'Your account has been restricted. You cannot join orders.',
      );
      return;
    }
    const displayName =
      auth.currentUser?.displayName ||
      auth.currentUser?.email?.split('@')[0] ||
      'User';
    setJoiningId(orderId);
    try {
      const orderRef = doc(db, 'orders', orderId);
      const preJoinSnap = await getDoc(orderRef);
      const hostId = preJoinSnap.exists()
        ? String(preJoinSnap.data()?.creatorId ?? preJoinSnap.data()?.hostId ?? '')
        : '';
      if (!hostId) {
        throw new Error('Order host is missing.');
      }
      if (await isUserBlocked(uid, hostId)) {
        throw new Error('You cannot join this order.');
      }
      await updateDoc(orderRef, {
        status: 'matched',
        participantIds: arrayUnion(uid),
        user2Id: uid,
        user2Name: displayName,
      });
      const orderSnap = await getDoc(orderRef);
      const participantIds = orderSnap.exists()
        ? ((orderSnap.data()?.participantIds as string[] | undefined) ?? [])
        : [];
      if (participantIds.length >= 2) {
        getOrCreateChat(orderId, participantIds).catch(() => {});
      }
      const { createAlert } = await import('@/services/alerts');
      await createAlert('order_matched', 'Order matched');
      const { incrementGrowthMatches } =
        await import('@/services/growthMetrics');
      await incrementGrowthMatches();
      const messagesRef = collection(db, 'orders', orderId, 'messages');
      await addDoc(messagesRef, {
        userId: uid,
        userName: displayName,
        text: 'Joined the order',
        createdAt: serverTimestamp(),
        type: 'system',
      });
      // Analytics: user joined an order
      await trackOrderJoined(uid, orderId);
      Alert.alert('Success', 'You joined the order.');
      router.push(`/match/${orderId}` as const);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to join';
      Alert.alert('Error', msg);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    } finally {
      setJoiningId(null);
    }
  };

  const handleCreateOrder = () => {
    if (!auth.currentUser) {
      router.push('/(auth)/login?redirectTo=/order/create');
      return;
    }
    router.push('/order/create');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar style="light" />
      <ScreenFadeIn style={{ flex: 1 }}>
        <MatchAlert
          visible={matchAlertOrder != null}
          restaurantName={matchAlertOrder?.restaurantName ?? ''}
          onJoin={handleMatchJoin}
          onIgnore={handleMatchIgnore}
          joining={joiningMatchId != null}
        />
        <View style={styles.header}>
          <AppLogo size={64} marginTop={4} />
          <Text style={styles.title}>Nearby orders</Text>
        </View>

      {locationError ? (
        <View style={styles.messageBox}>
          <Text style={styles.messageText}>{locationError}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={fetchUserLocation}
          >
            <Text style={styles.retryButtonText}>Allow location</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.skeletonWrap}>
          <ShimmerSkeleton width="100%" height={150} borderRadius={16} style={styles.skeletonItem} />
          <ShimmerSkeleton width="100%" height={150} borderRadius={16} style={styles.skeletonItem} />
          <ShimmerSkeleton width="100%" height={150} borderRadius={16} />
          <ActivityIndicator size="small" color={ACCENT} style={{ marginTop: 14 }} />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {ordersWithDistance.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>🍽️</Text>
              <Text style={styles.emptyText}>
                No orders near you yet.{'\n'}Create one and invite someone!
              </Text>
              <TouchableOpacity style={styles.emptyCreateButton} onPress={handleCreateOrder}>
                <Text style={styles.emptyCreateButtonText}>Create First Order</Text>
              </TouchableOpacity>
            </View>
          ) : (
            ordersWithDistance.map((order) => {
              const distanceLabel =
                order.distanceKm != null
                  ? order.distanceKm < 1
                    ? `${(order.distanceKm * 1000).toFixed(0)} m away`
                    : `${order.distanceKm.toFixed(1)} km away`
                  : '—';
              const timeLabel = order.createdAt
                ? `Created ${getTimeAgo(new Date(order.createdAt))}`
                : '—';
              const isJoining = joiningId === order.id;

              return (
                <View key={order.id} style={styles.card}>
                  <Text style={styles.cardRestaurant}>{order.restaurantName}</Text>
                  <Text style={styles.cardDistance}>{distanceLabel}</Text>
                  <Text style={styles.cardTime}>{timeLabel}</Text>
                  <TouchableOpacity
                    style={[
                      styles.joinButton,
                      isJoining && styles.joinButtonDisabled,
                    ]}
                    onPress={() => handleJoinOrder(order.id)}
                    disabled={isJoining}
                  >
                    {isJoining ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.joinButtonText}>Join Order</Text>
                    )}
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </ScrollView>
      )}

        <TouchableOpacity style={styles.createButton} onPress={handleCreateOrder}>
          <Text style={styles.createButtonText}>Create Order</Text>
        </TouchableOpacity>
      </ScreenFadeIn>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: D.bg },
  header: {
    paddingHorizontal: theme.spacing.screen,
    paddingBottom: 16,
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: D.text,
    marginTop: 8,
  },
  messageBox: {
    marginHorizontal: theme.spacing.screen,
    padding: 16,
    backgroundColor: D.panel,
    borderRadius: theme.radius.card,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: D.border,
  },
  messageText: {
    fontSize: 14,
    color: D.muted,
    marginBottom: 12,
  },
  retryButton: {
    backgroundColor: 'rgba(52, 211, 153, 0.22)',
    paddingVertical: 14,
    paddingHorizontal: theme.spacing.section,
    borderRadius: theme.radius.button,
    minHeight: theme.spacing.touchMin,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.45)',
  },
  retryButtonText: {
    color: '#A7F3D0',
    fontWeight: '600',
    fontSize: 14,
  },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  skeletonWrap: { flex: 1, padding: theme.spacing.screen, paddingTop: 10 },
  skeletonItem: { marginBottom: theme.spacing.tight },
  scroll: { flex: 1 },
  scrollContent: { padding: theme.spacing.screen, paddingBottom: 100 },
  emptyState: { alignItems: 'center', marginTop: 24 },
  emptyEmoji: { fontSize: 28, marginBottom: 8 },
  emptyText: {
    fontSize: 16,
    color: D.muted,
    textAlign: 'center',
  },
  emptyCreateButton: {
    marginTop: 14,
    minHeight: 42,
    borderRadius: 12,
    backgroundColor: 'rgba(52, 211, 153, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.35)',
    paddingHorizontal: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyCreateButtonText: {
    color: '#A7F3D0',
    fontWeight: '700',
    fontSize: 13,
  },
  card: {
    backgroundColor: D.card,
    borderWidth: 1,
    borderColor: D.border,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.tight,
  },
  cardRestaurant: {
    fontSize: 18,
    fontWeight: '700',
    color: D.text,
    marginBottom: 6,
  },
  cardDistance: {
    fontSize: 14,
    color: D.muted,
    marginBottom: 4,
  },
  cardTime: {
    fontSize: 13,
    color: D.muted,
    marginBottom: 12,
  },
  joinButton: {
    backgroundColor: 'rgba(52, 211, 153, 0.9)',
    paddingVertical: 14,
    borderRadius: theme.radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: theme.spacing.touchMin,
  },
  joinButtonDisabled: { opacity: 0.7 },
  joinButtonText: {
    color: '#042F24',
    fontWeight: '700',
    fontSize: 16,
  },
  createButton: {
    position: 'absolute',
    bottom: theme.spacing.lg,
    left: theme.spacing.screen,
    right: theme.spacing.screen,
    backgroundColor: 'rgba(52, 211, 153, 0.22)',
    paddingVertical: 16,
    borderRadius: theme.radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: theme.spacing.touchMin,
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.45)',
  },
  createButtonText: {
    color: '#A7F3D0',
    fontWeight: '700',
    fontSize: 16,
  },
});
