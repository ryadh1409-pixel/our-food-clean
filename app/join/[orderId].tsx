import AppLogo from '@/components/AppLogo';
import { getIosAppStoreUrl, getPlayStoreUrl } from '@/constants/storeLinks';
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
import { shadows, theme } from '@/constants/theme';

const c = theme.colors;

type OrderData = {
  restaurantName: string;
  mealType: string;
  sharePrice: number;
  hostName: string;
  participants: string[];
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
        const plist = Array.isArray(d?.participants)
          ? d.participants.filter((x): x is string => typeof x === 'string')
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
          participants: plist,
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
    order != null && order.participants.length >= order.maxPeople;

  const handleJoinOrder = () => {
    if (!orderId) return;
    const deepLink = `halforder://order/${orderId}`;
    if (Platform.OS === 'web') {
      router.push(`/order/${orderId}` as never);
      return;
    }
    Linking.openURL(deepLink).catch(() => {
      if (Platform.OS === 'ios') {
        Linking.openURL(getIosAppStoreUrl()).catch(() => {});
      } else {
        Linking.openURL(getPlayStoreUrl()).catch(() => {});
      }
    });
  };

  const handleDownloadApp = () => {
    if (Platform.OS === 'ios') {
      Linking.openURL(getIosAppStoreUrl()).catch(() => {});
    } else if (Platform.OS === 'android') {
      Linking.openURL(getPlayStoreUrl()).catch(() => {});
    } else {
      Linking.openURL(getPlayStoreUrl()).catch(() => {});
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={c.primary} />
          <Text style={styles.loadingText}>Loading invite…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (notFound || !order) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={[styles.cardWrapper, styles.centered]}>
          <AppLogo size={88} marginTop={0} />
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
              You opened a shared-order invite with HalfOrder.
            </Text>
          </View>

          <View style={styles.logoRow}>
            <AppLogo size={96} marginTop={0} />
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
            Open the order to join this shared meal.
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
    backgroundColor: c.chromeWash,
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
    color: c.textMuted,
  },
  notFoundTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: c.textSlateDark,
    marginTop: 24,
    textAlign: 'center',
  },
  notFoundSub: {
    fontSize: 15,
    color: c.textMuted,
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  previewBubble: {
    backgroundColor: c.successBackground,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderLeftWidth: 4,
    borderLeftColor: c.success,
  },
  previewLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: c.successTextDark,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  previewText: {
    fontSize: 15,
    color: c.successTextDark,
    lineHeight: 22,
  },
  logoRow: {
    alignItems: 'center',
    marginBottom: 20,
  },
  card: {
    backgroundColor: c.white,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.section,
    marginBottom: theme.spacing.section,
    borderWidth: 1,
    borderColor: c.border,
    ...shadows.card,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: c.textSlateDark,
    marginBottom: 16,
  },
  cardRow: {
    fontSize: 16,
    color: c.textSlateDark,
    marginBottom: 10,
  },
  cardLabel: {
    fontWeight: '600',
    color: c.textSlate,
  },
  inviteMessage: {
    fontSize: 16,
    color: c.textSlate,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 24,
    paddingHorizontal: 8,
  },
  statusBox: {
    marginBottom: 20,
    padding: 16,
    borderRadius: 12,
    backgroundColor: c.dangerBackground,
    alignItems: 'center',
  },
  statusError: {
    fontSize: 16,
    fontWeight: '600',
    color: c.danger,
  },
  primaryButton: {
    backgroundColor: c.primary,
    paddingVertical: 16,
    borderRadius: theme.radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: theme.spacing.touchMin,
    marginBottom: theme.spacing.tight,
    width: '100%',
  },
  primaryButtonText: {
    color: c.textOnPrimary,
    fontSize: 17,
    fontWeight: '700',
  },
  secondaryButton: {
    backgroundColor: c.white,
    paddingVertical: 16,
    borderRadius: theme.radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: theme.spacing.touchMin,
    borderWidth: 2,
    borderColor: c.primary,
    width: '100%',
  },
  secondaryButtonText: {
    color: c.primary,
    fontSize: 16,
    fontWeight: '600',
  },
});
