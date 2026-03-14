import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatTorontoTime } from '@/lib/format-toronto-time';
import { auth, db } from '@/services/firebase';

type SupportMessage = {
  id: string;
  text: string;
  sender: 'user' | 'support';
  createdAt: number;
};

export default function SupportChatScreen() {
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const flatListRef = useRef<FlatList>(null);

  const uid = auth.currentUser?.uid ?? '';

  useEffect(() => {
    if (!uid) {
      setLoading(false);
      return;
    }
    const messagesPath = collection(db, 'support_chats', uid, 'messages');
    const q = query(messagesPath, orderBy('createdAt', 'asc'));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: SupportMessage[] = snap.docs.map((d) => {
          const d2 = d.data();
          const created = d2?.createdAt?.toMillis?.() ?? d2?.createdAt ?? 0;
          const sender = d2?.sender === 'support' ? 'support' : 'user';
          return {
            id: d.id,
            text: typeof d2?.text === 'string' ? d2.text : '',
            sender,
            createdAt: Number(created),
          };
        });
        setMessages(list);
        setLoading(false);
      },
      () => {
        setMessages([]);
        setLoading(false);
      },
    );

    return () => unsub();
  }, [uid]);

  useEffect(() => {
    if (messages.length > 0) {
      flatListRef.current?.scrollToEnd({ animated: true });
    }
  }, [messages.length]);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || !uid || sending) return;

    setSending(true);
    try {
      const messagesPath = collection(db, 'support_chats', uid, 'messages');
      await addDoc(messagesPath, {
        text: trimmed,
        sender: 'user',
        createdAt: serverTimestamp(),
      });
      setText('');
      Keyboard.dismiss();
    } finally {
      setSending(false);
    }
  };

  if (!uid) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: '#fff',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 24,
        }}
      >
        <Text style={{ color: '#64748b', textAlign: 'center' }}>
          Please sign in to contact support.
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: '#fff' }}
      edges={['bottom']}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
          ListEmptyComponent={
            <View style={{ padding: 24, alignItems: 'center' }}>
              <Text
                style={{ color: '#94a3b8', fontSize: 14, textAlign: 'center' }}
              >
                No messages yet. Send a message to get help.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const isUser = item.sender === 'user';
            return (
              <View
                style={{
                  alignSelf: isUser ? 'flex-end' : 'flex-start',
                  maxWidth: '80%',
                  backgroundColor: isUser ? '#2563eb' : '#f1f5f9',
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  borderRadius: 12,
                  marginBottom: 8,
                }}
              >
                <Text
                  style={{ color: isUser ? '#fff' : '#334155', fontSize: 14 }}
                >
                  {item.text}
                </Text>
                <Text
                  style={{
                    color: isUser ? 'rgba(255,255,255,0.8)' : '#94a3b8',
                    fontSize: 11,
                    marginTop: 2,
                  }}
                >
                  {formatTorontoTime(item.createdAt)}
                </Text>
              </View>
            );
          }}
        />

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderTopWidth: 1,
            borderTopColor: '#e2e8f0',
            backgroundColor: '#fff',
          }}
        >
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Type your message..."
            placeholderTextColor="#94a3b8"
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: '#e2e8f0',
              borderRadius: 24,
              paddingVertical: 10,
              paddingHorizontal: 16,
              fontSize: 15,
              color: '#334155',
            }}
            editable={!sending}
          />
          <TouchableOpacity
            onPress={handleSend}
            disabled={!text.trim() || sending}
            style={{
              marginLeft: 8,
              backgroundColor: text.trim() && !sending ? '#2563eb' : '#cbd5e1',
              paddingVertical: 10,
              paddingHorizontal: 20,
              borderRadius: 24,
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '600' }}>Send</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
