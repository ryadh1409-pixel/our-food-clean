/**
 * Expo Notifications: permissions, Expo push token, Android channel, foreground presentation.
 *
 * Call `configureForegroundNotificationHandler()` once early in app startup (e.g. root layout).
 * Use `registerForPushNotificationsAsync()` after sign-in or when you need a fresh token.
 */
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { HALF_ORDER_PAIR_JOIN_PUSH_TYPE } from '@/constants/pushTypes';

let foregroundHandlerConfigured = false;

/** EAS / app config project id for `getExpoPushTokenAsync` (required for some Expo builds). */
export function resolveExpoProjectId(): string | undefined {
  const extra =
    Constants.expoConfig?.extra &&
    typeof Constants.expoConfig.extra === 'object'
      ? (Constants.expoConfig.extra as Record<string, unknown>)
      : undefined;
  const eas =
    extra?.eas && typeof extra.eas === 'object'
      ? (extra.eas as Record<string, unknown>)
      : undefined;
  const fromExtra =
    typeof eas?.projectId === 'string' ? eas.projectId : undefined;
  const fromEasConfig =
    typeof Constants.easConfig?.projectId === 'string'
      ? Constants.easConfig.projectId
      : undefined;
  return fromExtra ?? fromEasConfig;
}

/** Android 8+ channel so notifications appear reliably. */
export async function ensureAndroidNotificationChannelAsync(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Default',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#34D399',
  });
}

/**
 * One-shot client setup: Android channel + foreground handler.
 * Safe to call from `App` mount alongside root layout configuration.
 */
export async function setupNotifications(): Promise<void> {
  if (Platform.OS === 'web') return;
  configureForegroundNotificationHandler();
  await ensureAndroidNotificationChannelAsync();
}

/** Foreground presentation. Idempotent — safe to call multiple times. */
export function configureForegroundNotificationHandler(): void {
  if (Platform.OS === 'web') return;
  if (foregroundHandlerConfigured) return;
  foregroundHandlerConfigured = true;

  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const data = notification.request.content.data as
        | Record<string, unknown>
        | undefined;
      /** Pair-join uses an in-app `Alert` in `_layout`; hide OS banner to avoid duplicates. */
      if (data?.type === HALF_ORDER_PAIR_JOIN_PUSH_TYPE) {
        return {
          shouldShowAlert: false,
          shouldPlaySound: true,
          shouldSetBadge: true,
          shouldShowBanner: false,
          shouldShowList: false,
        };
      }
      return {
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      };
    },
  });
}

/**
 * Request notification permission, ensure Android channel, return Expo push token string.
 * @returns Token, or `null` on web, denied permission, or failure.
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return null;
  }

  if (
    (Platform.OS === 'android' || Platform.OS === 'ios') &&
    !Device.isDevice
  ) {
    console.warn(
      '[notifications] Push may not work on a simulator; use a physical device for reliable tokens.',
    );
  }

  await ensureAndroidNotificationChannelAsync();

  let perm = await Notifications.getPermissionsAsync();
  if (perm.status !== Notifications.PermissionStatus.GRANTED) {
    perm = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
      },
    });
  }

  if (perm.status !== Notifications.PermissionStatus.GRANTED) {
    return null;
  }

  const projectId = resolveExpoProjectId();
  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    if (typeof token === 'string' && token.length > 0) {
      return token;
    }
  } catch (e) {
    console.warn('[notifications] getExpoPushTokenAsync failed:', e);
  }

  return null;
}

/** Fired when Expo rotates the device push token — persist to your backend when signed in. */
export function subscribeExpoPushTokenRefresh(
  onToken: (expoPushToken: string) => void,
): { remove: () => void } {
  if (Platform.OS === 'web') {
    return { remove: () => {} };
  }
  return Notifications.addPushTokenListener((devicePushToken) => {
    if (
      devicePushToken.type === 'expo' &&
      typeof devicePushToken.data === 'string' &&
      devicePushToken.data.length > 0
    ) {
      onToken(devicePushToken.data);
    }
  });
}

export { Notifications };

export type { Notification } from 'expo-notifications';
