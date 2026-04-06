import ReportUserModal from '@/components/ReportUserModal';
import { reportContentIdChatMessage } from '@/services/reports';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  addDoc,
  collection,
  doc as firestoreDoc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
} from 'firebase/firestore';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionSheetIOS,
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
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { systemActionSheet, systemConfirm } from '@/components/SystemDialogHost';
import { getUserFriendlyError } from '@/utils/errorHandler';
import { showError, showSuccess } from '@/utils/toast';
import { blockUser } from '@/services/block';
import { hasBlockBetween } from '@/services/blocks';
import { auth, db } from '@/services/firebase';
import { markHalfOrderChatActive } from '@/services/halfOrderLifecycle';

/** Firestore message doc shape varies; listener spreads `doc.data()`. */
type ChatMessage = { id: string } & Record<string, unknown>;

function paramToId(raw: string | string[] | undefined): string {
  if (raw == null) return '';
  return String(Array.isArray(raw) ? raw[0] : raw);
}

function formatMessageTime(createdAt: unknown): string {
  const n =
    typeof createdAt === 'number' && Number.isFinite(createdAt)
      ? createdAt
      : null;
  if (n == null) return '';
  try {
    return new Date(n).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export default function ChatByIdScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = paramToId(params.id);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chatExists, setChatExists] = useState<boolean | null>(null);
  const [hasSyncedMessages, setHasSyncedMessages] = useState(false);
  const [chatReads, setChatReads] = useState<Record<string, number>>({});
  const [peerUid, setPeerUid] = useState<string | null>(null);
  const [peerFlagged, setPeerFlagged] = useState(false);
  const [blockedBetween, setBlockedBetween] = useState(false);
  const [reportMessageId, setReportMessageId] = useState<string | null>(null);
  const bootstrapAttemptedRef = useRef(false);
  const aiInsertAttemptedRef = useRef(false);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: true });
    });
  }, []);

  useEffect(() => {
    if (!id) {
      setChatExists(null);
      setHasSyncedMessages(false);
      setMessages([]);
      setLoading(false);
      setError('Missing chat.');
      return;
    }
    setError(null);
    setLoading(true);
    setMessages([]);
    setHasSyncedMessages(false);
    bootstrapAttemptedRef.current = false;
    aiInsertAttemptedRef.current = false;
  }, [id]);

  useEffect(() => {
    if (!id) {
      return;
    }
    setChatExists(null);
    const unsub = onSnapshot(firestoreDoc(db, 'chats', id), (snap) => {
      if (!snap.exists()) {
        setError('Chat not found.');
        setChatExists(false);
        setLoading(false);
      } else {
        setError(null);
        setChatExists(true);
        setLoading(false);
        const d = snap.data();
        const readsRaw = d?.reads;
        setChatReads(
          readsRaw && typeof readsRaw === 'object' && readsRaw !== null
            ? (readsRaw as Record<string, number>)
            : {},
        );
        const uid = auth.currentUser?.uid;
        const users = Array.isArray(d?.users)
          ? (d.users as unknown[]).filter((x): x is string => typeof x === 'string')
          : [];
        const part = Array.isArray(d?.participants)
          ? (d.participants as unknown[]).filter((x): x is string => typeof x === 'string')
          : [];
        const list = users.length > 0 ? users : part;
        const other = uid ? list.find((x) => x !== uid) ?? null : null;
        setPeerUid(other);
      }
    });
    return () => unsub();
  }, [id]);

  useEffect(() => {
    if (!peerUid) {
      setPeerFlagged(false);
      return;
    }
    const ref = firestoreDoc(db, 'users', peerUid);
    const unsub = onSnapshot(ref, (snap) => {
      const d = snap.data();
      setPeerFlagged(
        snap.exists()
          ? d?.isFlagged === true || d?.flagged === true
          : false,
      );
    });
    return () => unsub();
  }, [peerUid]);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid || !peerUid) {
      setBlockedBetween(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const v = await hasBlockBetween(uid, peerUid);
        if (!cancelled) setBlockedBetween(v);
      } catch {
        if (!cancelled) setBlockedBetween(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [peerUid]);

  useEffect(() => {
    if (!id || chatExists !== true) return;
    void markHalfOrderChatActive(id);
  }, [id, chatExists]);

  useEffect(() => {
    if (!id) return;

    const q = query(
      collection(db, 'chats', id, 'messages'),
      orderBy('createdAt', 'asc'),
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setMessages(msgs);
      setHasSyncedMessages(true);
      scrollToEnd();
    });

    return () => unsubscribe();
  }, [id, scrollToEnd]);

  useEffect(() => {
    if (!id || chatExists !== true || !hasSyncedMessages) return;
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    let cancelled = false;
    (async () => {
      try {
        const ref = firestoreDoc(db, 'chats', id);
        const snap = await getDoc(ref);
        if (!snap.exists() || cancelled) return;
        const data = snap.data();
        const prev =
          data?.reads && typeof data.reads === 'object' && data.reads !== null
            ? (data.reads as Record<string, number>)
            : {};
        await updateDoc(ref, { reads: { ...prev, [uid]: Date.now() } });
      } catch {
        /* offline / rules */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, chatExists, hasSyncedMessages, messages.length]);

  useEffect(() => {
    if (!id || chatExists !== true || !hasSyncedMessages || messages.length > 0 || bootstrapAttemptedRef.current) {
      return;
    }
    bootstrapAttemptedRef.current = true;
    (async () => {
      try {
        const welcome = 'You both joined this order 🍕';
        await addDoc(collection(db, 'chats', id, 'messages'), {
          text: welcome,
          senderId: 'system',
          sender: 'system',
          userName: 'System',
          createdAt: Date.now(),
          delivered: true,
          seen: false,
          system: true,
        });
        await updateDoc(firestoreDoc(db, 'chats', id), {
          lastMessage: welcome,
          lastMessageAt: Date.now(),
        }).catch(() => {});
      } catch {
        bootstrapAttemptedRef.current = false;
      }
    })();
  }, [id, chatExists, hasSyncedMessages, messages.length]);

  useEffect(() => {
    if (!id) return;
    if (!messages.length) return;

    const hasAI = messages.some((m) => m['sender'] === 'ai');

    if (!hasAI && !aiInsertAttemptedRef.current) {
      aiInsertAttemptedRef.current = true;
      addDoc(collection(db, 'chats', id, 'messages'), {
        text: 'Hey! I can help you coordinate your order 🍕',
        sender: 'ai',
        createdAt: Date.now(),
      }).catch(() => {
        aiInsertAttemptedRef.current = false;
      });
    }
  }, [id, messages]);

  useEffect(() => {
    if (messages.length === 0) return;
    scrollToEnd();
  }, [messages.length, scrollToEnd]);

  const myUid = auth.currentUser?.uid ?? '';

  const visibleMessages = useMemo(() => {
    const uid = myUid || undefined;
    return messages.filter((item) => {
      const senderId = String(item.senderId ?? '');
      const isSystem = senderId === 'system' || item['system'] === true;
      const isAi = item['sender'] === 'ai';
      if (isSystem || isAi) return true;
      if (!uid) return true;
      if (!peerUid) return true;
      const mine = senderId === uid;
      if (mine) return true;
      if (blockedBetween) return false;
      if (peerFlagged && senderId === peerUid) return false;
      return true;
    });
  }, [messages, peerUid, blockedBetween, peerFlagged, myUid]);

  const canSend = useMemo(
    () =>
      text.trim().length > 0 &&
      !sending &&
      !!id &&
      !blockedBetween &&
      !!myUid,
    [text, sending, id, blockedBetween, myUid],
  );

  const onSend = async () => {
    if (!canSend) return;
    if (blockedBetween) return;
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const payload = text.trim();
    setSending(true);
    try {
      await addDoc(collection(db, 'chats', id, 'messages'), {
        text: payload,
        senderId: uid,
        userName:
          auth.currentUser?.displayName ||
          auth.currentUser?.email?.split('@')[0] ||
          'User',
        createdAt: Date.now(),
      });
      await updateDoc(firestoreDoc(db, 'chats', id), {
        lastMessage: payload,
        lastMessageAt: Date.now(),
      }).catch(() => {});
      setText('');
    } catch (e) {
      showError(getUserFriendlyError(e));
    } finally {
      setSending(false);
    }
  };

  const confirmBlockPeer = () => {
    if (!myUid || !peerUid) return;
    void (async () => {
      const ok = await systemConfirm({
        title: 'Block user?',
        message: 'You will not see each other’s messages or orders.',
        confirmLabel: 'Block',
        destructive: true,
      });
      if (!ok) return;
      try {
        await blockUser(peerUid, myUid);
        setBlockedBetween(true);
        showSuccess('This user is blocked.');
      } catch (e) {
        showError(getUserFriendlyError(e));
      }
    })();
  };

  const openMessageActions = (item: ChatMessage) => {
    const sid = String(item.senderId ?? '');
    if (!peerUid || sid !== peerUid || !myUid) return;

    const openReport = () => setReportMessageId(item.id);
    const doBlock = () => confirmBlockPeer();

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', 'Report', 'Block user'],
          cancelButtonIndex: 0,
          destructiveButtonIndex: 2,
          userInterfaceStyle: 'dark',
        },
        (buttonIndex) => {
          if (buttonIndex === 1) openReport();
          if (buttonIndex === 2) doBlock();
        },
      );
    } else {
      void systemActionSheet({
        title: 'Message',
        actions: [
          { label: 'Report', onPress: openReport },
          { label: 'Block user', destructive: true, onPress: doBlock },
        ],
      });
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.back}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Chat</Text>
          <View style={{ width: 48 }} />
        </View>

        {blockedBetween ? (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>
              You have blocked this user or they blocked you. Messaging is
              disabled.
            </Text>
          </View>
        ) : null}
        {peerFlagged && !blockedBetween ? (
          <View style={styles.bannerMuted}>
            <Text style={styles.bannerText}>
              This account was flagged for review. Their messages are hidden.
            </Text>
          </View>
        ) : null}

        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator color="#34D399" />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={visibleMessages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            onContentSizeChange={scrollToEnd}
            renderItem={({ item }) => {
              const senderId = String(item.senderId ?? '');
              const isSystem = senderId === 'system' || item['system'] === true;
              const isAi = item['sender'] === 'ai';
              const mine = !isSystem && senderId === auth.currentUser?.uid;
              const label = String(item.userName ?? item.sender ?? 'User');
              const body = String(item.text ?? '');
              const createdAt = item.createdAt;
              const timeLabel = formatMessageTime(createdAt);
              const ts =
                typeof createdAt === 'number' && Number.isFinite(createdAt)
                  ? createdAt
                  : 0;
              const showSeen =
                mine &&
                !!peerUid &&
                ts > 0 &&
                (chatReads[peerUid] ?? 0) >= ts;
              const showMessageMenu =
                !isSystem &&
                !isAi &&
                !!peerUid &&
                !!myUid &&
                senderId === peerUid &&
                !blockedBetween;
              return (
                <View
                  style={[
                    styles.bubbleRow,
                    mine ? styles.bubbleRowMine : styles.bubbleRowTheirs,
                  ]}
                >
                  <View
                    style={[
                      styles.bubble,
                      mine ? styles.mine : styles.theirs,
                    ]}
                  >
                    {!isSystem ? (
                      <Text style={styles.name}>{label}</Text>
                    ) : null}
                    <Text style={styles.msg}>{body}</Text>
                    {!isSystem ? (
                      <View style={styles.metaRow}>
                        {timeLabel ? (
                          <Text style={styles.msgTime}>{timeLabel}</Text>
                        ) : null}
                        {showSeen ? (
                          <Text style={styles.seenLabel}>Seen</Text>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                  {showMessageMenu ? (
                    <TouchableOpacity
                      style={styles.msgOverflowBtn}
                      onPress={() => openMessageActions(item)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityLabel="Message actions"
                    >
                      <MaterialIcons
                        name="more-horiz"
                        size={22}
                        color="#94A3B8"
                      />
                    </TouchableOpacity>
                  ) : null}
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
            placeholder={
              blockedBetween ? 'Messaging disabled' : 'Write a message…'
            }
            placeholderTextColor="#9CA3AF"
            style={styles.input}
            onSubmitEditing={onSend}
            editable={!sending && !blockedBetween}
          />
          <TouchableOpacity
            style={[styles.sendBtn, !canSend && styles.disabled]}
            onPress={onSend}
            disabled={!canSend}
          >
            <Text style={styles.sendText}>{sending ? '…' : 'Send'}</Text>
          </TouchableOpacity>
        </View>

        <ReportUserModal
          visible={!!reportMessageId && !!peerUid && !!myUid && !!id}
          onClose={() => setReportMessageId(null)}
          reporterId={myUid}
          reportedUserId={peerUid ?? ''}
          contentId={
            reportMessageId && id
              ? reportContentIdChatMessage(id, reportMessageId)
              : ''
          }
          onSubmitted={() => showSuccess('We received your report.')}
        />
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
  bubbleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
    gap: 4,
    maxWidth: '100%',
    paddingRight: 4,
  },
  bubbleRowMine: {
    justifyContent: 'flex-end',
    alignSelf: 'flex-end',
  },
  bubbleRowTheirs: {
    justifyContent: 'flex-start',
    alignSelf: 'flex-start',
  },
  msgOverflowBtn: { padding: 4, marginTop: 4 },
  banner: {
    backgroundColor: 'rgba(248,113,113,0.12)',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#3F2A2A',
  },
  bannerMuted: {
    backgroundColor: 'rgba(251,191,36,0.1)',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#3F3829',
  },
  bannerText: { color: '#E5E7EB', fontSize: 13, lineHeight: 18 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { padding: 12, paddingBottom: 20 },
  bubble: { maxWidth: '76%', borderRadius: 14, padding: 10 },
  mine: { alignSelf: 'flex-end', backgroundColor: '#10241D' },
  theirs: { alignSelf: 'flex-start', backgroundColor: '#141922' },
  name: { color: '#6EE7B7', fontSize: 12, fontWeight: '700', marginBottom: 4 },
  msg: { color: '#F3F4F6', fontSize: 14 },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
    justifyContent: 'flex-end',
  },
  msgTime: { color: '#6B7280', fontSize: 11 },
  seenLabel: { color: '#34D399', fontSize: 11, fontWeight: '600' },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: '#1F2937',
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
  sendText: { color: '#052E1A', fontWeight: '800' },
  disabled: { opacity: 0.6 },
  empty: { color: '#9CA3AF' },
  error: { color: '#FCA5A5', marginTop: 6 },
});
