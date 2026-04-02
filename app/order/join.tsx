import { isUserBanned } from '@/services/adminGuard';
import { auth, db } from '@/services/firebase';
import { joinOrderWithParticipantRecord } from '@/services/orderLifecycle';
import { useRouter } from 'expo-router';
import {
  addDoc,
  collection,
  onSnapshot,
  query,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
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

type OpenOrder = {
  id: string;
  mealType: string;
  hostId: string;
};

export default function JoinOrderScreen() {
  const router = useRouter();
  const [orders, setOrders] = useState<OpenOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const [joiningId, setJoiningId] = useState<string | null>(null);

  useEffect(() => {
    const q = query(
      collection(db, 'orders'),
      where('status', '==', 'open'),
    );
    setLoading(true);
    setListError(false);
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setListError(false);
        const list: OpenOrder[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            mealType:
              typeof data?.mealType === 'string' ? data.mealType : '—',
            hostId:
              typeof data?.hostId === 'string' ? data.hostId : '—',
          };
        });
        setOrders(list);
        setLoading(false);
      },
      () => {
        setListError(true);
        setOrders([]);
        setLoading(false);
      },
    );
    return () => unsubscribe();
  }, [retryNonce]);

  const handleGoSwipe = () => {
    router.push('/(tabs)/index');
  };

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
      await joinOrderWithParticipantRecord(db, orderId, uid, {}, {
        requireOpenForJoin: true,
      });
      console.log('[order/join] joined', orderId, 'uid', uid);
      await addDoc(collection(db, 'orders', orderId, 'messages'), {
        type: 'system',
        text: 'A participant joined',
        senderId: '',
        senderName: '',
        createdAt: serverTimestamp(),
      });
      router.push(`/order/${orderId}` as never);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to join';
      Alert.alert('Could not join', msg);
    } finally {
      setJoiningId(null);
    }
  };

  const renderItem = ({ item }: { item: OpenOrder }) => (
    <View style={styles.card}>
      <Text style={styles.cardLabel}>Meal type</Text>
      <Text style={styles.cardValue}>{item.mealType}</Text>
      <Text style={styles.cardLabel}>Host</Text>
      <Text style={styles.cardValue}>{item.hostId}</Text>
      <TouchableOpacity
        style={[styles.joinBtn, joiningId === item.id && styles.btnDisabled]}
        onPress={() => handleJoin(item.id)}
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

  if (loading && orders.length === 0) {
    return (
      <SafeAreaView style={styles.centered} edges={['top']}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingCaption}>Loading open orders…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Text style={styles.title}>Orders</Text>
      <TouchableOpacity
        style={styles.createButton}
        onPress={handleGoSwipe}
        activeOpacity={0.85}
      >
        <Text style={styles.createButtonText}>Go to Swipe</Text>
      </TouchableOpacity>
      <FlatList
        data={orders}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
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
                No active orders yet — start one and others can join.
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
    marginBottom: 12,
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
