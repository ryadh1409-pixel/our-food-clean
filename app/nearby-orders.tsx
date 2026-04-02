import AppLogo from '@/components/AppLogo';
import { useHiddenUserIds } from '@/hooks/useHiddenUserIds';
import { useNearbyOrders, type NearbyOrder } from '@/hooks/useNearbyOrders';
import { haversineDistanceKm } from '@/lib/haversine';
import { isUserBanned } from '@/services/adminGuard';
import { isUserBlocked } from '@/services/block';
import { auth, db } from '@/services/firebase';
import { joinOrderWithParticipantRecord } from '@/services/orderLifecycle';
import { trackOrderJoined } from '@/services/analytics';
import { useRouter } from 'expo-router';
import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { shadows, theme } from '@/constants/theme';

const NEARBY_RADIUS_KM = 1;

export default function NearbyOrdersScreen() {
  const router = useRouter();
  const { userLocation, orders, loading, error, refetch } =
    useNearbyOrders(NEARBY_RADIUS_KM);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const hiddenUserIds = useHiddenUserIds();

  const ordersWithDistance = useMemo(() => {
    const visibleOrders = orders.filter((o) => {
      const ownerId = String(o.creatorId ?? '');
      if (!ownerId) return false;
      if (ownerId === auth.currentUser?.uid) return false;
      return !hiddenUserIds.has(ownerId);
    });
    if (!userLocation) return visibleOrders;
    return [...visibleOrders].sort((a, b) => {
      const distA = Math.hypot(
        a.latitude - userLocation.latitude,
        a.longitude - userLocation.longitude,
      );
      const distB = Math.hypot(
        b.latitude - userLocation.latitude,
        b.longitude - userLocation.longitude,
      );
      return distA - distB;
    });
  }, [hiddenUserIds, orders, userLocation]);

  const handleJoin = async (order: NearbyOrder) => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      router.push('/(auth)/login?redirectTo=/nearby-orders');
      return;
    }
    if (await isUserBanned(uid)) {
      Alert.alert(
        'Access denied',
        'Your account has been restricted. You cannot join orders.',
      );
      return;
    }
    if (order.participants.includes(uid)) {
      router.push(`/order/${order.id}` as const);
      return;
    }
    if (order.participants.length >= order.maxParticipants) {
      Alert.alert(
        'Order full',
        'This order already has the maximum number of participants.',
      );
      return;
    }
    setJoiningId(order.id);
    try {
      const hostId = String(order.creatorId ?? '');
      if (hostId && (await isUserBlocked(uid, hostId))) {
        throw new Error('You cannot join this order.');
      }
      const displayName =
        auth.currentUser?.displayName ||
        auth.currentUser?.email?.split('@')[0] ||
        'User';
      await joinOrderWithParticipantRecord(db, order.id, uid, {
        status: 'matched',
        user2Id: uid,
        user2Name: displayName,
      });
      const { createAlert } = await import('@/services/alerts');
      await createAlert('order_matched', 'Order matched');
      const { incrementGrowthMatches } =
        await import('@/services/growthMetrics');
      await incrementGrowthMatches();
      const messagesRef = collection(db, 'orders', order.id, 'messages');
      await addDoc(messagesRef, {
        senderId: uid,
        senderName: displayName,
        userName: displayName,
        text: 'You joined this shared order',
        createdAt: serverTimestamp(),
        type: 'system',
      });
      // Analytics: user joined an order
      await trackOrderJoined(uid, order.id);
      router.push(`/order/${order.id}` as const);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to join';
      Alert.alert('Error', msg);
    } finally {
      setJoiningId(null);
    }
  };

  const getDistanceKm = (order: NearbyOrder): number | null => {
    if (!userLocation) return null;
    return haversineDistanceKm(
      userLocation.latitude,
      userLocation.longitude,
      order.latitude,
      order.longitude,
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <AppLogo size={64} marginTop={4} />
        <Text style={styles.title}>Nearby Orders</Text>
        <Text style={styles.subtitle}>
          Within {NEARBY_RADIUS_KM} km • Tap Join to open the order
        </Text>
      </View>

      {error ? (
        <View style={styles.messageBox}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={refetch}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>
            Loading location and open orders…
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={refetch} />
          }
          showsVerticalScrollIndicator={false}
        >
          {ordersWithDistance.length === 0 ? (
            <Text style={styles.emptyText}>
              No active orders within {NEARBY_RADIUS_KM} km — start one and others
              can join.
            </Text>
          ) : (
            ordersWithDistance.map((order) => {
              const distanceKm = getDistanceKm(order);
              const distanceLabel =
                distanceKm != null ? `${distanceKm.toFixed(2)} km away` : '—';
              const participantsLabel = `${order.participants.length} / ${order.maxParticipants} participants`;
              const isJoining = joiningId === order.id;

              return (
                <View key={order.id} style={styles.card}>
                  <Text style={styles.cardRestaurant}>
                    {order.restaurantName}
                  </Text>
                  <Text style={styles.cardRow}>{distanceLabel}</Text>
                  <Text style={styles.cardRow}>{participantsLabel}</Text>
                  <TouchableOpacity
                    style={[
                      styles.joinButton,
                      isJoining && styles.joinButtonDisabled,
                    ]}
                    onPress={() => handleJoin(order)}
                    disabled={isJoining}
                  >
                    {isJoining ? (
                      <ActivityIndicator
                        size="small"
                        color={theme.colors.textOnPrimary}
                      />
                    ) : (
                      <Text style={styles.joinButtonText}>Join</Text>
                    )}
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </ScrollView>
      )}
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
    fontSize: 22,
    fontWeight: '700',
    color: theme.colors.text,
    marginTop: 8,
  },
  subtitle: {
    fontSize: 13,
    color: theme.colors.textMuted,
    marginTop: 4,
  },
  messageBox: {
    marginHorizontal: theme.spacing.screen,
    padding: 16,
    backgroundColor: theme.colors.dangerBackground,
    borderRadius: theme.radius.card,
    alignItems: 'center',
  },
  errorText: {
    fontSize: 14,
    color: theme.colors.dangerText,
    marginBottom: 12,
  },
  retryButton: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 14,
    paddingHorizontal: theme.spacing.section,
    borderRadius: theme.radius.button,
    minHeight: theme.spacing.touchMin,
    justifyContent: 'center',
    alignItems: 'center',
  },
  retryButtonText: {
    color: theme.colors.textOnPrimary,
    fontWeight: '600',
    fontSize: 14,
  },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, fontSize: 14, color: theme.colors.textMuted },
  scroll: { flex: 1 },
  scrollContent: { padding: theme.spacing.screen, paddingBottom: 32 },
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
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.tight,
    ...shadows.card,
  },
  cardRestaurant: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 8,
  },
  cardRow: {
    fontSize: 14,
    color: theme.colors.textMuted,
    marginBottom: 4,
  },
  joinButton: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 14,
    borderRadius: theme.radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: theme.spacing.touchMin,
    marginTop: theme.spacing.tight,
  },
  joinButtonDisabled: { opacity: 0.7 },
  joinButtonText: {
    color: theme.colors.textOnPrimary,
    fontWeight: '600',
    fontSize: 16,
  },
});
