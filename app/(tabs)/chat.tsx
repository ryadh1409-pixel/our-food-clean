import * as Haptics from 'expo-haptics';
import { ScreenFadeIn } from '@/components/ScreenFadeIn';
import { ShimmerSkeleton } from '@/components/ShimmerSkeleton';
import { useAuth } from '@/services/AuthContext';
import { db } from '@/services/firebase';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '@/constants/theme';
import { runTapScale } from '@/utils/motion';

const ACCENT = '#34D399';
const D = {
  bg: '#06080C',
  card: '#11161F',
  border: 'rgba(255,255,255,0.1)',
  text: '#F8FAFC',
  muted: 'rgba(248,250,252,0.55)',
  chipBg: 'rgba(255,255,255,0.06)',
  chipActive: 'rgba(52, 211, 153, 0.18)',
  chipActiveBorder: 'rgba(52, 211, 153, 0.4)',
};

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

export default function ChatTabScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>('all');
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const listScale = useRef(new Animated.Value(1)).current;

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
        runTapScale(listScale);
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
    const created = m.createdAt;
    if (!created) return '';
    const ms =
      typeof created === 'number'
        ? created
        : (created as { toMillis: () => number }).toMillis?.();
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
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar style="light" />
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Messages</Text>
        </View>
        <View style={styles.centered}>
          <Text style={styles.hint}>Sign in to view your messages.</Text>
          <TouchableOpacity
            style={styles.signInBtn}
            onPress={() =>
              router.push('/(auth)/login?redirectTo=/(tabs)/chat')
            }
          >
            <Text style={styles.signInBtnText}>Sign in</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar style="light" />
      <ScreenFadeIn style={{ flex: 1 }}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Messages</Text>
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
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setActiveTab(tab.id);
              }}
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
          <View style={styles.skeletonWrap}>
            <ShimmerSkeleton
              width="100%"
              height={70}
              borderRadius={16}
              style={styles.skeletonItem}
            />
            <ShimmerSkeleton
              width="100%"
              height={70}
              borderRadius={16}
              style={styles.skeletonItem}
            />
            <ShimmerSkeleton width="100%" height={70} borderRadius={16} />
            <ActivityIndicator
              size="small"
              color={ACCENT}
              style={{ marginTop: 14 }}
            />
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>💬</Text>
            <Text style={styles.emptyText}>No messages</Text>
            <Text style={styles.emptyHint}>
              New order chats and updates will appear here.
            </Text>
          </View>
        ) : (
          <Animated.View style={{ flex: 1, transform: [{ scale: listScale }] }}>
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
          </Animated.View>
        )}
      </ScreenFadeIn>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: D.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: D.border,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: D.text,
  },
  tabsScroll: {
    maxHeight: 52,
    borderBottomWidth: 1,
    borderBottomColor: D.border,
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
    backgroundColor: D.chipBg,
  },
  tabActive: {
    backgroundColor: D.chipActive,
    borderWidth: 1,
    borderColor: D.chipActiveBorder,
  },
  tabText: {
    fontSize: 15,
    fontWeight: '500',
    color: D.muted,
  },
  tabTextActive: {
    color: '#ECFDF5',
    fontWeight: '700',
  },
  listContent: {
    padding: 16,
    paddingBottom: 32,
  },
  messageCard: {
    backgroundColor: D.card,
    borderWidth: 1,
    borderColor: D.border,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.tight,
  },
  messageTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: D.text,
    marginBottom: 4,
  },
  messageBody: {
    fontSize: 14,
    color: D.muted,
    marginBottom: 8,
  },
  messageDate: {
    fontSize: 12,
    color: D.muted,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 48,
  },
  emptyText: {
    fontSize: 16,
    color: D.muted,
    marginTop: 6,
    fontWeight: '700',
  },
  emptyIcon: {
    fontSize: 26,
    marginBottom: 2,
  },
  emptyHint: {
    marginTop: 6,
    fontSize: 13,
    color: D.muted,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  skeletonWrap: {
    padding: 16,
    paddingTop: 22,
  },
  skeletonItem: {
    marginBottom: 10,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  hint: {
    fontSize: 16,
    color: D.muted,
    textAlign: 'center',
  },
  signInBtn: {
    marginTop: 20,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(52, 211, 153, 0.22)',
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.45)',
  },
  signInBtnText: {
    color: '#A7F3D0',
    fontWeight: '700',
    fontSize: 16,
  },
});
