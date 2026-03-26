import AppLogo from '@/components/AppLogo';
import { BrandBanner } from '@/components/BrandBanner';
import { EATON_CENTRE } from '@/constants/deal-zones';
import { layoutStyles, theme, typography } from '@/constants/theme';
import type { DealZoneOrder } from '@/hooks/useDealZoneOrders';
import { useDealZoneOrders } from '@/hooks/useDealZoneOrders';
import { isUserBanned } from '@/services/adminGuard';
import { auth, db } from '@/services/firebase';
import { useRouter } from 'expo-router';
import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function DealsScreen() {
  const router = useRouter();
  const { userInZone, orders, loading, error, refetch } =
    useDealZoneOrders(EATON_CENTRE);
  const [joiningId, setJoiningId] = useState<string | null>(null);

  const handleJoin = async (order: DealZoneOrder) => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      router.push('/(auth)/login?redirectTo=/(tabs)/deals');
      return;
    }
    if (await isUserBanned(uid)) {
      Alert.alert(
        'Access denied',
        'Your account has been restricted. You cannot join orders.',
      );
      return;
    }
    if (order.participantIds.includes(uid)) {
      router.push(`/match/${order.id}` as const);
      return;
    }
    if (order.participantIds.length >= order.maxParticipants) {
      Alert.alert(
        'Order full',
        'This order already has the maximum number of participants.',
      );
      return;
    }
    setJoiningId(order.id);
    try {
      const orderRef = doc(db, 'orders', order.id);
      const displayName =
        auth.currentUser?.displayName ||
        auth.currentUser?.email?.split('@')[0] ||
        'User';
      await updateDoc(orderRef, {
        status: 'matched',
        participantIds: arrayUnion(uid),
        user2Id: uid,
        user2Name: displayName,
      });
      const { createAlert } = await import('@/services/alerts');
      await createAlert('order_matched', 'Order matched');
      const { incrementGrowthMatches } =
        await import('@/services/growthMetrics');
      await incrementGrowthMatches();
      const messagesRef = collection(db, 'orders', order.id, 'messages');
      await addDoc(messagesRef, {
        userId: uid,
        userName: displayName,
        text: 'Joined the order',
        createdAt: serverTimestamp(),
        type: 'system',
      });
      Alert.alert('Success', 'You joined the order.');
      router.push(`/match/${order.id}` as const);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to join';
      Alert.alert('Error', msg);
    } finally {
      setJoiningId(null);
    }
  };

  const handleChooseLocation = () => {
    refetch();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <BrandBanner>
        <View style={styles.bannerRow}>
          <AppLogo size={40} marginTop={0} style={styles.bannerLogo} />
          <Text style={styles.bannerText}>Deals Zone</Text>
        </View>
      </BrandBanner>

      {error ? (
        <View style={styles.content}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={layoutStyles.primaryButton}
            onPress={refetch}
            activeOpacity={0.85}
          >
            <Text style={layoutStyles.primaryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : loading ? (
        <View style={[styles.content, styles.centered]}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.hint}>Getting your location...</Text>
        </View>
      ) : !userInZone ? (
        <View style={styles.content}>
          <Text style={styles.message}>
            Sorry, your location is currently outside our deal zones.
          </Text>
          <Text style={styles.hint}>
            Come to {EATON_CENTRE.name} for special split deals.
          </Text>
          <TouchableOpacity
            style={layoutStyles.primaryButton}
            onPress={handleChooseLocation}
            activeOpacity={0.85}
          >
            <Text style={layoutStyles.primaryButtonText}>Refresh location</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={refetch} />
          }
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.zoneTitle}>{EATON_CENTRE.name} Deals</Text>
          <Text style={styles.zoneSubtitle}>
            Open orders from restaurants in the mall
          </Text>

          {orders.length === 0 ? (
            <Text style={styles.emptyText}>
              No open orders here yet. Create one to get started!
            </Text>
          ) : (
            orders.map((order) => {
              const distanceLabel =
                order.distanceFromUserKm != null
                  ? `${order.distanceFromUserKm.toFixed(2)} km away`
                  : '—';
              const peopleLabel = `${order.participantIds.length} / ${order.maxParticipants} people joined`;
              const isJoining = joiningId === order.id;

              return (
                <View key={order.id} style={[layoutStyles.card, styles.cardInner]}>
                  <Text style={styles.cardRestaurant}>
                    {order.restaurantName}
                  </Text>
                  <Text style={styles.cardRow}>{distanceLabel}</Text>
                  <Text style={styles.cardRow}>{peopleLabel}</Text>
                  <TouchableOpacity
                    style={[
                      layoutStyles.primaryButton,
                      styles.joinButton,
                      isJoining && styles.joinButtonDisabled,
                    ]}
                    onPress={() => handleJoin(order)}
                    disabled={isJoining}
                  >
                    {isJoining ? (
                      <ActivityIndicator
                        size="small"
                        color={theme.colors.textOnPrimary}
                      />
                    ) : (
                      <Text style={layoutStyles.primaryButtonText}>Join Order</Text>
                    )}
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  bannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerLogo: {
    marginBottom: 2,
    marginRight: 12,
  },
  bannerText: {
    ...typography.title,
    fontSize: 20,
    color: theme.colors.textOnPrimary,
    fontWeight: '700',
  },
  content: {
    flex: 1,
    paddingHorizontal: theme.spacing.screen,
    paddingTop: 32,
    alignItems: 'center',
  },
  centered: { justifyContent: 'center' },
  message: {
    fontSize: 16,
    color: theme.colors.text,
    textAlign: 'center',
    marginBottom: 12,
  },
  hint: {
    fontSize: 14,
    color: theme.colors.textMuted,
    textAlign: 'center',
    marginBottom: 24,
  },
  errorText: {
    fontSize: 14,
    color: theme.colors.dangerText,
    textAlign: 'center',
    marginBottom: 16,
  },
  scroll: { flex: 1 },
  scrollContent: { padding: theme.spacing.screen, paddingBottom: 32 },
  zoneTitle: {
    ...typography.title,
    marginBottom: theme.spacing.xs,
  },
  zoneSubtitle: {
    ...typography.bodyMuted,
    marginBottom: theme.spacing.section,
  },
  emptyText: {
    fontSize: 15,
    color: theme.colors.textMuted,
    textAlign: 'center',
    marginTop: 12,
  },
  cardInner: {
    marginBottom: theme.spacing.md - 4,
  },
  cardRestaurant: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 8,
  },
  cardRow: {
    fontSize: 14,
    color: theme.colors.textMuted,
    marginBottom: 4,
  },
  joinButton: {
    marginTop: theme.spacing.md - 4,
    minHeight: 48,
    paddingVertical: 12,
  },
  joinButtonDisabled: { opacity: 0.7 },
});
