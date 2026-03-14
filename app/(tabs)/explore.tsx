import AppLogo from '@/components/AppLogo';
import CampusBanner from '@/components/CampusBanner';
import MatchAlert from '@/components/MatchAlert';
import { theme } from '@/constants/theme';
import { useCampusDetection } from '@/hooks/useCampusDetection';
import { CAMPUS_MATCH_RADIUS_METERS } from '@/services/campusMode';
import { haversineDistanceKm } from '@/lib/haversine';
import { getTimeAgo } from '@/lib/time-ago';
import {
  subscribeToNearbyOpenOrders,
  type AutoMatchOrder,
} from '@/services/autoMatch';
import { createAlert } from '@/services/alerts';
import { isUserBanned } from '@/services/adminGuard';
import { trackOrderJoined } from '@/services/analytics';
import { getOrCreateChat } from '@/services/chat';
import { auth, db } from '@/services/firebase';
import { getUserLocation } from '@/services/location';
import { useRouter } from 'expo-router';
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

type ExploreOrder = {
  id: string;
  restaurantName: string;
  creatorId: string;
  status: string;
  createdAt: number | null;
  latitude: number | null;
  longitude: number | null;
  distanceKm: number | null;
  campus?: string | null;
};

export default function ExploreScreen() {
  const router = useRouter();
  const [orders, setOrders] = useState<ExploreOrder[]>([]);
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
  const { isCampusMode, campusName } = useCampusDetection();
  const [userCampus, setUserCampus] = useState<string | null>(null);

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

  useEffect(() => {
    if (!uid) {
      setUserCampus(null);
      return;
    }
    const userRef = doc(db, 'users', uid);
    getDoc(userRef)
      .then((snap) => {
        const data = snap.data();
        setUserCampus(typeof data?.campus === 'string' ? data.campus : null);
      })
      .catch(() => setUserCampus(null));
  }, [uid]);

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
    const radiusMeters = isCampusMode ? CAMPUS_MATCH_RADIUS_METERS : undefined;
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
      { radiusMeters },
    );
    return () => unsub();
  }, [uid, userLocation?.latitude, userLocation?.longitude, isCampusMode]);

  const handleMatchJoin = async () => {
    const order = matchAlertOrder;
    if (!order || !uid) return;
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
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to join');
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
        const list: ExploreOrder[] = snap.docs.map((d) => {
          const data = d.data();
          const created =
            data?.createdAt?.toMillis?.() ?? data?.createdAt ?? null;
          const lat =
            typeof data?.latitude === 'number'
              ? data.latitude
              : (data?.location?.latitude ?? null);
          const lng =
            typeof data?.longitude === 'number'
              ? data.longitude
              : (data?.location?.longitude ?? null);
          const campus = typeof data?.campus === 'string' ? data.campus : null;
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
            campus,
          };
        });
        const filtered = userCampus
          ? list.filter((o) => o.campus === userCampus)
          : list;
        setOrders(filtered);
        setLoading(false);
      },
      () => {
        setOrders([]);
        setLoading(false);
      },
    );
    return () => unsubscribe();
  }, [userCampus]);

  const RADAR_RADIUS_KM = isCampusMode ? 0.15 : 5;

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
  }, [orders, userLocation, isCampusMode]);

  const handleJoinOrder = async (orderId: string) => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      router.push('/(auth)/login?redirectTo=/(tabs)/explore');
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
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to join';
      Alert.alert('Error', msg);
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
      {isCampusMode ? <CampusBanner campusName={campusName} /> : null}
      <MatchAlert
        visible={matchAlertOrder != null}
        restaurantName={matchAlertOrder?.restaurantName ?? ''}
        onJoin={handleMatchJoin}
        onIgnore={handleMatchIgnore}
        joining={joiningMatchId != null}
      />
      <View style={styles.header}>
        <AppLogo />
        <Text style={styles.title}>
          {isCampusMode ? 'Nearby student orders' : 'Nearby orders'}
        </Text>
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
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {ordersWithDistance.length === 0 ? (
            <Text style={styles.emptyText}>
              No orders near you yet.{'\n'}Create one and invite someone!
            </Text>
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
                  <View style={styles.cardTitleRow}>
                    <Text style={styles.cardRestaurant}>
                      {order.restaurantName}
                    </Text>
                    {isCampusMode ? (
                      <View style={styles.studentBadge}>
                        <Text style={styles.studentBadgeText}>
                          Student match
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  {order.campus ? (
                    <Text style={styles.cardCampus}>
                      Campus: {order.campus}
                    </Text>
                  ) : null}
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
                      <ActivityIndicator
                        size="small"
                        color={theme.colors.textOnPrimary}
                      />
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  header: {
    paddingHorizontal: theme.spacing.screen,
    paddingBottom: 16,
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.text,
    marginTop: 8,
  },
  messageBox: {
    marginHorizontal: theme.spacing.screen,
    padding: 16,
    backgroundColor: theme.colors.backgroundDark,
    borderRadius: theme.radius.card,
    alignItems: 'center',
  },
  messageText: {
    fontSize: 14,
    color: theme.colors.textMuted,
    marginBottom: 12,
  },
  retryButton: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: theme.radius.button,
  },
  retryButtonText: {
    color: theme.colors.textOnPrimary,
    fontWeight: '600',
    fontSize: 14,
  },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { flex: 1 },
  scrollContent: { padding: theme.spacing.screen, paddingBottom: 100 },
  emptyText: {
    fontSize: 16,
    color: theme.colors.textMuted,
    textAlign: 'center',
    marginTop: 24,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.card,
    padding: 16,
    marginBottom: 12,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    marginBottom: 6,
  },
  studentBadge: {
    backgroundColor: '#FFD700',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  studentBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0B0B0B',
  },
  cardRestaurant: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
  },
  cardCampus: {
    fontSize: 13,
    color: theme.colors.textMuted,
    marginBottom: 4,
  },
  cardDistance: {
    fontSize: 14,
    color: theme.colors.textMuted,
    marginBottom: 4,
  },
  cardTime: {
    fontSize: 13,
    color: theme.colors.textMuted,
    marginBottom: 12,
  },
  joinButton: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 12,
    borderRadius: theme.radius.button,
    alignItems: 'center',
  },
  joinButtonDisabled: { opacity: 0.7 },
  joinButtonText: {
    color: theme.colors.textOnPrimary,
    fontWeight: '600',
    fontSize: 16,
  },
  createButton: {
    position: 'absolute',
    bottom: 24,
    left: theme.spacing.screen,
    right: theme.spacing.screen,
    backgroundColor: theme.colors.primary,
    paddingVertical: 14,
    borderRadius: theme.radius.button,
    alignItems: 'center',
  },
  createButtonText: {
    color: theme.colors.textOnPrimary,
    fontWeight: '600',
    fontSize: 16,
  },
});
