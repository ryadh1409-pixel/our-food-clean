import OrderMarker from '@/components/OrderMarker';
import SafeMap from '@/components/SafeMap';
import {
  useNearbyOrdersRealtime,
  type NearbyOrder,
} from '@/hooks/useNearbyOrders';
import { haversineDistanceKm } from '@/lib/haversine';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const DEMAND_MAP_RADIUS_KM = 0.5;
const CLUSTER_GRID_DEG = 0.003;

type Cluster = {
  key: string;
  orders: NearbyOrder[];
  latitude: number;
  longitude: number;
};

function clusterOrders(orders: NearbyOrder[]): Cluster[] {
  const cells = new Map<string, NearbyOrder[]>();
  orders.forEach((o) => {
    const lat = Math.round(o.latitude / CLUSTER_GRID_DEG) * CLUSTER_GRID_DEG;
    const lng = Math.round(o.longitude / CLUSTER_GRID_DEG) * CLUSTER_GRID_DEG;
    const key = `${lat},${lng}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key)!.push(o);
  });
  return Array.from(cells.entries()).map(([key, list]) => ({
    key,
    orders: list,
    latitude: list[0].latitude,
    longitude: list[0].longitude,
  }));
}

type DemandMapProps = {
  onJoinOrder: (orderId: string) => void;
  style?: object;
};

/**
 * Live Demand Map: real-time map of nearby open orders (500m).
 * Markers by food type; clustering; tap opens order preview card.
 * Web: placeholder (react-native-maps is native-only).
 */
export default function DemandMap({ onJoinOrder, style }: DemandMapProps) {
  const { userLocation, orders, loading, error, refetch } =
    useNearbyOrdersRealtime(DEMAND_MAP_RADIUS_KM);
  const [selectedOrder, setSelectedOrder] = useState<NearbyOrder | null>(null);

  const clusters = useMemo(() => clusterOrders(orders), [orders]);

  const region = userLocation
    ? {
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      }
    : {
        latitude: 43.6532,
        longitude: -79.3832,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      };

  const distanceKm =
    selectedOrder && userLocation
      ? haversineDistanceKm(
          userLocation.latitude,
          userLocation.longitude,
          selectedOrder.latitude,
          selectedOrder.longitude,
        )
      : 0;
  const distanceLabel =
    distanceKm < 1
      ? `${Math.round(distanceKm * 1000)} m`
      : `${distanceKm.toFixed(1)} km`;

  if (Platform.OS === 'web') {
    return (
      <View style={[styles.placeholder, style]}>
        <Text style={styles.placeholderText}>Live map available on mobile</Text>
      </View>
    );
  }

  if (loading && !userLocation) {
    return (
      <View style={[styles.centered, style]}>
        <ActivityIndicator size="large" color="#FFD700" />
        <Text style={styles.loadingText}>Getting location...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.centered, style]}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={refetch}>
          <Text style={styles.retryBtnText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.wrapper, style]}>
      <SafeMap style={styles.map} initialRegion={region} showsUserLocation>
        {clusters.map((cluster) => {
          const order = cluster.orders[0];
          const isCluster = cluster.orders.length > 1;
          return (
            <OrderMarker
              key={cluster.key}
              order={{
                ...order,
                latitude: cluster.latitude,
                longitude: cluster.longitude,
              }}
              onPress={() => setSelectedOrder(order)}
              isCluster={isCluster}
              count={cluster.orders.length}
            />
          );
        })}
      </SafeMap>

      {selectedOrder ? (
        <View style={styles.previewCard}>
          <Text style={styles.previewRestaurant}>
            {selectedOrder.restaurantName}
          </Text>
          <Text style={styles.previewMeal}>{selectedOrder.mealType}</Text>
          <Text style={styles.previewDistance}>{distanceLabel} away</Text>
          <TouchableOpacity
            style={styles.joinBtn}
            onPress={() => {
              onJoinOrder(selectedOrder.id);
              setSelectedOrder(null);
            }}
          >
            <Text style={styles.joinBtnText}>Join Order</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={() => setSelectedOrder(null)}
          >
            <Text style={styles.closeBtnText}>Close</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { height: 320, position: 'relative' },
  map: { flex: 1, borderRadius: 12 },
  placeholder: {
    height: 200,
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: { color: '#8E8E93', fontSize: 14 },
  centered: {
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: { marginTop: 8, color: '#666', fontSize: 14 },
  errorText: { color: '#c00', fontSize: 14, marginBottom: 8 },
  retryBtn: {
    backgroundColor: '#FFD700',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  retryBtnText: { fontWeight: '600', color: '#000' },
  previewCard: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    right: 12,
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  previewRestaurant: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
    marginBottom: 4,
  },
  previewMeal: { fontSize: 14, color: '#666', marginBottom: 4 },
  previewDistance: { fontSize: 13, color: '#888', marginBottom: 12 },
  joinBtn: {
    backgroundColor: '#FFD700',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 8,
  },
  joinBtnText: { fontWeight: '700', color: '#000', fontSize: 16 },
  closeBtn: { alignItems: 'center' },
  closeBtnText: { fontSize: 14, color: '#666' },
});
