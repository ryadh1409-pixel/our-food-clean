import {
  PAYMENT_MATCH_ALERT_MESSAGE,
  PAYMENT_MATCH_ALERT_TITLE,
} from '@/constants/paymentDisclaimer';
import { theme } from '@/constants/theme';
import { FoodCardGrid } from '@/components/FoodCardGrid';
import { useAuth } from '@/services/AuthContext';
import { FoodCardPaymentDisclaimer } from '@/components/FoodCardPaymentDisclaimer';
import { safeAlertBody, USER_ERROR_JOIN } from '@/lib/userFacingErrors';
import {
  formatFoodCardSharingPriceLine,
  isFoodCardJoinDisabled,
  joinOrder,
  subscribeActiveFoodCards,
  type FoodCard,
} from '@/services/foodCards';
import { subscribeJoinHintsForFoodCard } from '@/services/foodCardSlotOrders';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { AIDescription } from '@/components/AIDescription';
import { SafeAreaView } from 'react-native-safe-area-context';

const D = {
  bg: '#06080C',
  card: '#11161F',
  border: 'rgba(255,255,255,0.1)',
  text: '#F8FAFC',
  muted: 'rgba(248,250,252,0.55)',
};

function BrowseFoodCardRow({
  card,
  uid,
  joiningId,
  onJoin,
  router,
}: {
  card: FoodCard;
  uid: string | undefined;
  joiningId: string | null;
  onJoin: (c: FoodCard) => void;
  router: ReturnType<typeof useRouter>;
}) {
  const [joinHint, setJoinHint] = useState<{
    primaryOpenUsers: string[];
    anyOpenOrderMemberIds: string[];
  } | null>(null);

  useEffect(() => {
    return subscribeJoinHintsForFoodCard(card.id, setJoinHint);
  }, [card.id]);

  const joinBusy = joiningId === card.id;
  const joinDisabled =
    joinBusy ||
    (!!uid &&
      isFoodCardJoinDisabled(
        card,
        uid,
        joinHint?.anyOpenOrderMemberIds ?? null,
      ));
  const detailPath = card.id;
  const alreadyIn = !!(
    uid && joinHint?.anyOpenOrderMemberIds.includes(uid)
  );
  let joinLabel = '❤️ Join';
  if (!uid) joinLabel = 'Sign in to join';
  else if (alreadyIn) joinLabel = 'Joined';

  return (
    <View style={styles.card}>
      <TouchableOpacity
        activeOpacity={0.92}
        onPress={() => router.push(`/order/${detailPath}` as never)}
      >
        <Image source={{ uri: card.image }} style={styles.hero} />
      </TouchableOpacity>
      <View style={styles.cardBody}>
        <TouchableOpacity
          activeOpacity={0.88}
          onPress={() => router.push(`/order/${detailPath}` as never)}
        >
          <Text style={styles.cardTitle}>{card.title}</Text>
        </TouchableOpacity>
        <AIDescription description={card.aiDescription} title={card.title} />
        <Text style={styles.meta}>{card.restaurantName}</Text>
        <Text style={styles.meta}>
          {formatFoodCardSharingPriceLine(card.sharingPrice)}
        </Text>
        <Text style={styles.meta}>Total ${card.price.toFixed(2)}</Text>
        <Text style={styles.meta} numberOfLines={3}>
          {card.venueLocation.trim()
            ? `Location: ${card.venueLocation.trim()}`
            : card.location
              ? 'Location on map'
              : 'Location not listed'}
        </Text>
        <Text style={styles.meta}>HalfOrder share · up to 2 people</Text>
        <FoodCardPaymentDisclaimer style={styles.rowDisclaimer} />
        <TouchableOpacity
          style={styles.detailsRow}
          activeOpacity={0.88}
          onPress={() => router.push(`/order/${detailPath}` as never)}
        >
          <Text style={styles.detailsRowText}>View details →</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.joinBtn,
            joinDisabled && !joinBusy && styles.joinBtnDisabled,
          ]}
          disabled={joinDisabled}
          onPress={() => onJoin(card)}
        >
          {joinBusy ? (
            <ActivityIndicator color="#0B1A15" />
          ) : (
            <Text style={styles.joinText}>{joinLabel}</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function BrowseScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [cards, setCards] = useState<FoodCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [joiningId, setJoiningId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setListError(false);
    const unsub = subscribeActiveFoodCards(
      (rows) => {
        console.log(
          `[browse] count=${rows.length} (food_cards · status==active)`,
        );
        rows.forEach((c) =>
          console.log(`[browse] card ${c.id} status=${c.status}`),
        );
        setCards(rows);
        setLoading(false);
      },
      () => setListError(true),
    );
    return () => unsub();
  }, [retryKey]);

  const onJoin = async (card: FoodCard) => {
    const uid = user?.uid;
    if (!uid) {
      Alert.alert('Sign in required', 'Sign in to join a food card.');
      router.push('/(auth)/login' as never);
      return;
    }
    if (isFoodCardJoinDisabled(card, uid)) return;
    setJoiningId(card.id);
    try {
      const result = await joinOrder(card.id, uid);
      if (!result.ok) {
        if (!result.silent) {
          Alert.alert('Unable to join', safeAlertBody(result.message, USER_ERROR_JOIN));
        }
        return;
      }
      if (result.justBecamePair) {
        Alert.alert(PAYMENT_MATCH_ALERT_TITLE, PAYMENT_MATCH_ALERT_MESSAGE);
      }
      router.push(`/order/${result.orderId}` as never);
    } catch (e) {
      Alert.alert('Unable to join', USER_ERROR_JOIN);
    } finally {
      setJoiningId(null);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Text style={styles.title}>Swipe & Join</Text>
        <Text style={styles.subtitle}>Admin-curated food cards</Text>
      </View>
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color="#34D399" />
          <Text style={styles.loadingHint}>Loading food cards…</Text>
        </View>
      ) : cards.length === 0 ? (
        listError ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.empty}>
              Could not load food cards. Check your connection.
            </Text>
            <TouchableOpacity
              style={styles.retryBtn}
              onPress={() => setRetryKey((k) => k + 1)}
            >
              <Text style={styles.retryText}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.centered}>
            <Text style={styles.empty}>No active food cards yet. Check back soon.</Text>
          </View>
        )
      ) : (
        <FoodCardGrid
          data={cards}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.content}
          renderItem={(card) => (
            <BrowseFoodCardRow
              card={card}
              uid={user?.uid}
              joiningId={joiningId}
              onJoin={onJoin}
              router={router}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: D.bg },
  header: { paddingHorizontal: theme.spacing.screen, paddingVertical: 14 },
  title: { color: D.text, fontSize: 24, fontWeight: '800' },
  subtitle: { color: D.muted, marginTop: 6 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingHint: { marginTop: 12, color: D.muted, fontSize: 14, fontWeight: '600' },
  content: { padding: theme.spacing.screen, paddingBottom: 32 },
  emptyWrap: { marginTop: 30, alignItems: 'center' },
  empty: { color: D.muted, textAlign: 'center', lineHeight: 22 },
  retryBtn: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: 'rgba(52, 211, 153, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.35)',
  },
  retryText: { color: '#A7F3D0', fontWeight: '800' },
  card: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: D.border,
    marginBottom: 14,
    backgroundColor: D.card,
  },
  hero: { width: '100%', height: 220, backgroundColor: '#222' },
  cardBody: { padding: 14 },
  cardTitle: { color: D.text, fontSize: 20, fontWeight: '800' },
  meta: { color: D.muted, marginTop: 6 },
  rowDisclaimer: { alignSelf: 'stretch' },
  detailsRow: {
    marginTop: 10,
    paddingVertical: 8,
    alignItems: 'center',
  },
  detailsRowText: { color: '#6EE7B7', fontWeight: '800', fontSize: 15 },
  joinBtn: {
    marginTop: 12,
    height: 46,
    borderRadius: 12,
    backgroundColor: '#34D399',
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinBtnDisabled: { opacity: 0.45 },
  joinText: { color: '#071A14', fontWeight: '800' },
});
