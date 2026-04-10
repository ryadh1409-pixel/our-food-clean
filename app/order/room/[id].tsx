/**
 * Legacy thread: messages under `orders/{orderId}/messages`.
 * Primary order UI + HalfOrder flow: `/order/[id]` (sibling route).
 */
import { theme } from '@/constants/theme';
import { auth, db } from '@/services/firebase';
import { CONTENT_NOT_ALLOWED, moderateChatMessage } from '@/utils/contentModeration';
import { showError } from '@/utils/toast';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  addDoc,
  collection,
  orderBy,
  query,
  serverTimestamp,
} from 'firebase/firestore';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { onSnapshot } from 'firebase/firestore';

/** Align with `OrderRoomScreen` / `chatSecurity` order chat limits. */
const ORDER_ROOM_CHAT_MAX = 200;

type OrderMessage = {
  id: string;
  text?: string;
  senderId?: string;
  senderName?: string;
  createdAt?: unknown;
};

export default function OrderChatScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const orderId = useMemo(() => {
    const raw = params.id;
    const str = Array.isArray(raw) ? raw[0] : raw;
    return typeof str === 'string' ? str : '';
  }, [params.id]);

  const [messages, setMessages] = useState<OrderMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const listRef = useRef<FlatList<OrderMessage> | null>(null);

  const currentUser = auth.currentUser;
  const uid = currentUser?.uid ?? '';

  const messagesRef = useMemo(() => {
    if (!orderId.trim()) return null;
    return collection(db, 'orders', orderId, 'messages');
  }, [orderId]);

  const q = useMemo(() => {
    if (!messagesRef) return null;
    return query(messagesRef, orderBy('createdAt', 'asc'));
  }, [messagesRef]);

  useEffect(() => {
    if (!q) {
      setMessages([]);
      setLoading(false);
      setError(orderId.trim() ? null : 'Missing order id.');
      return;
    }

    setLoading(true);
    setError(null);

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const next: OrderMessage[] = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<OrderMessage, 'id'>),
        }));
        setMessages(next);
        setLoading(false);
      },
      (e) => {
        setError(e instanceof Error ? e.message : 'Failed to load messages');
        setLoading(false);
      },
    );

    return () => unsub();
  }, [q, orderId]);

  useEffect(() => {
    if (!listRef.current) return;
    // Fire-and-forget scroll on every message update.
    // The list updates are driven by Firestore snapshots.
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: true });
    });
  }, [messages.length]);

  const canSend = !!uid && input.trim().length > 0 && !sending;

  const onSend = async () => {
    if (!messagesRef) return;
    if (!uid) return;
    if (!canSend) return;

    const text = input.trim();
    const mod = moderateChatMessage(text, { maxLength: ORDER_ROOM_CHAT_MAX });
    if (!mod.ok) {
      showError(
        mod.reason === CONTENT_NOT_ALLOWED ? CONTENT_NOT_ALLOWED : mod.reason,
      );
      return;
    }
    setSending(true);
    try {
      await addDoc(messagesRef, {
        text: mod.text,
        senderId: uid,
        senderName:
          typeof currentUser?.displayName === 'string' && currentUser.displayName.trim()
            ? currentUser.displayName
            : currentUser?.email?.split('@')[0] ?? 'User',
        createdAt: serverTimestamp(),
      });
      setInput('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const renderMessage = ({ item }: { item: OrderMessage }) => {
    const mine = item.senderId === uid;
    const bubbleStyle = mine ? styles.bubbleMine : styles.bubbleTheirs;
    const textStyle = mine ? styles.textMine : styles.textTheirs;
    return (
      <View style={[styles.row, mine ? styles.rowRight : styles.rowLeft]}>
        <View style={[styles.bubble, bubbleStyle]}>
          {!mine && item.senderName ? (
            <Text style={[styles.senderName, styles.textMuted]}>{item.senderName}</Text>
          ) : null}
          <Text style={[styles.text, textStyle]}>{item.text ?? ''}</Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
          <MaterialIcons name="arrow-back" size={22} color="#F8FAFC" />
        </Pressable>
        <Text style={styles.headerTitle}>Order Chat</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.chatBody}>
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
          </View>
        ) : error ? (
          <View style={styles.centered}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            renderItem={renderMessage}
            contentContainerStyle={styles.listContent}
            onContentSizeChange={() =>
              listRef.current?.scrollToEnd({ animated: true })
            }
          />
        )}
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.inputRow}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Write a message..."
            placeholderTextColor="#9CA3AF"
            style={styles.input}
            editable={!sending && !!uid}
            onSubmitEditing={onSend}
          />
          <TouchableOpacity
            style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
            disabled={!canSend}
            onPress={() => void onSend()}
          >
            <Text style={styles.sendBtnText}>{sending ? '...' : 'Send'}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#06080C',
    paddingHorizontal: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  backBtn: {
    padding: 8,
  },
  headerTitle: {
    color: '#F8FAFC',
    fontWeight: '800',
    fontSize: 16,
  },
  headerSpacer: {
    width: 38,
  },
  chatBody: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: '#FCA5A5',
    fontSize: 14,
  },
  listContent: {
    paddingVertical: 12,
    paddingBottom: 16,
  },
  row: {
    width: '100%',
    marginBottom: 10,
  },
  rowLeft: {
    alignItems: 'flex-start',
  },
  rowRight: {
    alignItems: 'flex-end',
  },
  bubble: {
    maxWidth: '80%',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  bubbleMine: {
    backgroundColor: 'rgba(16, 36, 29, 0.95)',
    borderColor: 'rgba(52, 211, 153, 0.25)',
  },
  bubbleTheirs: {
    backgroundColor: 'rgba(20, 25, 34, 0.95)',
    borderColor: 'rgba(125, 211, 252, 0.18)',
  },
  senderName: {
    marginBottom: 6,
  },
  text: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  textMine: {
    color: '#E9FFF6',
  },
  textTheirs: {
    color: '#F8FAFC',
  },
  textMuted: {
    color: 'rgba(248,250,252,0.62)',
    fontSize: 12,
    fontWeight: '700',
  },
  inputRow: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 10,
    paddingBottom: 16,
  },
  input: {
    flex: 1,
    backgroundColor: 'rgba(17, 22, 31, 0.95)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    color: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontWeight: '500',
  },
  sendBtn: {
    backgroundColor: 'rgba(52, 211, 153, 0.22)',
    borderRadius: 14,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.45)',
  },
  sendBtnDisabled: {
    opacity: 0.6,
  },
  sendBtnText: {
    color: '#A7F3D0',
    fontWeight: '800',
    fontSize: 14,
  },
});

