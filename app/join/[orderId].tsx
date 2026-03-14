import { REFERRAL_ORDER_ID_KEY, REFERRAL_STORAGE_KEY } from '@/lib/invite-link';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Handles halforder.app/join/{orderId}?ref={userId}.
 * Stores referral uid and orderId for referral tracking, then redirects to the order screen.
 */
export default function JoinRedirectScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ orderId?: string; ref?: string }>();
  const orderId =
    params.orderId ?? (params as unknown as { orderId?: string }).orderId;
  const refUid = params.ref ?? (params as unknown as { ref?: string }).ref;

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
      if (orderId?.trim()) {
        router.replace({
          pathname: '/order/[id]',
          params: { id: orderId },
        } as never);
      } else {
        router.replace('/(tabs)/explore');
      }
    })();
    return () => {
      mounted = false;
    };
  }, [orderId, refUid, router]);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator size="large" />
    </View>
  );
}
