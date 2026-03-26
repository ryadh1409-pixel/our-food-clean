import { useNearbyOrders } from '@/hooks/useNearbyOrders';
import { useRouter } from 'expo-router';
import React from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { shadows, theme } from '@/constants/theme';

const c = theme.colors;

export default function MapScreenWeb() {
  const router = useRouter();
  const { userLocation, orders, loading, error, refetch } = useNearbyOrders();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Text style={styles.title}>Nearby Orders</Text>
      {!userLocation ? (
        <Text style={styles.hint}>Allow location to see orders near you.</Text>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={c.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={refetch} />
          }
        >
          {orders.length === 0 ? (
            <Text style={styles.empty}>No nearby orders within 3 km.</Text>
          ) : (
            orders.map((order) => (
              <TouchableOpacity
                key={order.id}
                style={styles.card}
                onPress={() => router.push(`/order/${order.id}` as const)}
              >
                <Text style={styles.cardTitle}>{order.restaurantName}</Text>
                <Text style={styles.cardRow}>Meal: {order.mealType}</Text>
                <Text style={styles.cardRow}>
                  Total: ${order.totalPrice.toFixed(2)} · Share: $
                  {order.sharePrice.toFixed(2)}
                </Text>
                <Text style={styles.cardRow}>By: {order.userName}</Text>
                <Text style={styles.joinLabel}>Tap to join</Text>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/order/create')}
      >
        <Text style={styles.fabText}>Create Order</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: c.text,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  hint: {
    fontSize: 14,
    color: c.textMuted,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  error: {
    fontSize: 14,
    color: c.dangerText,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: 16, paddingBottom: 100 },
  empty: {
    fontSize: 16,
    color: c.textMuted,
    textAlign: 'center',
    marginTop: 24,
  },
  card: {
    backgroundColor: c.white,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.tight,
    ...shadows.card,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: c.text,
    marginBottom: 8,
  },
  cardRow: { fontSize: 14, color: c.textSlateDark, marginBottom: 4 },
  joinLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: c.success,
    marginTop: 8,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    alignSelf: 'center',
    backgroundColor: c.primary,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  fabText: { color: c.textOnPrimary, fontSize: 16, fontWeight: '600' },
});
