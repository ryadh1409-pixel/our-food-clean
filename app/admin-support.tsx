import {
  addDoc,
  collection,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Keyboard,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatTorontoTime } from '@/lib/format-toronto-time';
import { auth, db } from '@/services/firebase';
import { theme } from '@/constants/theme';

const c = theme.colors;

const ADMIN_UID = 'REPLACE_WITH_ADMIN_UID';

type SupportMessage = {
  id: string;
  text: string;
  sender: 'user' | 'support';
  createdAt: number;
};

export default function AdminSupportScreen() {
  const [userIds, setUserIds] = useState<string[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const flatListRef = useRef<FlatList>(null);

  const uid = auth.currentUser?.uid ?? '';
  const isAdmin = uid === ADMIN_UID;

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    getDocs(collection(db, 'support_chats')).then((snap) => {
      setUserIds(snap.docs.map((d) => d.id));
      setLoading(false);
    });
  }, [isAdmin]);

  useEffect(() => {
    if (!selectedUserId || !isAdmin) return;
    const messagesPath = collection(
      db,
      'support_chats',
      selectedUserId,
      'messages',
    );
    const q = query(messagesPath, orderBy('createdAt', 'asc'));

    const unsub = onSnapshot(q, (snap) => {
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
    });

    return () => unsub();
  }, [selectedUserId, isAdmin]);

  useEffect(() => {
    if (messages.length > 0) {
      flatListRef.current?.scrollToEnd({ animated: true });
    }
  }, [messages.length]);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || !selectedUserId || sending) return;

    setSending(true);
    try {
      const messagesPath = collection(
        db,
        'support_chats',
        selectedUserId,
        'messages',
      );
      await addDoc(messagesPath, {
        text: trimmed,
        sender: 'support',
        createdAt: serverTimestamp(),
      });
      setText('');
      Keyboard.dismiss();
    } finally {
      setSending(false);
    }
  };

  if (!isAdmin) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: c.background,
          justifyContent: 'center',
          alignItems: 'center',
          padding: 24,
        }}
      >
        <Text style={{ color: c.textMuted, textAlign: 'center' }}>
          Access denied
        </Text>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: c.background,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <Text style={{ color: c.textMuted }}>Loading...</Text>
      </SafeAreaView>
    );
  }

  if (!selectedUserId) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.background, padding: 16 }}>
        <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 16 }}>
          Support chats
        </Text>
        {userIds.length === 0 ? (
          <Text style={{ color: c.iconInactive }}>No support chats yet</Text>
        ) : (
          userIds.map((id) => (
            <TouchableOpacity
              key={id}
              onPress={() => setSelectedUserId(id)}
              style={{
                padding: 12,
                borderBottomWidth: 1,
                borderBottomColor: c.border,
              }}
            >
              <Text style={{ color: c.textSlateDark }}>{id}</Text>
            </TouchableOpacity>
          ))
        )}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: c.background }}
      edges={['bottom']}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          padding: 12,
          borderBottomWidth: 1,
          borderBottomColor: c.border,
        }}
      >
        <TouchableOpacity onPress={() => setSelectedUserId(null)}>
          <Text style={{ color: c.accentBlue, marginRight: 16 }}>← Back</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 14, color: c.textMuted }} numberOfLines={1}>
          {selectedUserId}
        </Text>
      </View>
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
        ListEmptyComponent={
          <View style={{ padding: 24, alignItems: 'center' }}>
            <Text
              style={{
                color: c.iconInactive,
                fontSize: 14,
                textAlign: 'center',
              }}
            >
              No messages
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
                backgroundColor: isUser ? c.accentBlue : c.surfaceMuted,
                paddingVertical: 8,
                paddingHorizontal: 12,
                borderRadius: 12,
                marginBottom: 8,
              }}
            >
              <Text
                style={{
                  color: isUser ? c.textOnPrimary : c.textSlateDark,
                  fontSize: 14,
                }}
              >
                {item.text}
              </Text>
              <Text
                style={{
                  color: isUser ? c.textOnPrimary : c.iconInactive,
                  fontSize: 11,
                  marginTop: 2,
                  opacity: isUser ? 0.88 : 1,
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
          borderTopColor: c.border,
          backgroundColor: c.background,
        }}
      >
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Reply..."
          placeholderTextColor={c.iconInactive}
          style={{
            flex: 1,
            borderWidth: 1,
            borderColor: c.border,
            borderRadius: 24,
            paddingVertical: 10,
            paddingHorizontal: 16,
            fontSize: 15,
            color: c.textSlateDark,
          }}
          editable={!sending}
        />
        <TouchableOpacity
          onPress={handleSend}
          disabled={!text.trim() || sending}
          style={{
            marginLeft: 8,
            backgroundColor:
              text.trim() && !sending ? c.accentBlue : c.borderStrong,
            paddingVertical: 10,
            paddingHorizontal: 20,
            borderRadius: 24,
          }}
        >
          <Text style={{ color: c.textOnPrimary, fontWeight: '600' }}>
            Send
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
