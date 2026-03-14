import AppLogo from '@/components/AppLogo';
import { REFERRAL_ORDER_ID_KEY, REFERRAL_STORAGE_KEY } from '@/lib/invite-link';
import { db } from '@/services/firebase';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { doc, getDoc } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

const APP_STORE_URL = 'https://apps.apple.com/app/halforder-split-meals/id123456789';
const PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.anonymous.ourfoodclean';

type OrderData = {
  restaurantName: string;
  mealType: string;
  sharePrice: number;
  hostName: string;
  participantIds: string[];
  maxPeople: number;
  expiresAtMs: number | null;
  status: string;
};

export default function JoinInviteScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ orderId?: string; ref?: string }>();
  const orderId =
    params.orderId ?? (params as unknown as { orderId?: string }).orderId ?? '';
  const refUid = params.ref ?? (params as unknown as { ref?: string }).ref;

  const [order, setOrder] = useState<OrderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (refUid?.trim()) {
          await AsyncStorage.setItem(REFERRAL_STORAGE_KEY, refUid.trim());
        }
        if (orderId?.trim()) {
          await AsyncStorage.setItem(REFERRAL_ORDER_ID_KEY, orderId.trim());
        }
      } catch {
        // ignore
      }
      if (!mounted) return;
    })();
    return () => {
      mounted = false;
    };
  }, [orderId, refUid]);

  useEffect(() => {
    if (!orderId?.trim()) {
      setLoading(false);
      setNotFound(true);
      return;
    }
    let cancelled = false;
    getDoc(doc(db, 'orders', orderId))
      .then((snap) => {
        if (cancelled) return;
        if (!snap.exists()) {
          setOrder(null);
          setNotFound(true);
          setLoading(false);
          return;
        }
        const d = snap.data();
        const participantIds = Array.isArray(d?.participantIds)
          ? d.participantIds
          : [];
        const maxPeople =
          typeof d?.maxPeople === 'number' && d.maxPeople >= 1 ? d.maxPeople : 2;
        const expRaw = d?.expiresAt;
        const expiresAtMs =
          typeof expRaw === 'number'
            ? expRaw
            : typeof expRaw?.toMillis === 'function'
              ? expRaw.toMillis()
              : null;
        setOrder({
          restaurantName:
            typeof d?.restaurantName === 'string' ? d.restaurantName : '—',
          mealType: typeof d?.mealType === 'string' ? d.mealType : '—',
          sharePrice:
            typeof d?.sharePrice === 'number' ? d.sharePrice : 0,
          hostName:
            typeof d?.userName === 'string'
              ? d.userName
              : typeof d?.restaurantName === 'string'
                ? d.restaurantName
                : 'Host',
          participantIds,
          maxPeople,
          expiresAtMs,
          status: typeof d?.status === 'string' ? d.status : 'open',
        });
        setNotFound(false);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setOrder(null);
          setNotFound(true);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  const isExpired =
    order != null &&
    (order.status === 'expired' ||
      (order.expiresAtMs != null && order.expiresAtMs <= Date.now()));
  const isFull =
    order != null && order.participantIds.length >= order.maxPeople;

  const handleJoinOrder = () => {
    if (!orderId) return;
    const deepLink = `halforder://order/${orderId}`;
    if (Platform.OS === 'web') {
      router.push({ pathname: '/order/[id]', params: { id: orderId } } as never);
      return;
    }
    Linking.openURL(deepLink).catch(() => {
      if (Platform.OS === 'ios') {
        Linking.openURL(APP_STORE_URL).catch(() => {});
      } else {
        Linking.openURL(PLAY_STORE_URL).catch(() => {});
      }
    });
  };

  const handleDownloadApp = () => {
    if (Platform.OS === 'ios') {
      Linking.openURL(APP_STORE_URL).catch(() => {});
    } else if (Platform.OS === 'android') {
      Linking.openURL(PLAY_STORE_URL).catch(() => {});
    } else {
      Linking.openURL(PLAY_STORE_URL).catch(() => {});
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.loadingText}>Loading invite…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (notFound || !order) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={[styles.cardWrapper, styles.centered]}>
          <AppLogo />
          <Text style={styles.notFoundTitle}>Order not found</Text>
          <Text style={styles.notFoundSub}>
            This invite link may be invalid or the order was removed.
          </Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => router.replace('/(tabs)')}
          >
            <Text style={styles.primaryButtonText}>Go to HalfOrder</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const sharePriceLabel =
    order.sharePrice != null ? `$${Number(order.sharePrice).toFixed(2)}` : '—';

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.cardWrapper}>
          {/* WhatsApp-style invite preview */}
          <View style={styles.previewBubble}>
            <Text style={styles.previewLabel}>Invitation</Text>
            <Text style={styles.previewText}>
              Someone invited you to split a meal and save money with HalfOrder.
            </Text>
          </View>

          <View style={styles.logoRow}>
            <AppLogo width={120} height={56} marginTop={0} />
          </View>

          {/* Order card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Order details</Text>
            <Text style={styles.cardRow}>
              <Text style={styles.cardLabel}>Meal Type: </Text>
              {order.mealType}
            </Text>
            <Text style={styles.cardRow}>
              <Text style={styles.cardLabel}>Restaurant: </Text>
              {order.restaurantName}
            </Text>
            <Text style={styles.cardRow}>
              <Text style={styles.cardLabel}>Share price: </Text>
              {sharePriceLabel}
            </Text>
            <Text style={styles.cardRow}>
              <Text style={styles.cardLabel}>Host: </Text>
              {order.hostName}
            </Text>
          </View>

          <Text style={styles.inviteMessage}>
            Someone invited you to split a meal and save money.
          </Text>

          {isFull ? (
            <>
              <View style={styles.statusBox}>
                <Text style={styles.statusError}>
                  This order is already full.
                </Text>
              </View>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={handleDownloadApp}
                activeOpacity={0.85}
              >
                <Text style={styles.secondaryButtonText}>Download App</Text>
              </TouchableOpacity>
            </>
          ) : isExpired ? (
            <>
              <View style={styles.statusBox}>
                <Text style={styles.statusError}>
                  This order has expired.
                </Text>
              </View>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={handleDownloadApp}
                activeOpacity={0.85}
              >
                <Text style={styles.secondaryButtonText}>Download App</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={handleJoinOrder}
                activeOpacity={0.85}
              >
                <Text style={styles.primaryButtonText}>Join Order</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={handleDownloadApp}
                activeOpacity={0.85}
              >
                <Text style={styles.secondaryButtonText}>Download App</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 48,
    alignItems: 'center',
  },
  cardWrapper: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#64748b',
  },
  notFoundTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
    marginTop: 24,
    textAlign: 'center',
  },
  notFoundSub: {
    fontSize: 15,
    color: '#64748b',
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  previewBubble: {
    backgroundColor: '#dcfce7',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderLeftWidth: 4,
    borderLeftColor: '#22c55e',
  },
  previewLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#166534',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  previewText: {
    fontSize: 15,
    color: '#166534',
    lineHeight: 22,
  },
  logoRow: {
    alignItems: 'center',
    marginBottom: 20,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 16,
  },
  cardRow: {
    fontSize: 16,
    color: '#334155',
    marginBottom: 10,
  },
  cardLabel: {
    fontWeight: '600',
    color: '#475569',
  },
  inviteMessage: {
    fontSize: 16,
    color: '#475569',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 24,
    paddingHorizontal: 8,
  },
  statusBox: {
    marginBottom: 20,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#fef2f2',
    alignItems: 'center',
  },
  statusError: {
    fontSize: 16,
    fontWeight: '600',
    color: '#dc2626',
  },
  primaryButton: {
    backgroundColor: '#2563eb',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
    width: '100%',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
  },
  secondaryButton: {
    backgroundColor: '#ffffff',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#2563eb',
    width: '100%',
  },
  secondaryButtonText: {
    color: '#2563eb',
    fontSize: 16,
    fontWeight: '600',
  },
});
