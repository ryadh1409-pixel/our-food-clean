import { useAuth } from '@/services/AuthContext';
import { db } from '@/services/firebase';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { adminCardShell, adminColors as COLORS } from '@/constants/adminTheme';

const ADMIN_EMAIL = 'support@halforder.app';

type NotificationItem = {
  id: string;
  title: string;
  body: string;
  createdAt: number;
  sentTo: string[];
  receivedCount: number;
  openedCount: number;
};

export default function AdminNotificationsTrackingScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = user?.email === ADMIN_EMAIL;

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    if (user.email !== ADMIN_EMAIL) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchData() {
      try {
        const [notifSnap, logsSnap] = await Promise.all([
          getDocs(
            query(
              collection(db, 'notifications'),
              orderBy('createdAt', 'desc'),
            ),
          ),
          getDocs(collection(db, 'notification_logs')),
        ]);

        if (cancelled) return;

        const byNotifId: Record<string, { received: number; opened: number }> =
          {};
        logsSnap.docs.forEach((doc) => {
          const d = doc.data();
          const nid = d?.notificationId;
          if (typeof nid !== 'string') return;
          if (!byNotifId[nid]) byNotifId[nid] = { received: 0, opened: 0 };
          if (d?.status === 'received') byNotifId[nid].received += 1;
          if (d?.status === 'opened') byNotifId[nid].opened += 1;
        });

        const list: NotificationItem[] = notifSnap.docs.map((doc) => {
          const d = doc.data();
          const sentTo = Array.isArray(d?.sentTo) ? d.sentTo : [];
          const created = d?.createdAt?.toMillis?.() ?? d?.createdAt ?? 0;
          const counts = byNotifId[doc.id] ?? { received: 0, opened: 0 };
          return {
            id: doc.id,
            title: typeof d?.title === 'string' ? d.title : '—',
            body: typeof d?.body === 'string' ? d.body : '',
            createdAt: Number(created),
            sentTo,
            receivedCount: counts.received,
            openedCount: counts.opened,
          };
        });
        setItems(list);
        setError(null);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load');
          setItems([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!user) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centered}>
          <Text style={styles.unauthorized}>You are not authorized</Text>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backBtn}
          >
            <Text style={styles.backBtnText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centered}>
          <Text style={styles.unauthorized}>You are not authorized</Text>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backBtn}
          >
            <Text style={styles.backBtnText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (loading && items.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading...</Text>
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
      </View>
      <Text style={styles.title}>Notification Tracking</Text>
      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No notifications sent yet.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Title: {item.title}</Text>
            <View style={styles.row}>
              <Text style={styles.cardLabel}>Sent:</Text>
              <Text style={styles.cardValue}>{item.sentTo.length}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.cardLabel}>Received:</Text>
              <Text style={styles.cardValue}>{item.receivedCount}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.cardLabel}>Opened:</Text>
              <Text style={styles.cardValue}>{item.openedCount}</Text>
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  backText: {
    fontSize: 16,
    color: COLORS.primary,
    fontWeight: '600',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 8,
  },
  listContent: {
    padding: 16,
    paddingBottom: 32,
  },
  card: {
    ...adminCardShell,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  cardLabel: {
    fontSize: 14,
    color: COLORS.textMuted,
    marginRight: 8,
    minWidth: 80,
  },
  cardValue: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  unauthorized: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.error,
    textAlign: 'center',
    marginBottom: 16,
  },
  backBtn: {
    marginTop: 8,
  },
  backBtnText: {
    fontSize: 16,
    color: COLORS.primary,
    fontWeight: '600',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: COLORS.textMuted,
  },
  errorBox: {
    backgroundColor: COLORS.dangerBg,
    padding: 12,
    borderRadius: 8,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  errorText: {
    fontSize: 14,
    color: COLORS.error,
  },
  empty: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 15,
    color: COLORS.textMuted,
  },
});
