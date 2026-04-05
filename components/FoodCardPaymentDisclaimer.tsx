import {
  COORDINATION_CARD_DISCLAIMER,
  COORDINATION_ORDER_DETAIL_DISCLAIMER,
} from '@/constants/paymentDisclaimer';
import React from 'react';
import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';

type Props = {
  style?: StyleProp<TextStyle>;
  /**
   * `card` — short line under order/food cards.
   * `detail` — longer copy on the order detail screen.
   */
  variant?: 'card' | 'detail';
};

export function FoodCardPaymentDisclaimer({ style, variant = 'card' }: Props) {
  const copy =
    variant === 'detail'
      ? COORDINATION_ORDER_DETAIL_DISCLAIMER
      : COORDINATION_CARD_DISCLAIMER;
  return (
    <Text style={[variant === 'detail' ? styles.detail : styles.card, style]}>
      {copy}
    </Text>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 8,
    fontSize: 10,
    lineHeight: 14,
    color: 'rgba(148, 163, 184, 0.62)',
    fontWeight: '500',
    flexShrink: 1,
    letterSpacing: 0.1,
  },
  detail: {
    marginTop: 12,
    fontSize: 12,
    lineHeight: 17,
    color: 'rgba(148, 163, 184, 0.7)',
    fontWeight: '500',
    flexShrink: 1,
    letterSpacing: 0.15,
  },
});
