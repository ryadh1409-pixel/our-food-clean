import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, type ViewStyle } from 'react-native';

import { gradients } from '@/theme/theme';

type Props = {
  height?: number;
  style?: ViewStyle | ViewStyle[];
  /** Use horizontal green → orange */
  variant?: 'diagonal' | 'horizontal';
};

export function BrandGradientBar({
  height = 4,
  style,
  variant = 'diagonal',
}: Props) {
  const g =
    variant === 'horizontal' ? gradients.brandHorizontal : gradients.brand;
  return (
    <LinearGradient
      colors={[g.colors[0], g.colors[1]]}
      start={g.start}
      end={g.end}
      style={[styles.bar, { height }, style]}
    />
  );
}

const styles = StyleSheet.create({
  bar: {
    width: '100%',
  },
});
