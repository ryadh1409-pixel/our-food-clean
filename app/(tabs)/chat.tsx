import { ChatFlow } from '@/components/ChatFlow';
import { systemActionSheet } from '@/components/SystemDialogHost';
import { LEGAL_URLS } from '@/constants/legalLinks';
import { useAIChat } from '@/hooks/useAIChat';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { openWhatsAppWithText } from '@/lib/orderWhatsAppInvite';
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
import {
  buildFoodAssistUserMessage,
  detectFoodKeyword,
  extractLocationFromMessage,
  foodNeedLocationPrompt,
  runFoodPlaceAssist,
} from '@/services/chatFoodAssist';
import { detectLocalAssistantIntent } from '@/services/chatLocalIntent';
import { createAiPlaceFoodCardAndOrder } from '@/services/aiChatFoodOrder';
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

export type MessageAiPlacePick = { placeName: string; address: string };

export type Message = {
  id: string;
  text: string;
  sender: 'user' | 'bot';
  createdAt?: number;
  action?: AssistantMessageAction;
  orders?: MessageOrderRef[];
  /** From `/chat` backend: Google Places (New) results */
  places?: unknown[];
  /** Structured picks for “Start Order” (Swipe + Firestore). */
  aiPlacePicks?: MessageAiPlacePick[];
};

function extractReplyFromChatData(data: unknown): string {
  if (!data || typeof data !== 'object') return 'No response';
  const r = (data as { reply?: unknown }).reply;
  return typeof r === 'string' && r.trim() ? r.trim() : 'No response';
}

function extractPlacesFromChatData(data: unknown): unknown[] {
  if (!data || typeof data !== 'object') return [];
  const p = (data as { places?: unknown }).places;
  return Array.isArray(p) ? p : [];
}

function formatPlaceLine(place: unknown): string {
  if (!place || typeof place !== 'object') return 'Place';
  const o = place as Record<string, unknown>;
  if (typeof o.name === 'string' && typeof o.rating === 'number') {
    const plRaw = o.priceLevel ?? o.price_level;
    const pl =
      typeof plRaw === 'number' && Number.isFinite(plRaw) ? plRaw : null;
    const price =
      pl == null ? 'Price n/a' : pl === 0 ? 'Free' : '$'.repeat(Math.min(pl, 4));
    const addr =
      typeof o.address === 'string' && o.address.trim()
        ? o.address.trim()
        : '';
    return `${o.name.trim()} · ★${o.rating.toFixed(1)} · ${price}${addr ? `\n   ${addr}` : ''}`;
  }
  if (typeof o.name === 'string' && o.name.trim()) return o.name.trim();
  if (o.displayName && typeof o.displayName === 'object') {
    const t = (o.displayName as { text?: unknown }).text;
    if (typeof t === 'string' && t.trim()) return t.trim();
  }
  if (typeof o.formattedAddress === 'string' && o.formattedAddress.trim()) {
    return o.formattedAddress.trim();
  }
  if (typeof o.address === 'string' && o.address.trim()) {
    return o.address.trim();
  }
  return 'Place';
}

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

/** Places API (New) — `places:searchText` response (partial). */
type PlacesSearchTextPlace = {
  displayName?: { text?: string };
  rating?: number;
  formattedAddress?: string;
};

type PlacesSearchTextResponse = {
  places?: PlacesSearchTextPlace[];
  error?: { code?: number; message?: string; status?: string };
};

function placeDisplayName(p: PlacesSearchTextPlace): string {
  const t = p.displayName?.text;
  return typeof t === 'string' && t.trim() ? t.trim() : 'Unknown';
}

/**
 * Google Places API (New) — Text Search (`places:searchText`).
 * https://developers.google.com/maps/documentation/places/web-service/text-search
 */
type PlacesTextSearchResult =
  | { ok: true; text: string; picks: MessageAiPlacePick[] }
  | { ok: false; message: string };

async function placesTextSearchChatMessage(input: {
  keyword: string;
  location: string;
  bias?: { lat: number; lng: number } | null;
}): Promise<PlacesTextSearchResult> {
  const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
  const keyTrim =
    typeof API_KEY === 'string' ? API_KEY.trim() : '';
  if (!keyTrim) {
    console.error('Missing Google Maps API key');
    return {
      ok: false,
      message:
        'Could not search places (missing EXPO_PUBLIC_GOOGLE_MAPS_API_KEY).',
    };
  }

  const textQuery =
    input.location === 'near me'
      ? input.keyword.trim()
      : `${input.keyword.trim()} in ${input.location.trim()}`;

  console.log('[Places API New] textQuery sent', textQuery);

  const url = 'https://places.googleapis.com/v1/places:searchText';

  const body: {
    textQuery: string;
    locationBias?: {
      circle: {
        center: { latitude: number; longitude: number };
        radius: number;
      };
    };
  } = { textQuery };

  if (
    input.bias &&
    Number.isFinite(input.bias.lat) &&
    Number.isFinite(input.bias.lng)
  ) {
    body.locationBias = {
      circle: {
        center: { latitude: input.bias.lat, longitude: input.bias.lng },
        radius: 3000,
      },
    };
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': keyTrim,
        'X-Goog-FieldMask':
          'places.displayName,places.formattedAddress,places.rating',
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    if (__DEV__) console.warn('[Places API New] network error', e);
    return {
      ok: false,
      message: 'Could not reach Google Places. Check your connection.',
    };
  }

  let data: PlacesSearchTextResponse;
  try {
    data = (await res.json()) as PlacesSearchTextResponse;
  } catch {
    return { ok: false, message: 'Invalid response from Google Places.' };
  }

  console.log('[Places API New] full API response', data);

  if (!res.ok) {
    const msg = data.error?.message ?? res.statusText;
    return {
      ok: false,
      message: `Places search failed (${res.status}): ${msg}`,
    };
  }

  const places = Array.isArray(data.places) ? data.places : [];
  if (places.length === 0) {
    return {
      ok: false,
      message: `No results found for ${input.keyword.trim()}. Try another area or cuisine.`,
    };
  }

  const top = places.slice(0, 3);
  const nearLabel =
    input.location === 'near me' ? 'you' : input.location.trim();
  const head = `Top cheap ${input.keyword.trim()} near ${nearLabel}:\n`;
  const lines = top.map((p, i) => {
    const name = placeDisplayName(p);
    const stars =
      typeof p.rating === 'number' && Number.isFinite(p.rating)
        ? p.rating.toFixed(1)
        : 'N/A';
    const addr = (p.formattedAddress ?? '').trim() || 'Address unavailable';
    return `${i + 1}. ${name} ⭐${stars} - ${addr}`;
  });
  const picks: MessageAiPlacePick[] = top.map((p) => ({
    placeName: placeDisplayName(p),
    address: (p.formattedAddress ?? '').trim() || 'Address unavailable',
  }));
  return { ok: true, text: head + lines.join('\n'), picks };
}

function detectNorthYorkChatFood(
  text: string,
): 'pizza' | 'burger' | 'healthy' | 'other' | null {
  const t = text.toLowerCase();
  if (/\bpizza\b/.test(t)) return 'pizza';
  if (/\bburger(s)?\b/.test(t)) return 'burger';
  if (/\bhealthy\b|\bsalad\b|🥗/.test(text)) return 'healthy';
  if (/\bother meal\b|\bother\b.*\bmeal\b|🍽️/.test(text)) return 'other';
  return null;
}

function hasNorthYork(text: string): boolean {
  return /\bnorth\s+york\b/i.test(text);
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
  const [showPartnerInvite, setShowPartnerInvite] = useState(false);
  const flatListRef = useRef<FlatList<Message> | null>(null);
  const inputRef = useRef<TextInput | null>(null);
  const assistantInFlightRef = useRef(false);
  const lastAssistantSendAtRef = useRef(0);
  const foodLocationPendingRef = useRef<{ foodKeyword: string } | null>(null);
  const [startingPlaceKey, setStartingPlaceKey] = useState<string | null>(null);

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
    (
      decision: AiDecision,
      options?: { fromBackendChat?: boolean },
    ) => {
      if (decision.reason === 'price_high') {
        addMessage('This is a bit expensive 👀 want to split it?');
        setShowSplit(true);
      }

      if (decision.intent === 'recommend_order') {
        if (!options?.fromBackendChat) {
          const r = decision.restaurant?.trim();
          const f = decision.food?.trim();
          const p =
            typeof decision.estimated_price === 'number'
              ? decision.estimated_price
              : null;
          const summary =
            r && f
              ? `I’d go with ${f} at ${r}${p != null ? ` (~$${p.toFixed(2)})` : ''}.`
              : decision.reason?.trim() ||
                'Here’s a single pick — check Guided order above.';
          addMessage(summary);
        }
        if (decision.suggest_split) {
          addMessage('This is a bit pricey 👀 want to split it?');
          setShowSplit(true);
        }
        return;
      }

      if (decision.intent === 'order_food') {
        setStep('pizzaType');
      }

      if (decision.intent === 'ask_location') {
        addMessage(
          'Which neighbourhood or city should I use? You can type it (“pizza in Liberty Village”) or set your map pin in Profile.',
        );
      }

      if (decision.suggest_split && decision.intent !== 'recommend_order') {
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
      setShowPartnerInvite(false);

      const uid = authUser?.uid;
      if (!uid) {
        setMessages((prev) => [
          ...prev,
          {
            id: `${Date.now()}-b`,
            text: 'Sign in to use the assistant and create or join orders.',
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
      let awaitingPartnerAlone = false;
      try {
        awaitingPartnerAlone = await userHasSoloWaitingHalfOrder(uid);
        const aiChatUrl = getAiChatUrl();
        if (aiChatUrl) {
          const aiResult = await sendMessageToAI(outgoingText, aiChatUrl);
          if (!aiResult.ok) {
            setMessages((prev) => [
              ...prev,
              {
                id: `${Date.now()}-ai-err`,
                text: `Assistant is temporarily unavailable (${aiResult.error}). Try again in a moment.`,
                sender: 'bot',
                createdAt: Date.now(),
                action: 'none',
              },
            ]);
            setError('AI backend request failed.');
            return;
          }

          const result = aiResult.data;
          console.log('AI result:', result);

          const replyText = extractReplyFromChatData(result);
          const placesList = extractPlacesFromChatData(result);

          const baseId = Date.now();
          const botMessages: Message[] = [
            {
              id: `${baseId}-bot`,
              text: replyText || 'No response',
              sender: 'bot',
              createdAt: Date.now(),
              action: 'none',
              places: placesList.length > 0 ? placesList : undefined,
            },
          ];
          setMessages((prev) => [...prev, ...botMessages]);

          handleAIDecision(aiResult.decision, { fromBackendChat: true });
          return;
        }

        const intent = detectLocalAssistantIntent(outgoingText);
        if (
          /^(thanks|thank you|thx)\b/i.test(outgoingText.trim()) &&
          foodLocationPendingRef.current
        ) {
          foodLocationPendingRef.current = null;
        }

        if (intent.primary !== 'join') {
          const simpleFood = detectNorthYorkChatFood(outgoingText);
          const ny = hasNorthYork(outgoingText);
          const explicitLoc = extractLocationFromMessage(outgoingText);
          const anyAssistFood = detectFoodKeyword(outgoingText);
          const profileHasCoords =
            profile?.location &&
            typeof profile.location.lat === 'number' &&
            typeof profile.location.lng === 'number';

          const foodKeyword =
            anyAssistFood ||
            (simpleFood
              ? simpleFood === 'other'
                ? 'restaurant'
                : simpleFood
              : null);
          const locationLabel =
            explicitLoc ??
            (simpleFood && ny ? 'North York' : null) ??
            (profile?.location ? 'near me' : 'North York');

          if (ny && !foodKeyword) {
            setMessages((prev) => [
              ...prev,
              {
                id: `${Date.now()}-ask-food-ny`,
                text: 'What should I look up? Say pizza, burger, healthy meal, or other meal — together with “North York”.',
                sender: 'bot',
                createdAt: Date.now(),
                action: 'none',
              },
            ]);
            return;
          }

          if (foodKeyword && locationLabel) {
            const bias =
              profileHasCoords && profile?.location
                ? {
                    lat: profile.location.lat as number,
                    lng: profile.location.lng as number,
                  }
                : null;
            const results = await placesTextSearchChatMessage({
              keyword: foodKeyword,
              location: locationLabel,
              bias,
            });
            foodLocationPendingRef.current = null;
            if (!results.ok) {
              setMessages((prev) => [
                ...prev,
                {
                  id: `${Date.now()}-places-ts`,
                  text: results.message,
                  sender: 'bot',
                  createdAt: Date.now(),
                  action: 'none',
                },
              ]);
            } else {
              setMessages((prev) => [
                ...prev,
                {
                  id: `${Date.now()}-places-ts`,
                  text: results.text,
                  sender: 'bot',
                  createdAt: Date.now(),
                  action: 'none',
                  aiPlacePicks: results.picks,
                },
              ]);
            }
            return;
          }

          const kwNow = detectFoodKeyword(outgoingText);
          if (
            kwNow &&
            foodLocationPendingRef.current &&
            foodLocationPendingRef.current.foodKeyword !== kwNow
          ) {
            foodLocationPendingRef.current = null;
          }
          const foodMsg = buildFoodAssistUserMessage(
            outgoingText,
            foodLocationPendingRef.current,
          );
          const assist = await runFoodPlaceAssist(
            foodMsg,
            profile?.location ?? null,
          );
          if (assist.kind === 'need_location') {
            foodLocationPendingRef.current = {
              foodKeyword: assist.foodKeyword,
            };
            setMessages((prev) => [
              ...prev,
              {
                id: `${Date.now()}-food-loc`,
                text: foodNeedLocationPrompt(assist.foodKeyword),
                sender: 'bot',
                createdAt: Date.now(),
                action: 'none',
              },
            ]);
            return;
          }
          foodLocationPendingRef.current = null;
          if (assist.kind === 'found') {
            setMessages((prev) => [
              ...prev,
              {
                id: `${Date.now()}-food-res`,
                text: assist.intro,
                sender: 'bot',
                createdAt: Date.now(),
                action: 'none',
                aiPlacePicks:
                  assist.picks.length > 0
                    ? assist.picks.map((p) => ({
                        placeName: p.name.trim() || 'Restaurant',
                        address:
                          p.address.trim() || 'Address unavailable',
                      }))
                    : undefined,
              },
            ]);
            return;
          }
        } else {
          foodLocationPendingRef.current = null;
        }

        if (intent.primary === 'location_help') {
          setMessages((prev) => [
            ...prev,
            {
              id: `${Date.now()}-loc-tip`,
              text:
                'Set your map pin in Profile for “near you” searches and ~2 km order matching. For a one-off, say something like “sushi in Midtown”.',
              sender: 'bot',
              createdAt: Date.now(),
              action: 'none',
            },
          ]);
        }

        const ctx = detectTimeContext();
        const fetched = await fetchActiveJoinableOrdersForContext(
          ctx,
          3,
          48,
          authUser?.uid,
        );
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
        let pipelineMsgs: {
          text: string;
          action: Message['action'];
          orders?: Message['orders'];
        }[] = [];
        if (result != null && typeof result === 'object') {
          const m = (result as { messages?: unknown }).messages;
          if (Array.isArray(m)) {
            pipelineMsgs = m as typeof pipelineMsgs;
          }
        }
        const botMessages: Message[] = pipelineMsgs.map((m, i) => ({
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
            text: 'Something went wrong. Check your connection and try again.',
            sender: 'bot',
            createdAt: Date.now(),
            action: 'none',
          },
        ]);
        setError('Assistant request failed.');
      } finally {
        assistantInFlightRef.current = false;
        setLoading(false);
        setShowPartnerInvite(awaitingPartnerAlone);
      }
    },
    [
      authUser?.uid,
      authUser?.displayName,
      authUser?.email,
      profile?.name,
      profile?.email,
      profile?.location,
      profile,
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
    void Linking.openURL(
      openWhatsAppWithText(
        'Join my HalfOrder split — grab the other half in the app: https://halforder.app',
      ),
    );
  }, []);

  const openPartnerInviteWhatsApp = useCallback(() => {
    void Linking.openURL(
      openWhatsAppWithText(
        "I've started a split order on HalfOrder — open the app to join my half.\nhttps://halforder.app",
      ),
    );
  }, []);

  const handleStartOrderFromPick = useCallback(
    async (
      messageId: string,
      pickIndex: number,
      pick: MessageAiPlacePick,
    ) => {
      const uid = authUser?.uid;
      if (!uid) {
        showError('Sign in to start a shared order.');
        return;
      }
      const rowKey = `${messageId}:${pickIndex}`;
      setStartingPlaceKey(rowKey);
      try {
        const displayName =
          profile?.name?.trim() ||
          authUser?.displayName?.trim() ||
          'Host';
        const photoUrl =
          profile?.avatar ??
          (typeof authUser?.photoURL === 'string'
            ? authUser.photoURL
            : null);
        const loc = profile?.location;
        const lat =
          loc && typeof loc.lat === 'number' ? loc.lat : undefined;
        const lng =
          loc && typeof loc.lng === 'number' ? loc.lng : undefined;
        await createAiPlaceFoodCardAndOrder({
          uid,
          placeName: pick.placeName,
          address: pick.address,
          displayName,
          photoUrl,
          lat,
          lng,
        });
        showNotice(
          'Order started',
          'Your pick is live on Swipe. Invite a friend from the card.',
        );
        router.push('/(tabs)/' as never);
      } catch (e) {
        if (__DEV__) console.warn('[chat] start order from pick', e);
        const msg =
          e instanceof Error && e.message.trim()
            ? e.message.trim()
            : 'Try again.';
        showError(`Could not start order: ${msg}`);
      } finally {
        setStartingPlaceKey(null);
      }
    },
    [authUser, profile, router],
  );

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
              {isSuggestedCard
                ? 'Start from this template →'
                : (item.orders?.length ?? 0) > 1
                  ? 'Browse Join tab or tap to explore →'
                  : 'View order & invite your other half →'}
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
        {!isUser &&
        item.aiPlacePicks &&
        item.aiPlacePicks.length > 0 ? (
          <View style={styles.aiPickBlock}>
            {item.aiPlacePicks.map((pick, idx) => {
              const rowKey = `${item.id}:${idx}`;
              const busy = startingPlaceKey === rowKey;
              return (
                <View key={rowKey} style={styles.aiPickRow}>
                  <Text style={styles.aiPickName}>{pick.placeName}</Text>
                  <Text style={styles.aiPickAddr}>{pick.address}</Text>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={[
                      styles.startOrderBtn,
                      busy && styles.startOrderBtnDisabled,
                    ]}
                    disabled={busy}
                    onPress={() =>
                      void handleStartOrderFromPick(item.id, idx, pick)
                    }
                  >
                    <Text style={styles.startOrderBtnText}>
                      {busy ? 'Starting…' : 'Start Order'}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        ) : !isUser &&
          item.places &&
          Array.isArray(item.places) &&
          item.places.length > 0 ? (
          <View style={styles.placesBlock}>
            {item.places.slice(0, 5).map((p, idx) => (
              <Text key={`${item.id}-p-${idx}`} style={styles.placeLine}>
                • {formatPlaceLine(p)}
              </Text>
            ))}
          </View>
        ) : null}
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
                Food near you, open orders, or split invites — just ask.
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
            <Text style={styles.typingText}>Finding the best reply…</Text>
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
              Split the bill? Send a quick WhatsApp to your other half.
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

        {showPartnerInvite && authUser?.uid ? (
          <View style={styles.partnerInvitePanel}>
            <Text style={styles.partnerInviteText}>
              You have a half-order waiting. Nudge your partner on WhatsApp with an app link.
            </Text>
            <TouchableOpacity
              style={styles.splitWaBtn}
              onPress={openPartnerInviteWhatsApp}
              activeOpacity={0.9}
            >
              <FontAwesome name="whatsapp" size={20} color="#fff" />
              <Text style={styles.splitWaBtnText}>WhatsApp invite</Text>
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
            placeholder="e.g. pizza in North York, or find orders to join"
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
  placesBlock: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.15)',
    gap: 4,
    alignSelf: 'stretch',
  },
  placeLine: {
    color: 'rgba(248,250,252,0.88)',
    fontSize: 13,
    fontWeight: '600',
  },
  aiPickBlock: {
    marginTop: 10,
    alignSelf: 'stretch',
    gap: 10,
  },
  aiPickRow: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  aiPickName: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '800',
  },
  aiPickAddr: {
    color: 'rgba(248,250,252,0.72)',
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },
  startOrderBtn: {
    marginTop: 10,
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: 'rgba(52, 211, 153, 0.22)',
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.5)',
  },
  startOrderBtnDisabled: { opacity: 0.55 },
  startOrderBtnText: {
    color: '#6EE7B7',
    fontSize: 14,
    fontWeight: '800',
  },
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
  partnerInvitePanel: {
    marginHorizontal: 12,
    marginBottom: 10,
    padding: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(6, 78, 59, 0.45)',
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.45)',
    gap: 12,
  },
  partnerInviteText: {
    color: 'rgba(209, 250, 229, 0.98)',
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 21,
  },
});
