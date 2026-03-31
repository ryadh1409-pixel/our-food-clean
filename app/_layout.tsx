import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { Redirect, Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef } from 'react';
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
import { db, ensureAuthReady } from '@/services/firebase';
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
import {
  addDoc,
  collection,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
  type DocumentData,
} from 'firebase/firestore';

const NEARBY_MATCH_DATA_TYPE = 'nearby_match';

export const unstable_settings = {
  initialRouteName: 'index',
};

export const linking = {
  prefixes: [
    'halforder://',
    'https://halforder.app',
    'https://www.halforder.app',
  ],
  config: {
    screens: {
      terms: 'terms',
      privacy: 'privacy',
      subscribe: 'subscribe',
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
  const currentUserRef = useRef(user);
  const latestOrderRef = useRef<{
    orderId: string | null;
    status: string;
    items: string;
  } | null>(null);
  const orderStateCacheRef = useRef<Record<string, { status: string; participants: number }>>({});
  const tidioOrderEventSentRef = useRef<Set<string>>(new Set());

  const seg0 = segments[0] as string | undefined;

  useEffect(() => {
    currentUserRef.current = user;
  }, [user]);

  useEffect(() => {
    const uid = user?.uid;
    if (!uid) {
      latestOrderRef.current = null;
      return;
    }

    const loadLatestOrder = async () => {
      try {
        const baseRef = collection(db, 'orders');
        const q = query(
          baseRef,
          where('userId', '==', uid),
          orderBy('createdAt', 'desc'),
          limit(1),
        );
        let snapshot = await getDocs(q);

        // Fallback when a composite index is not available yet.
        if (snapshot.empty) {
          snapshot = await getDocs(query(baseRef, where('userId', '==', uid), limit(10)));
        }

        if (snapshot.empty) {
          latestOrderRef.current = null;
          return;
        }

        const docSnap = snapshot.docs[0];
        const data = (docSnap.data() ?? {}) as DocumentData;
        const status =
          typeof data.status === 'string' && data.status.trim()
            ? data.status.trim()
            : 'unknown';
        const itemsSource =
          typeof data.itemsSummary === 'string'
            ? data.itemsSummary
            : typeof data.restaurantName === 'string'
              ? data.restaurantName
              : typeof data.mealType === 'string'
                ? data.mealType
                : '';
        latestOrderRef.current = {
          orderId: docSnap.id,
          status,
          items: itemsSource.trim() || 'meal item',
        };
      } catch (error) {
        console.warn('[Tidio] failed loading latest order:', error);
        latestOrderRef.current = null;
      }
    };

    loadLatestOrder().catch(() => {});
  }, [user?.uid]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (typeof window === 'undefined') return;
    const uid = user?.uid;
    if (!uid) return;

    type TidioApi = {
      messageFromOperator?: (message: string) => void;
      showMessage?: (message: string | { message: string }) => void;
      sendMessage?: (message: string | { message: string }) => void;
      addMessage?: (message: string | { message: string }) => void;
    };
    type TidioWindow = Window & { tidioChatApi?: TidioApi };

    const sendTidioOrderNotification = (message: string) => {
      const api = (window as TidioWindow).tidioChatApi;
      if (!api) return;
      try {
        if (typeof api.messageFromOperator === 'function') {
          api.messageFromOperator(message);
          return;
        }
        if (typeof api.showMessage === 'function') {
          api.showMessage({ message });
          return;
        }
        if (typeof api.sendMessage === 'function') {
          api.sendMessage({ message });
          return;
        }
        if (typeof api.addMessage === 'function') {
          api.addMessage({ message });
        }
      } catch (error) {
        console.warn('[Tidio] order notification send failed:', error);
      }
    };

    const q = query(collection(db, 'orders'), where('userId', '==', uid));
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'removed') return;
          const orderId = change.doc.id;
          const data = (change.doc.data() ?? {}) as DocumentData;
          const status =
            typeof data.status === 'string' ? data.status.toLowerCase() : 'unknown';
          const participantsCount = Array.isArray(data.participantIds)
            ? data.participantIds.length
            : 0;

          const prev = orderStateCacheRef.current[orderId];
          orderStateCacheRef.current[orderId] = {
            status,
            participants: participantsCount,
          };
          if (!prev) return;

          const emitOnce = (key: string, text: string) => {
            if (tidioOrderEventSentRef.current.has(key)) return;
            tidioOrderEventSentRef.current.add(key);
            sendTidioOrderNotification(text);
            console.log('[Tidio] order event notification:', { orderId, key, text });
          };

          if (prev.status !== 'matched' && status === 'matched') {
            emitOnce(`${orderId}:matched`, '🎉 Your order has been matched! Someone joined your order!');
          }
          if (prev.status !== 'completed' && status === 'completed') {
            emitOnce(`${orderId}:completed`, '✅ Your order is completed 🍕');
          }
          if (participantsCount > prev.participants && status === 'pending') {
            emitOnce(`${orderId}:join-request`, '👀 Someone wants to join your order');
          }
        });
      },
      (error) => {
        console.warn('[Tidio] order listener failed:', error);
      },
    );

    return () => {
      unsub();
    };
  }, [user?.uid]);

  useEffect(() => {
    ensureAuthReady().catch((error) => {
      console.warn('Anonymous auth bootstrap failed:', error);
    });
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (typeof document === 'undefined') return;

    const existing = document.getElementById('tidio-live-chat');
    if (existing) {
      console.log('[Tidio] script already present');
      return;
    }

    const script = document.createElement('script');
    script.id = 'tidio-live-chat';
    script.src = '//code.tidio.co/fnmubcdwbtbooaqhbih23ly2idzdyq6b.js';
    script.async = true;
    script.onload = () => {
      console.log('[Tidio] script loaded');
    };
    script.onerror = () => {
      console.warn('[Tidio] script failed to load');
    };
    document.body.appendChild(script);
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (typeof window === 'undefined') return;

    type TidioApi = {
      on?: (eventName: string, handler: (payload?: unknown) => void) => void;
      off?: (eventName: string, handler: (payload?: unknown) => void) => void;
      setVisitorData?: (data: Record<string, string>) => void;
      showMessage?: (message: string | { message: string }) => void;
      sendMessage?: (message: string | { message: string }) => void;
      addMessage?: (message: string | { message: string }) => void;
    };
    type TidioWindow = Window & {
      tidioChatApi?: TidioApi;
      __tidioTrackingBound?: boolean;
      __tidioAwaitingOrderId?: boolean;
      __tidioAiPaused?: boolean;
    };

    let cleanupHandler: (() => void) | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let attempts = 0;
    const maxAttempts = 20;

    const notifyNewTidioMessage = async (
      message: string,
      direction: 'received' | 'sent',
    ) => {
      // Current notification behavior (console). Keep this helper for future push integration.
      console.log('[Tidio Notification]', {
        direction,
        message,
        timestamp: new Date().toISOString(),
      });
    };
    const sendSupportMessage = (
      api: TidioApi,
      text: string,
    ) => {
      const dynamicApi = api as unknown as Record<
        string,
        ((message: string | { message: string }) => void) | undefined
      >;
      const sender =
        dynamicApi.showMessage ?? dynamicApi.sendMessage ?? dynamicApi.addMessage;
      if (typeof sender !== 'function') return;
      try {
        sender({ message: text });
      } catch {
        try {
          sender(text);
        } catch {
          // Keep chat stable if this Tidio API variant does not support client-side messages.
        }
      }
    };
    const AUTO_REPLY_TEXT =
      'Hey 👋 Welcome to OurFood!\nWe help you share meals and save money 🍕\n\nIf you need help, just type your issue.\nWe usually reply within a few minutes.';
    const QUICK_REPLY_OPTIONS = [
      'My current order',
      'Report a problem',
      'How it works',
      'Refund request',
    ] as const;
    const AI_ENDPOINT =
      process.env.EXPO_PUBLIC_SUPPORT_AI_ENDPOINT || 'http://localhost:3000/ai-support-reply';
    const requestAiReply = async (message: string): Promise<string | null> => {
      try {
        const response = await fetch(AI_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message }),
        });
        if (!response.ok) return null;
        const json = (await response.json()) as { aiResponse?: unknown };
        if (typeof json.aiResponse === 'string' && json.aiResponse.trim()) {
          return json.aiResponse.trim();
        }
        return null;
      } catch (error) {
        console.warn('[Tidio] AI reply request failed:', error);
        return null;
      }
    };

    const attachTracking = (): boolean => {
      const tidioWindow = window as TidioWindow;
      const api = tidioWindow.tidioChatApi;
      if (!api?.on || tidioWindow.__tidioTrackingBound) return false;

      const onVisitorMessage = async (payload?: unknown) => {
        const tidioWindow = window as TidioWindow;
        const data =
          payload && typeof payload === 'object'
            ? (payload as Record<string, unknown>)
            : null;
        const messageRaw =
          (typeof data?.message === 'string' && data.message) ||
          (typeof data?.content === 'string' && data.content) ||
          '';
        const message = messageRaw.trim();
        if (!message) return;
        console.log('[Tidio] message captured:', {
          message,
          timestamp: new Date().toISOString(),
        });

        const sessionUser = currentUserRef.current;
        const userId = sessionUser?.uid ?? null;
        const email = sessionUser?.email ?? null;
        const name = sessionUser?.displayName ?? null;

        try {
          await addDoc(collection(db, 'chats'), {
            message,
            createdAt: serverTimestamp(),
            source: 'tidio',
            userId,
            email,
            name,
          });
          await notifyNewTidioMessage(message, 'sent');
          console.log('[Tidio] message saved to Firestore:', {
            message,
            userId,
            timestamp: new Date().toISOString(),
          });

          const normalized = message.toLowerCase();
          if (normalized.includes('agent')) {
            tidioWindow.__tidioAiPaused = true;
            sendSupportMessage(
              api,
              'Understood — I am pausing auto-replies and routing you to a human support agent.',
            );
            await notifyNewTidioMessage(
              'AI paused by user request (agent handoff).',
              'received',
            );
            return;
          }

          if (!tidioWindow.__tidioAiPaused) {
            const aiReply = await requestAiReply(message);
            if (aiReply) {
              sendSupportMessage(api, aiReply);
              await notifyNewTidioMessage('AI response sent.', 'received');
              return;
            }
          }

          const hasOrderIntent =
            normalized.includes('order') ||
            normalized.includes('join') ||
            normalized.includes('create') ||
            normalized.includes('my current order');
          const hasIssueIntent =
            normalized.includes('issue') ||
            normalized.includes('problem') ||
            normalized.includes('wrong') ||
            normalized.includes('not working');
          const hasRefundIntent =
            normalized.includes('refund') ||
            normalized.includes('money back') ||
            normalized.includes('chargeback');
          const isNewUserIntent =
            normalized.includes('how') ||
            normalized.includes('new') ||
            normalized.includes('first time') ||
            normalized.includes('how sharing works') ||
            normalized.includes('how does sharing work') ||
            normalized.includes('how it works');

          const orderIdMatch = message.match(/[A-Za-z0-9_-]{8,40}/);
          if (tidioWindow.__tidioAwaitingOrderId && orderIdMatch?.[0]) {
            tidioWindow.__tidioAwaitingOrderId = false;
            const orderId = orderIdMatch[0];
            sendSupportMessage(
              api,
              `Thanks — I captured order ID ${orderId}. Our support team will review this issue and follow up shortly.`,
            );
            await notifyNewTidioMessage(
              `Captured issue orderId: ${orderId}`,
              'received',
            );
            return;
          }

          if (hasIssueIntent) {
            tidioWindow.__tidioAwaitingOrderId = true;
            const latestOrderId = latestOrderRef.current?.orderId;
            const suggestion = latestOrderId
              ? ` Latest order I found: ${latestOrderId}.`
              : '';
            sendSupportMessage(
              api,
              `I can help with that. Please share your order ID so we can locate the order and resolve the issue quickly.${suggestion}`,
            );
            await notifyNewTidioMessage(
              'Issue flow started: requested orderId.',
              'received',
            );
            return;
          }

          if (hasRefundIntent) {
            sendSupportMessage(
              api,
              'Refund steps: 1) Share your order ID, 2) Describe the issue and what went wrong, 3) Our support team reviews and confirms eligibility, 4) If approved, the refund is processed to your original payment method.',
            );
            await notifyNewTidioMessage('Refund steps sent.', 'received');
            return;
          }

          if (hasOrderIntent) {
            const latestOrder = latestOrderRef.current;
            const latestLine =
              latestOrder?.orderId
                ? ` Your current order: #${latestOrder.orderId}, status: ${latestOrder.status}, items: ${latestOrder.items}.`
                : '';
            sendSupportMessage(
              api,
              `You can start by tapping 'Create Order' to post your meal, or 'Join' to match with an existing order near you.${latestLine} If you tell me what you're trying to do, I can guide you step-by-step.`,
            );
            await notifyNewTidioMessage(
              'Order guidance flow response sent.',
              'received',
            );
            return;
          }

          if (isNewUserIntent) {
            sendSupportMessage(
              api,
              'OurFood lets you split meal costs with nearby users by creating or joining shared orders. You choose a meal, match with others, and each person pays their share directly in the app flow.',
            );
            await notifyNewTidioMessage(
              'New user sharing explanation sent.',
              'received',
            );
          }
        } catch (error) {
          console.error('[Tidio] failed to store message:', error);
        }
      };

      const onOperatorMessage = async (payload?: unknown) => {
        const data =
          payload && typeof payload === 'object'
            ? (payload as Record<string, unknown>)
            : null;
        const messageRaw =
          (typeof data?.message === 'string' && data.message) ||
          (typeof data?.content === 'string' && data.content) ||
          '';
        const message = messageRaw.trim();
        if (!message) return;
        await notifyNewTidioMessage(message, 'received');
      };

      const onChatOpened = async () => {
        const sessionUser = currentUserRef.current;
        const replyKey = `tidio_autoreply_seen_${sessionUser?.uid ?? 'guest'}`;
        const alreadySent =
          typeof sessionStorage !== 'undefined' &&
          sessionStorage.getItem(replyKey) === '1';
        if (alreadySent) return;

        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.setItem(replyKey, '1');
        }

        const dynamicApi = api as unknown as Record<
          string,
          ((
            message:
              | string
              | {
                  message: string;
                  quickReplies?: Array<{ label: string; value: string }>;
                  buttons?: Array<{ text: string; value: string }>;
                },
          ) => void) | undefined
        >;
        const sender =
          dynamicApi.showMessage ??
          dynamicApi.sendMessage ??
          dynamicApi.addMessage;
        if (typeof sender === 'function') {
          const latestOrder = latestOrderRef.current;
          const latestOrderLine =
            latestOrder?.orderId
              ? `\n\nUser current order: #${latestOrder.orderId}, status: ${latestOrder.status}, items: ${latestOrder.items}`
              : '\n\nUser current order: not found yet.';
          const quickReplyPayload = {
            message: `${AUTO_REPLY_TEXT}${latestOrderLine}`,
            quickReplies: QUICK_REPLY_OPTIONS.map((label) => ({
              label,
              value: label,
            })),
            buttons: QUICK_REPLY_OPTIONS.map((label) => ({
              text: label,
              value: label,
            })),
          };
          const fallbackMenu =
            `${AUTO_REPLY_TEXT}${latestOrderLine}\n\nQuick options:\n` +
            QUICK_REPLY_OPTIONS.map((label, index) => `${index + 1}) ${label}`).join('\n');
          try {
            // Best effort: some Tidio builds support quickReplies/buttons payloads.
            sender(quickReplyPayload);
          } catch {
            try {
              sender(fallbackMenu);
            } catch {
              // Keep flow safe if this Tidio build doesn't support sending from client API.
            }
          }
        }

        try {
          await addDoc(collection(db, 'chats'), {
            message: AUTO_REPLY_TEXT,
            createdAt: serverTimestamp(),
            source: 'tidio',
            type: 'auto-reply',
            userId: sessionUser?.uid ?? null,
            email: sessionUser?.email ?? null,
            name: sessionUser?.displayName ?? null,
          });
          await notifyNewTidioMessage(AUTO_REPLY_TEXT, 'received');
          console.log('[Tidio] auto-reply triggered on chat open');
        } catch (error) {
          console.error('[Tidio] failed to save auto-reply:', error);
        }
      };

      api.on('messageFromVisitor', onVisitorMessage);
      api.on('messageFromOperator', onOperatorMessage);
      api.on('chatOpen', onChatOpened);
      api.on('chatOpened', onChatOpened);
      tidioWindow.__tidioTrackingBound = true;

      cleanupHandler = () => {
        try {
          api.off?.('messageFromVisitor', onVisitorMessage);
          api.off?.('messageFromOperator', onOperatorMessage);
          api.off?.('chatOpen', onChatOpened);
          api.off?.('chatOpened', onChatOpened);
        } catch {
          // keep cleanup safe in browsers where off() is unavailable
        }
        tidioWindow.__tidioTrackingBound = false;
      };

      return true;
    };

    if (!attachTracking()) {
      timer = setInterval(() => {
        attempts += 1;
        if (attachTracking() && timer) {
          clearInterval(timer);
          timer = null;
          return;
        }
        if (attempts >= maxAttempts && timer) {
          clearInterval(timer);
          timer = null;
          console.warn('[Tidio] chat API not available; skipping tracking.');
        }
      }, 1000);
    }

    return () => {
      if (timer) {
        clearInterval(timer);
      }
      cleanupHandler?.();
    };
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (typeof window === 'undefined') return;

    type TidioApi = {
      setVisitorData?: (data: Record<string, string>) => void;
    };
    type TidioWindow = Window & { tidioChatApi?: TidioApi };

    let timer: ReturnType<typeof setInterval> | null = null;
    let attempts = 0;
    const maxAttempts = 20;

    const setVisitorData = (): boolean => {
      const api = (window as TidioWindow).tidioChatApi;
      if (!api?.setVisitorData) return false;

      const sessionUser = currentUserRef.current;
      api.setVisitorData({
        distinct_id: sessionUser?.uid ?? 'guest',
        userId: sessionUser?.uid ?? 'guest',
        email: sessionUser?.email ?? 'noemail@example.com',
        name: sessionUser?.displayName ?? 'User',
      });

      console.log('[Tidio] visitor data set', {
        userId: sessionUser.uid,
        email: sessionUser.email ?? null,
        name: sessionUser.displayName ?? null,
      });
      return true;
    };

    if (!setVisitorData()) {
      timer = setInterval(() => {
        attempts += 1;
        if (setVisitorData() && timer) {
          clearInterval(timer);
          timer = null;
          return;
        }
        if (attempts >= maxAttempts && timer) {
          clearInterval(timer);
          timer = null;
          console.warn('[Tidio] visitor data not set; API/user unavailable.');
        }
      }, 1000);
    }

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [user?.uid, user?.email, user?.displayName]);

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
  const onPublicShellRoutes =
    seg0 === 'terms-acceptance' ||
    seg0 === 'terms' ||
    seg0 === 'privacy' ||
    seg0 === 'subscribe';
  const redirectToLogin =
    !user && !inAuthGroup && !onJoinRedirect && !onPublicShellRoutes;
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
          name="subscribe"
          options={{ headerShown: false, title: 'Subscribe' }}
        />
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
