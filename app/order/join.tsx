import { isUserBanned } from '@/services/adminGuard';
import { auth, db } from '@/services/firebase';
import { cancelHalfOrder } from '@/services/halfOrderCancel';
import { joinHalfOrderByOrderId } from '@/services/joinOrder';
import {
  formatOrderCountdown,
  joinOrderWithParticipantRecord,
  normalizeParticipantsStrings,
  ORDER_JOIN_WINDOW_MS,
  parseJoinedAtMs,
  remainingMsAfterJoin,
} from '@/services/orderLifecycle';
import { memberIdsFromOrderData } from '@/services/orders';
import { useRouter } from 'expo-router';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { shadows, theme } from '@/constants/theme';

type JoinableOrder = {
  id: string;
  label: string;
  subtitle: string;
  status: string;
  maxPeople: number;
  memberCount: number;
  usesHalf: boolean;
};

type MySpot = {
  id: string;
  label: string;
  usesHalf: boolean;
  remainingLabel: string | null;
};

function docToJoinable(
  id: string,
  data: Record<string, unknown>,
  uid: string | undefined,
): JoinableOrder | null {
  const status =
    typeof data.status === 'string' ? data.status.trim().toLowerCase() : '';
  if (status !== 'open' && status !== 'waiting') return null;

  const users = Array.isArray(data.users)
    ? data.users.filter((x): x is string => typeof x === 'string' && x.length > 0)
    : [];
  const usesHalf = users.length > 0;
  const members = memberIdsFromOrderData(data);
  const partStrings = normalizeParticipantsStrings(data.participants);
  const memberCount =
    members.length > 0
      ? members.length
      : partStrings.length > 0
        ? partStrings.length
        : Number(data.peopleJoined ?? 1);

  const maxPeople = Number(data.maxPeople ?? data.maxUsers ?? 2);

  if (memberCount >= maxPeople) return null;
  if (uid && members.includes(uid)) return null;

  const foodName =
    typeof data.foodName === 'string' && data.foodName.trim()
      ? data.foodName.trim()
      : typeof data.mealType === 'string' && data.mealType.trim()
        ? data.mealType.trim()
        : usesHalf
          ? 'Half order'
          : 'Shared order';
  const hostId =
    typeof data.hostId === 'string' && data.hostId.trim()
      ? data.hostId.trim()
      : typeof data.createdBy === 'string' && data.createdBy.trim()
        ? data.createdBy.trim()
        : members[0] ?? '—';

  return {
    id,
    label: foodName,
    subtitle: `${usesHalf ? 'Half order' : 'Open order'} · Host ${hostId.slice(0, 8)}…`,
    status,
    maxPeople,
    memberCount,
    usesHalf,
  };
}

function docToMySpot(
  id: string,
  data: Record<string, unknown>,
  uid: string,
  now: number,
): MySpot | null {
  const status =
    typeof data.status === 'string' ? data.status.trim().toLowerCase() : '';
  if (
    status === 'cancelled' ||
    status === 'completed' ||
    status === 'expired'
  ) {
    return null;
  }
  const members = memberIdsFromOrderData(data);
  if (!members.includes(uid)) return null;
  if (status !== 'open' && status !== 'waiting' && status !== 'matched') {
    return null;
  }

  const users = Array.isArray(data.users)
    ? data.users.filter((x): x is string => typeof x === 'string' && x.length > 0)
    : [];
  const usesHalf = users.length > 0;

  const foodName =
    typeof data.foodName === 'string' && data.foodName.trim()
      ? data.foodName.trim()
      : typeof data.mealType === 'string' && data.mealType.trim()
        ? data.mealType.trim()
        : 'Your order';

  const joinedAtMap = data.joinedAtMap as Record<string, unknown> | undefined;
  const joinedMs = parseJoinedAtMs(joinedAtMap?.[uid]);
  const rem =
    joinedMs != null ? remainingMsAfterJoin(joinedMs, now) : null;
  const remainingLabel =
    rem != null && rem > 0
      ? formatOrderCountdown(rem)
      : joinedMs != null && rem != null && rem <= 0
        ? 'Window ended — continue in app'
        : null;

  return {
    id,
    label: foodName,
    usesHalf,
    remainingLabel,
  };
}

export default function JoinOrderScreen() {
  const router = useRouter();
  const [joinable, setJoinable] = useState<JoinableOrder[]>([]);
  const [mySpots, setMySpots] = useState<MySpot[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [leavingId, setLeavingId] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());

  const uid = auth.currentUser?.uid;

  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const q = query(
      collection(db, 'orders'),
      where('status', 'in', ['open', 'waiting']),
    );
    setLoading(true);
    setListError(false);
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setListError(false);
        const joinList: JoinableOrder[] = [];
        const mine: MySpot[] = [];
        for (const d of snap.docs) {
          const data = d.data() as Record<string, unknown>;
          const j = docToJoinable(d.id, data, uid);
          if (j) joinList.push(j);
          if (uid) {
            const spot = docToMySpot(d.id, data, uid, nowTick);
            if (spot) mine.push(spot);
          }
        }
        joinList.sort((a, b) => a.label.localeCompare(b.label));
        mine.sort((a, b) => a.label.localeCompare(b.label));
        setJoinable(joinList);
        setMySpots(mine);
        setLoading(false);
      },
      () => {
        setListError(true);
        setJoinable([]);
        setMySpots([]);
        setLoading(false);
      },
    );
    return () => unsubscribe();
  }, [retryNonce, uid, nowTick]);

  const headerJoinableCount = useMemo(() => joinable.length, [joinable]);

  const handleGoSwipe = () => {
    router.push('/(tabs)/index');
  };

  const handleJoin = async (item: JoinableOrder) => {
    const orderId = item.id;
    const u = auth.currentUser?.uid;
    if (!u) {
      router.push('/(auth)/login?redirectTo=/order/join');
      return;
    }
    if (await isUserBanned(u)) {
      Alert.alert(
        'Access denied',
        'Your account has been restricted. You cannot join orders.',
      );
      return;
    }
    setJoiningId(orderId);
    try {
      const ref = doc(db, 'orders', orderId);
      const pre = await getDoc(ref);
      if (!pre.exists()) throw new Error('Order no longer exists.');
      const d = pre.data() as Record<string, unknown>;
      const members = memberIdsFromOrderData(d);
      if (members.includes(u)) {
        Alert.alert('Already joined', 'You are already on this order.', [
          {
            text: 'Open',
            onPress: () => router.push(`/order/${orderId}` as never),
          },
          { text: 'OK' },
        ]);
        return;
      }

      if (item.usesHalf) {
        const res = await joinHalfOrderByOrderId(orderId);
        if (res.alreadyJoined) {
          router.push(`/order/${orderId}` as never);
          return;
        }
      } else {
        await joinOrderWithParticipantRecord(db, orderId, u, {}, {
          requireOpenForJoin: true,
        });
        await addDoc(collection(db, 'orders', orderId, 'messages'), {
          type: 'system',
          text: 'A participant joined',
          senderId: '',
          senderName: '',
          createdAt: serverTimestamp(),
        });
      }

      Alert.alert(
        'Joined',
        `You have ${Math.round(ORDER_JOIN_WINDOW_MS / 60000)} minutes to coordinate after joining.`,
      );
      router.push(`/order/${orderId}` as never);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to join';
      Alert.alert('Could not join', msg);
    } finally {
      setJoiningId(null);
    }
  };

  const handleLeaveSpot = (spot: MySpot) => {
    const u = auth.currentUser?.uid;
    if (!u) return;
    Alert.alert(
      'Leave this order?',
      'Other participants will see you left.',
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: spot.usesHalf ? 'Cancel order' : 'Leave',
          style: 'destructive',
          onPress: async () => {
            setLeavingId(spot.id);
            try {
              if (spot.usesHalf) {
                await cancelHalfOrder(spot.id);
              } else {
                const { leaveOrderParticipant } = await import('@/services/orderLifecycle');
                await leaveOrderParticipant(db, spot.id, u);
              }
              Alert.alert('Updated', 'You left the order.');
            } catch (e) {
              const msg = e instanceof Error ? e.message : 'Could not leave';
              Alert.alert('Error', msg);
            } finally {
              setLeavingId(null);
            }
          },
        },
      ],
    );
  };

  const renderJoinItem = ({ item }: { item: JoinableOrder }) => (
    <View style={styles.card}>
      <Text style={styles.cardLabel}>Order</Text>
      <Text style={styles.cardValue}>{item.label}</Text>
      <Text style={styles.cardMeta}>
        {item.memberCount}/{item.maxPeople} joined · {item.status}
      </Text>
      <Text style={styles.cardHint}>{item.subtitle}</Text>
      <TouchableOpacity
        style={[styles.joinBtn, joiningId === item.id && styles.btnDisabled]}
        onPress={() => handleJoin(item)}
        disabled={joiningId === item.id}
      >
        {joiningId === item.id ? (
          <ActivityIndicator
            size="small"
            color={theme.colors.textOnPrimary}
          />
        ) : (
          <Text style={styles.joinBtnText}>Join order</Text>
        )}
      </TouchableOpacity>
    </View>
  );

  const renderMySpot = ({ item }: { item: MySpot }) => (
    <View style={styles.card}>
      <Text style={styles.cardLabel}>Your spot</Text>
      <Text style={styles.cardValue}>{item.label}</Text>
      {item.remainingLabel ? (
        <Text style={styles.timerText}>{item.remainingLabel}</Text>
      ) : null}
      <View style={styles.rowBtns}>
        <TouchableOpacity
          style={styles.openBtn}
          onPress={() => router.push(`/order/${item.id}` as never)}
        >
          <Text style={styles.openBtnText}>Open</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.leaveBtn, leavingId === item.id && styles.btnDisabled]}
          onPress={() => handleLeaveSpot(item)}
          disabled={leavingId === item.id}
        >
          {leavingId === item.id ? (
            <ActivityIndicator size="small" color={theme.colors.danger} />
          ) : (
            <Text style={styles.leaveBtnText}>
              {item.usesHalf ? 'Cancel' : 'Leave'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );

  const listHeader = (
    <>
      <Text style={styles.title}>Join an order</Text>
      <TouchableOpacity
        style={styles.createButton}
        onPress={handleGoSwipe}
        activeOpacity={0.85}
      >
        <Text style={styles.createButtonText}>Go to Swipe</Text>
      </TouchableOpacity>
      {mySpots.length > 0 ? (
        <>
          <Text style={styles.sectionTitle}>Your active spots</Text>
          {mySpots.map((item) => (
            <View key={item.id}>{renderMySpot({ item })}</View>
          ))}
        </>
      ) : null}
      <Text style={styles.sectionTitle}>
        Open orders ({headerJoinableCount})
      </Text>
    </>
  );

  if (loading && joinable.length === 0 && mySpots.length === 0) {
    return (
      <SafeAreaView style={styles.centered} edges={['top']}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingCaption}>Loading open orders…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <FlatList
        data={joinable}
        keyExtractor={(item) => item.id}
        renderItem={renderJoinItem}
        ListHeaderComponent={listHeader}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyBlock}>
            {listError ? (
              <>
                <Text style={styles.emptyText}>
                  Could not load orders. Check your connection and try again.
                </Text>
                <TouchableOpacity
                  style={styles.retryBtn}
                  onPress={() => {
                    setListError(false);
                    setLoading(true);
                    setRetryNonce((n) => n + 1);
                  }}
                >
                  <Text style={styles.retryBtnText}>Try again</Text>
                </TouchableOpacity>
              </>
            ) : (
              <Text style={styles.emptyText}>
                No joinable orders right now — start one from Swipe or the map.
              </Text>
            )}
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  centered: {
    flex: 1,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingCaption: {
    marginTop: 14,
    color: theme.colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.colors.text,
    paddingHorizontal: theme.spacing.screen,
    paddingTop: 24,
    paddingBottom: 16,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.text,
    paddingHorizontal: theme.spacing.screen,
    marginBottom: 8,
    marginTop: 8,
  },
  createButton: {
    backgroundColor: theme.colors.primary,
    marginHorizontal: theme.spacing.screen,
    paddingVertical: 16,
    borderRadius: theme.radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: theme.spacing.touchMin,
    ...shadows.button,
  },
  createButtonText: {
    color: theme.colors.textOnPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  listContent: {
    paddingHorizontal: theme.spacing.screen,
    paddingBottom: 32,
  },
  card: {
    backgroundColor: theme.colors.chromeWash,
    borderRadius: theme.radius.card,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.tight,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  cardLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cardValue: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
    marginTop: 4,
    marginBottom: 8,
  },
  cardMeta: {
    fontSize: 13,
    color: theme.colors.textMuted,
    marginBottom: 4,
  },
  cardHint: {
    fontSize: 12,
    color: theme.colors.textMuted,
    marginBottom: 12,
  },
  timerText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.accentBlue,
    marginBottom: 10,
  },
  rowBtns: {
    flexDirection: 'row',
    gap: 10,
  },
  openBtn: {
    flex: 1,
    backgroundColor: theme.colors.primary,
    paddingVertical: 12,
    borderRadius: theme.radius.button,
    alignItems: 'center',
  },
  openBtnText: {
    color: theme.colors.textOnPrimary,
    fontWeight: '700',
  },
  leaveBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.colors.danger,
    paddingVertical: 12,
    borderRadius: theme.radius.button,
    alignItems: 'center',
  },
  leaveBtnText: {
    color: theme.colors.danger,
    fontWeight: '700',
  },
  joinBtn: {
    backgroundColor: theme.colors.accentBlue,
    paddingVertical: 12,
    borderRadius: theme.radius.button,
    alignItems: 'center',
  },
  btnDisabled: {
    opacity: 0.6,
  },
  joinBtnText: {
    color: theme.colors.textOnPrimary,
    fontWeight: '700',
    fontSize: 16,
  },
  emptyBlock: {
    marginTop: 24,
  },
  emptyText: {
    color: theme.colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
  },
  retryBtn: {
    marginTop: 14,
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: theme.colors.accentBlue,
  },
  retryBtnText: {
    color: theme.colors.textOnPrimary,
    fontWeight: '700',
  },
});
