import DemandMap from '@/components/DemandMap';
import { useRouter } from 'expo-router';
import React from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '@/constants/theme';

const c = theme.colors;

export default function MapScreenNative() {
  const router = useRouter();

  const handleJoinOrder = (orderId: string) => {
    router.push(`/match/${orderId}` as const);
  };

  if (Platform.OS === 'web') {
    return (
      <SafeAreaView style={[styles.container, styles.centered]}>
        <View style={styles.header}>
          <Text style={styles.title}>Live Demand Map</Text>
        </View>
        <View style={styles.mapPlaceholder}>
          <Text style={styles.mapPlaceholderText}>
            Map available on mobile only
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Live Demand Map</Text>
      </View>
      <DemandMap onJoinOrder={handleJoinOrder} style={styles.demandMap} />
      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/(tabs)/index')}
      >
        <Text style={styles.fabText}>Go to Swipe</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  centered: { justifyContent: 'center', alignItems: 'center' },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    backgroundColor: c.lightGray,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: c.text,
  },
  demandMap: { flex: 1, margin: 12 },
  fab: {
    position: 'absolute',
    bottom: 24,
    alignSelf: 'center',
    backgroundColor: c.primary,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    ...Platform.select({
      ios: {
        shadowColor: c.shadow,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
      },
      android: { elevation: 4 },
    }),
  },
  fabText: { color: c.textOnPrimary, fontSize: 16, fontWeight: '600' },
  mapPlaceholder: {
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: c.surface,
  },
  mapPlaceholderText: {
    fontSize: 14,
    color: c.textMuted,
  },
});
