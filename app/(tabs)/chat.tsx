import { ChatFlow } from '@/components/ChatFlow';
import { systemActionSheet } from '@/components/SystemDialogHost';
import { LEGAL_URLS } from '@/constants/legalLinks';
import { useAIChat } from '@/hooks/useAIChat';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { buildProductAssistantIntro } from '@/services/ai';
import {
  getAiChatUrl,
  sendMessageToAI,
  type AiDecision,
} from '@/services/aiBackendDecision';
import { useAuth } from '@/services/AuthContext';
import {
  buildSmartMatchIntroText,
  detectTimeContext,
  fetchActiveJoinableOrdersForContext,
  type AssistantOrderSummary,
  type TimeContext,
} from '@/services/chatAssistantOrders';
import { saveAssistantChatFeedback } from '@/services/chatService';
import {
  getSmartMatches,
  type SmartMatchOrder,
} from '@/services/matchingEngine';
import { userHasSoloWaitingHalfOrder } from '@/services/referralRewards';
import {
  SUGGESTED_ORDER_BOT_COPY,
  generateSuggestedOrder,
} from '@/services/suggestedOrder';
import { moderateChatMessage } from '@/utils/contentModeration';
import { showError, showNotice } from '@/utils/toast';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export type AssistantMessageAction = 'join_order' | 'create_order' | 'none';

export type MessageOrderRef = {
  id: string;
  title: string;
  isSuggested?: boolean;
  priceSplit?: string;
  mealCategory?: string;
};

export type Message = {
  id: string;
  text: string;
  sender: 'user' | 'bot';
  createdAt?: number;
  action?: AssistantMessageAction;
  orders?: MessageOrderRef[];
};

function toMessageOrders(rows: AssistantOrderSummary[]): MessageOrderRef[] {
  return rows.map((r) => ({
    id: r.id,
    title:
      [r.restaurantName, r.mealType].filter(Boolean).join(' · ') ||
      'Order',
  }));
}

const ASSISTANT_INTRO_MESSAGE_ID = 'assistant-intro-suggestion';
const PRODUCT_INTRO_MESSAGE_ID = 'halforder-product-assistant-intro';
const PRODUCT_INTRO_SEEN_KEY = 'halforder_product_assistant_intro_seen_v1';

const ASSISTANT_CHAT_MAX_CHARS = 500;
const ASSISTANT_SEND_COOLDOWN_MS = 2000;

const QUICK_ACTIONS = [
  { label: '🍕 Pizza', message: 'Pizza 🍕' },
  { label: '🍔 Burger', message: 'Burger 🍔' },
  { label: '🥗 Healthy', message: 'Healthy meal 🥗' },
  { label: '🍽️ Other', message: 'Other meal 🍽️' },
] as const;

const IDEA_CHIPS = [
  { label: 'Late night snack 🌙', message: 'Late night snack 🌙' },
  { label: 'Lunch deal 🍱', message: 'Lunch deal 🍱' },
] as const;

/** Shown when backend decision intent is `order_food` (EXPO_PUBLIC_AI_CHAT_URL) */
const AI_PIZZA_TYPE_CHIPS = [
  'Pepperoni 🍕',
  'Margherita 🍕',
  'Veggie 🥗',
] as const;

function buildIntroSuggestionMessage(
  ctx: TimeContext,
  rows: AssistantOrderSummary[],
): Message {
  const orderRefs = toMessageOrders(rows);
  if (rows.length > 0) {
    return {
      id: ASSISTANT_INTRO_MESSAGE_ID,
      text: buildSmartMatchIntroText(ctx, rows),
      sender: 'bot',
      createdAt: Date.now(),
      action: 'join_order',
      orders: orderRefs,
    };
  }
  const suggested = generateSuggestedOrder(ctx);
  return {
    id: ASSISTANT_INTRO_MESSAGE_ID,
    text: SUGGESTED_ORDER_BOT_COPY,
    sender: 'bot',
    createdAt: Date.now(),
    action: 'join_order',
    orders: [suggested],
  };
}

export default function ChatScreen() {
  const router = useRouter();
  const { user: authUser } = useAuth();
  const { profile } = useCurrentUser();
  const { markIntroSuggestedTemplate, runUserTurn } = useAIChat();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [introLoading, setIntroLoading] = useState(true);
  const [introFetchFailed, setIntroFetchFailed] = useState(false);
  const [error, setError] = useState('');
  const [smartLoading, setSmartLoading] = useState(false);
  const [smartMatches, setSmartMatches] = useState<{
    aiText: string;
    nearbyOrders: SmartMatchOrder[];
  } | null>(null);
  /** AI-driven guided UI (backend decisions), not only chat text */
  const [step, setStep] = useState<'chat' | 'pizzaType'>('chat');
  const [showSplit, setShowSplit] = useState(false);
  const flatListRef = useRef<FlatList<Message> | null>(null);
  const inputRef = useRef<TextInput | null>(null);
  const assistantInFlightRef = useRef(false);
  const lastAssistantSendAtRef = useRef(0);

  useFocusEffect(
    useCallback(() => {
      const t = setTimeout(() => {
        inputRef.current?.focus();
      }, 200);
      return () => clearTimeout(t);
    }, []),
  );

  useEffect(() => {
    let cancelled = false;
    const loc = profile?.location;
    if (!loc || !authUser?.uid) {
      setSmartMatches(null);
      return;
    }
    const ctx = detectTimeContext();
    const food = ctx.fallbackFood;
    setSmartLoading(true);
    void getSmartMatches({
      lat: loc.lat,
      lng: loc.lng,
      food,
      uid: authUser.uid,
    })
      .then((res) => {
        if (!cancelled) setSmartMatches(res);
      })
      .finally(() => {
        if (!cancelled) setSmartLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authUser?.uid, profile?.location]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let productIntro: Message | null = null;
      if (authUser?.uid) {
        try {
          const seen = await AsyncStorage.getItem(PRODUCT_INTRO_SEEN_KEY);
          if (!seen && !cancelled) {
            const dn =
              profile?.name ||
              authUser.displayName ||
              'there';
            productIntro = {
              id: PRODUCT_INTRO_MESSAGE_ID,
              text: buildProductAssistantIntro(dn),
              sender: 'bot',
              createdAt: Date.now(),
              action: 'none',
            };
            await AsyncStorage.setItem(PRODUCT_INTRO_SEEN_KEY, '1');
          }
        } catch (e) {
          console.warn('[chat] product intro storage', e);
        }
      }
      try {
        const ctx = detectTimeContext();
        const fetched = await fetchActiveJoinableOrdersForContext(
          ctx,
          3,
          48,
          authUser?.uid,
        );
        if (cancelled) return;
        setIntroFetchFailed(false);
        const intro = buildIntroSuggestionMessage(ctx, fetched);
        if (intro.orders?.[0]?.isSuggested === true) {
          markIntroSuggestedTemplate();
        }
        setMessages((prev) => {
          if (prev.some((m) => m.id === ASSISTANT_INTRO_MESSAGE_ID)) {
            return prev;
          }
          const base = prev.filter((m) => m.id !== PRODUCT_INTRO_MESSAGE_ID);
          const prefix = productIntro ? [productIntro] : [];
          return [...base, ...prefix, intro];
        });
      } catch {
        if (cancelled) return;
        setIntroFetchFailed(true);
        const fallbackIntro = buildIntroSuggestionMessage(detectTimeContext(), []);
        if (fallbackIntro.orders?.[0]?.isSuggested === true) {
          markIntroSuggestedTemplate();
        }
        setMessages((prev) => {
          if (prev.some((m) => m.id === ASSISTANT_INTRO_MESSAGE_ID)) {
            return prev;
          }
          const base = prev.filter((m) => m.id !== PRODUCT_INTRO_MESSAGE_ID);
          const prefix = productIntro ? [productIntro] : [];
          return [...base, ...prefix, fallbackIntro];
        });
      } finally {
        if (!cancelled) {
          setIntroLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    markIntroSuggestedTemplate,
    authUser?.uid,
    authUser?.displayName,
    profile?.name,
  ]);

  useEffect(() => {
    flatListRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  const formatTime = (ts?: number) => {
    if (!ts) return '';
    return new Date(ts).toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const handleJoinOrderAction = (item: Message) => {
    const orders = item.orders;
    if (!orders?.length) {
      router.push({ pathname: '/(tabs)/join' } as never);
      return;
    }
    const first = orders[0];
    if (first.isSuggested === true) {
      router.push({
        pathname: '/(tabs)/create',
        params: {
          prefillTitle: first.title,
          prefillPriceSplit: first.priceSplit ?? '$8',
          fromSuggested: '1',
          ...(first.mealCategory
            ? { prefillMealCategory: first.mealCategory }
            : {}),
        },
      } as never);
      return;
    }
    if (orders.length > 1) {
      router.push({ pathname: '/(tabs)/join' } as never);
      return;
    }
    router.push(`/order/${first.id}` as never);
  };

  const handleCreateOrderAction = () => {
    router.push({ pathname: '/(tabs)/create' } as never);
  };

  const addMessage = useCallback((text: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: `${Date.now()}-ai-${Math.random().toString(36).slice(2)}`,
        text,
        sender: 'bot',
        createdAt: Date.now(),
        action: 'none',
      },
    ]);
  }, []);

  const handleAIDecision = useCallback(
    (decision: AiDecision) => {
      if (decision.reason === 'price_high') {
        addMessage('This is a bit expensive 👀 want to split it?');
        setShowSplit(true);
      }

      if (decision.intent === 'order_food') {
        setStep('pizzaType');
      }

      if (decision.intent === 'ask_location') {
        addMessage('Where are you located? 📍');
      }

      if (decision.suggest_split) {
        setShowSplit(true);
      }

      if (decision.intent === 'fallback' && decision.message) {
        addMessage(decision.message);
      }
    },
    [addMessage],
  );

  const openSafetyAndReportingMenu = useCallback(() => {
    void systemActionSheet({
      title: 'Safety & reporting',
      message:
        'Block someone from an order chat or the Join tab. Manage blocked users on your Profile.',
      actions: [
        {
          label: 'Report a user — open Profile',
          onPress: () => router.push('/(tabs)/profile' as never),
        },
        {
          label: 'Community guidelines',
          onPress: () => router.push('/safety' as never),
        },
        {
          label: 'Terms of Service',
          onPress: () => void Linking.openURL(LEGAL_URLS.terms),
        },
        {
          label: 'Privacy Policy',
          onPress: () => void Linking.openURL(LEGAL_URLS.privacy),
        },
        {
          label: 'Submit a complaint',
          onPress: () => router.push('/complaint' as never),
        },
      ],
    });
  }, [router]);

  const submitAssistantText = useCallback(
    async (outgoingRaw: string, options?: { clearInput?: boolean }) => {
      if (!outgoingRaw.trim() || assistantInFlightRef.current) return;

      const mod = moderateChatMessage(outgoingRaw, {
        maxLength: ASSISTANT_CHAT_MAX_CHARS,
      });
      if (!mod.ok) {
        showError(mod.reason);
        return;
      }
      const outgoingText = mod.text;

      const now = Date.now();
      if (now - lastAssistantSendAtRef.current < ASSISTANT_SEND_COOLDOWN_MS) {
        showError('Please wait a moment before sending another message.');
        return;
      }
      lastAssistantSendAtRef.current = now;

      setError('');
      if (options?.clearInput !== false) {
        setInput('');
      }

      const userMessage: Message = {
        id: `${Date.now()}-u`,
        text: outgoingText,
        sender: 'user',
        createdAt: Date.now(),
        action: 'none',
      };
      setMessages((prev) => [...prev, userMessage]);

      setStep('chat');
      setShowSplit(false);

      const uid = authUser?.uid;
      if (!uid) {
        setMessages((prev) => [
          ...prev,
          {
            id: `${Date.now()}-b`,
            text: 'Sign in to create orders from chat.',
            sender: 'bot',
            createdAt: Date.now(),
            action: 'none',
          },
        ]);
        return;
      }

      void saveAssistantChatFeedback({
        userId: uid,
        userName:
          profile?.name ||
          authUser.displayName ||
          'User',
        message: outgoingText,
        email: profile?.email ?? authUser.email ?? null,
      });

      assistantInFlightRef.current = true;
      setLoading(true);
      try {
        const aiChatUrl = getAiChatUrl();
        if (aiChatUrl) {
          const aiResult = await sendMessageToAI(outgoingText, aiChatUrl);
          if (!aiResult.ok) {
            setMessages((prev) => [
              ...prev,
              {
                id: `${Date.now()}-ai-err`,
                text: `Assistant unavailable: ${aiResult.error}`,
                sender: 'bot',
                createdAt: Date.now(),
                action: 'none',
              },
            ]);
            setError('AI backend request failed.');
            return;
          }
          handleAIDecision(aiResult.decision);
          return;
        }

        const ctx = detectTimeContext();
        const fetched = await fetchActiveJoinableOrdersForContext(
          ctx,
          3,
          48,
          authUser?.uid,
        );
        const awaitingPartnerAlone = await userHasSoloWaitingHalfOrder(uid);
        const dn =
          profile?.name || authUser.displayName || 'Friend';
        const loc = profile?.location;
        const result = await runUserTurn({
          text: outgoingText,
          uid,
          nearbyJoinableCount: fetched.length,
          timeContext: ctx,
          awaitingPartnerAlone,
          assistantContext: {
            displayName: dn,
            email: profile?.email ?? authUser.email ?? null,
          },
          userLocation:
            loc && typeof loc.lat === 'number' && typeof loc.lng === 'number'
              ? {
                  lat: loc.lat,
                  lng: loc.lng,
                  label: profile?.name ?? null,
                }
              : null,
        });

        const baseId = Date.now();
        const botMessages: Message[] = result.messages.map((m, i) => ({
          id: `${baseId}-b-${i}`,
          text: m.text,
          sender: 'bot',
          createdAt: Date.now(),
          action: m.action,
          orders: m.orders as Message['orders'],
        }));

        if (botMessages.length > 0) {
          setMessages((prev) => [...prev, ...botMessages]);
        }

        if (result.navigateToOrderId) {
          router.push(`/order/${result.navigateToOrderId}` as never);
        }
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            id: `${Date.now()}-err`,
            text: 'Could not complete that. Check your connection and try again.',
            sender: 'bot',
            createdAt: Date.now(),
            action: 'none',
          },
        ]);
        setError('Assistant request failed.');
      } finally {
        assistantInFlightRef.current = false;
        setLoading(false);
      }
    },
    [
      authUser?.uid,
      authUser?.displayName,
      authUser?.email,
      profile?.name,
      profile?.email,
      profile?.location,
      router,
      runUserTurn,
      handleAIDecision,
    ],
  );

  const sendMessageFromInput = () => {
    if (!input.trim() || loading) return;
    void submitAssistantText(input, { clearInput: true });
  };

  const sendQuick = (message: string) => {
    if (loading) return;
    setInput('');
    void submitAssistantText(message, { clearInput: true });
  };

  const handleMicPress = () => {
    showNotice(
      'Voice input',
      'Please type your message for now. Voice input is not available in this version.',
    );
  };

  const openSplitWhatsApp = useCallback(() => {
    const text = 'Join my order on HalfOrder';
    void Linking.openURL(
      `https://wa.me/?text=${encodeURIComponent(text)}`,
    );
  }, []);

  const renderItem = ({ item }: { item: Message }) => {
    const isUser = item.sender === 'user';
    const joinable =
      !isUser && item.action === 'join_order';
    const creatable =
      !isUser && item.action === 'create_order';
    const primaryOrder = item.orders?.[0];
    const isSuggestedCard = primaryOrder?.isSuggested === true;

    const body = (
      <>
        {joinable ? (
          <TouchableOpacity
            activeOpacity={0.75}
            onPress={() => handleJoinOrderAction(item)}
            style={styles.actionTextTap}
          >
            <Text style={styles.text}>{item.text}</Text>
            {isSuggestedCard && primaryOrder ? (
              <View style={styles.suggestedOrderCard}>
                <Text style={styles.suggestedBadge}>Suggested order</Text>
                <Text style={styles.suggestedOrderTitle}>{primaryOrder.title}</Text>
                <Text style={styles.suggestedOrderMeta}>
                  Example share: {primaryOrder.priceSplit ?? ''}
                </Text>
                <Text style={styles.suggestedNote}>
                  Others can join once you create it
                </Text>
              </View>
            ) : null}
            <Text style={styles.actionHint}>
              {isSuggestedCard ? 'Start from this template →' : 'Join order →'}
            </Text>
          </TouchableOpacity>
        ) : creatable ? (
          <TouchableOpacity
            activeOpacity={0.75}
            onPress={handleCreateOrderAction}
            style={styles.actionTextTap}
          >
            <Text style={styles.text}>{item.text}</Text>
            <Text style={styles.actionHint}>Create order →</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.text}>{item.text}</Text>
        )}
        {item.createdAt ? (
          <Text style={styles.time}>{formatTime(item.createdAt)}</Text>
        ) : null}
      </>
    );

    return (
      <View
        style={[styles.message, isUser ? styles.user : styles.bot]}
      >
        {body}
      </View>
    );
  };

  const showIdeaChips = !input.trim() && !loading;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.screenHeader}>
          <View style={styles.screenHeaderTop}>
            <View style={styles.screenHeaderTextCol}>
              <Text style={styles.screenTitle}>AI Assistant</Text>
              <Text style={styles.screenSubtitle}>
                Tell me what you want to eat 🍕
              </Text>
            </View>
            <TouchableOpacity
              onPress={openSafetyAndReportingMenu}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Safety, report, and legal"
            >
              <MaterialIcons name="more-vert" size={26} color="#94A3B8" />
            </TouchableOpacity>
          </View>
          <Text style={styles.ugcNotice}>
            Users can report inappropriate behavior.
          </Text>
        </View>
        <FlatList
          ref={flatListRef}
          style={styles.messageList}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.messagesContent}
          ListHeaderComponent={
            <View style={styles.growthHeader}>
              {authUser?.uid ? (
                <ChatFlow
                  userLocation={
                    profile?.location &&
                    typeof profile.location.lat === 'number' &&
                    typeof profile.location.lng === 'number'
                      ? {
                          lat: profile.location.lat,
                          lng: profile.location.lng,
                          label: profile.name,
                        }
                      : null
                  }
                  onOrderNow={(ctx) => {
                    const title = ctx.restaurant
                      ? `${ctx.pizzaType} · ${ctx.restaurant.name}`
                      : 'Pizza order';
                    router.push({
                      pathname: '/(tabs)/create',
                      params: {
                        prefillTitle: title,
                        prefillPriceSplit: '$14',
                        prefillMealCategory: ctx.locationLabel,
                      },
                    } as never);
                  }}
                />
              ) : null}
              {!profile?.location ? (
                <Text style={styles.growthHint}>
                  Enable location on your profile for AI + nearby order matches (2km).
                </Text>
              ) : null}
              {smartLoading ? (
                <View style={styles.growthCard}>
                  <ActivityIndicator size="small" color="#6EE7B7" />
                  <Text style={styles.growthSubtitle}>Finding smart matches…</Text>
                </View>
              ) : null}
              {!smartLoading &&
              smartMatches &&
              (smartMatches.nearbyOrders.length > 0 || smartMatches.aiText) ? (
                <View style={styles.growthCard}>
                  <Text style={styles.growthTitle}>Smart matches</Text>
                  {smartMatches.aiText ? (
                    <Text style={styles.growthAi}>{smartMatches.aiText}</Text>
                  ) : null}
                  {smartMatches.nearbyOrders.length > 0 ? (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.chipRow}
                    >
                      {smartMatches.nearbyOrders.map((o) => (
                        <TouchableOpacity
                          key={o.id}
                          style={styles.matchChip}
                          activeOpacity={0.85}
                          onPress={() => router.push(`/order/${o.id}` as never)}
                        >
                          <Text style={styles.chipTitle} numberOfLines={1}>
                            {o.restaurantName}
                          </Text>
                          <Text style={styles.chipMeta} numberOfLines={2}>
                            {o.distanceMeters != null
                              ? `${Math.round(o.distanceMeters)}m`
                              : 'Nearby'}{' '}
                            · {o.foodName}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  ) : (
                    <Text style={styles.growthEmpty}>No orders in 2km right now.</Text>
                  )}
                </View>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            introLoading ? (
              <View style={styles.introPlaceholder}>
                <ActivityIndicator size="small" color="#6B7280" />
              </View>
            ) : null
          }
          onContentSizeChange={() =>
            flatListRef.current?.scrollToEnd({ animated: true })
          }
          onLayout={() =>
            flatListRef.current?.scrollToEnd({ animated: false })
          }
        />

        {showIdeaChips ? (
          <View style={styles.composerSection}>
            <Text style={styles.composerSectionLabel}>Ideas</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipScroller}
            >
              {IDEA_CHIPS.map((chip) => (
                <TouchableOpacity
                  key={chip.label}
                  style={styles.ideaChip}
                  activeOpacity={0.85}
                  onPress={() => sendQuick(chip.message)}
                  disabled={loading}
                >
                  <Text style={styles.ideaChipText}>{chip.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        ) : null}

        <View style={styles.composerSection}>
          <Text style={styles.composerSectionLabel}>Quick actions</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipScroller}
          >
            {QUICK_ACTIONS.map((q) => (
              <TouchableOpacity
                key={q.label}
                style={styles.quickChip}
                activeOpacity={0.85}
                onPress={() => sendQuick(q.message)}
                disabled={loading}
              >
                <Text style={styles.quickChipText}>{q.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {loading ? (
          <View style={styles.typingRow}>
            <ActivityIndicator size="small" color="#6EE7B7" />
            <Text style={styles.typingText}>Assistant is thinking…</Text>
          </View>
        ) : null}
        {introFetchFailed ? (
          <Text style={styles.bannerText}>
            Live order list unavailable — showing suggestions only.
          </Text>
        ) : null}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {step === 'pizzaType' && authUser?.uid ? (
          <View style={styles.guidedPanel}>
            <Text style={styles.guidedPanelTitle}>Pick a style</Text>
            <View style={styles.guidedChipRow}>
              {AI_PIZZA_TYPE_CHIPS.map((label) => (
                <TouchableOpacity
                  key={label}
                  style={styles.guidedChip}
                  activeOpacity={0.85}
                  disabled={loading}
                  onPress={() => void submitAssistantText(label, { clearInput: true })}
                >
                  <Text style={styles.guidedChipText}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : null}

        {showSplit && authUser?.uid ? (
          <View style={styles.splitPanel}>
            <Text style={styles.splitPanelText}>
              Split this order with a friend ⚡
            </Text>
            <TouchableOpacity
              style={styles.splitWaBtn}
              onPress={openSplitWhatsApp}
              activeOpacity={0.9}
            >
              <FontAwesome name="whatsapp" size={20} color="#fff" />
              <Text style={styles.splitWaBtnText}>Share via WhatsApp</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={styles.inputContainer}>
          <TouchableOpacity onPress={handleMicPress} style={styles.micButton}>
            <Text style={styles.micText}>🎤</Text>
          </TouchableOpacity>
          <TextInput
            ref={inputRef}
            value={input}
            onChangeText={setInput}
            placeholder="Ask anything…"
            placeholderTextColor="#8A8A8A"
            style={styles.input}
            editable={!loading}
            onSubmitEditing={sendMessageFromInput}
            returnKeyType="send"
          />
          <TouchableOpacity
            onPress={sendMessageFromInput}
            style={[
              styles.button,
              (loading || !input.trim()) && styles.buttonDisabled,
            ]}
            disabled={loading || !input.trim()}
          >
            <Text style={{ color: '#fff' }}>Send</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0d0f14' },
  container: { flex: 1, backgroundColor: '#0d0f14' },
  screenHeader: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(110, 231, 183, 0.12)',
  },
  screenHeaderTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  screenHeaderTextCol: {
    flex: 1,
    minWidth: 0,
  },
  ugcNotice: {
    marginTop: 10,
    fontSize: 12,
    lineHeight: 17,
    color: 'rgba(248, 250, 252, 0.55)',
    fontWeight: '500',
  },
  screenTitle: {
    color: '#F8FAFC',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  screenSubtitle: {
    marginTop: 4,
    color: 'rgba(110, 231, 183, 0.9)',
    fontSize: 14,
    fontWeight: '600',
  },
  composerSection: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
  },
  composerSectionLabel: {
    color: 'rgba(248, 250, 252, 0.45)',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  chipScroller: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 4,
  },
  ideaChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(52, 211, 153, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.35)',
  },
  ideaChipText: {
    color: '#A7F3D0',
    fontSize: 13,
    fontWeight: '700',
  },
  quickChip: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  quickChipText: {
    color: '#E2E8F0',
    fontSize: 13,
    fontWeight: '600',
  },
  messageList: { flex: 1 },
  messagesContent: { padding: 12, paddingBottom: 20 },

  message: {
    padding: 12,
    borderRadius: 10,
    marginVertical: 5,
    maxWidth: '80%',
  },

  user: {
    backgroundColor: '#007AFF',
    alignSelf: 'flex-end',
  },

  bot: {
    backgroundColor: '#333',
    alignSelf: 'flex-start',
  },

  text: { color: '#fff' },
  actionTextTap: { alignSelf: 'stretch' },
  actionHint: {
    color: '#6EE7B7',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 6,
  },
  suggestedOrderCard: {
    marginTop: 10,
    padding: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  suggestedBadge: {
    color: '#A7F3D0',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  suggestedOrderTitle: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '700',
  },
  suggestedOrderMeta: {
    color: 'rgba(248,250,252,0.75)',
    fontSize: 13,
    marginTop: 4,
  },
  suggestedNote: {
    color: 'rgba(248,250,252,0.55)',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 8,
    fontStyle: 'italic',
  },
  time: { color: '#B6B6B6', marginTop: 4, fontSize: 11 },
  typingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  typingText: { color: '#B6B6B6', fontSize: 13 },
  bannerText: {
    color: 'rgba(250, 204, 21, 0.95)',
    paddingHorizontal: 14,
    marginBottom: 8,
    fontSize: 13,
    fontWeight: '600',
  },
  errorText: {
    color: '#FCA5A5',
    paddingHorizontal: 14,
    marginBottom: 8,
    fontSize: 13,
  },

  inputContainer: {
    flexDirection: 'row',
    padding: 10,
    borderTopWidth: 1,
    borderColor: '#222',
  },
  micButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#2A2A2A',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  micText: { fontSize: 16 },

  input: {
    flex: 1,
    backgroundColor: '#222',
    color: '#fff',
    padding: 10,
    borderRadius: 8,
    marginRight: 10,
  },

  button: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 15,
    justifyContent: 'center',
    borderRadius: 8,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  introPlaceholder: {
    paddingVertical: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  growthHeader: { marginBottom: 8 },
  growthHint: {
    color: 'rgba(250, 204, 21, 0.9)',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  growthCard: {
    backgroundColor: '#1a1d24',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(110, 231, 183, 0.25)',
  },
  growthTitle: {
    color: '#6EE7B7',
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  growthSubtitle: {
    color: '#9CA3AF',
    fontSize: 12,
    marginTop: 8,
  },
  growthAi: {
    color: '#F8FAFC',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 10,
  },
  growthEmpty: { color: '#9CA3AF', fontSize: 13 },
  chipRow: { gap: 10, paddingVertical: 4 },
  matchChip: {
    width: 200,
    padding: 10,
    borderRadius: 10,
    backgroundColor: '#252a33',
    marginRight: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  chipTitle: { color: '#F8FAFC', fontWeight: '700', fontSize: 14 },
  chipMeta: { color: '#9CA3AF', fontSize: 12, marginTop: 4 },
  guidedPanel: {
    marginHorizontal: 12,
    marginBottom: 10,
    padding: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    borderWidth: 1,
    borderColor: 'rgba(110, 231, 183, 0.28)',
  },
  guidedPanelTitle: {
    color: '#6EE7B7',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 10,
    letterSpacing: 0.3,
  },
  guidedChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  guidedChip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  guidedChipText: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '700',
  },
  splitPanel: {
    marginHorizontal: 12,
    marginBottom: 10,
    padding: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(30, 27, 75, 0.55)',
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.35)',
    gap: 12,
  },
  splitPanelText: {
    color: '#E9D5FF',
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 21,
  },
  splitWaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#25D366',
  },
  splitWaBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
});
