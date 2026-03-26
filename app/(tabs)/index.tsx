import { getCreditExpiryCountdown } from '@/lib/credit-expiry';
import { getTimeAgo } from '@/lib/time-ago';
import {
  useAutoMatchOrders,
  type AutoMatchOrder,
} from '@/hooks/useAutoMatchOrders';
import { isUserBanned } from '@/services/adminGuard';
import { getOrCreateChat } from '@/services/chat';
import { db } from '@/services/firebase';
import { createAlert } from '@/services/alerts';
import { useRouter } from 'expo-router';
import { getAuth } from '@firebase/auth';
import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
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

import { ScreenHeader } from '@/components/ScreenHeader';
import { layoutStyles, theme, typography } from '@/constants/theme';

export default function HomeScreen() {
  const router = useRouter();
  const auth = getAuth();
  const user = auth.currentUser;
  const [credits, setCredits] = useState<number>(0);
  const [creditExpiresAt, setCreditExpiresAt] = useState<number | null>(null);
  const [ordersCount, setOrdersCount] = useState<number>(0);
  const [creditLoading, setCreditLoading] = useState(!!user?.uid);
  const {
    orders: autoMatchOrders,
    loading: autoMatchLoading,
    error: autoMatchError,
    refetch: refetchAutoMatch,
  } = useAutoMatchOrders();
  const [joiningId, setJoiningId] = useState<string | null>(null);

  useEffect(() => {
    const uid = user?.uid;
    if (!uid) {
      setCredits(0);
      setCreditExpiresAt(null);
      setOrdersCount(0);
      setCreditLoading(false);
      return;
    }
    setCreditLoading(true);
    const unsub = onSnapshot(
      doc(db, 'users', uid),
      (snap) => {
        if (!snap.exists()) {
          setCredits(0);
          setCreditExpiresAt(null);
          setOrdersCount(0);
          setCreditLoading(false);
          return;
        }
        const data = snap.data();
        const exp =
          data?.creditExpiresAt?.toMillis?.() ?? data?.creditExpiresAt ?? null;
        const now = Date.now();
        if (exp != null && now > exp) {
          setCredits(0);
          setCreditExpiresAt(null);
          setDoc(doc(db, 'users', uid), { credits: 0 }, { merge: true }).catch(
            () => {},
          );
        } else {
          setCredits(typeof data?.credits === 'number' ? data.credits : 0);
          setCreditExpiresAt(exp);
        }
        setOrdersCount(
          typeof data?.ordersCount === 'number' ? data.ordersCount : 0,
        );
        setCreditLoading(false);
      },
      () => {
        setCredits(0);
        setCreditExpiresAt(null);
        setOrdersCount(0);
        setCreditLoading(false);
      },
    );
    return () => unsub();
  }, [user?.uid]);

  const effectiveCredits =
    creditExpiresAt != null && Date.now() > creditExpiresAt ? 0 : credits;
  const expiryCountdown = getCreditExpiryCountdown(creditExpiresAt);
  const taxGiftRemaining = ordersCount % 3 === 0 ? 3 : 3 - (ordersCount % 3);
  const nextOrderIsTaxGift = (ordersCount + 1) % 3 === 0;

  const handleCreateOrder = () => {
    if (!user) {
      router.push('/(auth)/login?redirectTo=/order/create');
      return;
    }
    router.push('/order/create');
  };

  const handleJoinOrder = () => {
    if (!user) {
      router.push('/(auth)/login?redirectTo=/order/join');
      return;
    }
    router.push('/order/join');
  };

  const handleNearbyOrders = () => {
    if (!user) {
      router.push('/(auth)/login?redirectTo=/nearby-orders');
      return;
    }
    router.push('/nearby-orders');
  };

  const handleJoinAutoMatch = async (order: AutoMatchOrder) => {
    const uid = user?.uid;
    if (!uid) {
      router.push('/(auth)/login?redirectTo=/(tabs)');
      return;
    }
    if (await isUserBanned(uid)) {
      Alert.alert(
        'Access denied',
        'Your account has been restricted. You cannot join orders.',
      );
      return;
    }
    if (order.participantIds.includes(uid)) {
      router.push(`/order/${order.id}` as const);
      return;
    }
    if (order.participantIds.length >= order.maxParticipants) {
      Alert.alert(
        'Order full',
        'This order already has the maximum number of participants.',
      );
      refetchAutoMatch();
      return;
    }
    setJoiningId(order.id);
    try {
      const orderRef = doc(db, 'orders', order.id);
      const displayName =
        user.displayName || user.email?.split('@')[0] || 'User';
      const newCount = order.participantIds.length + 1;
      const isFull = newCount >= order.maxParticipants;
      await updateDoc(orderRef, {
        status: isFull ? 'matched' : 'active',
        participantIds: arrayUnion(uid),
        ...(isFull && {
          user2Id: uid,
          user2Name: displayName,
        }),
      });
      if (isFull) {
        const newParticipantIds = [...order.participantIds, uid];
        getOrCreateChat(order.id, newParticipantIds).catch(() => {});
      }
      await createAlert('order_joined', 'Someone joined your order.', {
        orderId: order.id,
        hostId: order.hostId,
      });
      const messagesRef = collection(db, 'orders', order.id, 'messages');
      await addDoc(messagesRef, {
        userId: uid,
        userName: displayName,
        text: 'Joined the order',
        createdAt: serverTimestamp(),
        type: 'system',
      });
      const { incrementGrowthMatches } =
        await import('@/services/growthMetrics');
      await incrementGrowthMatches();
      Alert.alert('Success', 'You joined the order.');
      router.push(`/match/${order.id}` as const);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to join';
      Alert.alert('Error', msg);
      refetchAutoMatch();
    } finally {
      setJoiningId(null);
    }
  };

  return (
    <SafeAreaView style={layoutStyles.container} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeader
          subtitle="Split meals. Pay half."
          variant="hero"
          align="center"
          logo="hero"
        />
        <View style={styles.content}>
          {user && (
            <View style={[layoutStyles.card, styles.creditCardInner]}>
              {creditLoading ? (
                <ActivityIndicator size="small" color={theme.colors.primary} />
              ) : (
                <>
                  <Text style={styles.creditBalance}>
                    ${effectiveCredits.toFixed(2)} credit
                  </Text>
                  <Text style={styles.creditExpiry}>
                    {effectiveCredits > 0
                      ? `Expires in ${expiryCountdown}`
                      : expiryCountdown}
                  </Text>
                </>
              )}
            </View>
          )}

          {user && (
            <View style={[layoutStyles.cardFlat, styles.taxGiftProgressCard]}>
              <Text style={styles.taxGiftProgressText}>
                {nextOrderIsTaxGift
                  ? 'This order qualifies for a tax gift 🎁'
                  : taxGiftRemaining === 1
                    ? 'Only 1 more order to get your tax paid by HalfOrder 🎁'
                    : `Only ${taxGiftRemaining} more orders to get your tax paid by HalfOrder 🎁`}
              </Text>
            </View>
          )}

          {user && (
            <View style={styles.autoMatchSection}>
              <Text style={styles.autoMatchTitle}>
                Orders near you (within 1 km, last 15 min)
              </Text>
              {autoMatchLoading ? (
                <ActivityIndicator
                  size="small"
                  color={theme.colors.primary}
                  style={{ marginVertical: 16 }}
                />
              ) : autoMatchError ? (
                <Text style={styles.autoMatchError}>{autoMatchError}</Text>
              ) : autoMatchOrders.length === 0 ? (
                <Text style={styles.autoMatchEmpty}>
                  No open orders nearby. Create one or try Nearby Orders.
                </Text>
              ) : (
                autoMatchOrders.map((order) => {
                  const isJoining = joiningId === order.id;
                  const alreadyJoined = order.participantIds.includes(
                    user?.uid ?? '',
                  );
                  const isFull =
                    order.participantIds.length >= order.maxParticipants;
                  const distanceLabel =
                    order.distanceKm < 1
                      ? `${(order.distanceKm * 1000).toFixed(0)} m`
                      : `${order.distanceKm.toFixed(1)} km`;
                  const timeLabel = getTimeAgo(new Date(order.createdAtMs));
                  return (
                    <View key={order.id} style={[layoutStyles.card, styles.autoMatchCard]}>
                      <Text style={styles.autoMatchRestaurant}>
                        {order.restaurantName}
                      </Text>
                      <Text style={styles.autoMatchMeta}>
                        Distance: {distanceLabel}
                      </Text>
                      <Text style={styles.autoMatchMeta}>
                        Created: {timeLabel}
                      </Text>
                      <TouchableOpacity
                        style={[
                          layoutStyles.primaryButton,
                          styles.autoMatchJoinBtn,
                          (isJoining || isFull || alreadyJoined) &&
                            styles.autoMatchJoinBtnDisabled,
                        ]}
                        onPress={() =>
                          alreadyJoined
                            ? router.push(`/order/${order.id}` as const)
                            : handleJoinAutoMatch(order)
                        }
                        disabled={isJoining || isFull}
                        activeOpacity={0.85}
                      >
                        {isJoining ? (
                          <ActivityIndicator
                            size="small"
                            color={theme.colors.textOnPrimary}
                          />
                        ) : alreadyJoined ? (
                          <Text style={layoutStyles.primaryButtonText}>
                            View Order
                          </Text>
                        ) : isFull ? (
                          <Text style={layoutStyles.primaryButtonText}>Full</Text>
                        ) : (
                          <Text style={layoutStyles.primaryButtonText}>
                            Join Order
                          </Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  );
                })
              )}
            </View>
          )}

          <View style={styles.buttons}>
            <TouchableOpacity
              style={layoutStyles.primaryButton}
              onPress={handleCreateOrder}
              activeOpacity={0.85}
            >
              <Text style={layoutStyles.primaryButtonText}>Create Order</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={layoutStyles.secondaryButton}
              onPress={handleJoinOrder}
              activeOpacity={0.85}
            >
              <Text style={layoutStyles.secondaryButtonText}>Join Order</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={layoutStyles.outlineButton}
              onPress={handleNearbyOrders}
              activeOpacity={0.85}
            >
              <Text style={layoutStyles.outlineButtonText}>Nearby Orders</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: theme.spacing.xl,
  },
  content: {
    flex: 1,
    paddingHorizontal: theme.spacing.screen,
    paddingTop: theme.spacing.md,
    alignItems: 'center',
  },
  creditCardInner: {
    marginBottom: theme.spacing.lg,
    minWidth: 200,
    alignItems: 'center',
    paddingVertical: theme.spacing.md,
  },
  creditBalance: {
    ...typography.bodyMedium,
    fontSize: 18,
    fontWeight: '700',
  },
  creditExpiry: {
    ...typography.caption,
    marginTop: theme.spacing.xs,
  },
  taxGiftProgressCard: {
    paddingVertical: theme.spacing.md - 2,
    paddingHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.primaryOrange,
  },
  taxGiftProgressText: {
    ...typography.caption,
    fontSize: 14,
    color: theme.colors.primaryDark,
    textAlign: 'center',
    fontWeight: '500',
  },
  buttons: {
    width: '100%',
    maxWidth: 340,
    gap: theme.spacing.md,
  },
  autoMatchSection: {
    width: '100%',
    maxWidth: 320,
    marginBottom: 24,
  },
  autoMatchTitle: {
    ...typography.caption,
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: theme.spacing.tight,
    textAlign: 'center',
  },
  autoMatchError: {
    fontSize: 13,
    color: theme.colors.textMuted,
    textAlign: 'center',
    marginVertical: 8,
  },
  autoMatchEmpty: {
    fontSize: 13,
    color: theme.colors.textMuted,
    textAlign: 'center',
    marginVertical: 8,
  },
  autoMatchCard: {
    padding: theme.spacing.md - 2,
    marginBottom: theme.spacing.sm + 2,
  },
  autoMatchRestaurant: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 6,
  },
  autoMatchMeta: {
    fontSize: 13,
    color: theme.colors.textMuted,
    marginBottom: 2,
  },
  autoMatchJoinBtn: {
    marginTop: theme.spacing.sm + 2,
    minHeight: 48,
    paddingVertical: 12,
  },
  autoMatchJoinBtnDisabled: {
    backgroundColor: theme.colors.dotInactive,
    opacity: 0.85,
  },
});
