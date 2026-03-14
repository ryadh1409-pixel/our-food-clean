import { formatTorontoOrderTime } from '@/lib/format-toronto-time';
import { isUserBanned } from '@/services/adminGuard';
import { trackEvent } from '@/services/analytics';
import { auth, db } from '@/services/firebase';
import { hasBlockConflict } from '@/services/report-block';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import type { User } from 'firebase/auth';
import { onAuthStateChanged } from 'firebase/auth';
import {
  addDoc,
  arrayRemove,
  arrayUnion,
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
  maxPeople: number;
  participantIds: string[];
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
  const orderRef = doc(db, 'orders', orderId);
  await runTransaction(db, async (transaction) => {
    const orderSnap = await transaction.get(orderRef);

    if (!orderSnap.exists()) {
      throw new Error('Order not found');
    }

    const orderData = orderSnap.data();
    if (orderData.status !== 'open') {
      throw new Error('Order is not open');
    }

    const participants: string[] = Array.isArray(orderData.participantIds)
      ? orderData.participantIds
      : [];
    const maxPeople = Number(orderData.maxPeople ?? 0);

    if (participants.includes(user.uid)) {
      throw new Error('You already joined this order');
    }

    if (participants.length >= maxPeople) {
      throw new Error('Order is full');
    }

    const newCount = participants.length + 1;
    transaction.update(orderRef, {
      participantIds: arrayUnion(user.uid),
      status: newCount >= maxPeople ? 'full' : 'open',
    });
  });
}

async function leaveOrderWithTransaction(
  orderId: string,
  user: { uid: string },
): Promise<void> {
  if (!user?.uid) {
    throw new Error('You must be signed in to leave.');
  }
  const orderRef = doc(db, 'orders', orderId);
  await runTransaction(db, async (transaction) => {
    const orderSnap = await transaction.get(orderRef);
    if (!orderSnap.exists()) {
      throw new Error('Order not found');
    }
    const data = orderSnap.data();
    const participantIds: string[] = Array.isArray(data?.participantIds)
      ? data.participantIds
      : [];
    const maxPeople = Number(data?.maxPeople ?? 0);
    if (!participantIds.includes(user.uid)) {
      throw new Error('Not in order');
    }
    const newCount = participantIds.length - 1;
    const updateData: Record<string, unknown> = {
      participantIds: arrayRemove(user.uid),
    };
    const currentStatus =
      typeof data?.status === 'string' ? data.status : 'open';
    if (currentStatus === 'closed' && newCount < maxPeople) {
      updateData.status = 'open';
    }
    transaction.update(orderRef, updateData);
  });
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
    const participantIds: string[] = Array.isArray(data?.participantIds)
      ? data.participantIds
      : [];
    if (!participantIds.includes(user.uid)) {
      throw new Error('Not in order');
    }
    const rawConfirmations = data?.confirmations;
    const confirmations: Record<string, boolean> =
      typeof rawConfirmations === 'object' && rawConfirmations !== null
        ? { ...(rawConfirmations as Record<string, boolean>) }
        : {};
    confirmations[user.uid] = true;
    const allConfirmed =
      participantIds.length > 0 &&
      participantIds.every((id) => confirmations[id]);
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
  const participantIds: string[] = Array.isArray(data?.participantIds)
    ? data.participantIds
    : [];
  const creatorId = participantIds[0] ?? '';
  if (creatorId !== user.uid) {
    throw new Error('Only creator can lock');
  }
  const confirmations: Record<string, boolean> = {};
  participantIds.forEach((id) => {
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
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [anonId, setAnonId] = useState<string | null>(null);

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
      where('status', '==', 'waiting'),
      orderBy('createdAt', 'desc'),
    );
    setLoading(true);
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
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
          return {
            id: d.id,
            maxPeople: Number(d2?.maxPeople ?? 0),
            participantIds: Array.isArray(d2?.participantIds)
              ? d2.participantIds
              : [],
            totalPrice: Number(d2?.totalPrice ?? 0),
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
          const hasRoom = o.participantIds.length < o.maxPeople;
          const notExpired = o.expiresAt == null || o.expiresAt > now;
          return hasRoom && notExpired;
        });
        setOrders(filtered);
      },
      () => setOrders([]),
    );
    setLoading(false);
    return () => unsubscribe();
  }, []);

  const displayOrders = useMemo(
    () => [...orders].sort((a, b) => b.createdAt - a.createdAt),
    [orders],
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
      const participantIds: string[] = Array.isArray(
        orderSnap.data()?.participantIds,
      )
        ? orderSnap.data()!.participantIds
        : [];
      if (await hasBlockConflict(user.uid, participantIds)) {
        Alert.alert(
          'Cannot join',
          'You cannot join this order due to a block.',
        );
        return;
      }
      await joinOrderWithTransaction(orderId, user);
      const messagesRef = collection(db, 'orders', orderId, 'messages');
      await addDoc(messagesRef, {
        type: 'system',
        text: 'User joined the order',
        senderId: '',
        createdAt: serverTimestamp(),
      });
      Alert.alert('Success', 'Joined successfully');
    } catch (e) {
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

  const handleConfirm = async (orderId: string) => {
    const user = auth.currentUser;
    if (!user || !user.uid) {
      Alert.alert('Error', 'You must be signed in to confirm.');
      return;
    }

    try {
      await confirmParticipation(orderId, user);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to confirm';
      Alert.alert('Error', msg);
    }
  };

  if (loading && orders.length === 0) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: '#fff',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <ActivityIndicator size="large" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: '#fff', paddingHorizontal: 24 }}
    >
      <Text
        style={{
          fontSize: 28,
          fontWeight: '700',
          color: '#22223b',
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
          <Text style={{ color: '#666', marginTop: 16 }}>No open orders</Text>
        }
        renderItem={({ item }) => {
          const currentUid = user?.uid ?? '';
          const alreadyJoined =
            currentUid !== '' && item.participantIds.includes(currentUid);
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
              ? '#f97316'
              : foodType === 'noodles'
                ? '#eab308'
                : '#9ca3af';
          const almostFull = item.maxPeople - item.participantIds.length === 1;

          return (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingVertical: 16,
                paddingHorizontal: 18,
                borderWidth: 1,
                borderColor: '#e2e8f0',
                borderLeftWidth: 6,
                borderLeftColor: accentColor,
                borderRadius: 10,
                marginBottom: 14,
              }}
            >
              <View>
                <Text
                  style={{ color: '#334155', fontSize: 26, fontWeight: '700' }}
                >
                  {(FOOD_EMOJI[foodType] ?? '🍽️') + ' ' + foodLabel}
                </Text>
                <Text style={{ color: '#64748b', fontSize: 14 }}>
                  {restaurantLabel}
                </Text>
                {item.restaurantLocation ? (
                  <Text style={{ color: '#64748b', fontSize: 13 }}>
                    📍 {item.restaurantLocation}
                  </Text>
                ) : null}
                <Text style={{ color: '#64748b', fontSize: 13 }}>
                  {item.orderAtMs != null
                    ? `⏰ ${formatTorontoOrderTime(item.orderAtMs)}`
                    : `⏱ ${item.orderTime || 'Now'}`}
                </Text>
                <Text style={{ color: '#94a3b8', fontSize: 11, marginTop: 2 }}>
                  Please be ready 5 minutes before order time
                </Text>
                <Text style={{ color: '#64748b', fontSize: 14 }}>
                  👥 {item.participantIds.length} / {item.maxPeople} people
                </Text>
                <Text style={{ color: '#334155', fontSize: 14, marginTop: 2 }}>
                  Total: ${item.totalPrice.toFixed(2)}
                </Text>
                <Text style={{ color: '#22c55e', fontSize: 14, marginTop: 2 }}>
                  Per person: $
                  {item.participantIds.length > 0
                    ? (item.totalPrice / item.participantIds.length).toFixed(2)
                    : item.totalPrice.toFixed(2)}
                </Text>
                {item.paidBy ? (
                  <Text
                    style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}
                  >
                    {item.paidBy === currentUid
                      ? 'You are paying'
                      : 'Paid by creator'}
                  </Text>
                ) : null}
                {almostFull && (
                  <Text
                    style={{
                      color: '#ea580c',
                      fontSize: 12,
                      fontWeight: '600',
                      marginTop: 4,
                    }}
                  >
                    🔥 Almost full
                  </Text>
                )}
                <Text style={{ color: '#94a3b8', fontSize: 12, marginTop: 4 }}>
                  {item.id}
                </Text>
              </View>
              {item.status === 'ready_to_pay' ? (
                <Text
                  style={{ color: '#16a34a', fontSize: 12, fontWeight: '600' }}
                >
                  All confirmed. Ready to pay.
                </Text>
              ) : item.status === 'locked' ? (
                alreadyJoined ? (
                  <TouchableOpacity
                    onPress={() => handleConfirm(item.id)}
                    disabled={!!joiningId}
                    style={{
                      backgroundColor: '#22c55e',
                      paddingVertical: 8,
                      paddingHorizontal: 16,
                      borderRadius: 8,
                    }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '600' }}>
                      {!item.confirmations || !item.confirmations[currentUid]
                        ? 'Confirm Participation'
                        : 'Confirmed'}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <Text
                    style={{
                      color: '#dc2626',
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
                    backgroundColor: alreadyJoined ? '#dc2626' : '#2563eb',
                    paddingVertical: 8,
                    paddingHorizontal: 16,
                    borderRadius: 8,
                  }}
                >
                  {joining ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={{ color: '#fff', fontWeight: '600' }}>
                      {alreadyJoined ? 'Leave' : 'Join'}
                    </Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}
