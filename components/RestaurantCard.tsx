import { theme } from '@/constants/theme';
import { Image } from 'expo-image';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { NearbyRestaurant } from '@/services/api';

const c = theme.colors;
const CARD_W = 220;
const IMG_H = 112;

export type RestaurantCardProps = {
  item: NearbyRestaurant;
  onSelect: (item: NearbyRestaurant) => void;
};

export function RestaurantCard({ item, onSelect }: RestaurantCardProps) {
  return (
    <View style={styles.card}>
      <Image
        source={{ uri: item.image }}
        style={styles.image}
        contentFit="cover"
        transition={200}
      />
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={2}>
          {item.name}
        </Text>
        <Text style={styles.meta}>
          ⭐ {item.rating.toFixed(1)} · {item.distance}
        </Text>
        <TouchableOpacity
          style={styles.selectBtn}
          onPress={() => onSelect(item)}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`Select ${item.name}`}
        >
          <Text style={styles.selectText}>Select</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export function restaurantCardKeyExtractor(item: NearbyRestaurant) {
  return item.id;
}

const styles = StyleSheet.create({
  card: {
    width: CARD_W,
    marginRight: 12,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: c.surfaceDarkElevated,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  image: {
    width: '100%',
    height: IMG_H,
    backgroundColor: c.surfaceDark,
  },
  body: {
    padding: 12,
    gap: 6,
  },
  name: {
    color: c.white,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
  },
  meta: {
    color: 'rgba(248,250,252,0.65)',
    fontSize: 13,
    fontWeight: '600',
  },
  selectBtn: {
    marginTop: 4,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(110, 231, 183, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(110, 231, 183, 0.45)',
    alignItems: 'center',
  },
  selectText: {
    color: '#6EE7B7',
    fontSize: 14,
    fontWeight: '800',
  },
});
