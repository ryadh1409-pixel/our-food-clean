import { theme } from '@/constants/theme';
import { Image } from 'expo-image';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { PopularPizza } from '@/services/api';

const c = theme.colors;

export type PizzaItemProps = {
  item: PopularPizza;
};

export function PizzaItem({ item }: PizzaItemProps) {
  return (
    <View style={styles.row}>
      <Image
        source={{ uri: item.image }}
        style={styles.thumb}
        contentFit="cover"
        transition={200}
      />
      <View style={styles.textCol}>
        <Text style={styles.name} numberOfLines={2}>
          {item.name}
        </Text>
        <Text style={styles.price}>${item.price.toFixed(2)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: c.surfaceDark,
  },
  textCol: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    color: c.white,
    fontSize: 15,
    fontWeight: '700',
  },
  price: {
    marginTop: 4,
    color: '#6EE7B7',
    fontSize: 16,
    fontWeight: '800',
  },
});
