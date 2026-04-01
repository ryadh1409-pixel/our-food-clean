import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
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

import { auth, db } from '@/services/firebase';

type ChatMessage = {
  id: string;
  text: string;
  senderId: string;
  userName: string;
  createdAtMs: number;
};

function paramToId(raw: string | string[] | undefined): string {
  if (raw == null) return '';
  return String(Array.isArray(raw) ? raw[0] : raw);
}

export default function ChatByIdScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const chatId = paramToId(params.id);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** null = chat doc not loaded yet */
  const [chatExists, setChatExists] = useState<boolean | null>(null);
  const [hasSyncedMessages, setHasSyncedMessages] = useState(false);
  const bootstrapAttemptedRef = useRef(false);
  const aiBootstrapAttemptedRef = useRef(false);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  useEffect(() => {
    if (!chatId) {
      setChatExists(null);
      setHasSyncedMessages(false);
      setMessages([]);
      setLoading(false);
      setError('Missing chat.');
      return;
    }
    setError(null);
    setLoading(true);
  }, [chatId]);

  useEffect(() => {
    if (!chatId) {
      return;
    }
    setChatExists(null);
    const unsub = onSnapshot(doc(db, 'chats', chatId), (snap) => {
      if (!snap.exists()) {
        setError('Chat not found.');
        setChatExists(false);
        setLoading(false);
      } else {
        setError(null);
        setChatExists(true);
      }
    });
    return () => unsub();
  }, [chatId]);

  useEffect(() => {
    if (!chatId) return;
    setHasSyncedMessages(false);
    bootstrapAttemptedRef.current = false;
    aiBootstrapAttemptedRef.current = false;
    const q = query(collection(db, 'chats', chatId, 'messages'), orderBy('createdAt', 'asc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            text: String(data?.text ?? ''),
            senderId: String(data?.senderId ?? ''),
            userName: String(data?.userName ?? 'User'),
            createdAtMs: Number(data?.createdAt?.toMillis?.() ?? Date.now()),
          };
        });
        setMessages(rows);
        setHasSyncedMessages(true);
        setLoading(false);
      },
      () => {
        setMessages([]);
        setHasSyncedMessages(true);
        setLoading(false);
      },
    );
    return () => unsub();
  }, [chatId]);

  useEffect(() => {
    if (!chatId || chatExists !== true || !hasSyncedMessages || messages.length > 0 || bootstrapAttemptedRef.current) {
      return;
    }
    bootstrapAttemptedRef.current = true;
    (async () => {
      try {
        const welcome = 'Hey! You both joined the same food 🍕';
        await addDoc(collection(db, 'chats', chatId, 'messages'), {
          text: welcome,
          senderId: 'system',
          userName: 'System',
          createdAt: serverTimestamp(),
          delivered: true,
          seen: false,
          system: true,
        });
        await updateDoc(doc(db, 'chats', chatId), {
          lastMessage: welcome,
          lastMessageAt: serverTimestamp(),
        }).catch(() => {});
        if (!aiBootstrapAttemptedRef.current) {
          aiBootstrapAttemptedRef.current = true;
          try {
            const res = await fetch('http://localhost:3000/chat', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                message: welcome,
                user: {
                  uid: auth.currentUser?.uid ?? '',
                  name: auth.currentUser?.displayName ?? 'User',
                },
                chatId,
              }),
            });
            const data = (await res.json()) as { response?: string; reply?: string };
            const aiReply = (data.reply ?? data.response ?? '').trim();
            if (aiReply) {
              await addDoc(collection(db, 'chats', chatId, 'messages'), {
                text: aiReply,
                senderId: 'ai',
                userName: 'AI Assistant',
                createdAt: serverTimestamp(),
                delivered: true,
                seen: false,
                system: true,
              });
              await updateDoc(doc(db, 'chats', chatId), {
                lastMessage: aiReply,
                lastMessageAt: serverTimestamp(),
              }).catch(() => {});
            }
          } catch {
            aiBootstrapAttemptedRef.current = false;
          }
        }
      } catch {
        bootstrapAttemptedRef.current = false;
      }
    })();
  }, [chatId, chatExists, hasSyncedMessages, messages.length]);

  useEffect(() => {
    if (messages.length === 0) return;
    listRef.current?.scrollToEnd({ animated: true });
  }, [messages.length]);

  const canSend = useMemo(() => text.trim().length > 0 && !sending && !!chatId, [text, sending, chatId]);

  const onSend = async () => {
    if (!canSend) return;
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const payload = text.trim();
    setSending(true);
    try {
      await addDoc(collection(db, 'chats', chatId, 'messages'), {
        text: payload,
        senderId: uid,
        userName: auth.currentUser?.displayName || auth.currentUser?.email?.split('@')[0] || 'User',
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'chats', chatId), {
        lastMessage: payload,
        lastMessageAt: serverTimestamp(),
      }).catch(() => {});
      setText('');
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.back}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Chat</Text>
          <View style={{ width: 40 }} />
        </View>

        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator color="#34D399" />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => {
              const mine = item.senderId === auth.currentUser?.uid;
              return (
                <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
                  <Text style={styles.name}>{item.userName}</Text>
                  <Text style={styles.msg}>{item.text}</Text>
                </View>
              );
            }}
            ListEmptyComponent={
              <View style={styles.centered}>
                <Text style={styles.empty}>No messages yet.</Text>
                {error ? <Text style={styles.error}>{error}</Text> : null}
              </View>
            }
          />
        )}

        <View style={styles.inputRow}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Write a message..."
            placeholderTextColor="#9CA3AF"
            style={styles.input}
            onSubmitEditing={onSend}
            editable={!sending}
          />
          <TouchableOpacity style={[styles.sendBtn, !canSend && styles.disabled]} onPress={onSend} disabled={!canSend}>
            <Text style={styles.sendText}>{sending ? '...' : 'Send'}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
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
  back: { color: '#34D399', fontWeight: '700' },
  title: { color: '#F8FAFC', fontWeight: '700', fontSize: 17 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { padding: 12, paddingBottom: 20 },
  bubble: { maxWidth: '80%', borderRadius: 14, padding: 10, marginBottom: 10 },
  mine: { alignSelf: 'flex-end', backgroundColor: '#10241D' },
  theirs: { alignSelf: 'flex-start', backgroundColor: '#141922' },
  name: { color: '#6EE7B7', fontSize: 12, fontWeight: '700', marginBottom: 4 },
  msg: { color: '#F3F4F6', fontSize: 14 },
  inputRow: { flexDirection: 'row', gap: 8, padding: 10, borderTopWidth: 1, borderTopColor: '#1F2937' },
  input: { flex: 1, minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: '#232A35', color: '#F8FAFC', paddingHorizontal: 12, backgroundColor: '#141922' },
  sendBtn: { minHeight: 44, minWidth: 68, borderRadius: 12, backgroundColor: '#34D399', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 14 },
  sendText: { color: '#052E1A', fontWeight: '800' },
  disabled: { opacity: 0.6 },
  empty: { color: '#9CA3AF' },
  error: { color: '#FCA5A5', marginTop: 6 },
});
