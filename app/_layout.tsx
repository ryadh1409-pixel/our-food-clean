import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { Redirect, Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import {
    Platform,
} from 'react-native';

import 'react-native-reanimated';

/**
 * Root Stack: auth, onboarding, modals, and `/(tabs)` (the only Tab navigator).
 * Main app chrome lives in `app/(tabs)/_layout.tsx`.
 */
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { trackAppOpen, trackNotificationOpen } from '@/services/analytics';
import { AuthProvider, useAuth } from '@/services/AuthContext';
import {
    logNotificationOpened,
    logNotificationReceived,
} from '@/services/notificationTracking';
import { startExpiredOrdersCleanup } from '@/services/orders';
import {
    registerPushTokenAndSave,
    updateLastActive,
    updateUserLocationInFirestore,
} from '@/services/radarAndPush';

const NEARBY_MATCH_DATA_TYPE = 'nearby_match';

export const unstable_settings = {
  initialRouteName: 'index',
};

export const linking = {
  prefixes: ['halforder://', 'https://halforder.app'],
  config: {
    screens: {
      'order/[id]': 'order/:id',
      'match/[orderId]': 'match/:orderId',
      'food-match/[matchId]': 'food-match/:matchId',
      'join/[orderId]': 'join/:orderId',
    },
  },
};

function RootLayoutNav() {
  const { user } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  const seg0 = segments[0] as string | undefined;

  useEffect(() => {
    const uid = user?.uid;
    if (!uid) return;
    updateLastActive(uid).catch(() => {});
    updateUserLocationInFirestore(uid, user?.email ?? null).catch(() => {});
    registerPushTokenAndSave(uid).catch(() => {});
    trackAppOpen(uid).catch(() => {});
  }, [user?.uid, user?.email]);

  // Background cleanup of expired orders (runs every 60 seconds while app is open)
  useEffect(() => {
    const stop = startExpiredOrdersCleanup();
    return () => stop();
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    const receivedSub = Notifications.addNotificationReceivedListener(
      (notification) => {
        const data = notification?.request?.content?.data as
          | Record<string, unknown>
          | undefined;
        const notificationId = data?.notificationId as string | undefined;
        if (notificationId) {
          logNotificationReceived(notificationId).catch(() => {});
        }
      },
    );

    const responseSub = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification?.request?.content?.data as
          | Record<string, unknown>
          | undefined;
        const notificationId =
          (data?.notificationId as string | undefined) ??
          (response.notification?.request?.identifier as string | undefined) ??
          null;
        if (notificationId) {
          logNotificationOpened(notificationId).catch(() => {});
        }
        trackNotificationOpen(user?.uid ?? null, notificationId).catch(
          () => {},
        );
        if (data?.type === NEARBY_MATCH_DATA_TYPE) {
          router.push('/order/create');
        }
      },
    );
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response?.notification?.request?.content?.data) return;
      const data = response.notification.request.content.data as Record<
        string,
        unknown
      >;
      const notificationId = data?.notificationId as string | undefined;
      if (notificationId) {
        logNotificationOpened(notificationId).catch(() => {});
      }
      if (data?.type === NEARBY_MATCH_DATA_TYPE) {
        setTimeout(() => router.push('/order/create'), 300);
      }
    });
    return () => {
      receivedSub.remove();
      responseSub.remove();
    };
  }, [router]);

  const inAuthGroup = seg0 === '(auth)';
  const onJoinRedirect = seg0 === 'join';
  const onTermsFlow =
    seg0 === 'terms-acceptance' ||
    seg0 === 'terms' ||
    seg0 === 'privacy';
  const redirectToLogin =
    !user && !inAuthGroup && !onJoinRedirect && !onTermsFlow;
  const redirectToTabs = user && inAuthGroup;
  const pathname = segments.length > 0 ? `/${segments.join('/')}` : '';
  const loginHref =
    pathname && pathname !== '/' && pathname !== ''
      ? `/(auth)/login?redirectTo=${encodeURIComponent(pathname)}`
      : '/(auth)/login';

  return (
    <>
      {redirectToLogin ? (
        <Redirect href={loginHref as Parameters<typeof Redirect>[0]['href']} />
      ) : null}
      {redirectToTabs ? <Redirect href="/(tabs)" /> : null}
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="terms" options={{ title: 'Terms of Use' }} />
        <Stack.Screen name="privacy" options={{ title: 'Privacy Policy' }} />
        <Stack.Screen
          name="terms-acceptance"
          options={{ headerShown: false, title: 'Terms' }}
        />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen
          name="create-order"
          options={{ title: 'Create Order' }}
        />
        <Stack.Screen name="support" options={{ title: 'Support' }} />
        <Stack.Screen
          name="admin-support"
          options={{ title: 'Admin Support' }}
        />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="order/[id]" options={{ title: 'Order' }} />
        <Stack.Screen name="user/[id]" options={{ title: 'User Profile' }} />
        <Stack.Screen
          name="order-details/[id]"
          options={{ title: 'Order Details' }}
        />
        <Stack.Screen name="match/[orderId]" options={{ headerShown: false }} />
        <Stack.Screen
          name="food-match/[matchId]"
          options={{ headerShown: false, title: 'Match' }}
        />
        <Stack.Screen name="join/[orderId]" options={{ headerShown: false }} />
        <Stack.Screen
          name="nearby-orders"
          options={{ title: 'Nearby Orders' }}
        />
        <Stack.Screen
          name="admin-users"
          options={{ title: 'Users Management' }}
        />
        <Stack.Screen
          name="admin-orders"
          options={{ title: 'Orders Management' }}
        />
        <Stack.Screen
          name="admin-notifications"
          options={{ title: 'Send Notifications' }}
        />
        <Stack.Screen
          name="admin-reports"
          options={{ title: 'User reports' }}
        />
        <Stack.Screen
          name="wallet"
          options={{ title: 'Wallet', headerShown: false }}
        />
        <Stack.Screen
          name="inbox"
          options={{ title: 'Inbox', headerShown: false }}
        />
        <Stack.Screen
          name="explore"
          options={{ title: 'Browse', headerShown: false }}
        />
        <Stack.Screen
          name="chat/[orderId]"
          options={{ title: 'Chat', headerShown: false }}
        />
        <Stack.Screen
          name="help"
          options={{ title: 'Help', headerShown: false }}
        />
        <Stack.Screen
          name="safety"
          options={{ title: 'Safety', headerShown: false }}
        />
        <Stack.Screen
          name="complaint"
          options={{ title: 'Complaint or inquiry', headerShown: false }}
        />
        <Stack.Screen
          name="modal"
          options={{ presentation: 'modal', title: 'Modal' }}
        />
      </Stack>
      <StatusBar style="light" />
    </>
  );
}

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <ThemeProvider value={DarkTheme}>
        <AuthProvider>
          <RootLayoutNav />
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
