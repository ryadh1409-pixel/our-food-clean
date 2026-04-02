import { useHiddenUserIds } from '@/hooks/useHiddenUserIds';
import { formatTorontoOrderTime } from '@/lib/format-toronto-time';
import { isUserBanned } from '@/services/adminGuard';
import { trackEvent } from '@/services/analytics';
import { auth, db } from '@/services/firebase';
import {
  getJoinedAtMsForUser,
  joinOrderWithParticipantRecord,
  leaveOrderParticipant,
  normalizeParticipantsStrings,
} from '@/services/orderLifecycle';
import { hasBlockConflict } from '@/services/report-block';
import { blockUser, submitUserReport } from '@/services/userSafety';
import { logError } from '@/utils/errorLogger';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import type { User } from '@firebase/auth';
import { onAuthStateChanged } from '@firebase/auth';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '@/constants/theme';

const c = theme.colors;

const ANON_ID_KEY = '@join_anon_id';

async function getOrCreateAnonId(): Promise<string> {
  let id = await AsyncStorage.getItem(ANON_ID_KEY);
  if (!id) {
    id = 'anon_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    await AsyncStorage.setItem(ANON_ID_KEY, id);
  }
  return id;
}

type OpenOrder = {
  id: string;
  hostId: string;
  maxPeople: number;
  participants: string[];
  totalPrice: number;
  status: string;
  paidBy: string | null;
  confirmations: Record<string, boolean> | null;
  foodType: string;
  restaurantName: string;
  restaurantLocation: string;
  orderTime: string;
  orderAtMs: number | null;
  createdAt: number;
  pricePerPerson: number | null;
  expiresAt: number | null;
  /** Marketing / template rows must not appear as real joinable orders */
  isSuggested?: boolean;
};

const FOOD_EMOJI: Record<string, string> = {
  pizza: '🍕',
  noodles: '🍜',
};

async function joinOrderWithTransaction(
  orderId: string,
  user: { uid: string },
): Promise<void> {
  if (!user?.uid) {
    throw new Error('You must be signed in to join.');
  }
  await joinOrderWithParticipantRecord(
    db,
    orderId,
    user.uid,
    {},
    {
      requireOpenForJoin: true,
      resolveStatus: (nextCount, maxPeople) =>
        nextCount >= maxPeople ? 'full' : 'open',
    },
  );
}

async function leaveOrderWithTransaction(
  orderId: string,
  user: { uid: string },
): Promise<void> {
  if (!user?.uid) {
    throw new Error('You must be signed in to leave.');
  }
  await leaveOrderParticipant(db, orderId, user.uid);
}

async function confirmParticipation(
  orderId: string,
  user: { uid: string },
): Promise<void> {
  if (!user?.uid) {
    throw new Error('You must be signed in to confirm.');
  }
  const orderRef = doc(db, 'orders', orderId);
  await runTransaction(db, async (transaction) => {
    const orderSnap = await transaction.get(orderRef);
    if (!orderSnap.exists()) {
      throw new Error('Order not found');
    }
    const data = orderSnap.data();
    const plist: string[] = Array.isArray(data?.participants)
      ? data.participants.filter((x): x is string => typeof x === 'string')
      : [];
    if (!plist.includes(user.uid)) {
      throw new Error('Not in order');
    }
    const rawConfirmations = data?.confirmations;
    const confirmations: Record<string, boolean> =
      typeof rawConfirmations === 'object' && rawConfirmations !== null
        ? { ...(rawConfirmations as Record<string, boolean>) }
        : {};
    confirmations[user.uid] = true;
    const allConfirmed =
      plist.length > 0 && plist.every((id) => confirmations[id]);
    const updateData: Record<string, unknown> = {
      [`confirmations.${user.uid}`]: true,
    };
    if (allConfirmed) {
      updateData.status = 'ready_to_pay';
    }
    transaction.update(orderRef, updateData);
  });
}

async function lockOrder(orderId: string): Promise<void> {
  const user = auth.currentUser;
  if (!user?.uid) {
    throw new Error('You must be signed in to lock.');
  }
  const orderRef = doc(db, 'orders', orderId);
  const orderSnap = await getDoc(orderRef);
  if (!orderSnap.exists()) {
    throw new Error('Order not found');
  }
  const data = orderSnap.data();
  const plist: string[] = Array.isArray(data?.participants)
    ? data.participants.filter((x): x is string => typeof x === 'string')
    : [];
  const creatorId = plist[0] ?? '';
  if (creatorId !== user.uid) {
    throw new Error('Only creator can lock');
  }
  const confirmations: Record<string, boolean> = {};
  plist.forEach((id) => {
    confirmations[id] = false;
  });
  await updateDoc(orderRef, {
    status: 'locked',
    paidBy: user.uid,
    confirmations,
  });
}

export default function JoinScreen() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [orders, setOrders] = useState<OpenOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState(false);
  const [listRetryNonce, setListRetryNonce] = useState(0);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [anonId, setAnonId] = useState<string | null>(null);
  const hiddenUserIds = useHiddenUserIds();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u ?? null));
    return () => unsub();
  }, []);

  useEffect(() => {
    getOrCreateAnonId().then(setAnonId);
  }, []);

  useEffect(() => {
    const q = query(
      collection(db, 'orders'),
      where('status', '==', 'open'),
      orderBy('createdAt', 'desc'),
    );
    setLoading(true);
    setListError(false);
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        if (__DEV__) {
          console.log('Realtime orders update:', snap.docs.length);
        }
        setListError(false);
        const now = Date.now();
        const list: OpenOrder[] = snap.docs.map((d) => {
          const d2 = d.data();
          const created = d2?.createdAt?.toMillis?.() ?? d2?.createdAt ?? 0;
          const expRaw = d2?.expiresAt;
          const exp =
            typeof expRaw === 'number'
              ? expRaw
              : typeof expRaw?.toMillis === 'function'
                ? expRaw.toMillis()
                : null;
          const hostId =
            (typeof d2?.hostId === 'string' && d2.hostId) ||
            (typeof d2?.userId === 'string' && d2.userId) ||
            (Array.isArray(d2?.participants) && d2.participants[0]
              ? String(d2.participants[0])
              : '');
          return {
            id: d.id,
            hostId,
            maxPeople: Number(d2?.maxPeople ?? 0),
            participants: Array.isArray(d2?.participants)
              ? d2.participants.filter(
                  (x): x is string => typeof x === 'string',
                )
              : [],
            totalPrice: Number(d2?.totalPrice ?? 0),
            isSuggested: d2?.isSuggested === true,
            status: typeof d2?.status === 'string' ? d2.status : 'open',
            paidBy: typeof d2?.paidBy === 'string' ? d2.paidBy : null,
            confirmations:
              typeof d2?.confirmations === 'object' && d2.confirmations !== null
                ? (d2.confirmations as Record<string, boolean>)
                : null,
            foodType: typeof d2?.foodType === 'string' ? d2.foodType : 'pizza',
            restaurantName:
              typeof d2?.restaurantName === 'string' && d2.restaurantName.trim()
                ? d2.restaurantName
                : 'Not specified',
            restaurantLocation:
              typeof d2?.restaurantLocation === 'string'
                ? d2.restaurantLocation
                : '',
            orderTime: typeof d2?.orderTime === 'string' ? d2.orderTime : 'Now',
            orderAtMs: d2?.orderAt?.toMillis?.() ?? d2?.orderAt ?? null,
            createdAt: Number(created),
            pricePerPerson:
              typeof d2?.pricePerPerson === 'number' ? d2.pricePerPerson : null,
            expiresAt: exp,
          };
        });
        // Only keep orders that are not full and not expired
        const filtered = list.filter((o) => {
          if (o.isSuggested === true) return false;
          const hasRoom = o.participants.length < o.maxPeople;
          const notExpired = o.expiresAt == null || o.expiresAt > now;
          return hasRoom && notExpired;
        });
        setOrders(filtered);
        setLoading(false);
      },
      () => {
        setListError(true);
        setOrders([]);
        setLoading(false);
      },
    );
    return () => unsubscribe();
  }, [listRetryNonce]);

  const displayOrders = useMemo(
    () =>
      [...orders]
        .filter((o) => o.hostId && !hiddenUserIds.has(o.hostId))
        .sort((a, b) => b.createdAt - a.createdAt),
    [orders, hiddenUserIds],
  );

  const handleJoinPress = (orderId: string) => {
    if (!user) {
      trackEvent('join_clicked_unauthenticated', { userId: null, orderId });
      router.push({
        pathname: '/login',
        params: { redirectTo: `/join?orderId=${orderId}` },
      });
      return;
    }
    doJoinOrder(orderId);
  };

  const doJoinOrder = async (orderId: string) => {
    if (!user) return;
    if (await isUserBanned(user.uid)) {
      Alert.alert(
        'Access denied',
        'Your account has been restricted. You cannot join orders.',
      );
      return;
    }
    setJoiningId(orderId);
    try {
      const orderSnap = await getDoc(doc(db, 'orders', orderId));
      const orderData = orderSnap.data();
      const plist = normalizeParticipantsStrings(orderData?.participants);
      if (
        plist.includes(user.uid) &&
        getJoinedAtMsForUser(orderData?.joinedAtMap, user.uid) != null
      ) {
        Alert.alert('Already joined', 'You are already in this order.');
        return;
      }
      if (await hasBlockConflict(user.uid, plist)) {
        Alert.alert(
          'Cannot join',
          'You cannot join this order due to a block.',
        );
        return;
      }
      await joinOrderWithTransaction(orderId, user);
      console.log('[join tab] joined order', orderId, 'uid', user.uid);
      const messagesRef = collection(db, 'orders', orderId, 'messages');
      await addDoc(messagesRef, {
        type: 'system',
        text: 'A participant joined',
        senderId: '',
        senderName: '',
        createdAt: serverTimestamp(),
      });
      router.push(`/order/${orderId}` as never);
    } catch (e) {
      logError(e, { alert: false });
      const msg = e instanceof Error ? e.message : 'Failed to join';
      Alert.alert('Error', msg);
    } finally {
      setJoiningId(null);
    }
  };

  const handleLeave = async (orderId: string) => {
    const user = auth.currentUser;
    if (!user || !user.uid) {
      Alert.alert('Error', 'You must be signed in to leave.');
      return;
    }

    setJoiningId(orderId);
    try {
      await leaveOrderWithTransaction(orderId, user);
      Alert.alert('Success', 'You left the order');
    } catch (e) {
      logError(e, { alert: false });
      const msg = e instanceof Error ? e.message : 'Failed to leave';
      if (msg === 'Not in order') {
        Alert.alert('Error', 'You are not in this order');
      } else {
        Alert.alert('Error', msg);
      }
    } finally {
      setJoiningId(null);
    }
  };

  const handleReportHost = (hostId: string, orderId: string) => {
    const u = user?.uid;
    if (!u) {
      router.push({
        pathname: '/login',
        params: { redirectTo: '/join' },
      });
      return;
    }
    const reasons = ['Spam', 'Inappropriate behavior', 'Scam', 'Other'] as const;
    Alert.alert('Report host', 'Select a reason', [
      ...reasons.map((reason) => ({
        text: reason,
        onPress: () => {
          void (async () => {
            try {
              await submitUserReport({
                reporterId: u,
                reportedUserId: hostId,
                orderId,
                reason,
              });
              Alert.alert('Report submitted');
            } catch (e) {
              Alert.alert(
                'Error',
                e instanceof Error ? e.message : 'Could not submit report.',
              );
            }
          })();
        },
      })),
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleBlockHost = (hostId: string) => {
    const u = user?.uid;
    if (!u) {
      router.push({
        pathname: '/login',
        params: { redirectTo: '/join' },
      });
      return;
    }
    Alert.alert(
      'Block host',
      'You will not see orders from this host in your join list.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await blockUser(u, hostId);
                Alert.alert(
                  'Blocked',
                  'This host will not appear in your join list.',
                );
              } catch (e) {
                Alert.alert(
                  'Error',
                  e instanceof Error ? e.message : 'Could not block user.',
                );
              }
            })();
          },
        },
      ],
    );
  };

  const handleConfirm = async (orderId: string) => {
    const user = auth.currentUser;
    if (!user || !user.uid) {
      Alert.alert('Error', 'You must be signed in to confirm.');
      return;
    }

    try {
      await confirmParticipation(orderId, user);
    } catch (e) {
      logError(e, { alert: false });
      const msg = e instanceof Error ? e.message : 'Failed to confirm';
      Alert.alert('Error', msg);
    }
  };

  if (loading && orders.length === 0) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: c.background,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <ActivityIndicator size="large" />
        <Text style={{ color: c.textMuted, marginTop: 14, fontSize: 14 }}>
          Loading open orders…
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: c.background, paddingHorizontal: 24 }}
    >
      <Text
        style={{
          fontSize: 28,
          fontWeight: '700',
          color: c.text,
          marginTop: 16,
          marginBottom: 24,
        }}
      >
        Join Order
      </Text>

      <FlatList
        data={displayOrders}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <View style={{ marginTop: 16 }}>
            {listError ? (
              <>
                <Text style={{ color: c.danger, lineHeight: 20 }}>
                  Could not load orders. Check your connection and try again.
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    setListError(false);
                    setLoading(true);
                    setListRetryNonce((n) => n + 1);
                  }}
                  style={{
                    marginTop: 14,
                    alignSelf: 'flex-start',
                    paddingVertical: 10,
                    paddingHorizontal: 16,
                    borderRadius: 8,
                    backgroundColor: c.accentBlue,
                  }}
                >
                  <Text style={{ color: c.textOnPrimary, fontWeight: '700' }}>
                    Try again
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <Text style={{ color: c.textMuted, lineHeight: 20 }}>
                No active orders yet — start one and others can join. Open Swipe
                to browse food cards.
              </Text>
            )}
          </View>
        }
        renderItem={({ item }) => {
          const currentUid = user?.uid ?? '';
          const alreadyJoined =
            currentUid !== '' && item.participants.includes(currentUid);
          const joining = joiningId === item.id;
          const foodType = (item.foodType || 'pizza').toLowerCase();
          const foodLabel =
            foodType.charAt(0).toUpperCase() + foodType.slice(1);
          const restaurantLabel =
            !item.restaurantName ||
            item.restaurantName.trim() === '' ||
            item.restaurantName === 'Not specified'
              ? 'Unknown restaurant'
              : item.restaurantName;
          const accentColor =
            foodType === 'pizza'
              ? c.primary
              : foodType === 'noodles'
                ? c.warning
                : c.iconInactive;
          const almostFull = item.maxPeople - item.participants.length === 1;

          return (
            <View style={{ marginBottom: 14 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingVertical: 16,
                paddingHorizontal: 18,
                borderWidth: 1,
                borderColor: c.border,
                borderLeftWidth: 6,
                borderLeftColor: accentColor,
                borderRadius: 10,
              }}
            >
              <View>
                <Text
                  style={{
                    color: c.textSlateDark,
                    fontSize: 26,
                    fontWeight: '700',
                  }}
                >
                  {(FOOD_EMOJI[foodType] ?? '🍽️') + ' ' + foodLabel}
                </Text>
                <Text style={{ color: c.textMuted, fontSize: 14 }}>
                  {restaurantLabel}
                </Text>
                {item.restaurantLocation ? (
                  <Text style={{ color: c.textMuted, fontSize: 13 }}>
                    📍 {item.restaurantLocation}
                  </Text>
                ) : null}
                <Text style={{ color: c.textMuted, fontSize: 13 }}>
                  {item.orderAtMs != null
                    ? `⏰ ${formatTorontoOrderTime(item.orderAtMs)}`
                    : `⏱ ${item.orderTime || 'Now'}`}
                </Text>
                <Text
                  style={{ color: c.iconInactive, fontSize: 11, marginTop: 2 }}
                >
                  Please be ready 5 minutes before order time
                </Text>
                <Text style={{ color: c.textMuted, fontSize: 14 }}>
                  Participants: {item.participants.length} / {item.maxPeople}
                </Text>
                <Text
                  style={{ color: c.textSlateDark, fontSize: 14, marginTop: 2 }}
                >
                  Total: ${item.totalPrice.toFixed(2)}
                </Text>
                <Text style={{ color: c.success, fontSize: 14, marginTop: 2 }}>
                  Per person: $
                  {item.participants.length > 0
                    ? (item.totalPrice / item.participants.length).toFixed(2)
                    : item.totalPrice.toFixed(2)}
                </Text>
                {item.paidBy ? (
                  <Text
                    style={{ color: c.textMuted, fontSize: 12, marginTop: 2 }}
                  >
                    {item.paidBy === currentUid
                      ? 'You are paying'
                      : 'Paid by creator'}
                  </Text>
                ) : null}
                {almostFull ? (
                  <Text
                    style={{
                      color: c.textMuted,
                      fontSize: 12,
                      fontWeight: '600',
                      marginTop: 4,
                    }}
                  >
                    One spot left
                  </Text>
                ) : null}
                <Text
                  style={{ color: c.iconInactive, fontSize: 12, marginTop: 4 }}
                >
                  {item.id}
                </Text>
              </View>
              {item.status === 'ready_to_pay' ? (
                <Text
                  style={{
                    color: c.successTextDark,
                    fontSize: 12,
                    fontWeight: '600',
                  }}
                >
                  All confirmed. Ready to pay.
                </Text>
              ) : item.status === 'locked' ? (
                alreadyJoined ? (
                  <TouchableOpacity
                    onPress={() => handleConfirm(item.id)}
                    disabled={!!joiningId}
                    style={{
                      backgroundColor: c.success,
                      paddingVertical: 8,
                      paddingHorizontal: 16,
                      borderRadius: 8,
                    }}
                  >
                    <Text style={{ color: c.textOnPrimary, fontWeight: '600' }}>
                      {!item.confirmations || !item.confirmations[currentUid]
                        ? 'Confirm Participation'
                        : 'Confirmed'}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <Text
                    style={{
                      color: c.danger,
                      fontSize: 12,
                      fontWeight: '600',
                    }}
                  >
                    Locked for payment
                  </Text>
                )
              ) : (
                <TouchableOpacity
                  onPress={() =>
                    alreadyJoined
                      ? handleLeave(item.id)
                      : handleJoinPress(item.id)
                  }
                  disabled={!!joiningId}
                  style={{
                    backgroundColor: alreadyJoined ? c.danger : c.accentBlue,
                    paddingVertical: 8,
                    paddingHorizontal: 16,
                    borderRadius: 8,
                  }}
                >
                  {joining ? (
                    <ActivityIndicator size="small" color={c.textOnPrimary} />
                  ) : (
                    <Text style={{ color: c.textOnPrimary, fontWeight: '600' }}>
                      {alreadyJoined ? 'Leave' : 'Join'}
                    </Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
            {currentUid &&
            item.hostId &&
            item.hostId !== currentUid &&
            item.status === 'open' ? (
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  paddingHorizontal: 18,
                  paddingTop: 10,
                  gap: 10,
                }}
              >
                <TouchableOpacity
                  onPress={() => handleReportHost(item.hostId, item.id)}
                  style={{
                    paddingVertical: 8,
                    paddingHorizontal: 12,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: c.borderStrong,
                    backgroundColor: c.chromeWash,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: '600',
                      color: c.textSlate,
                    }}
                  >
                    Report host
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleBlockHost(item.hostId)}
                  style={{
                    paddingVertical: 8,
                    paddingHorizontal: 12,
                    borderRadius: 8,
                    backgroundColor: c.dangerBackground,
                    borderWidth: 1,
                    borderColor: c.dangerBorder,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: '600',
                      color: c.dangerText,
                    }}
                  >
                    Block host
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}
