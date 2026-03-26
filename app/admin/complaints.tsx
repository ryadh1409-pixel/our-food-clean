import { useAuth } from '@/services/AuthContext';
import { db } from '@/services/firebase';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
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

type Complaint = {
  id: string;
  userId: string;
  userEmail: string;
  message: string;
  createdAt: number;
  status: 'new' | 'read';
};

function formatDate(ms: number): string {
  const d = new Date(ms);
  const day = d.getDate();
  const month = d.toLocaleString('en-CA', { month: 'short' });
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
}

export default function AdminComplaintsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);

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

    const complaintsRef = collection(db, 'complaints');
    const q = query(complaintsRef, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const list: Complaint[] = snap.docs.map((doc) => {
          const data = doc.data();
          const createdAt =
            data?.createdAt?.toMillis?.() ?? data?.createdAt ?? 0;
          return {
            id: doc.id,
            userId: typeof data?.userId === 'string' ? data.userId : '',
            userEmail:
              typeof data?.userEmail === 'string' ? data.userEmail : '',
            message: typeof data?.message === 'string' ? data.message : '',
            createdAt: Number(createdAt),
            status: data?.status === 'read' ? 'read' : 'new',
          };
        });
        setComplaints(list);
        setLoading(false);
      },
      (err) => {
        console.warn('Complaints listener error:', err);
        setLoading(false);
      },
    );

    return () => unsubscribe();
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

  if (loading && complaints.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading complaints...</Text>
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
      <Text style={styles.title}>Admin - User Complaints</Text>
      <FlatList
        data={complaints}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No complaints yet.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>User:</Text>
            <Text style={styles.cardEmail}>{item.userEmail || '—'}</Text>
            <Text style={styles.cardLabel}>Message:</Text>
            <Text style={styles.cardMessage}>{item.message}</Text>
            <Text style={styles.cardLabel}>Date:</Text>
            <Text style={styles.cardDate}>{formatDate(item.createdAt)}</Text>
            <View style={styles.badgeRow}>
              <Text style={styles.cardLabel}>Status:</Text>
              <View
                style={[styles.badge, item.status === 'new' && styles.badgeNew]}
              >
                <Text style={styles.badgeText}>
                  {item.status === 'new' ? 'NEW' : 'READ'}
                </Text>
              </View>
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
  cardLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMuted,
    marginTop: 8,
    marginBottom: 2,
  },
  cardEmail: {
    fontSize: 15,
    color: COLORS.text,
  },
  cardMessage: {
    fontSize: 14,
    color: COLORS.text,
    marginBottom: 4,
  },
  cardDate: {
    fontSize: 14,
    color: COLORS.textMuted,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: COLORS.border,
  },
  badgeNew: {
    backgroundColor: COLORS.accentBlue,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.card,
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
  empty: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 15,
    color: COLORS.textMuted,
  },
});
