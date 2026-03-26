import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { gradients, spacing } from '@/theme/theme';

type Props = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

/** Full-width horizontal green → orange bar (e.g. section headers). */
export function BrandBanner({ children, style }: Props) {
  const g = gradients.brandHorizontal;
  return (
    <LinearGradient
      colors={[g.colors[0], g.colors[1]]}
      start={g.start}
      end={g.end}
      style={[styles.banner, style]}
    >
      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  banner: {
    paddingVertical: 18,
    paddingHorizontal: spacing.screen,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
