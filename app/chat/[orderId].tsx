import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
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
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenFadeIn } from '@/components/ScreenFadeIn';
import { hasBlockBetween } from '@/services/blocks';
import { auth, db } from '@/services/firebase';

type ChatMessage = {
  id: string;
  text: string;
  senderId: string;
  userName: string;
  createdAtMs: number;
};

export default function OrderChatScreen() {
  const router = useRouter();
  const { orderId } = useLocalSearchParams<{ orderId?: string }>();
  const resolvedOrderId = String(orderId ?? '');
  const listRef = useRef<FlatList<ChatMessage>>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [otherUserId, setOtherUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!resolvedOrderId) return;
    const orderRef = doc(db, 'orders', resolvedOrderId);
    const unsub = onSnapshot(orderRef, (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      const creator = String(data?.createdBy ?? data?.creatorId ?? data?.hostId ?? '');
      setOtherUserId(creator || null);
    });
    return () => unsub();
  }, [resolvedOrderId]);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid || !otherUserId || uid === otherUserId) {
      setBlocked(false);
      return;
    }
    let cancelled = false;
    hasBlockBetween(uid, otherUserId)
      .then((v) => {
        if (!cancelled) setBlocked(v);
      })
      .catch(() => {
        if (!cancelled) setBlocked(false);
      });
    return () => {
      cancelled = true;
    };
  }, [otherUserId]);

  useEffect(() => {
    if (!resolvedOrderId || blocked) {
      setLoading(false);
      if (blocked) setMessages([]);
      return;
    }
    const q = query(
      collection(db, 'orders', resolvedOrderId, 'messages'),
      orderBy('createdAt', 'asc'),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: ChatMessage[] = snap.docs.map((d) => {
          const data = d.data();
          const ms = data?.createdAt?.toMillis?.() ?? data?.createdAt ?? Date.now();
          return {
            id: d.id,
            text: String(data?.text ?? ''),
            senderId: String(data?.senderId ?? data?.userId ?? ''),
            userName: String(data?.userName ?? 'User'),
            createdAtMs: Number(ms),
          };
        });
        setMessages(list);
        setError(null);
        setLoading(false);
      },
      () => {
        setMessages([]);
        setError('Unable to load chat. Pull to retry by reopening this screen.');
        setLoading(false);
      },
    );
    return () => unsub();
  }, [blocked, resolvedOrderId]);

  useEffect(() => {
    if (messages.length === 0) return;
    const id = setTimeout(() => {
      listRef.current?.scrollToEnd({ animated: true });
    }, 40);
    return () => clearTimeout(id);
  }, [messages.length]);

  const displayName =
    auth.currentUser?.displayName || auth.currentUser?.email?.split('@')[0] || 'You';

  const canSend = useMemo(
    () => !!resolvedOrderId && text.trim().length > 0 && !sending && !blocked,
    [blocked, resolvedOrderId, sending, text],
  );

  const handleSend = async () => {
    if (!canSend) return;
    const uid = auth.currentUser?.uid;
    if (!uid || !resolvedOrderId) return;
    const payload = text.trim();
    setSending(true);
    try {
      await addDoc(collection(db, 'orders', resolvedOrderId, 'messages'), {
        text: payload,
        senderId: uid,
        userName: displayName,
        createdAt: serverTimestamp(),
      });
      setText('');
      Haptics.selectionAsync().catch(() => {});
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send message.');
    } finally {
      setSending(false);
    }
  };

  const formatTime = (ms: number) =>
    new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenFadeIn style={styles.container}>
        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.back}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Order Chat</Text>
          <View style={{ width: 40 }} />
        </View>

        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#34D399" />
          </View>
        ) : blocked ? (
          <View style={styles.centered}>
            <Text style={styles.emptyTitle}>Chat unavailable</Text>
            <Text style={styles.emptyHint}>
              This conversation is hidden because one user blocked the other.
            </Text>
          </View>
        ) : messages.length === 0 ? (
          <View style={styles.centered}>
            <Text style={styles.emptyTitle}>No messages yet</Text>
            <Text style={styles.emptyHint}>Start the conversation with your order partners.</Text>
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
            renderItem={({ item }) => {
              const mine = item.senderId === auth.currentUser?.uid;
              return (
                <View style={[styles.msgBubble, mine ? styles.mine : styles.theirs]}>
                  <Text style={styles.userName}>{item.userName}</Text>
                  <Text style={styles.msgText}>{item.text}</Text>
                  <Text style={styles.time}>{formatTime(item.createdAtMs)}</Text>
                </View>
              );
            }}
          />
        )}

        <View style={styles.inputRow}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Write a message..."
            placeholderTextColor="#9CA3AF"
            style={styles.input}
            editable={!sending}
          />
          <TouchableOpacity
            style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!canSend}
          >
            <Text style={styles.sendBtnText}>{sending ? '...' : 'Send'}</Text>
          </TouchableOpacity>
        </View>
        {error ? <Text style={styles.errorBanner}>{error}</Text> : null}
        </KeyboardAvoidingView>
      </ScreenFadeIn>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0D10' },
  header: {
    height: 56,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomColor: '#1F2937',
    borderBottomWidth: 1,
  },
  back: { color: '#34D399', fontSize: 15, fontWeight: '700' },
  title: { color: '#F8FAFC', fontSize: 17, fontWeight: '700' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { padding: 12, paddingBottom: 20 },
  msgBubble: {
    maxWidth: '80%',
    borderRadius: 14,
    padding: 10,
    marginBottom: 10,
  },
  mine: { alignSelf: 'flex-end', backgroundColor: '#10241D', borderColor: '#1E3A2F', borderWidth: 1 },
  theirs: { alignSelf: 'flex-start', backgroundColor: '#141922', borderColor: '#232A35', borderWidth: 1 },
  userName: { color: '#6EE7B7', fontSize: 12, fontWeight: '700', marginBottom: 4 },
  msgText: { color: '#F3F4F6', fontSize: 14 },
  time: { color: '#9CA3AF', fontSize: 11, marginTop: 6, textAlign: 'right' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderTopColor: '#1F2937',
    borderTopWidth: 1,
    backgroundColor: '#0F141B',
  },
  input: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#232A35',
    color: '#F8FAFC',
    paddingHorizontal: 12,
    backgroundColor: '#141922',
  },
  sendBtn: {
    minHeight: 44,
    minWidth: 68,
    borderRadius: 12,
    backgroundColor: '#34D399',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  sendBtnDisabled: { opacity: 0.6 },
  sendBtnText: { color: '#052E1A', fontWeight: '800', fontSize: 14 },
  emptyTitle: { color: '#F3F4F6', fontSize: 18, fontWeight: '700' },
  emptyHint: { color: '#9CA3AF', fontSize: 13, marginTop: 6, textAlign: 'center' },
  errorText: { color: '#FCA5A5', marginTop: 8, fontSize: 12 },
  errorBanner: {
    color: '#FCA5A5',
    fontSize: 12,
    textAlign: 'center',
    paddingBottom: 8,
    backgroundColor: '#1A1113',
  },
});
