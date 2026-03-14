import { useAuth } from '@/services/AuthContext';
import { db } from '@/services/firebase';
import {
  collection,
  getDocs,
  query,
  Timestamp,
  where,
} from 'firebase/firestore';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import SafeMap, { Marker } from '@/components/SafeMap';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const ADMIN_EMAIL = 'support@halforder.app';

const COLORS = {
  background: '#F5F5F5',
  text: '#000000',
  textMuted: '#666666',
  primary: '#FFD700',
  border: '#E5E5E5',
  error: '#B91C1C',
} as const;

type ActivityPoint = {
  id: string;
  userId: string;
  userEmail: string;
  latitude: number;
  longitude: number;
  time: number;
};

const DEFAULT_REGION = {
  latitude: 43.6532,
  longitude: -79.3832,
  latitudeDelta: 0.1,
  longitudeDelta: 0.1,
};

export default function AdminActivityMapScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [points, setPoints] = useState<ActivityPoint[]>([]);
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

    async function fetchActivity() {
      try {
        const cutoff = Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000);
        const q = query(
          collection(db, 'user_activity'),
          where('time', '>=', cutoff),
        );
        const snap = await getDocs(q);
        if (cancelled) return;
        const list: ActivityPoint[] = [];
        snap.docs.forEach((doc) => {
          const d = doc.data();
          const lat = d?.latitude;
          const lng = d?.longitude;
          if (typeof lat !== 'number' || typeof lng !== 'number') return;
          const timeMs = d?.time?.toMillis?.() ?? d?.time ?? 0;
          list.push({
            id: doc.id,
            userId: typeof d?.userId === 'string' ? d.userId : '',
            userEmail: typeof d?.userEmail === 'string' ? d.userEmail : '',
            latitude: lat,
            longitude: lng,
            time: Number(timeMs),
          });
        });
        setPoints(list);
        setError(null);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load activity');
          setPoints([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchActivity();
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

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading activity...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const initialRegion =
    points.length > 0
      ? {
          latitude: points[0].latitude,
          longitude: points[0].longitude,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }
      : DEFAULT_REGION;

  if (Platform.OS === 'web') {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.title}>Admin Activity Map</Text>
        <View style={styles.webPlaceholder}>
          <Text style={styles.webPlaceholderText}>
            Activity map is available on iOS and Android.
          </Text>
          <Text style={styles.pointsCount}>
            {points.length} points (last 24h)
          </Text>
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
        <Text style={styles.headerTitle}>Admin Activity Map</Text>
      </View>
      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
      <View style={styles.mapContainer}>
        <SafeMap
          style={styles.map}
          initialRegion={initialRegion}
          showsUserLocation={false}
        >
          {points.map((item) => (
            <Marker
              key={item.id}
              coordinate={{
                latitude: item.latitude,
                longitude: item.longitude,
              }}
              title={item.userEmail || item.userId || 'User'}
            />
          ))}
        </SafeMap>
      </View>
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          {points.length} activity point{points.length === 1 ? '' : 's'} (last
          24 hours)
        </Text>
      </View>
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
    backgroundColor: '#FFFFFF',
  },
  backText: {
    fontSize: 16,
    color: COLORS.primary,
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    marginLeft: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 8,
  },
  mapContainer: {
    flex: 1,
    minHeight: 300,
  },
  map: {
    width: '100%',
    height: '100%',
  },
  mapPlaceholder: {
    flex: 1,
    minHeight: 300,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.border,
  },
  mapPlaceholderText: {
    fontSize: 16,
    color: COLORS.textMuted,
  },
  footer: {
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  footerText: {
    fontSize: 14,
    color: COLORS.textMuted,
    textAlign: 'center',
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
    backgroundColor: '#FEE2E2',
    padding: 12,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 8,
  },
  errorText: {
    fontSize: 14,
    color: COLORS.error,
  },
  webPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  webPlaceholderText: {
    fontSize: 16,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
  pointsCount: {
    fontSize: 14,
    color: COLORS.textMuted,
    marginTop: 8,
  },
});
