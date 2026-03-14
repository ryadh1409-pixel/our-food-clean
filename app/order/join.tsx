import { haversineDistanceKm } from '@/lib/haversine';
import {
  formatTorontoDate,
  formatTorontoTimeHHMM,
} from '@/lib/format-toronto-time';
import { isUserBanned } from '@/services/adminGuard';
import { getOrCreateChat } from '@/services/chat';
import { getUserLocation } from '@/services/location';
import { auth, db } from '@/services/firebase';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TrustScoreLabel } from '@/components/TrustScoreLabel';
import { theme } from '@/constants/theme';
import { useTrustScore } from '@/hooks/useTrustScore';

type WaitingOrder = {
  id: string;
  userId: string;
  userName: string;
  restaurantName: string;
  mealType: string;
  totalPrice: number;
  sharePrice: number;
  whatsappNumber: string;
  createdAt: number | null;
};

function formatWhatsAppNumber(num: string): string {
  const digits = num.replace(/\D/g, '');
  return digits.startsWith('0') ? digits.slice(1) : digits;
}

const AUTO_MATCH_RADIUS_KM = 2;
const AUTO_MATCH_TIMEOUT_MS = 10000;
const MEAL_TYPES = ['Pizza', 'Noodles'] as const;

function JoinOrderCard({
  item,
  isJoining,
  onJoin,
  onOpenChat,
  onOpenWhatsApp,
  hasWhatsApp,
}: {
  item: WaitingOrder;
  isJoining: boolean;
  onJoin: () => void;
  onOpenChat: () => void;
  onOpenWhatsApp: () => void;
  hasWhatsApp: boolean;
}) {
  const trustScore = useTrustScore(item.userId || null);
  const createdLabel =
    item.createdAt != null
      ? `${formatTorontoDate(item.createdAt)} ${formatTorontoTimeHHMM(item.createdAt)}`
      : '—';

  return (
    <View style={styles.card}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <Text style={styles.cardTitle}>{item.userName}</Text>
        {trustScore && trustScore.count > 0 ? (
          <TrustScoreLabel
            average={trustScore.average}
            count={trustScore.count}
            showTrusted
            compact
          />
        ) : null}
      </View>
      <Text style={styles.cardRow}>
        <Text style={styles.cardLabel}>Restaurant: </Text>
        {item.restaurantName}
      </Text>
      <Text style={styles.cardRow}>
        <Text style={styles.cardLabel}>Meal Type: </Text>
        {item.mealType}
      </Text>
      <Text style={styles.cardRow}>
        <Text style={styles.cardLabel}>Total Price: </Text>$
        {item.totalPrice.toFixed(2)}
      </Text>
      <Text style={styles.cardRow}>
        <Text style={styles.cardLabel}>Share Price: </Text>$
        {item.sharePrice.toFixed(2)}
      </Text>
      <Text style={styles.cardMeta}>{createdLabel}</Text>
      <View style={styles.cardButtons}>
        <TouchableOpacity
          style={[styles.btnPrimary, isJoining && styles.btnDisabled]}
          onPress={onJoin}
          disabled={isJoining}
        >
          {isJoining ? (
            <ActivityIndicator
              size="small"
              color={theme.colors.textOnPrimary}
            />
          ) : (
            <Text style={styles.btnPrimaryText}>Join Order</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity style={styles.btnSecondary} onPress={onOpenChat}>
          <Text style={styles.btnSecondaryText}>Open Chat</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btnSecondary, !hasWhatsApp && styles.btnDisabled]}
          onPress={onOpenWhatsApp}
          disabled={!hasWhatsApp}
        >
          <Text style={styles.btnSecondaryText}>Open WhatsApp</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function JoinOrderScreen() {
  const router = useRouter();
  const [orders, setOrders] = useState<WaitingOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [selectedMealType, setSelectedMealType] = useState<'Pizza' | 'Noodles'>(
    'Pizza',
  );
  const [autoMatchSearching, setAutoMatchSearching] = useState(false);
  const [autoMatchNoMatch, setAutoMatchNoMatch] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const q = query(
      collection(db, 'orders'),
      where('status', 'in', ['active', 'waiting']),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: WaitingOrder[] = snap.docs.map((d) => {
          const data = d.data();
          const created =
            data?.createdAt?.toMillis?.() ?? data?.createdAt ?? null;
          return {
            id: d.id,
            userId: typeof data?.userId === 'string' ? data.userId : '',
            userName:
              typeof data?.userName === 'string' ? data.userName : 'User',
            restaurantName:
              typeof data?.restaurantName === 'string' &&
              data.restaurantName.trim()
                ? data.restaurantName
                : 'Not specified',
            mealType:
              typeof data?.mealType === 'string' ? data.mealType : 'Pizza',
            totalPrice: Number(data?.totalPrice ?? 0),
            sharePrice: Number(data?.sharePrice ?? 0),
            whatsappNumber:
              typeof data?.whatsappNumber === 'string'
                ? data.whatsappNumber
                : '',
            createdAt: created,
          };
        });
        setOrders(list);
        setLoading(false);
      },
      () => {
        setOrders([]);
        setLoading(false);
      },
    );
    return () => unsub();
  }, []);

  const displayName =
    auth.currentUser?.displayName ||
    auth.currentUser?.email?.split('@')[0] ||
    'User';

  const handleJoin = async (orderId: string) => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      router.push('/(auth)/login?redirectTo=/order/join');
      return;
    }
    if (await isUserBanned(uid)) {
      Alert.alert(
        'Access denied',
        'Your account has been restricted. You cannot join orders.',
      );
      return;
    }
    setJoiningId(orderId);
    try {
      const orderRef = doc(db, 'orders', orderId);
      await updateDoc(orderRef, {
        status: 'matched',
        participantIds: arrayUnion(uid),
        user2Id: uid,
        user2Name: displayName,
      });
      const orderSnap = await getDoc(orderRef);
      const participantIds = orderSnap.exists()
        ? ((orderSnap.data()?.participantIds as string[] | undefined) ?? [])
        : [];
      if (participantIds.length >= 2) {
        getOrCreateChat(orderId, participantIds).catch(() => {});
      }
      const { createAlert } = await import('@/services/alerts');
      await createAlert('order_matched', 'Order matched');
      const { incrementGrowthMatches } =
        await import('@/services/growthMetrics');
      await incrementGrowthMatches();
      const messagesRef = collection(db, 'orders', orderId, 'messages');
      await addDoc(messagesRef, {
        userId: uid,
        userName: displayName,
        text: 'Joined the order',
        createdAt: serverTimestamp(),
        type: 'system',
      });
      Alert.alert('Success', 'You joined the order.');
      router.push(`/match/${orderId}` as const);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to join';
      Alert.alert('Error', msg);
    } finally {
      setJoiningId(null);
    }
  };

  const runAutoMatchSearch = async (): Promise<string | null> => {
    const uid = auth.currentUser?.uid;
    if (!uid) return null;
    const loc = await getUserLocation();
    const q = query(
      collection(db, 'orders'),
      where('status', 'in', ['active', 'waiting']),
      where('mealType', '==', selectedMealType),
    );
    const snap = await getDocs(q);
    const candidates: { id: string; distance: number }[] = [];
    snap.docs.forEach((d) => {
      const data = d.data();
      if (data?.userId === uid) return;
      const locObj = data?.location;
      if (
        locObj &&
        typeof locObj.latitude === 'number' &&
        typeof locObj.longitude === 'number'
      ) {
        const distance = haversineDistanceKm(
          loc.latitude,
          loc.longitude,
          locObj.latitude,
          locObj.longitude,
        );
        if (distance <= AUTO_MATCH_RADIUS_KM) {
          candidates.push({ id: d.id, distance });
        }
      }
    });
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => a.distance - b.distance);
    return candidates[0].id;
  };

  const handleFindMatch = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      router.push('/(auth)/login?redirectTo=/order/join');
      return;
    }
    if (await isUserBanned(uid)) {
      Alert.alert(
        'Access denied',
        'Your account has been restricted. You cannot join orders.',
      );
      return;
    }
    setAutoMatchNoMatch(false);
    setAutoMatchSearching(true);
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = null;
    }
    const tryMatch = async (): Promise<boolean> => {
      let orderId: string | null = null;
      try {
        orderId = await runAutoMatchSearch();
      } catch (e) {
        if (searchTimeoutRef.current) {
          clearTimeout(searchTimeoutRef.current);
          searchTimeoutRef.current = null;
        }
        setAutoMatchSearching(false);
        Alert.alert(
          'Error',
          e instanceof Error ? e.message : 'Location or search failed.',
        );
        return true;
      }
      if (!orderId) return false;
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
        searchTimeoutRef.current = null;
      }
      setAutoMatchSearching(false);
      setJoiningId(orderId);
      try {
        const orderRef = doc(db, 'orders', orderId);
        await updateDoc(orderRef, {
          status: 'matched',
          participantIds: arrayUnion(uid),
          user2Id: uid,
          user2Name: displayName,
        });
        const orderSnap = await getDoc(orderRef);
        const participantIds = orderSnap.exists()
          ? ((orderSnap.data()?.participantIds as string[] | undefined) ?? [])
          : [];
        if (participantIds.length >= 2) {
          getOrCreateChat(orderId, participantIds).catch(() => {});
        }
        const { createAlert } = await import('@/services/alerts');
        await createAlert('order_matched', 'Order matched');
        const { incrementGrowthMatches } =
          await import('@/services/growthMetrics');
        await incrementGrowthMatches();
        const messagesRef = collection(db, 'orders', orderId, 'messages');
        await addDoc(messagesRef, {
          userId: uid,
          userName: displayName,
          text: 'You have been matched! Start chatting.',
          createdAt: serverTimestamp(),
          type: 'system',
        });
        Alert.alert('Matched!', 'You have been matched! Start chatting.', [
          {
            text: 'OK',
            onPress: () => router.push(`/match/${orderId}` as const),
          },
        ]);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to join';
        Alert.alert('Error', msg);
      } finally {
        setJoiningId(null);
      }
      return true;
    };
    const start = Date.now();
    const deadline = start + AUTO_MATCH_TIMEOUT_MS;
    if (await tryMatch()) return;
    const scheduleRetry = () => {
      if (Date.now() >= deadline) {
        setAutoMatchSearching(false);
        setAutoMatchNoMatch(true);
        return;
      }
      searchTimeoutRef.current = setTimeout(async () => {
        searchTimeoutRef.current = null;
        if (await tryMatch()) return;
        scheduleRetry();
      }, 2500);
    };
    searchTimeoutRef.current = setTimeout(scheduleRetry, 2500);
  };

  const handleCreateOrder = () => {
    setAutoMatchNoMatch(false);
    router.push('/order/create');
  };

  const handleSearchAgain = () => {
    setAutoMatchNoMatch(false);
  };

  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, []);

  const handleOpenChat = (orderId: string) => {
    router.push(`/order/${orderId}` as const);
  };

  const handleOpenWhatsApp = (whatsappNumber: string) => {
    const num = formatWhatsAppNumber(whatsappNumber);
    if (!num) return;
    const url = `https://wa.me/${num}`;
    if (Platform.OS === 'web') {
      (window as unknown as { open: (u: string) => void }).open(url, '_blank');
    } else {
      Linking.openURL(url);
    }
  };

  const renderItem = ({ item }: { item: WaitingOrder }) => (
    <JoinOrderCard
      item={item}
      isJoining={joiningId === item.id}
      onJoin={() => handleJoin(item.id)}
      onOpenChat={() => handleOpenChat(item.id)}
      onOpenWhatsApp={() => handleOpenWhatsApp(item.whatsappNumber)}
      hasWhatsApp={!!item.whatsappNumber}
    />
  );

  if (loading && orders.length === 0) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Text style={styles.title}>Orders</Text>

      <View style={styles.autoMatchSection}>
        <Text style={styles.autoMatchLabel}>Auto Match</Text>
        <Text style={styles.autoMatchHint}>
          Select meal type and find someone nearby (within 2 km)
        </Text>
        <View style={styles.mealTypeRow}>
          {MEAL_TYPES.map((type) => (
            <TouchableOpacity
              key={type}
              style={[
                styles.mealTypeBtn,
                selectedMealType === type && styles.mealTypeBtnActive,
              ]}
              onPress={() => setSelectedMealType(type)}
            >
              <Text
                style={[
                  styles.mealTypeBtnText,
                  selectedMealType === type && styles.mealTypeBtnTextActive,
                ]}
              >
                {type}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity
          style={[
            styles.findMatchBtn,
            autoMatchSearching && styles.btnDisabled,
          ]}
          onPress={handleFindMatch}
          disabled={autoMatchSearching}
        >
          {autoMatchSearching ? (
            <ActivityIndicator
              size="small"
              color={theme.colors.textOnPrimary}
            />
          ) : (
            <Text style={styles.findMatchBtnText}>⚡ Find Match</Text>
          )}
        </TouchableOpacity>
      </View>

      {autoMatchNoMatch ? (
        <View style={styles.noMatchCard}>
          <Text style={styles.noMatchTitle}>No nearby match found.</Text>
          <Text style={styles.noMatchSubtitle}>Create a new order?</Text>
          <View style={styles.noMatchButtons}>
            <TouchableOpacity
              style={styles.noMatchPrimaryBtn}
              onPress={handleCreateOrder}
            >
              <Text style={styles.noMatchPrimaryBtnText}>Create Order</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.noMatchSecondaryBtn}
              onPress={handleSearchAgain}
            >
              <Text style={styles.noMatchSecondaryBtnText}>Search Again</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>All waiting orders</Text>
      <FlatList
        data={orders}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            No orders waiting. Create one from the home screen.
          </Text>
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
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.colors.text,
    paddingHorizontal: theme.spacing.screen,
    paddingTop: 24,
    paddingBottom: 16,
  },
  autoMatchSection: {
    marginHorizontal: theme.spacing.screen,
    marginBottom: 20,
    padding: 16,
    borderRadius: 12,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  autoMatchLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 4,
  },
  autoMatchHint: {
    fontSize: 13,
    color: theme.colors.textMuted,
    marginBottom: 12,
  },
  mealTypeRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  mealTypeBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  mealTypeBtnActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  mealTypeBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
  },
  mealTypeBtnTextActive: {
    color: theme.colors.textOnPrimary,
  },
  findMatchBtn: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  findMatchBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.textOnPrimary,
  },
  noMatchCard: {
    marginHorizontal: theme.spacing.screen,
    marginBottom: 20,
    padding: 20,
    borderRadius: 12,
    backgroundColor: '#fef3c7',
    borderWidth: 1,
    borderColor: '#f59e0b',
  },
  noMatchTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
    marginBottom: 4,
  },
  noMatchSubtitle: {
    fontSize: 15,
    color: '#666',
    marginBottom: 16,
  },
  noMatchButtons: {
    gap: 10,
  },
  noMatchPrimaryBtn: {
    backgroundColor: '#22c55e',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  noMatchPrimaryBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  noMatchSecondaryBtn: {
    backgroundColor: theme.colors.surface,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  noMatchSecondaryBtnText: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
    paddingHorizontal: theme.spacing.screen,
    marginBottom: 12,
  },
  listContent: {
    paddingHorizontal: theme.spacing.screen,
    paddingBottom: 24,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.card,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 12,
  },
  cardRow: {
    fontSize: 14,
    color: theme.colors.text,
    marginBottom: 4,
  },
  cardLabel: {
    fontWeight: '600',
    color: theme.colors.textMuted,
  },
  cardMeta: {
    fontSize: 12,
    color: theme.colors.textMuted,
    marginTop: 8,
    marginBottom: 12,
  },
  cardButtons: {
    gap: 8,
  },
  btnPrimary: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 12,
    borderRadius: theme.radius.button,
    alignItems: 'center',
  },
  btnPrimaryText: {
    color: theme.colors.textOnPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  btnSecondary: {
    backgroundColor: theme.colors.surface,
    paddingVertical: 12,
    borderRadius: theme.radius.button,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  btnSecondaryText: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  btnDisabled: { opacity: 0.6 },
  emptyText: {
    fontSize: 16,
    color: theme.colors.textMuted,
    textAlign: 'center',
    marginTop: 24,
  },
});
