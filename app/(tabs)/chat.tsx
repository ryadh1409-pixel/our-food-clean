import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAuth } from '@/services/AuthContext';
import {
  buildSmartMatchIntroText,
  detectFoodIntent,
  detectTimeContext,
  fetchActiveJoinableOrdersForContext,
  type AssistantOrderSummary,
  type TimeContext,
} from '@/services/chatAssistantOrders';
import {
  getSmartMatches,
  type SmartMatchOrder,
} from '@/services/matchingEngine';
import {
  SUGGESTED_ORDER_BOT_COPY,
  generateSuggestedOrder,
} from '@/services/suggestedOrder';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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

function buildUserTurnBotMessage(
  ctx: TimeContext,
  rows: AssistantOrderSummary[],
): Message {
  const orderRefs = toMessageOrders(rows);
  if (rows.length > 0) {
    return {
      id: `${Date.now()}-b`,
      text: buildSmartMatchIntroText(ctx, rows),
      sender: 'bot',
      createdAt: Date.now(),
      action: 'join_order',
      orders: orderRefs,
    };
  }
  const suggested = generateSuggestedOrder(ctx);
  return {
    id: `${Date.now()}-b`,
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
  const flatListRef = useRef<FlatList<Message> | null>(null);

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
  }, [authUser?.uid, profile?.location?.lat, profile?.location?.lng]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ctx = detectTimeContext();
        const fetched = await fetchActiveJoinableOrdersForContext(ctx, 3);
        if (cancelled) return;
        setIntroFetchFailed(false);
        const intro = buildIntroSuggestionMessage(ctx, fetched);
        setMessages((prev) => {
          if (prev.some((m) => m.id === ASSISTANT_INTRO_MESSAGE_ID)) {
            return prev;
          }
          return [...prev, intro];
        });
      } catch {
        if (cancelled) return;
        setIntroFetchFailed(true);
        setMessages((prev) => {
          if (prev.some((m) => m.id === ASSISTANT_INTRO_MESSAGE_ID)) {
            return prev;
          }
          return [...prev, buildIntroSuggestionMessage(detectTimeContext(), [])];
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
  }, []);

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

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const outgoingText = input.trim();
    setError('');
    const userMessage: Message = {
      id: `${Date.now()}-u`,
      text: outgoingText,
      sender: 'user',
      createdAt: Date.now(),
      action: 'none',
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');

    if (!detectFoodIntent(outgoingText)) {
      const botMessage: Message = {
        id: `${Date.now()}-b`,
        text: 'Mention food or that you’re hungry — I’ll look for open orders you can join, or suggest a template to start your own.',
        sender: 'bot',
        createdAt: Date.now(),
        action: 'none',
      };
      setMessages((prev) => [...prev, botMessage]);
      return;
    }

    setLoading(true);
    try {
      const ctx = detectTimeContext();
      const fetched = await fetchActiveJoinableOrdersForContext(ctx, 3);
      const botMessage = buildUserTurnBotMessage(ctx, fetched);
      setMessages((prev) => [...prev, botMessage]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-err`,
          text: 'Could not load orders. Check your connection and try again.',
          sender: 'bot',
          createdAt: Date.now(),
          action: 'none',
        },
      ]);
      setError('Failed to fetch orders.');
    } finally {
      setLoading(false);
    }
  };

  const handleMicPress = () => {
    Alert.alert(
      'Voice input',
      'Please type your message for now. Voice input is not available in this version.',
    );
  };

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

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.messagesContent}
          ListHeaderComponent={
            <View style={styles.growthHeader}>
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

        {loading ? (
          <View style={styles.typingRow}>
            <ActivityIndicator size="small" color="#9CA3AF" />
            <Text style={styles.typingText}>Loading open orders…</Text>
          </View>
        ) : null}
        {introFetchFailed ? (
          <Text style={styles.bannerText}>
            Live order list unavailable — showing suggestions only.
          </Text>
        ) : null}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <View style={styles.inputContainer}>
          <TouchableOpacity onPress={handleMicPress} style={styles.micButton}>
            <Text style={styles.micText}>🎤</Text>
          </TouchableOpacity>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Type a message..."
            placeholderTextColor="#8A8A8A"
            style={styles.input}
            editable={!loading}
            onSubmitEditing={sendMessage}
            returnKeyType="send"
          />
          <TouchableOpacity
            onPress={sendMessage}
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
  safe: { flex: 1, backgroundColor: '#111' },
  container: { flex: 1, backgroundColor: '#111' },
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
});
