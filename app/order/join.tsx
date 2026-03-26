import { isUserBanned } from '@/services/adminGuard';
import { auth, db } from '@/services/firebase';
import { useRouter } from 'expo-router';
import {
  collection,
  doc,
  onSnapshot,
  query,
  updateDoc,
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
  const [joiningId, setJoiningId] = useState<string | null>(null);

  useEffect(() => {
    const q = query(
      collection(db, 'orders'),
      where('status', '==', 'open'),
    );
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
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
        setOrders([]);
        setLoading(false);
      },
    );
    return () => unsubscribe();
  }, []);

  const handleCreateOrder = () => {
    router.push('/order/create');
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
      const orderRef = doc(db, 'orders', orderId);
      await updateDoc(orderRef, { status: 'matched' });
      Alert.alert('Success', 'You joined the order.');
      router.push(`/order/${orderId}` as const);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to join';
      Alert.alert('Error', msg);
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
          <Text style={styles.joinBtnText}>Join Order</Text>
        )}
      </TouchableOpacity>
    </View>
  );

  if (loading && orders.length === 0) {
    return (
      <SafeAreaView style={styles.centered} edges={['top']}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Text style={styles.title}>Orders</Text>
      <TouchableOpacity
        style={styles.createButton}
        onPress={handleCreateOrder}
        activeOpacity={0.85}
      >
        <Text style={styles.createButtonText}>Create Order</Text>
      </TouchableOpacity>
      <FlatList
        data={orders}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            No open orders. Create one to get started.
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
  createButton: {
    backgroundColor: theme.colors.primary,
    marginHorizontal: theme.spacing.screen,
    paddingVertical: 16,
    borderRadius: theme.radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: theme.spacing.touchMin,
    marginBottom: theme.spacing.section,
  },
  createButtonText: {
    color: theme.colors.textOnPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  listContent: {
    paddingHorizontal: theme.spacing.screen,
    paddingBottom: 24,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.tight,
    ...shadows.card,
  },
  cardLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textMuted,
    marginBottom: 4,
  },
  cardValue: {
    fontSize: 16,
    color: theme.colors.text,
    marginBottom: 12,
  },
  joinBtn: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 14,
    borderRadius: theme.radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: theme.spacing.touchMin,
    marginTop: theme.spacing.xs,
  },
  joinBtnText: {
    color: theme.colors.textOnPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  btnDisabled: {
    opacity: 0.6,
  },
  emptyText: {
    fontSize: 16,
    color: theme.colors.textMuted,
    textAlign: 'center',
    marginTop: 24,
  },
});
