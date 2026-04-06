import { isAdminFoodCardSlotId } from '@/constants/adminFoodCards';
import { isAdminUser } from '@/constants/adminUid';
import {
  PAYMENT_MATCH_ALERT_MESSAGE,
  PAYMENT_MATCH_ALERT_TITLE,
} from '@/constants/paymentDisclaimer';
import { safeAlertBody, USER_ERROR_JOIN } from '@/lib/userFacingErrors';
import { theme } from '@/constants/theme';
import { useAuth } from '@/services/AuthContext';
import { getHiddenUserIds } from '@/services/block';
import { FoodCardPaymentDisclaimer } from '@/components/FoodCardPaymentDisclaimer';
import {
  formatFoodCardSharingPriceLine,
  isFoodCardJoinDisabled,
  joinOrder,
  skipFoodCard,
  subscribeActiveFoodCards,
  type FoodCard,
} from '@/services/foodCards';
import { subscribeJoinHintsForFoodCard } from '@/services/foodCardSlotOrders';
import { subscribeActiveFoodTemplates } from '@/services/foodTemplates';
import type { FoodTemplate } from '@/types/food';
import { AIDescription } from '@/components/AIDescription';
import { showError, showNotice } from '@/utils/toast';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

function formatTimer(expiresAt: number): string {
  const left = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
  const m = Math.floor(left / 60);
  const s = left % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function SwipeScreen() {
  const SWIPE_TRIGGER = 90;
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const [cards, setCards] = useState<FoodCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [cardsError, setCardsError] = useState(false);
  const [cardsRetryKey, setCardsRetryKey] = useState(0);
  const [tick, setTick] = useState(0);
  const [joining, setJoining] = useState(false);
  const [hiddenUserIds, setHiddenUserIds] = useState<Set<string>>(new Set());
  const [foodTemplates, setFoodTemplates] = useState<FoodTemplate[]>([]);
  const [swipeDirection, setSwipeDirection] = useState<'left' | 'right' | null>(null);
  const pan = useRef(new Animated.ValueXY()).current;
  const swipeInFlightRef = useRef(false);

  useEffect(() => {
    setLoading(true);
    setCardsError(false);
    const unsub = subscribeActiveFoodCards(
      (rows) => {
        console.log(
          `[swipe] deck count=${rows.length} (food_cards · status==active · onSnapshot)`,
        );
        rows.forEach((c) =>
          console.log(`[swipe] card ${c.id} status=${c.status}`),
        );
        setCardsError(false);
        setCards(rows);
        setLoading(false);
      },
      () => setCardsError(true),
    );
    return () => unsub();
  }, [cardsRetryKey]);

  useEffect(() => {
    const unsub = subscribeActiveFoodTemplates(
      (rows) => setFoodTemplates(rows),
      () => setFoodTemplates([]),
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    const id = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const uid = user?.uid;

  useEffect(() => {
    if (!uid) {
      setHiddenUserIds(new Set());
      return;
    }
    let cancelled = false;
    getHiddenUserIds(uid)
      .then((s) => {
        if (!cancelled) setHiddenUserIds(s);
      })
      .catch(() => {
        if (!cancelled) setHiddenUserIds(new Set());
      });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  const adminPreview = isAdminUser(user);
  const deckCards = useMemo(() => {
    let list = cards;
    if (adminPreview && uid) {
      list = list.filter(
        (c) => typeof c.ownerId !== 'string' || c.ownerId !== uid,
      );
    }
    if (uid && hiddenUserIds.size > 0) {
      list = list.filter(
        (c) =>
          typeof c.ownerId !== 'string' || !hiddenUserIds.has(c.ownerId),
      );
    }
    return list;
  }, [cards, adminPreview, uid, hiddenUserIds]);
  const topCard = deckCards[0] ?? null;
  const secondCard = deckCards[1] ?? null;
  const [topJoinHint, setTopJoinHint] = useState<{
    primaryOpenUsers: string[];
    anyOpenOrderMemberIds: string[];
  } | null>(null);

  useEffect(() => {
    if (!topCard?.id) {
      setTopJoinHint(null);
      return;
    }
    return subscribeJoinHintsForFoodCard(topCard.id, setTopJoinHint);
  }, [topCard?.id]);

  /** Block swipe / primary join when signed in but cannot join this card (already in, full, admin, own card, etc.). */
  const joinBlockedForUser =
    !!uid &&
    !!topCard &&
    isFoodCardJoinDisabled(
      topCard,
      uid,
      topJoinHint?.anyOpenOrderMemberIds ?? null,
    );
  const joinPrimaryDisabled =
    !topCard || joining || (!!uid && joinBlockedForUser);

  const matchDeckHint = useMemo(() => {
    if (!uid || !topJoinHint) return null;
    if (topJoinHint.anyOpenOrderMemberIds.includes(uid)) return 'joined' as const;
    if (topJoinHint.primaryOpenUsers.length >= 1) return 'waiting' as const;
    return 'open' as const;
  }, [uid, topJoinHint]);

  const removeCardById = (cardId: string) => {
    setCards((prev) => prev.filter((c) => c.id !== cardId));
  };

  const onLike = async (cardId?: string) => {
    const targetId = cardId ?? topCard?.id;
    if (!targetId || joining) return;
    const joinUid = user?.uid;
    if (!joinUid) {
      showError('Sign in to join a food card.');
      router.push('/(auth)/login' as never);
      return;
    }
    const card = cards.find((c) => c.id === targetId) ?? topCard;
    const hint =
      card && topCard && card.id === topCard.id
        ? topJoinHint?.anyOpenOrderMemberIds ?? null
        : null;
    if (!card || isFoodCardJoinDisabled(card, joinUid, hint)) return;
    setJoining(true);
    try {
      const result = await joinOrder(targetId, joinUid);
      if (!result.ok) {
        if (!result.silent) {
          showError(safeAlertBody(result.message, USER_ERROR_JOIN));
        }
        return;
      }
      if (result.justBecamePair) {
        showNotice(PAYMENT_MATCH_ALERT_TITLE, PAYMENT_MATCH_ALERT_MESSAGE);
      }
      router.push(`/order/${result.orderId}` as never);
    } catch (e) {
      showError(USER_ERROR_JOIN);
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
      {foodTemplates.length > 0 ? (
        <View style={styles.templateSection}>
          <Text style={styles.templateSectionTitle}>Order from menu</Text>
          <Text style={styles.templateSectionSub}>
            Tap to start an order with name, price, and photo filled in
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.templateStrip}
          >
            {foodTemplates.map((t) => (
              <TouchableOpacity
                key={t.id}
                activeOpacity={0.88}
                style={styles.templateCard}
                onPress={() =>
                  router.push({
                    pathname: '/(tabs)/create',
                    params: {
                      fromFoodTemplate: '1',
                      prefillTitle: t.name,
                      prefillPriceSplit: `$${t.price.toFixed(2)}`,
                      prefillImageUrl: t.imageUrl,
                      prefillDescription: t.description,
                      templateId: t.id,
                    },
                  } as never)
                }
              >
                {t.imageUrl ? (
                  <Image
                    source={{ uri: t.imageUrl }}
                    style={styles.templateImage}
                  />
                ) : (
                  <View style={[styles.templateImage, styles.templateImagePh]} />
                )}
                <View style={styles.templateCardBody}>
                  <Text style={styles.templateName} numberOfLines={2}>
                    {t.name}
                  </Text>
                  <Text style={styles.templatePrice}>
                    ${t.price.toFixed(2)}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      ) : null}
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
        <View style={styles.deckWithActions}>
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
              <AIDescription
                description={topCard.aiDescription}
                title={topCard.title}
                compact
              />
              <Text style={styles.meta}>
                {formatFoodCardSharingPriceLine(topCard.sharingPrice)}
              </Text>
              <Text style={styles.meta}>{topCard.restaurantName}</Text>
              <Text style={styles.meta} numberOfLines={3}>
                {topCard.venueLocation.trim()
                  ? `Location: ${topCard.venueLocation.trim()}`
                  : topCard.location
                    ? 'Location included on this card'
                    : 'Location not listed on this card'}
              </Text>
              <FoodCardPaymentDisclaimer style={styles.cardDisclaimer} />
              {isAdminFoodCardSlotId(topCard.id) ||
              topCard.expiresAt > 1e15 ? null : (
                <Text style={styles.timer}>
                  Ends in {formatTimer(topCard.expiresAt + tick * 0)}
                </Text>
              )}
              <TouchableOpacity
                activeOpacity={0.88}
                onPress={() =>
                  router.push(
                    `/order/${topCard.orderId ?? topCard.id}` as never,
                  )
                }
                style={styles.detailsBtn}
              >
                <Text style={styles.detailsBtnText}>View details →</Text>
              </TouchableOpacity>
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
                      : topJoinHint?.anyOpenOrderMemberIds.includes(uid)
                        ? 'Joined'
                        : '❤️ Join order'}
                  </Text>
                )}
              </TouchableOpacity>
              {!uid ? (
                <Text style={styles.waitingText}>
                  Sign in to join this share and get matched with a partner.
                </Text>
              ) : matchDeckHint === 'joined' ? (
                <View style={[styles.matchPill, styles.matchPillJoined]}>
                  <Text style={styles.matchPillText}>
                    You’re in — open details for your order
                  </Text>
                </View>
              ) : matchDeckHint === 'waiting' ? (
                <View style={[styles.matchPill, styles.matchPillWaiting]}>
                  <Text style={styles.matchPillText}>
                    Someone’s waiting — join to complete the pair
                  </Text>
                </View>
              ) : matchDeckHint === 'open' ? (
                <View style={styles.matchPill}>
                  <Text style={styles.matchPillText}>
                    Be the first to join this share
                  </Text>
                </View>
              ) : topCard.user1 ? (
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
                  Join to create an order and get matched.
                </Text>
              )}
            </View>
          </Animated.View>
        </View>
        <View
          pointerEvents="box-none"
          style={[
            styles.actionsBarWrap,
            { bottom: Math.max(20, 10 + insets.bottom) },
          ]}
        >
          <BlurView intensity={48} tint="dark" style={styles.actionsBlur}>
            <View style={styles.actionsInner}>
              <TouchableOpacity
                disabled={joining}
                onPress={() => onSkip()}
                style={[styles.skipBarBtn, joining && styles.barBtnDisabled]}
                activeOpacity={0.85}
              >
                <Text style={styles.skipBarText}>Skip</Text>
              </TouchableOpacity>
              <TouchableOpacity
                disabled={joinPrimaryDisabled}
                onPress={() => onLike()}
                style={[
                  styles.joinBarBtn,
                  joinPrimaryDisabled && styles.barBtnDisabled,
                ]}
                activeOpacity={0.88}
              >
                {joining ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.joinBarText}>
                    {!uid
                      ? 'Sign in'
                      : topJoinHint?.anyOpenOrderMemberIds.includes(uid)
                        ? 'Joined'
                        : 'Join'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </BlurView>
        </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#070A0F' },
  header: { paddingHorizontal: theme.spacing.screen, paddingVertical: 12 },
  templateSection: {
    paddingLeft: theme.spacing.screen,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  templateSectionTitle: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '800',
  },
  templateSectionSub: {
    color: 'rgba(248,250,252,0.5)',
    fontSize: 12,
    marginTop: 4,
    marginBottom: 10,
    paddingRight: theme.spacing.screen,
  },
  templateStrip: { paddingRight: theme.spacing.screen },
  templateCard: {
    width: 148,
    marginRight: 12,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#11161F',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  templateImage: { width: '100%', height: 104, backgroundColor: '#1a1f28' },
  templateImagePh: { alignItems: 'center', justifyContent: 'center' },
  templateCardBody: { padding: 10 },
  templateName: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 18,
  },
  templatePrice: {
    color: '#34D399',
    fontSize: 15,
    fontWeight: '800',
    marginTop: 6,
  },
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
  deckWithActions: { flex: 1, position: 'relative' },
  deck: {
    flex: 1,
    paddingHorizontal: 16,
    justifyContent: 'center',
    paddingBottom: 96,
  },
  actionsBarWrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 20,
  },
  actionsBlur: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(15, 23, 32, 0.65)',
  },
  actionsInner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  skipBarBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.38)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  joinBarBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(45, 212, 191, 0.88)',
  },
  barBtnDisabled: { opacity: 0.45 },
  skipBarText: {
    color: 'rgba(203, 213, 225, 0.95)',
    fontSize: 15,
    fontWeight: '600',
  },
  joinBarText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
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
  cardDisclaimer: { alignSelf: 'stretch' },
  timer: { color: '#34D399', marginTop: 8, fontWeight: '700' },
  detailsBtn: {
    marginTop: 10,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.45)',
    backgroundColor: 'rgba(52, 211, 153, 0.08)',
  },
  detailsBtnText: { color: '#6EE7B7', fontWeight: '800', fontSize: 15 },
  hostRow: { marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#1f2937' },
  avatarPlaceholder: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  hostName: { color: '#D1FAE5', fontWeight: '700' },
  matchPill: {
    marginTop: 12,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(148,163,184,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.22)',
  },
  matchPillWaiting: {
    backgroundColor: 'rgba(251,191,36,0.12)',
    borderColor: 'rgba(251,191,36,0.35)',
  },
  matchPillJoined: {
    backgroundColor: 'rgba(52,211,153,0.14)',
    borderColor: 'rgba(52,211,153,0.35)',
  },
  matchPillText: {
    color: 'rgba(248,250,252,0.92)',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 18,
  },
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
});
