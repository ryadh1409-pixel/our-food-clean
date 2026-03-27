import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { theme } from '@/constants/theme';
import { ScreenFadeIn } from '@/components/ScreenFadeIn';
import { ShimmerSkeleton } from '@/components/ShimmerSkeleton';
import { blockUser, hasBlockBetween } from '@/services/blocks';
import { auth, db } from '@/services/firebase';

type OrderDetails = {
  id: string;
  foodName: string;
  image: string;
  pricePerPerson: number;
  totalPrice: number;
  peopleJoined: number;
  maxPeople: number;
  location: string;
  distance: number;
  timeRemaining: number;
  createdBy: string;
};

export default function OrderDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const orderId = String(params.id ?? '');

  const [order, setOrder] = useState<OrderDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [countdownSec, setCountdownSec] = useState(0);
  const [isBlocked, setIsBlocked] = useState(false);

  useEffect(() => {
    if (!orderId) {
      setLoading(false);
      return;
    }
    const ref = doc(db, 'orders', orderId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setOrder(null);
          setLoading(false);
          return;
        }
        const d = snap.data();
        const mapped: OrderDetails = {
          id: snap.id,
          foodName: String(d?.foodName ?? 'Shared order'),
          image:
            typeof d?.image === 'string' && d.image.trim()
              ? d.image
              : 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=1200&q=80',
          pricePerPerson: Number(d?.pricePerPerson ?? 0),
          totalPrice: Number(d?.totalPrice ?? 0),
          peopleJoined: Number(d?.peopleJoined ?? 1),
          maxPeople: Number(d?.maxPeople ?? 2),
          location: String(d?.location ?? 'Nearby'),
          distance: Number(d?.distance ?? 0),
          timeRemaining: Number(d?.timeRemaining ?? 20),
          createdBy: String(d?.createdBy ?? ''),
        };
        setOrder(mapped);
        setCountdownSec(Math.max(mapped.timeRemaining, 0) * 60);
        setLoading(false);
      },
      () => {
        setOrder(null);
        setLoading(false);
      },
    );
    return () => unsub();
  }, [orderId]);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid || !order?.createdBy || uid === order.createdBy) {
      setIsBlocked(false);
      return;
    }
    let cancelled = false;
    hasBlockBetween(uid, order.createdBy)
      .then((v) => {
        if (!cancelled) setIsBlocked(v);
      })
      .catch(() => {
        if (!cancelled) setIsBlocked(false);
      });
    return () => {
      cancelled = true;
    };
  }, [order?.createdBy]);

  useEffect(() => {
    if (countdownSec <= 0) return;
    const id = setInterval(() => {
      setCountdownSec((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, [countdownSec]);

  const remainingSpots = useMemo(() => {
    if (!order) return 0;
    return Math.max(order.maxPeople - order.peopleJoined, 0);
  }, [order]);

  const countdownLabel = useMemo(() => {
    const mins = Math.floor(countdownSec / 60);
    const secs = countdownSec % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }, [countdownSec]);

  const handleJoinOrder = async () => {
    if (!order) return;
    const uid = auth.currentUser?.uid;
    if (!uid) {
      router.push('/(auth)/login?redirectTo=/order-details/' + order.id);
      return;
    }
    setJoining(true);
    try {
      if (order.createdBy && (await hasBlockBetween(uid, order.createdBy))) {
        throw new Error('You cannot join this order due to a block.');
      }
      const orderRef = doc(db, 'orders', order.id);
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(orderRef);
        if (!snap.exists()) throw new Error('Order no longer exists.');
        const d = snap.data();
        const peopleJoined = Number(d?.peopleJoined ?? 1);
        const maxPeople = Number(d?.maxPeople ?? 2);
        const usersJoined = Array.isArray(d?.usersJoined) ? d.usersJoined : [];

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
      await setDoc(
        doc(db, 'orders', order.id, 'joins', uid),
        { userId: uid, joinedAt: serverTimestamp() },
        { merge: true },
      );
      await setDoc(
        doc(db, 'users', uid, 'joinedOrders', order.id),
        { orderId: order.id, joinedAt: serverTimestamp() },
        { merge: true },
      ).catch(() => {});
      Alert.alert('Joined', 'You joined this order.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.push({
        pathname: '/chat/[orderId]',
        params: { orderId: order.id },
      } as never);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to join order.';
      Alert.alert('Join failed', msg);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    } finally {
      setJoining(false);
    }
  };

  const handleBlockUser = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid || !order?.createdBy || uid === order.createdBy) return;
    Alert.alert('Block user', 'Are you sure you want to block this user?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Block',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setBlocking(true);
            try {
              await blockUser(uid, order.createdBy);
              setIsBlocked(true);
              Alert.alert('Blocked', 'User has been blocked.');
            } catch (e) {
              const msg = e instanceof Error ? e.message : 'Failed to block user.';
              Alert.alert('Block failed', msg);
            } finally {
              setBlocking(false);
            }
          })();
        },
      },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingWrap}>
        <ShimmerSkeleton width="92%" height={220} borderRadius={18} style={styles.skeletonGap} />
        <ShimmerSkeleton width="72%" height={22} style={styles.skeletonGapLine} />
        <ShimmerSkeleton width="44%" height={14} />
        <ActivityIndicator size="small" color={theme.colors.primary} style={{ marginTop: 16 }} />
      </SafeAreaView>
    );
  }

  if (!order) {
    return (
      <SafeAreaView style={styles.loadingWrap}>
        <Text style={styles.emptyText}>Order not found.</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScreenFadeIn style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.content}>
        <Image source={{ uri: order.image }} style={styles.image} />
        <Text style={styles.foodName}>{order.foodName}</Text>
        <Text style={styles.price}>${order.pricePerPerson.toFixed(2)} per person</Text>
        <View style={styles.card}>
          <Text style={styles.meta}>Total: ${order.totalPrice.toFixed(2)}</Text>
          <Text style={styles.meta}>
            Joined: {order.peopleJoined}/{order.maxPeople}
          </Text>
          <Text style={styles.meta}>Remaining spots: {remainingSpots}</Text>
          <Text style={styles.meta}>Distance: {order.distance.toFixed(1)} km</Text>
          <Text style={styles.meta}>Location: {order.location}</Text>
          <Text style={styles.meta}>Created by: {order.createdBy || 'Unknown'}</Text>
          <View style={styles.timerRow}>
            <Text style={styles.timerLabel}>Time remaining</Text>
            <Text style={styles.timerValue}>{countdownLabel}</Text>
          </View>
        </View>
        <TouchableOpacity
          style={[
            styles.joinButton,
            (joining || remainingSpots <= 0 || isBlocked) && styles.joinButtonDisabled,
          ]}
          onPress={handleJoinOrder}
          disabled={joining || remainingSpots <= 0 || isBlocked}
          activeOpacity={0.85}
        >
          <Text style={styles.joinButtonText}>
            {joining
              ? 'Joining...'
              : isBlocked
                ? 'Blocked'
                : remainingSpots <= 0
                  ? 'Order Full'
                  : 'Join Order'}
          </Text>
        </TouchableOpacity>
        {auth.currentUser?.uid && order.createdBy && auth.currentUser.uid !== order.createdBy ? (
          <TouchableOpacity
            style={[styles.blockButton, blocking && styles.joinButtonDisabled]}
            onPress={handleBlockUser}
            disabled={blocking}
            activeOpacity={0.85}
          >
            <Text style={styles.blockButtonText}>{blocking ? 'Blocking...' : 'Block User'}</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
      </ScreenFadeIn>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0D10' },
  loadingWrap: {
    flex: 1,
    backgroundColor: '#0B0D10',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: { color: '#E5E7EB', fontSize: 16 },
  skeletonGap: { marginBottom: 16 },
  skeletonGapLine: { marginBottom: 10 },
  backBtn: {
    marginTop: 14,
    backgroundColor: '#141922',
    borderColor: '#232A35',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  backBtnText: { color: '#C7D2FE', fontWeight: '700' },
  content: { padding: 16, paddingBottom: 32 },
  image: { width: '100%', height: 260, borderRadius: 20, marginBottom: 14 },
  foodName: { color: '#F8FAFC', fontSize: 28, fontWeight: '800' },
  price: { color: '#6EE7B7', fontSize: 18, fontWeight: '700', marginTop: 6, marginBottom: 14 },
  card: {
    backgroundColor: '#141922',
    borderColor: '#232A35',
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 6,
  },
  meta: { color: '#D1D5DB', fontSize: 14 },
  timerRow: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timerLabel: { color: '#FB923C', fontSize: 14, fontWeight: '700' },
  timerValue: { color: '#FB923C', fontSize: 24, fontWeight: '900' },
  joinButton: {
    marginTop: 16,
    backgroundColor: '#34D399',
    borderRadius: 14,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinButtonDisabled: { opacity: 0.6 },
  joinButtonText: { color: '#052E1A', fontSize: 16, fontWeight: '800' },
  blockButton: {
    marginTop: 10,
    backgroundColor: '#261317',
    borderRadius: 14,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#4B1D24',
  },
  blockButtonText: { color: '#FCA5A5', fontSize: 14, fontWeight: '800' },
});
