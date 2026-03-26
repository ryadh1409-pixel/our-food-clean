import type { NearbyOrder } from '@/hooks/useNearbyOrders';
import { Marker } from '@/components/SafeMap';
import { theme } from '@/constants/theme';
import React from 'react';

const c = theme.colors;
import { Platform, StyleSheet, Text, View } from 'react-native';

const MEAL_ICONS: Record<string, string> = {
  pizza: '🍕',
  burger: '🍔',
  sushi: '🍣',
};

function getMealIcon(mealType: string): string {
  const key = (mealType || '').toLowerCase();
  return MEAL_ICONS[key] ?? '🍽️';
}

type OrderMarkerProps = {
  order: NearbyOrder;
  onPress: () => void;
  isCluster?: boolean;
  count?: number;
};

/**
 * Marker for an order on the demand map. Icon by food type: pizza, burger, sushi.
 * Web: no-op (Marker from SafeMap returns null on web).
 */
export default function OrderMarker({
  order,
  onPress,
  isCluster = false,
  count = 1,
}: OrderMarkerProps) {
  if (Platform.OS === 'web') return null;

  const icon = getMealIcon(order.mealType);

  return (
    <Marker
      coordinate={{ latitude: order.latitude, longitude: order.longitude }}
      title={order.restaurantName}
      description={order.mealType}
      onPress={onPress}
      tracksViewChanges={false}
    >
      <View style={styles.marker}>
        <Text style={styles.icon}>{icon}</Text>
        {isCluster && count > 1 ? (
          <Text style={styles.count}>{count}</Text>
        ) : null}
      </View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  marker: {
    backgroundColor: c.white,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: c.primary,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 36,
    flexDirection: 'row',
  },
  icon: { fontSize: 18 },
  count: {
    fontSize: 12,
    fontWeight: '700',
    color: c.text,
    marginLeft: 2,
  },
});
