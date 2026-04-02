import { theme } from '@/constants/theme';
import {
  joinFoodCard,
  skipFoodCard,
  subscribeWaitingFoodCards,
  type FoodCard,
} from '@/services/foodCards';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
  const [cards, setCards] = useState<FoodCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const [joining, setJoining] = useState(false);
  const [swipeDirection, setSwipeDirection] = useState<'left' | 'right' | null>(null);
  const pan = useRef(new Animated.ValueXY()).current;
  const swipeInFlightRef = useRef(false);

  useEffect(() => {
    const unsub = subscribeWaitingFoodCards((rows) => {
      console.log('[swipe] cards from food_cards:', rows);
      setCards(rows);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const id = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const topCard = cards[0] ?? null;
  const secondCard = cards[1] ?? null;

  const removeTop = () => setCards((prev) => prev.slice(1));

  const onLike = async (cardId?: string) => {
    const targetId = cardId ?? topCard?.id;
    if (!targetId || joining) return;
    setJoining(true);
    try {
      const result = await joinFoodCard(targetId);
      console.log('[swipe] joinFoodCard result:', {
        cardId: targetId,
        matched: result.matched,
        chatId: result.chatId ?? null,
      });
      if (result.chatId) {
        removeTop();
        console.log('[swipe] navigating to chat:', {
          pathname: '/chat/[id]',
          id: String(result.chatId),
        });
        router.push({
          pathname: '/chat/[id]',
          params: { id: String(result.chatId) },
        } as never);
      } else {
        console.log('[swipe] no chat yet, stay on swipe deck:', { cardId: targetId });
        removeTop();
      }
    } finally {
      setJoining(false);
    }
  };

  const onSkip = async (cardId?: string) => {
    const targetId = cardId ?? topCard?.id;
    if (!targetId) return;
    await skipFoodCard(targetId);
    removeTop();
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
          if (g.dx > SWIPE_TRIGGER) swipe(1, topCard.id);
          else if (g.dx < -SWIPE_TRIGGER) swipe(-1, topCard.id);
          else {
            setSwipeDirection(null);
            Animated.spring(pan, {
              toValue: { x: 0, y: 0 },
              useNativeDriver: false,
            }).start();
          }
        },
      }),
    [pan, topCard?.id, joining],
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
        <Text style={styles.subtitle}>Right = Join · Left = Skip</Text>
      </View>
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color="#34D399" />
        </View>
      ) : !topCard ? (
        <View style={styles.centered}>
          <Text style={styles.empty}>No active food cards.</Text>
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
                {topCard.location ? 'Nearby location' : 'Location unavailable'}
              </Text>
              <Text style={styles.timer}>Ends in {formatTimer(topCard.expiresAt + tick * 0)}</Text>
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
                <Text style={styles.waitingText}>Waiting for someone...</Text>
              )}
            </View>
          </Animated.View>
        </View>
      )}
      <View style={styles.actions}>
        <TouchableOpacity onPress={() => onSkip()} style={[styles.btn, styles.skipBtn]}>
          <Text style={styles.skipText}>❌ Skip</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onLike()} style={[styles.btn, styles.likeBtn]}>
          <Text style={styles.likeText}>{joining ? '...' : '❤️ Join'}</Text>
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
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { color: 'rgba(248,250,252,0.65)' },
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
  skipText: { color: '#FCA5A5', fontWeight: '800' },
  likeText: { color: '#07241A', fontWeight: '800' },
});
