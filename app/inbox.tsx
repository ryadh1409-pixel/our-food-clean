import { useAuth } from '@/services/AuthContext';
import { db } from '@/services/firebase';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { shadows, theme } from '@/constants/theme';

const c = theme.colors;

type TabId = 'all' | 'offers' | 'support' | 'updates' | 'priority';

type InboxMessage = {
  id: string;
  type?: string;
  title?: string;
  body?: string;
  createdAt?: { toMillis: () => number } | number;
  priority?: boolean;
};

const TABS: { id: TabId; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'offers', label: 'Offers' },
  { id: 'support', label: 'Support' },
  { id: 'updates', label: 'Updates' },
  { id: 'priority', label: 'Priority' },
];

export default function InboxScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>('all');
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [loading, setLoading] = useState(true);

  const uid = user?.uid ?? null;

  useEffect(() => {
    if (!uid) {
      setLoading(false);
      setMessages([]);
      return;
    }
    const messagesRef = collection(db, 'users', uid, 'messages');
    const q = query(messagesRef);
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: InboxMessage[] = [];
        snap.docs.forEach((d) => {
          const data = d.data();
          list.push({
            id: d.id,
            type: data?.type,
            title: data?.title,
            body: data?.body,
            createdAt: data?.createdAt,
            priority: data?.priority === true,
          });
        });
        list.sort((a, b) => {
          const ma =
            typeof a.createdAt === 'number'
              ? a.createdAt
              : ((a.createdAt as { toMillis?: () => number })?.toMillis?.() ??
                0);
          const mb =
            typeof b.createdAt === 'number'
              ? b.createdAt
              : ((b.createdAt as { toMillis?: () => number })?.toMillis?.() ??
                0);
          return mb - ma;
        });
        setMessages(list);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return () => unsub();
  }, [uid]);

  const filtered = messages.filter((m) => {
    if (activeTab === 'all') return true;
    if (activeTab === 'offers')
      return m.type === 'offers' || m.type === 'promo';
    if (activeTab === 'support') return m.type === 'support';
    if (activeTab === 'updates') return m.type === 'updates';
    if (activeTab === 'priority') return m.priority === true;
    return true;
  });

  const getMessageDate = (m: InboxMessage) => {
    const c = m.createdAt;
    if (!c) return '';
    const ms =
      typeof c === 'number'
        ? c
        : (c as { toMillis: () => number }).toMillis?.();
    if (!ms) return '';
    const d = new Date(ms);
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  if (!uid) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.centered}>
          <Text style={styles.hint}>Sign in to view your inbox.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Inbox</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabsScroll}
        contentContainerStyle={styles.tabsContent}
      >
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab.id}
            style={[styles.tab, activeTab === tab.id && styles.tabActive]}
            onPress={() => setActiveTab(tab.id)}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === tab.id && styles.tabTextActive,
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      {loading ? (
        <ActivityIndicator
          size="large"
          color={c.primary}
          style={{ marginTop: 48 }}
        />
      ) : filtered.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No messages</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        >
          {filtered.map((m) => (
            <View key={m.id} style={styles.messageCard}>
              <Text style={styles.messageTitle} numberOfLines={1}>
                {m.title ?? 'Message'}
              </Text>
              <Text style={styles.messageBody} numberOfLines={2}>
                {m.body ?? ''}
              </Text>
              <Text style={styles.messageDate}>{getMessageDate(m)}</Text>
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  backText: {
    fontSize: 16,
    color: c.primary,
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: c.text,
    marginLeft: 16,
  },
  tabsScroll: {
    maxHeight: 52,
    borderBottomWidth: 1,
    borderBottomColor: c.borderSubtle,
  },
  tabsContent: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
    alignItems: 'center',
  },
  tab: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    marginRight: 8,
  },
  tabActive: {
    backgroundColor: c.warningSoft,
  },
  tabText: {
    fontSize: 15,
    fontWeight: '500',
    color: c.textSlateDark,
  },
  tabTextActive: {
    color: c.text,
    fontWeight: '700',
  },
  listContent: {
    padding: 16,
    paddingBottom: 32,
  },
  messageCard: {
    backgroundColor: c.background,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.tight,
    ...shadows.card,
  },
  messageTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: c.text,
    marginBottom: 4,
  },
  messageBody: {
    fontSize: 14,
    color: c.textMuted,
    marginBottom: 8,
  },
  messageDate: {
    fontSize: 12,
    color: c.textMuted,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 48,
  },
  emptyText: {
    fontSize: 16,
    color: c.textMuted,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  hint: {
    fontSize: 16,
    color: c.textMuted,
  },
});
