import { theme } from '@/constants/theme';
import type { PlaceRestaurant } from '@/services/googlePlaces';
import { Image } from 'expo-image';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const c = theme.colors;
const CARD_W = 220;
const IMG_H = 120;

export type RestaurantCardProps = {
  item: PlaceRestaurant;
  onSelect: (item: PlaceRestaurant) => void;
};

export function RestaurantCard({ item, onSelect }: RestaurantCardProps) {
  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.88}
      onPress={() => onSelect(item)}
      accessibilityRole="button"
      accessibilityLabel={`${item.name}, rating ${item.rating.toFixed(1)}`}
    >
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
          ⭐ {item.rating.toFixed(1)}
          {item.distance ? ` · ${item.distance}` : ''}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

export function restaurantCardKeyExtractor(item: PlaceRestaurant) {
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
    gap: 4,
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
});
