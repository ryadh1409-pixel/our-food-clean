import AsyncStorage from '@react-native-async-storage/async-storage';
import {
    DarkTheme,
    DefaultTheme,
    ThemeProvider,
} from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { Redirect, Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    DeviceEventEmitter,
    Platform,
    View,
} from 'react-native';

import {
    TERMS_ACCEPTANCE_STORAGE_KEY,
    TERMS_ACCEPTED_EVENT,
} from '@/constants/termsAcceptance';
import 'react-native-reanimated';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { theme } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
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
      'join/[orderId]': 'join/:orderId',
    },
  },
};

function RootLayoutNav() {
  const { user } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const [termsAccepted, setTermsAccepted] = useState<boolean | null>(null);

  const seg0 = segments[0] as string | undefined;

  const termsExempt =
    seg0 === 'index' ||
    seg0 === 'onboarding' ||
    seg0 === 'terms-acceptance' ||
    seg0 === 'terms' ||
    seg0 === 'privacy' ||
    seg0 === '(auth)';

  const termsLoadingBlock = termsAccepted === null && !termsExempt;

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(TERMS_ACCEPTED_EVENT, () => {
      setTermsAccepted(true);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void AsyncStorage.getItem(TERMS_ACCEPTANCE_STORAGE_KEY).then((v) => {
      if (!cancelled) {
        setTermsAccepted(v != null && v.length > 0);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [seg0]);

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

  const needsTermsRedirect =
    termsAccepted === false && !termsExempt;
  const termsHref =
    pathname !== '/' &&
    pathname !== '/index' &&
    !pathname.startsWith('/(auth)')
      ? (`/terms-acceptance?returnTo=${encodeURIComponent(pathname)}` as Parameters<
          typeof Redirect
        >[0]['href'])
      : ('/terms-acceptance' as Parameters<typeof Redirect>[0]['href']);

  if (termsLoadingBlock) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: theme.colors.background,
        }}
      >
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <>
      {needsTermsRedirect ? (
        <Redirect href={termsHref} />
      ) : redirectToLogin ? (
        <Redirect href={loginHref as Parameters<typeof Redirect>[0]['href']} />
      ) : null}
      {redirectToTabs ? <Redirect href="/(tabs)" /> : null}
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen
          name="terms-acceptance"
          options={{ headerShown: false, title: 'Terms' }}
        />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="support" options={{ title: 'Support' }} />
        <Stack.Screen
          name="admin-support"
          options={{ title: 'Admin Support' }}
        />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="order/[id]" options={{ title: 'Order' }} />
        <Stack.Screen name="match/[orderId]" options={{ headerShown: false }} />
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
      <StatusBar style="auto" />
    </>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <ErrorBoundary>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AuthProvider>
          <RootLayoutNav />
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
