import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Swiper from 'react-native-deck-swiper';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  collection,
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';

import { SwipeOrderCard } from '@/components/SwipeOrderCard';
import { ScreenFadeIn } from '@/components/ScreenFadeIn';
import { ShimmerSkeleton } from '@/components/ShimmerSkeleton';
import { SWIPE_FILTERS } from '@/constants/swipeOrders';
import { shadows, theme } from '@/constants/theme';
import { useBlockedUserIds } from '@/hooks/useBlockedUserIds';
import { hasBlockBetween } from '@/services/blocks';
import { submitReport, type ReportReason } from '@/services/reports';
import { auth, db } from '@/services/firebase';
import { runPulse, runTapScale } from '@/utils/motion';
import type { SwipeFilter, SwipeOrder } from '@/types/swipeOrder';

export default function HomeScreen() {
  const router = useRouter();
  const swiperRef = useRef<Swiper<SwipeOrder> | null>(null);
  const [activeFilter, setActiveFilter] = useState<SwipeFilter>('For You');
  const [cardIndex, setCardIndex] = useState(0);
  const [likedCount, setLikedCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [swiperKey, setSwiperKey] = useState(0);
  const [refreshTick, setRefreshTick] = useState(0);
  const [liveSwipeOrders, setLiveSwipeOrders] = useState<SwipeOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pulse = useRef(new Animated.Value(0.55)).current;
  const statsScale = useRef(new Animated.Value(1)).current;
  const uid = auth.currentUser?.uid ?? null;
  const blockedUserIds = useBlockedUserIds(uid);

  useEffect(() => {
    return runPulse(pulse);
  }, [pulse]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const pickCategory = (foodName: string): SwipeOrder['category'] => {
      const t = foodName.toLowerCase();
      if (t.includes('pizza')) return 'Pizza';
      if (t.includes('burger')) return 'Burgers';
      if (t.includes('truck')) return 'Food Trucks';
      if (t.includes('late') || t.includes('night')) return 'Late Night';
      return 'Food Trucks';
    };
    const imageByCategory: Record<SwipeOrder['category'], string> = {
      Pizza:
        'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=1200&q=80',
      Burgers:
        'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=1200&q=80',
      'Late Night':
        'https://images.unsplash.com/photo-1529006557810-274b9b2fc783?auto=format&fit=crop&w=1200&q=80',
      'Food Trucks':
        'https://images.unsplash.com/photo-1617093727343-374698b1b08d?auto=format&fit=crop&w=1200&q=80',
    };
    const unsub = onSnapshot(
      collection(db, 'orders'),
      (snap) => {
        const mapped = snap.docs
          .map((d) => {
            const data = d.data();
            const foodName =
              typeof data?.foodName === 'string' && data.foodName.trim()
                ? data.foodName
                : 'Shared order';
            const category = pickCategory(foodName);
            const maxPeople = Math.max(Number(data?.maxPeople ?? 2), 2);
            const peopleJoined = Math.max(Number(data?.peopleJoined ?? 1), 1);
            const splitPrice = Math.max(Number(data?.pricePerPerson ?? 1), 1);
            const createdBy = String(
              data?.createdBy ?? data?.creatorId ?? data?.hostId ?? '',
            );
            return {
              id: d.id,
              createdBy,
              category,
              dishName: foodName,
              imageUrl:
                typeof data?.image === 'string' && data.image.trim()
                  ? data.image
                  : imageByCategory[category],
              splitPriceCents: Math.round(splitPrice * 100),
              savingsPercent:
                Number(data?.totalPrice ?? splitPrice * maxPeople) > 0
                  ? Math.max(
                      0,
                      Math.min(
                        90,
                        Math.round(
                          (1 - splitPrice / Number(data?.totalPrice ?? splitPrice)) * 100,
                        ),
                      ),
                    )
                  : 50,
              distanceKm: Math.max(Number(data?.distance ?? 0.5), 0.1),
              etaMin: Math.max(Number(data?.timeRemaining ?? 20), 1),
              closingInMin: Math.max(Number(data?.timeRemaining ?? 20), 1),
              joinedCount: Math.min(peopleJoined, maxPeople),
              maxPeople,
              joinedAvatarUrls: ['https://i.pravatar.cc/100?img=31'],
            } as SwipeOrder;
          })
          .filter((order) => {
            if (order.joinedCount >= order.maxPeople) return false;
            if (!order.createdBy) return false;
            if (uid && order.createdBy === uid) return false;
            return !blockedUserIds.has(order.createdBy);
          });
        setLiveSwipeOrders(mapped);
        setLoading(false);
      },
      (e) => {
        setError(e instanceof Error ? e.message : 'Failed to load orders');
        setLoading(false);
      },
    );
    return () => unsub();
  }, [blockedUserIds, refreshTick, uid]);

  useEffect(() => {
    setCardIndex(0);
    setSwiperKey((k) => k + 1);
  }, [activeFilter, liveSwipeOrders.length]);

  const filteredOrders = useMemo(() => {
    if (activeFilter === 'For You') return liveSwipeOrders;
    return liveSwipeOrders.filter((o) => o.category === activeFilter);
  }, [activeFilter, liveSwipeOrders]);

  const remaining = Math.max(filteredOrders.length - cardIndex, 0);
  const hasCards = filteredOrders.length > 0 && cardIndex < filteredOrders.length;

  const handleSwiped = (nextIndex: number) => {
    setCardIndex(nextIndex);
    runTapScale(statsScale);
  };

  const handleJoinOrder = async (orderId: string) => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      router.push('/(auth)/login?redirectTo=/(tabs)');
      return;
    }

    const orderRef = doc(db, 'orders', orderId);
    const maybeOrder = filteredOrders.find((o) => o.id === orderId);
    const ownerId = maybeOrder?.createdBy ?? '';
    if (ownerId && (await hasBlockBetween(uid, ownerId))) {
      throw new Error('You cannot join this order due to a block.');
    }
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(orderRef);
      if (!snap.exists()) throw new Error('Order not found.');
      const data = snap.data();
      const peopleJoined = Number(data?.peopleJoined ?? 1);
      const maxPeople = Number(data?.maxPeople ?? 2);
      const usersJoined = Array.isArray(data?.usersJoined) ? data.usersJoined : [];

      if (usersJoined.includes(uid)) {
        throw new Error('You already joined this order.');
      }
      if (peopleJoined >= maxPeople) {
        throw new Error('Order is already full.');
      }
      tx.update(orderRef, {
        peopleJoined: peopleJoined + 1,
        usersJoined: [...usersJoined, uid],
      });
    });

    // Optional audit for joins, useful for later analytics/chat integration.
    await setDoc(
      doc(db, 'orders', orderId, 'joins', uid),
      {
        userId: uid,
        joinedAt: serverTimestamp(),
      },
      { merge: true },
    ).catch(() => {});
    router.push(`/order/${orderId}` as const);
  };

  const handleSwipedRight = (index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const swipedCard = filteredOrders[index];
    setLikedCount((prev) => prev + 1);
    if (swipedCard) {
      void handleJoinOrder(swipedCard.id).catch((e) => {
        const msg = e instanceof Error ? e.message : 'Failed to join order.';
        Alert.alert('Join failed', msg);
      });
    }
  };

  const handleSwipedLeft = () => {
    Haptics.selectionAsync().catch(() => {});
    setSkippedCount((prev) => prev + 1);
  };

  const handleReportOrder = (order: SwipeOrder) => {
    const reporterId = auth.currentUser?.uid;
    if (!reporterId) {
      router.push('/(auth)/login?redirectTo=/(tabs)');
      return;
    }
    const reportedUserId = order.createdBy;
    if (!reportedUserId) {
      Alert.alert('Report', 'Could not identify the order owner.');
      return;
    }
    const submitWithReason = (reason: ReportReason) => {
      void submitReport({
        reporterId,
        reportedUserId,
        orderId: order.id,
        reason,
        message: 'Reported from order card.',
      })
        .then(() => {
          Alert.alert('Report submitted', 'Thanks. We will review this report.');
        })
        .catch((e) => {
          Alert.alert('Report failed', e instanceof Error ? e.message : 'Please try again.');
        });
    };
    Alert.alert('Report order', 'Choose a reason', [
      { text: 'Spam', onPress: () => submitWithReason('spam') },
      {
        text: 'Inappropriate',
        onPress: () => submitWithReason('inappropriate'),
      },
      { text: 'Scam', onPress: () => submitWithReason('scam') },
      { text: 'Other', onPress: () => submitWithReason('other') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenFadeIn style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.brand}>HalfOrder</Text>
          <View style={styles.headerRight}>
            <Text style={styles.headerMeta}>{remaining} live</Text>
            <View style={styles.dot} />
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filtersRow}
        >
          {SWIPE_FILTERS.map((filter) => {
            const active = filter === activeFilter;
            return (
              <TouchableOpacity
                key={filter}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => {
                  setActiveFilter(filter);
                  setCardIndex(0);
                  setSwiperKey((k) => k + 1);
                }}
                activeOpacity={0.85}
              >
                <Text style={[styles.filterText, active && styles.filterTextActive]}>
                  {filter}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={styles.deck}>
          {loading ? (
            <View style={[styles.cardShell, styles.emptyCard]}>
              <Animated.View style={{ width: '100%', opacity: pulse }}>
                <ShimmerSkeleton width="100%" height={220} borderRadius={16} />
                <ShimmerSkeleton width="72%" height={22} style={styles.skeletonGapLg} />
                <ShimmerSkeleton width="54%" height={16} style={styles.skeletonGapMd} />
                <ShimmerSkeleton width="38%" height={14} />
              </Animated.View>
              <Text style={styles.emptySub}>Loading nearby orders...</Text>
            </View>
          ) : hasCards ? (
            <Swiper
              key={swiperKey}
              ref={swiperRef}
              cards={filteredOrders}
              cardIndex={0}
              stackSize={3}
              stackSeparation={14}
              animateCardOpacity
              animateOverlayLabelsOpacity
              backgroundColor="transparent"
              disableTopSwipe
              disableBottomSwipe
              verticalSwipe={false}
              onSwiped={handleSwiped}
              onSwipedLeft={handleSwipedLeft}
              onSwipedRight={handleSwipedRight}
              overlayLabels={{
                left: {
                  title: 'SKIP',
                  style: {
                    label: styles.skipOverlayLabel,
                    wrapper: styles.skipOverlayWrapper,
                  },
                },
                right: {
                  title: 'JOINED 🔥',
                  style: {
                    label: styles.joinOverlayLabel,
                    wrapper: styles.joinOverlayWrapper,
                  },
                },
              }}
              renderCard={(card) => (
                <TouchableOpacity
                  style={styles.cardShell}
                  activeOpacity={0.95}
                  onPress={() =>
                    router.push({
                      pathname: '/order-details/[id]',
                      params: { id: card.id },
                    } as never)
                  }
                >
                  <SwipeOrderCard order={card} onReport={() => handleReportOrder(card)} />
                </TouchableOpacity>
              )}
              cardVerticalMargin={0}
              cardHorizontalMargin={0}
            />
          ) : (
            <View style={[styles.cardShell, styles.emptyCard]}>
              <MaterialIcons name="hourglass-empty" size={34} color="#9CA3AF" />
              <Text style={styles.emptyTitle}>No more orders nearby</Text>
              <Text style={styles.emptySub}>
                {error ? error : 'Check back in a few minutes for fresh drops.'}
              </Text>
              <View style={styles.emptyActions}>
                <TouchableOpacity
                  style={styles.retryBtn}
                  onPress={() => setRefreshTick((t) => t + 1)}
                >
                  <Text style={styles.retryBtnText}>Retry</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.createNowBtn}
                  onPress={() => router.push('/create-order' as never)}
                >
                  <Text style={styles.createNowBtnText}>Create Order</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[styles.actionButton, styles.skipButton]}
            onPress={() => swiperRef.current?.swipeLeft()}
            activeOpacity={0.85}
            disabled={!hasCards}
          >
            <MaterialIcons name="close" size={26} color="#F87171" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.likeButton]}
            onPress={() => swiperRef.current?.swipeRight()}
            activeOpacity={0.85}
            disabled={!hasCards}
          >
            <MaterialIcons name="favorite" size={24} color="#34D399" />
          </TouchableOpacity>
        </View>

        <Animated.View style={[styles.statsRow, { transform: [{ scale: statsScale }] }]}>
          <Text style={styles.statsText}>Joined today: {likedCount}</Text>
          <Text style={styles.statsText}>Skipped: {skippedCount}</Text>
        </Animated.View>

        <View style={styles.bottomMockNav}>
          <NavItem
            icon="style"
            label="Swipe"
            active
            onPress={() => router.push('/(tabs)')}
          />
          <NavItem
            icon="travel-explore"
            label="Browse"
            onPress={() => router.push('/(tabs)/explore')}
          />
          <NavItem
            icon="favorite-border"
            label="Likes"
            onPress={() => router.push('/(tabs)/deals')}
          />
          <NavItem
            icon="chat-bubble-outline"
            label="Chat"
            onPress={() => router.push('/inbox')}
          />
          <NavItem
            icon="person-outline"
            label="Profile"
            onPress={() => router.push('/(tabs)/profile')}
          />
        </View>
      </ScreenFadeIn>
    </SafeAreaView>
  );
}

function NavItem({
  icon,
  label,
  active = false,
  onPress,
}: {
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  label: string;
  active?: boolean;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity style={styles.navItem} activeOpacity={0.8} onPress={onPress}>
      <MaterialIcons
        name={icon}
        size={20}
        color={active ? '#34D399' : theme.colors.textMuted}
      />
      <Text style={[styles.navText, active && styles.navTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0D10',
  },
  screen: {
    flex: 1,
    paddingHorizontal: theme.spacing.screen,
    paddingBottom: 24,
  },
  header: {
    marginTop: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  brand: {
    color: '#F8FAFC',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerMeta: {
    color: '#9CA3AF',
    fontSize: 13,
    fontWeight: '600',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#34D399',
  },
  filtersRow: {
    paddingBottom: 8,
    gap: 10,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#161A21',
    borderWidth: 1,
    borderColor: '#232A35',
  },
  filterChipActive: {
    backgroundColor: '#1E293B',
    borderColor: '#34D399',
  },
  filterText: {
    color: '#A1A1AA',
    fontSize: 13,
    fontWeight: '600',
  },
  filterTextActive: {
    color: '#ECFDF5',
  },
  deck: {
    height: 500,
    marginTop: 8,
    marginBottom: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardShell: {
    width: '100%',
    height: '100%',
    borderRadius: 26,
  },
  emptyCard: {
    backgroundColor: '#141922',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 22,
    ...shadows.card,
  },
  emptyTitle: {
    color: '#E5E7EB',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptySub: {
    color: '#9CA3AF',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },
  skeletonGapLg: { marginTop: 14, marginBottom: 10 },
  skeletonGapMd: { marginBottom: 8 },
  emptyActions: {
    marginTop: 14,
    flexDirection: 'row',
    gap: 10,
  },
  retryBtn: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2C3646',
    backgroundColor: '#111720',
    justifyContent: 'center',
    alignItems: 'center',
  },
  retryBtnText: {
    color: '#C7D2FE',
    fontWeight: '700',
    fontSize: 13,
  },
  createNowBtn: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#34D399',
    justifyContent: 'center',
    alignItems: 'center',
  },
  createNowBtnText: {
    color: '#052E1A',
    fontWeight: '800',
    fontSize: 13,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 22,
    marginBottom: 12,
  },
  actionButton: {
    width: 62,
    height: 62,
    borderRadius: 31,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#232A35',
    backgroundColor: '#141922',
    ...shadows.card,
  },
  skipButton: {
    backgroundColor: '#17161C',
  },
  likeButton: {
    backgroundColor: '#10241D',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 18,
    paddingHorizontal: 2,
  },
  statsText: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '600',
  },
  bottomMockNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 20,
    backgroundColor: '#121721',
    borderWidth: 1,
    borderColor: '#232A35',
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  navItem: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 58,
    gap: 2,
  },
  navText: {
    fontSize: 11,
    color: '#9CA3AF',
    fontWeight: '600',
  },
  navTextActive: {
    color: '#34D399',
  },
  joinOverlayLabel: {
    borderColor: '#34D399',
    color: '#34D399',
    borderWidth: 2,
    borderRadius: 12,
    fontSize: 24,
    fontWeight: '900',
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: 'rgba(12, 19, 16, 0.7)',
    overflow: 'hidden',
  },
  joinOverlayWrapper: {
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    marginTop: 36,
    marginLeft: 20,
  },
  skipOverlayLabel: {
    borderColor: '#FB7185',
    color: '#FB7185',
    borderWidth: 2,
    borderRadius: 12,
    fontSize: 22,
    fontWeight: '900',
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: 'rgba(30, 13, 18, 0.7)',
    overflow: 'hidden',
  },
  skipOverlayWrapper: {
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    marginTop: 36,
    marginRight: 20,
  },
});
