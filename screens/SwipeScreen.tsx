import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated as RNAnimated,
  Dimensions,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';

import {
  getHeroImageUrlForType,
  parseMinutesFromTimeLabel,
  SWIPE_MAIN_TABS,
  type MockFoodCard,
  type SwipeMainTab,
} from '@/constants/mockSwipeFood';
import { haversineDistanceKm } from '@/lib/haversine';
import { acceptFoodSwipe } from '@/services/foodSwipeMatch';
import { ensureOrderChatInitialized } from '@/services/chat';
import { auth, db } from '@/services/firebase';
import { getCityFromCoordinates, getUserLocationSafe } from '@/services/location';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const CARD_RADIUS = 26;
const SWIPE_OUT = SCREEN_W * 1.35;
const SWIPE_TRIGGER = SCREEN_W * 0.22;
const REJECT_MS = 165;
const AVATAR_PLACEHOLDER = 'https://via.placeholder.com/40';

type SwipeCard = MockFoodCard & {
  createdBy: string;
  userName: string;
  userAvatar: string | null;
  isOwner: boolean;
  distanceLabel: string;
};

function useDeadlineCountdown(cardId: string, totalMinutes: number) {
  const deadlineRef = useRef(Date.now() + totalMinutes * 60 * 1000);
  const [, setTick] = useState(0);
  useEffect(() => {
    deadlineRef.current = Date.now() + totalMinutes * 60 * 1000;
  }, [cardId, totalMinutes]);
  useEffect(() => {
    const id = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, [cardId]);
  const secLeft = Math.max(
    0,
    Math.ceil((deadlineRef.current - Date.now()) / 1000),
  );
  const m = Math.floor(secLeft / 60);
  const s = secLeft % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function SuccessBurst({ burstKey }: { burstKey: number }) {
  const scale = useRef(new RNAnimated.Value(0)).current;
  const opacity = useRef(new RNAnimated.Value(0)).current;

  useEffect(() => {
    scale.setValue(0.2);
    opacity.setValue(0);
    RNAnimated.parallel([
      RNAnimated.sequence([
        RNAnimated.spring(scale, {
          toValue: 1.12,
          friction: 6,
          tension: 140,
          useNativeDriver: true,
        }),
        RNAnimated.spring(scale, {
          toValue: 1,
          friction: 8,
          useNativeDriver: true,
        }),
      ]),
      RNAnimated.sequence([
        RNAnimated.timing(opacity, {
          toValue: 1,
          duration: 70,
          useNativeDriver: true,
        }),
        RNAnimated.timing(opacity, {
          toValue: 0,
          duration: 320,
          delay: 100,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [burstKey, scale, opacity]);

  return (
    <RNAnimated.View
      pointerEvents="none"
      style={[styles.successBurstWrap, { opacity }]}
    >
      <RNAnimated.Text style={[styles.successHeart, { transform: [{ scale }] }]}>
        ❤️
      </RNAnimated.Text>
      <Text style={styles.successNice}>Nice!</Text>
      <Text style={styles.successSub}>You’re in</Text>
    </RNAnimated.View>
  );
}

function GlassBar({ children, style }: { children: React.ReactNode; style?: object }) {
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

function FoodCardFace({ card }: { card: SwipeCard }) {
  const spotsLeft = Math.max(0, card.spotsLeft);
  const heroUri = getHeroImageUrlForType(card.type);
  const countdownLabel = useDeadlineCountdown(
    card.id,
    parseMinutesFromTimeLabel(card.time),
  );
  const joinedLabel =
    card.peopleJoined === 1
      ? '1 participant'
      : `${card.peopleJoined} participants`;
  const spotsLabel =
    spotsLeft <= 0
      ? 'Full'
      : spotsLeft === 1
        ? '1 spot left'
        : `${spotsLeft} spots left`;
  const priceLine = `$${card.price} each`;

  return (
    <View style={styles.cardFace}>
      <Image
        source={{ uri: heroUri }}
        style={styles.cardHeroImage}
        contentFit="cover"
        transition={200}
      />
      <LinearGradient
        colors={[
          'rgba(0,0,0,0)',
          'rgba(0,0,0,0)',
          'rgba(0,0,0,0.55)',
          'rgba(0,0,0,0.93)',
        ]}
        locations={[0, 0.38, 0.7, 1]}
        style={styles.imageGradient}
        pointerEvents="none"
      />

      <View style={styles.cardMeta}>
        <Text style={styles.foodTitle} numberOfLines={2}>
          {card.title}
        </Text>
        <View style={styles.urgencyBlock}>
          <View style={styles.userRow}>
            <Image
              source={{ uri: card.userAvatar || AVATAR_PLACEHOLDER }}
              style={styles.userAvatar}
              contentFit="cover"
              transition={120}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.userName} numberOfLines={1}>
                {card.userName}
              </Text>
              <Text style={styles.userLocation}>
                📍 {card.distanceLabel || 'Distance unavailable'}
              </Text>
            </View>
            {card.isOwner ? <Text style={styles.ownerTag}>Your order</Text> : null}
          </View>
          <Text style={styles.joinedLine}>{joinedLabel}</Text>
          <Text
            style={[
              styles.spotsLine,
              spotsLeft <= 0 && styles.spotsLineMuted,
            ]}
          >
            {spotsLabel}
          </Text>
          <View style={styles.timerRow}>
            <MaterialIcons name="timer" size={17} color="#FBBF24" />
            <Text style={styles.timerDigits}>{countdownLabel}</Text>
            <Text style={styles.timerHint}>left to join</Text>
          </View>
        </View>
        <Text style={styles.priceLine}>{priceLine}</Text>
        <View style={styles.rowMeta}>
          <View style={styles.metaPill}>
            <MaterialIcons name="schedule" size={16} color="#6EE7B7" />
            <Text style={styles.metaPillText}>{card.time}</Text>
          </View>
          <View style={styles.metaPill}>
            <MaterialIcons name="near-me" size={16} color="#7DD3FC" />
            <Text style={styles.metaPillText}>{card.distance}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

function ScalePress({
  children,
  onPress,
  disabled,
}: {
  children: React.ReactNode;
  onPress: () => void;
  disabled?: boolean;
}) {
  const scale = useRef(new RNAnimated.Value(1)).current;
  const pressIn = () => {
    RNAnimated.spring(scale, {
      toValue: 0.9,
      friction: 6,
      useNativeDriver: true,
    }).start();
  };
  const pressOut = () => {
    RNAnimated.spring(scale, {
      toValue: 1,
      friction: 5,
      useNativeDriver: true,
    }).start();
  };
  return (
    <Pressable
      onPress={onPress}
      onPressIn={pressIn}
      onPressOut={pressOut}
      disabled={disabled}
    >
      <RNAnimated.View style={{ transform: [{ scale }] }}>{children}</RNAnimated.View>
    </Pressable>
  );
}

function SwipeScreenInner() {
  const router = useRouter();
  const [tab, setTab] = useState<SwipeMainTab>('for-you');
  const [index, setIndex] = useState(0);
  const [burstKey, setBurstKey] = useState(0);
  const [liveOrders, setLiveOrders] = useState<SwipeCard[]>([]);
  const [joiningOrderId, setJoiningOrderId] = useState<string | null>(null);
  const [currentLocation, setCurrentLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [currentCity, setCurrentCity] = useState('Nearby');

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const loc = await getUserLocationSafe();
      if (!loc || cancelled) return;
      setCurrentLocation(loc);
      const city = await getCityFromCoordinates(loc.latitude, loc.longitude);
      if (!cancelled) setCurrentCity(city || 'Nearby');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'orders'), where('status', '==', 'open'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const currentUid = auth.currentUser?.uid ?? '';
        const cards: SwipeCard[] = snap.docs.map((d) => {
          const data = d.data();
          const rawCategory =
            typeof data?.category === 'string'
              ? data.category.toLowerCase()
              : typeof data?.mealType === 'string'
                ? data.mealType.toLowerCase()
                : 'pizza';
          const type: MockFoodCard['type'] =
            rawCategory === 'noodles' ? 'noodles' : 'pizza';
          const plist = Array.isArray(data?.participants)
            ? (data.participants as unknown[]).filter(
                (x): x is string => typeof x === 'string',
              )
            : [];
          const peopleJoined = plist.length > 0 ? plist.length : 1;
          const maxParticipants =
            typeof data?.maxPeople === 'number'
              ? data.maxPeople
              : typeof data?.maxParticipants === 'number'
                ? data.maxParticipants
                : 2;
          const spotsLeft = Math.max(0, maxParticipants - peopleJoined);
          const price =
            typeof data?.sharePrice === 'number'
              ? data.sharePrice
              : typeof data?.totalPrice === 'number'
                ? data.totalPrice
                : 0;
          return {
            id: d.id,
            title:
              typeof data?.restaurantName === 'string' && data.restaurantName.trim()
                ? data.restaurantName
                : 'Restaurant',
            type,
            price,
            time: '30 min',
            distance: 'Location hidden',
            peopleJoined,
            spotsLeft,
            categories: ['for-you', type],
            createdBy:
              typeof data?.createdBy === 'string' && data.createdBy.trim()
                ? data.createdBy
                : typeof data?.userId === 'string' && data.userId.trim()
                  ? data.userId
                  : '',
            userName:
              typeof data?.userName === 'string' && data.userName.trim()
                ? data.userName
                : typeof data?.name === 'string' && data.name.trim()
                  ? data.name
                : 'User',
            userAvatar:
              typeof data?.userAvatar === 'string' && data.userAvatar.trim()
                ? data.userAvatar
                : typeof data?.avatar === 'string' && data.avatar.trim()
                  ? data.avatar
                : null,
            isOwner: currentUid !== '' && (data?.createdBy === currentUid || data?.userId === currentUid),
            distanceLabel: (() => {
              const lat = data?.location?.latitude ?? data?.latitude;
              const lng = data?.location?.longitude ?? data?.longitude;
              if (
                currentLocation &&
                typeof lat === 'number' &&
                typeof lng === 'number'
              ) {
                const km = haversineDistanceKm(
                  currentLocation.latitude,
                  currentLocation.longitude,
                  lat,
                  lng,
                );
                return `${currentCity} • ${km.toFixed(1)} km`;
              }
              return typeof data?.distance === 'string' && data.distance.trim()
                ? data.distance
                : 'Nearby';
            })(),
          };
        });
        console.log(
          '[Swipe] fetched open orders:',
          cards.map((c) => ({ id: c.id, title: c.title, type: c.type })),
        );
        setLiveOrders(cards);
      },
      (error) => {
        console.error('[Swipe] failed to fetch open orders:', error);
        setLiveOrders([]);
      },
    );
    return () => unsub();
  }, [currentCity, currentLocation]);

  useEffect(() => {
    const unsubAll = onSnapshot(
      collection(db, 'orders'),
      (snap) => {
        console.log(
          '[Swipe] all orders documents:',
          snap.docs.map((d) => ({ id: d.id, ...d.data() })),
        );
      },
      (error) => {
        console.error('[Swipe] failed to fetch all orders:', error);
      },
    );
    return () => unsubAll();
  }, []);

  const handleLike = useCallback(
    async (order: SwipeCard) => {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        router.push('/(auth)/login?redirectTo=/(tabs)');
        return;
      }
      if (joiningOrderId) return;
      if (order.createdBy && order.createdBy === currentUser.uid) {
        Alert.alert('Own order', 'You cannot join your own order.');
        return;
      }

      setJoiningOrderId(order.id);
      try {
        const swipeResult = await acceptFoodSwipe(db, order.id, currentUser.uid);
        if (!swipeResult.ok) {
          throw new Error(swipeResult.error);
        }
        const orderRef = doc(db, 'orders', order.id);
        await updateDoc(orderRef, {
          participants: arrayUnion(currentUser.uid),
          [`joinedAtMap.${currentUser.uid}`]: serverTimestamp(),
        });
        if (!swipeResult.matched) {
          setIndex((i) => i + 1);
          return;
        }

        await ensureOrderChatInitialized(order.id);
        Notifications.scheduleNotificationAsync({
          content: {
            title: '🎉 Shared order',
            body: 'You can now chat',
          },
          trigger: null,
        }).catch(() => {});
        setBurstKey((k) => k + 1);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.push(`/order/${order.id}` as const);
        setIndex((i) => i + 1);
      } catch (error) {
        console.error('[Swipe] failed to join order on like:', error);
        Alert.alert(
          'Could not join order',
          error instanceof Error ? error.message : 'Please try again.',
        );
      } finally {
        setJoiningOrderId(null);
      }
    },
    [joiningOrderId, router],
  );

  const filtered = useMemo(() => {
    if (tab === 'for-you') return liveOrders;
    return liveOrders.filter((c) => c.categories.includes(tab));
  }, [liveOrders, tab]);
  const current = filtered[index];
  const next = filtered[index + 1];

  useEffect(() => {
    setIndex(0);
  }, [tab]);

  useEffect(() => {
    if (index >= filtered.length && filtered.length > 0) {
      setIndex(0);
    }
  }, [filtered.length, index]);

  useEffect(() => {
    translateX.value = 0;
    translateY.value = 0;
  }, [index, translateX, translateY]);

  const commitSwipeRight = useCallback(() => {
    if (!current) return;
    translateX.value = 0;
    translateY.value = 0;
    void handleLike(current);
  }, [current, handleLike, translateX, translateY]);

  const commitSwipeLeft = useCallback(() => {
    void Haptics.selectionAsync();
    setIndex((i) => i + 1);
  }, []);

  const pan = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .failOffsetY([-20, 20])
    .onUpdate((e) => {
      translateX.value = e.translationX;
      translateY.value = e.translationY * 0.25;
    })
    .onEnd((e) => {
      if (translateX.value > SWIPE_TRIGGER) {
        translateX.value = 0;
        translateY.value = 0;
        runOnJS(commitSwipeRight)();
      } else if (translateX.value < -SWIPE_TRIGGER) {
        translateX.value = withTiming(
          -SWIPE_OUT,
          { duration: REJECT_MS },
          (done) => {
            if (done) runOnJS(commitSwipeLeft)();
          },
        );
        translateY.value = withTiming(0, { duration: REJECT_MS });
      } else {
        translateX.value = withSpring(0, { damping: 20, stiffness: 260 });
        translateY.value = withSpring(0, { damping: 20, stiffness: 260 });
      }
    });

  const topStyle = useAnimatedStyle(() => {
    const rot = interpolate(
      translateX.value,
      [-SCREEN_W * 0.4, SCREEN_W * 0.4],
      [-10, 10],
      Extrapolation.CLAMP,
    );
    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { rotate: `${rot}deg` },
      ],
    };
  });

  const likeStamp = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateX.value,
      [0, SWIPE_TRIGGER * 0.85],
      [0, 1],
      Extrapolation.CLAMP,
    ),
  }));

  const nopeStamp = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateX.value,
      [-SWIPE_TRIGGER * 0.85, 0],
      [1, 0],
      Extrapolation.CLAMP,
    ),
  }));

  const fly = (dir: 'left' | 'right') => {
    if (!current) return;
    if (dir === 'right') {
      translateX.value = 0;
      translateY.value = 0;
      commitSwipeRight();
      return;
    }
    translateX.value = withTiming(-SWIPE_OUT, { duration: REJECT_MS }, (done) => {
      if (done) runOnJS(commitSwipeLeft)();
    });
    translateY.value = withTiming(0, { duration: REJECT_MS });
  };

  const resetDeck = () => {
    setIndex(0);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const cardMaxH = Math.min(SCREEN_H * 0.58, 520);

  return (
    <View style={styles.root}>
      {burstKey > 0 ? (
        <SuccessBurst key={burstKey} burstKey={burstKey} />
      ) : null}
      <StatusBar style="light" />
      <SafeAreaView style={styles.safeTop} edges={['top']}>
        <GlassBar style={[styles.topBar, { marginHorizontal: 16 }]}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabsInner}
          >
            {SWIPE_MAIN_TABS.map((t) => {
              const active = tab === t.key;
              return (
                <Pressable
                  key={t.key}
                  onPress={() => setTab(t.key)}
                  style={[styles.tabChip, active && styles.tabChipActive]}
                >
                  <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
                    {t.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </GlassBar>

        <View style={[styles.deck, { maxHeight: cardMaxH }]}>
          {!current ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No more cards right now</Text>
              <Text style={styles.emptySub}>
                No active orders to show — start one and others can join, or replay
                this list.
              </Text>
              <Pressable style={styles.resetBtn} onPress={resetDeck}>
                <Text style={styles.resetBtnText}>Show cards again</Text>
              </Pressable>
            </View>
          ) : (
            <>
              {next ? (
                <View style={[styles.cardShell, styles.cardBehind, { maxHeight: cardMaxH }]}>
                  <FoodCardFace card={next} />
                </View>
              ) : null}

              <GestureDetector gesture={pan}>
                <Animated.View
                  style={[
                    styles.cardShell,
                    styles.cardFront,
                    { maxHeight: cardMaxH },
                    topStyle,
                  ]}
                >
                  <FoodCardFace card={current} />
                  <Animated.View style={[styles.stamp, styles.stampLike, likeStamp]} pointerEvents="none">
                    <Text style={styles.stampLikeText}>LIKE</Text>
                  </Animated.View>
                  <Animated.View style={[styles.stamp, styles.stampNope, nopeStamp]} pointerEvents="none">
                    <Text style={styles.stampNopeText}>NOPE</Text>
                  </Animated.View>
                </Animated.View>
              </GestureDetector>
            </>
          )}
        </View>

        <View style={styles.actions}>
          <ScalePress onPress={() => fly('left')} disabled={!current}>
            <View style={[styles.circleBtn, styles.rejectCircle]}>
              <Text style={styles.circleEmoji}>❌</Text>
            </View>
          </ScalePress>
          <ScalePress onPress={() => fly('right')} disabled={!current || !!joiningOrderId}>
            <View style={[styles.circleBtn, styles.acceptCircle]}>
              <Text style={styles.circleEmoji}>❤️</Text>
            </View>
          </ScalePress>
        </View>
      </SafeAreaView>
    </View>
  );
}

export function SwipeScreen() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SwipeScreenInner />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#06080C',
  },
  safeTop: {
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
  topBar: {
    marginTop: 4,
    marginBottom: 14,
  },
  tabsInner: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  tabChip: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  tabChipActive: {
    backgroundColor: 'rgba(52, 211, 153, 0.22)',
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.45)',
  },
  tabLabel: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 13,
    fontWeight: '600',
  },
  tabLabelActive: {
    color: '#ECFDF5',
  },
  deck: {
    flex: 1,
    marginHorizontal: 18,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardShell: {
    width: SCREEN_W - 36,
    borderRadius: CARD_RADIUS,
    backgroundColor: '#11161F',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 16 },
        shadowOpacity: 0.45,
        shadowRadius: 24,
      },
      android: { elevation: 14 },
      default: {},
    }),
  },
  cardBehind: {
    position: 'absolute',
    transform: [{ scale: 0.94 }, { translateY: 14 }],
    opacity: 0.88,
    zIndex: 0,
  },
  cardFront: {
    zIndex: 1,
  },
  cardFace: {
    width: '100%',
    alignSelf: 'stretch',
    borderRadius: CARD_RADIUS,
    overflow: 'hidden',
    minHeight: 380,
    flex: 1,
    backgroundColor: '#0A0C10',
  },
  /** Full-bleed background; `cover` fills the card. */
  cardHeroImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  imageGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  cardMeta: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 20,
    paddingBottom: 22,
  },
  foodTitle: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginBottom: 6,
  },
  urgencyBlock: {
    marginBottom: 12,
    gap: 2,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 10,
  },
  userAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  userName: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
  },
  userLocation: {
    color: '#CCCCCC',
    fontSize: 12,
    marginTop: 2,
  },
  ownerTag: {
    color: '#6EE7B7',
    fontSize: 12,
    fontWeight: '700',
  },
  joinedLine: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 15,
    fontWeight: '700',
  },
  spotsLine: {
    color: '#A7F3D0',
    fontSize: 15,
    fontWeight: '800',
  },
  spotsLineMuted: {
    color: 'rgba(255,255,255,0.45)',
  },
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    flexWrap: 'wrap',
  },
  timerDigits: {
    color: '#FDE68A',
    fontSize: 20,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  timerHint: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    fontWeight: '600',
  },
  priceLine: {
    color: '#A7F3D0',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 12,
  },
  rowMeta: {
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
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  metaPillText: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 13,
    fontWeight: '600',
  },
  stamp: {
    position: 'absolute',
    top: '36%',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 3,
  },
  stampLike: {
    right: 24,
    borderColor: '#34D399',
    transform: [{ rotate: '-18deg' }],
  },
  stampLikeText: {
    color: '#34D399',
    fontSize: 28,
    fontWeight: '900',
  },
  stampNope: {
    left: 24,
    borderColor: '#FB7185',
    transform: [{ rotate: '18deg' }],
  },
  stampNopeText: {
    color: '#FB7185',
    fontSize: 28,
    fontWeight: '900',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 36,
    paddingVertical: 18,
    paddingBottom: 8,
  },
  circleBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
  },
  rejectCircle: {
    borderColor: 'rgba(251, 113, 133, 0.55)',
    backgroundColor: 'rgba(30, 18, 24, 0.95)',
  },
  acceptCircle: {
    borderColor: 'rgba(52, 211, 153, 0.55)',
    backgroundColor: 'rgba(14, 36, 28, 0.95)',
  },
  circleEmoji: {
    fontSize: 30,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#0E1218',
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    width: SCREEN_W - 36,
  },
  emptyTitle: {
    color: '#F1F5F9',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 8,
  },
  emptySub: {
    color: 'rgba(255,255,255,0.48)',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
  resetBtn: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(52, 211, 153, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.4)',
  },
  resetBtnText: {
    color: '#A7F3D0',
    fontWeight: '700',
  },
  successBurstWrap: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 40,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 100,
  },
  successHeart: {
    fontSize: 76,
    marginBottom: 4,
    textShadowColor: 'rgba(52,211,153,0.6)',
    textShadowRadius: 24,
    textShadowOffset: { width: 0, height: 0 },
  },
  successNice: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  successSub: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 4,
  },
});
