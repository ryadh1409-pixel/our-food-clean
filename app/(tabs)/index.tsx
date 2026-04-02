import { isAdminUser } from '@/constants/adminUid';
import { theme } from '@/constants/theme';
import { useAuth } from '@/services/AuthContext';
import {
  isFoodCardJoinDisabled,
  joinOrder,
  skipFoodCard,
  subscribeWaitingFoodCards,
  type FoodCard,
} from '@/services/foodCards';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

function formatTimer(expiresAt: number): string {
  const left = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
  const m = Math.floor(left / 60);
  const s = left % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function SwipeScreen() {
  const SWIPE_TRIGGER = 90;
  const router = useRouter();
  const { user } = useAuth();
  const [cards, setCards] = useState<FoodCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [cardsError, setCardsError] = useState(false);
  const [cardsRetryKey, setCardsRetryKey] = useState(0);
  const [tick, setTick] = useState(0);
  const [joining, setJoining] = useState(false);
  const [swipeDirection, setSwipeDirection] = useState<'left' | 'right' | null>(null);
  const pan = useRef(new Animated.ValueXY()).current;
  const swipeInFlightRef = useRef(false);

  useEffect(() => {
    setLoading(true);
    setCardsError(false);
    const unsub = subscribeWaitingFoodCards(
      (rows) => {
        console.log('[swipe] cards from food_cards:', rows);
        setCardsError(false);
        setCards(rows);
        setLoading(false);
      },
      () => setCardsError(true),
    );
    return () => unsub();
  }, [cardsRetryKey]);

  useEffect(() => {
    const id = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const uid = user?.uid;
  const adminPreview = isAdminUser(user);
  const deckCards = useMemo(() => {
    if (adminPreview && uid) {
      return cards.filter(
        (c) => typeof c.ownerId !== 'string' || c.ownerId !== uid,
      );
    }
    return cards;
  }, [cards, adminPreview, uid]);
  const topCard = deckCards[0] ?? null;
  const secondCard = deckCards[1] ?? null;
  /** Block swipe / primary join when signed in but cannot join this card (already in, full, admin, own card, etc.). */
  const joinBlockedForUser =
    !!uid && !!topCard && isFoodCardJoinDisabled(topCard, uid);
  const joinPrimaryDisabled =
    !topCard || joining || (!!uid && joinBlockedForUser);

  const removeCardById = (cardId: string) => {
    setCards((prev) => prev.filter((c) => c.id !== cardId));
  };

  const onLike = async (cardId?: string) => {
    const targetId = cardId ?? topCard?.id;
    if (!targetId || joining) return;
    const joinUid = user?.uid;
    if (!joinUid) {
      Alert.alert('Sign in required', 'Sign in to join a food card.');
      router.push('/(auth)/login' as never);
      return;
    }
    const card = cards.find((c) => c.id === targetId) ?? topCard;
    if (!card || isFoodCardJoinDisabled(card, joinUid)) return;
    setJoining(true);
    try {
      const result = await joinOrder(targetId, joinUid);
      console.log('[swipe] joinOrder result:', {
        cardId: targetId,
        alreadyJoined: result.alreadyJoined,
        isFull: result.isFull,
      });
      if (result.alreadyJoined) {
        Alert.alert('Already joined', 'You are already on this order.');
      } else if (result.isFull) {
        Alert.alert('Order full', 'This card has reached the maximum number of joiners.');
      }
      removeCardById(targetId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not join this card.';
      Alert.alert('Could not join', msg);
    } finally {
      setJoining(false);
    }
  };

  const onSkip = async (cardId?: string) => {
    const targetId = cardId ?? topCard?.id;
    if (!targetId) return;
    await skipFoodCard(targetId);
    removeCardById(targetId);
  };

  const swipe = (dx: number, cardId: string) => {
    if (swipeInFlightRef.current) return;
    swipeInFlightRef.current = true;
    Animated.timing(pan, {
      toValue: { x: dx > 0 ? 420 : -420, y: 0 },
      duration: 180,
      useNativeDriver: false,
    }).start(() => {
      pan.setValue({ x: 0, y: 0 });
      setSwipeDirection(null);
      const action = dx > 0 ? onLike(cardId) : onSkip(cardId);
      Promise.resolve(action).finally(() => {
        swipeInFlightRef.current = false;
      });
    });
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderMove: (_, g) => {
          pan.setValue({ x: g.dx, y: g.dy });
          if (g.dx > 8) setSwipeDirection('right');
          else if (g.dx < -8) setSwipeDirection('left');
          else setSwipeDirection(null);
        },
        onPanResponderRelease: (_, g) => {
          if (!topCard || joining || swipeInFlightRef.current) {
            setSwipeDirection(null);
            Animated.spring(pan, {
              toValue: { x: 0, y: 0 },
              useNativeDriver: false,
            }).start();
            return;
          }
          if (g.dx > SWIPE_TRIGGER) {
            if (joinBlockedForUser) {
              setSwipeDirection(null);
              Animated.spring(pan, {
                toValue: { x: 0, y: 0 },
                useNativeDriver: false,
              }).start();
              return;
            }
            swipe(1, topCard.id);
          } else if (g.dx < -SWIPE_TRIGGER) {
            swipe(-1, topCard.id);
          } else {
            setSwipeDirection(null);
            Animated.spring(pan, {
              toValue: { x: 0, y: 0 },
              useNativeDriver: false,
            }).start();
          }
        },
      }),
    [pan, topCard, joining, joinBlockedForUser],
  );

  const rotate = pan.x.interpolate({
    inputRange: [-180, 0, 180],
    outputRange: ['-12deg', '0deg', '12deg'],
  });
  const topStyle = { transform: [...pan.getTranslateTransform(), { rotate }] };
  const joinOpacity = pan.x.interpolate({
    inputRange: [20, 120],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const nopeOpacity = pan.x.interpolate({
    inputRange: [-120, -20],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  const emojiOpacity = pan.x.interpolate({
    inputRange: [-120, -20, 0, 20, 120],
    outputRange: [1, 0.25, 0, 0.25, 1],
    extrapolate: 'clamp',
  });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Swipe Food</Text>
        <Text style={styles.subtitle}>
          {adminPreview
            ? 'Admin preview · Join disabled · Skip to browse cards'
            : 'Right = Join · Left = Skip'}
        </Text>
        {adminPreview ? (
          <View style={styles.adminBanner}>
            <Text style={styles.adminBannerText}>
              Admin account — swipe deck is view-only for joins (your cards are excluded).
            </Text>
          </View>
        ) : null}
      </View>
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color="#34D399" />
          <Text style={styles.loadingHint}>Loading food cards…</Text>
        </View>
      ) : !topCard ? (
        <View style={styles.centered}>
          {cardsError ? (
            <>
              <Text style={styles.empty}>
                Could not load food cards. Check your connection.
              </Text>
              <TouchableOpacity
                style={styles.retryBtn}
                onPress={() => {
                  setCardsError(false);
                  setCardsRetryKey((k) => k + 1);
                }}
              >
                <Text style={styles.retryBtnText}>Try again</Text>
              </TouchableOpacity>
            </>
          ) : adminPreview && cards.length > 0 ? (
            <Text style={styles.empty}>
              No cards from other users to preview. Your admin listings are hidden here.
            </Text>
          ) : (
            <Text style={styles.empty}>
              No active food cards yet. Check back soon.
            </Text>
          )}
        </View>
      ) : (
        <View style={styles.deck}>
          {secondCard ? (
            <View style={[styles.card, styles.cardUnder]}>
              <Image source={{ uri: secondCard.image }} style={styles.image} />
            </View>
          ) : null}
          <Animated.View style={[styles.card, topStyle]} {...panResponder.panHandlers}>
            <Image source={{ uri: topCard.image }} style={styles.image} />
            <Animated.View style={[styles.swipeBadgeLeft, { opacity: nopeOpacity }]}>
              <Text style={styles.swipeBadgeTextLeft}>NOPE ❌</Text>
            </Animated.View>
            <Animated.View style={[styles.swipeBadgeRight, { opacity: joinOpacity }]}>
              <Text style={styles.swipeBadgeTextRight}>JOIN ❤️</Text>
            </Animated.View>
            {swipeDirection ? (
              <Animated.View style={[styles.emojiOverlay, { opacity: emojiOpacity }]}>
                <Text style={styles.emojiOverlayText}>
                  {swipeDirection === 'right' ? '❤️' : '❌'}
                </Text>
              </Animated.View>
            ) : null}
            <View style={styles.info}>
              <Text style={styles.cardTitle}>{topCard.title}</Text>
              <Text style={styles.meta}>${topCard.splitPrice.toFixed(2)} each</Text>
              <Text style={styles.meta}>{topCard.restaurantName}</Text>
              <Text style={styles.meta}>
                {topCard.location
                  ? 'Location included on this card'
                  : 'Location not listed on this card'}
              </Text>
              <Text style={styles.timer}>Ends in {formatTimer(topCard.expiresAt + tick * 0)}</Text>
              <TouchableOpacity
                activeOpacity={0.85}
                disabled={joinPrimaryDisabled}
                onPress={() => onLike(topCard.id)}
                style={[
                  styles.inlineJoinBtn,
                  joinPrimaryDisabled && styles.inlineJoinBtnDisabled,
                ]}
              >
                {joining ? (
                  <ActivityIndicator color="#07241A" />
                ) : (
                  <Text style={styles.inlineJoinText}>
                    {!uid
                      ? 'Sign in to join'
                      : topCard.joinedUsers?.includes(uid)
                        ? 'Joined'
                        : topCard.status === 'full'
                          ? 'Full'
                          : '❤️ Join order'}
                  </Text>
                )}
              </TouchableOpacity>
              {topCard.user1 ? (
                <View style={styles.hostRow}>
                  {topCard.user1.photo ? (
                    <Image source={{ uri: topCard.user1.photo }} style={styles.avatar} />
                  ) : (
                    <View style={[styles.avatar, styles.avatarPlaceholder]} />
                  )}
                  <Text style={styles.hostName}>{topCard.user1.name}</Text>
                </View>
              ) : (
                <Text style={styles.waitingText}>
                  Join this card to see host details when an order is created
                </Text>
              )}
            </View>
          </Animated.View>
        </View>
      )}
      <View style={styles.actions}>
        <TouchableOpacity
          disabled={!topCard || joining}
          onPress={() => onSkip()}
          style={[
            styles.btn,
            styles.skipBtn,
            (!topCard || joining) && styles.btnDisabled,
          ]}
        >
          <Text style={styles.skipText}>❌ Skip</Text>
        </TouchableOpacity>
        <TouchableOpacity
          disabled={joinPrimaryDisabled}
          onPress={() => onLike()}
          style={[
            styles.btn,
            styles.likeBtn,
            joinPrimaryDisabled && styles.btnDisabled,
          ]}
        >
          {joining ? (
            <ActivityIndicator color="#07241A" />
          ) : (
            <Text style={styles.likeText}>
              {!uid
                ? 'Sign in'
                : topCard && topCard.joinedUsers?.includes(uid)
                  ? 'Joined'
                  : topCard && (topCard.status === 'full' || (topCard.joinedUsers?.length ?? 0) >= (topCard.maxUsers ?? 2))
                    ? 'Full'
                    : '❤️ Join'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#070A0F' },
  header: { paddingHorizontal: theme.spacing.screen, paddingVertical: 12 },
  title: { color: '#F8FAFC', fontSize: 24, fontWeight: '800' },
  subtitle: { color: 'rgba(248,250,252,0.6)', marginTop: 4 },
  adminBanner: {
    marginTop: 10,
    padding: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(251, 191, 36, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.45)',
  },
  adminBannerText: {
    color: '#FDE68A',
    fontWeight: '700',
    fontSize: 13,
    lineHeight: 18,
  },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  loadingHint: {
    marginTop: 12,
    color: 'rgba(248,250,252,0.55)',
    fontSize: 14,
    fontWeight: '600',
  },
  empty: {
    color: 'rgba(248,250,252,0.65)',
    textAlign: 'center',
    lineHeight: 22,
  },
  retryBtn: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(52, 211, 153, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.45)',
  },
  retryBtnText: { color: '#A7F3D0', fontWeight: '800', fontSize: 15 },
  deck: { flex: 1, paddingHorizontal: 16, justifyContent: 'center' },
  card: {
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: '#11161F',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  cardUnder: { position: 'absolute', left: 26, right: 26, top: 90, opacity: 0.35 },
  image: { width: '100%', height: 350, backgroundColor: '#222' },
  info: { padding: 14 },
  cardTitle: { color: '#F8FAFC', fontSize: 24, fontWeight: '800' },
  meta: { color: 'rgba(248,250,252,0.7)', marginTop: 5 },
  timer: { color: '#34D399', marginTop: 8, fontWeight: '700' },
  hostRow: { marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  avatar: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#1f2937' },
  avatarPlaceholder: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  hostName: { color: '#D1FAE5', fontWeight: '700' },
  waitingText: { color: 'rgba(248,250,252,0.72)', marginTop: 8, fontWeight: '600' },
  inlineJoinBtn: {
    marginTop: 12,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#34D399',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineJoinBtnDisabled: { opacity: 0.45 },
  inlineJoinText: { color: '#07241A', fontWeight: '800', fontSize: 15 },
  swipeBadgeLeft: {
    position: 'absolute',
    left: 18,
    top: 18,
    borderWidth: 2,
    borderColor: '#f87171',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    zIndex: 10,
  },
  swipeBadgeRight: {
    position: 'absolute',
    right: 18,
    top: 18,
    borderWidth: 2,
    borderColor: '#34D399',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    zIndex: 10,
  },
  swipeBadgeTextLeft: { color: '#fda4af', fontWeight: '900', letterSpacing: 1.2 },
  swipeBadgeTextRight: { color: '#6ee7b7', fontWeight: '900', letterSpacing: 1.2 },
  emojiOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9,
    pointerEvents: 'none',
  },
  emojiOverlayText: {
    fontSize: 96,
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 8,
  },
  actions: { flexDirection: 'row', gap: 12, padding: 16 },
  btn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipBtn: { backgroundColor: 'rgba(239,68,68,0.14)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.4)' },
  likeBtn: { backgroundColor: '#34D399' },
  btnDisabled: { opacity: 0.45 },
  skipText: { color: '#FCA5A5', fontWeight: '800' },
  likeText: { color: '#07241A', fontWeight: '800' },
});
