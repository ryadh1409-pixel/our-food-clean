import { theme } from '@/constants/theme';
import { Image } from 'expo-image';
import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';

/** Square HalfOrder mark — use with `resizeMode` / `contentFit` contain only (no stretch). */
export const LOGO_SOURCE = require('../assets/images/logo.png');

type AppLogoProps = {
  /**
   * Square edge length (dp). Recommended for headers / splash-style blocks.
   * If omitted, uses `width`/`height` legacy or a responsive default.
   */
  size?: number;
  /** @deprecated Prefer `size` (square). If both set, the smaller edge defines the square box. */
  width?: number;
  height?: number;
  marginTop?: number;
  /** Extra wrapper styles (e.g. alignSelf for rows). */
  style?: ViewStyle;
  /** Large home-style logo (caps size from screen width). */
  variant?: 'default' | 'hero';
};

/**
 * HalfOrder logo — always drawn in a square bounds with contain so the asset is never distorted.
 */
export default function AppLogo({
  size,
  width: widthProp,
  height: heightProp,
  marginTop = 0,
  style,
  variant = 'default',
}: AppLogoProps) {
  const { width: windowWidth } = useWindowDimensions();
  const [loadFailed, setLoadFailed] = useState(false);

  let side: number;
  if (size != null) {
    side = size;
  } else if (widthProp != null || heightProp != null) {
    const w = widthProp ?? heightProp ?? 120;
    const h = heightProp ?? w;
    side = Math.min(w, h);
  } else if (variant === 'hero') {
    side = Math.min(240, Math.round(windowWidth * 0.5));
  } else {
    /** Default inline / stacked headers — moderate, responsive, never full-width. */
    side = Math.min(140, Math.round(windowWidth * 0.36));
  }

  if (loadFailed) {
    return (
      <View style={[styles.fallbackWrap, { marginTop }, style]}>
        <Text style={styles.fallbackHalf}>Half</Text>
        <Text style={styles.fallbackOrder}>Order</Text>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.wrap,
        {
          marginTop,
          width: side,
          height: side,
        },
        style,
      ]}
    >
      <Image
        source={LOGO_SOURCE}
        style={styles.image}
        contentFit="contain"
        transition={0}
        onError={() => setLoadFailed(true)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  fallbackWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  fallbackHalf: {
    fontSize: 22,
    fontWeight: '800',
    color: theme.colors.success,
  },
  fallbackOrder: {
    fontSize: 22,
    fontWeight: '800',
    color: theme.colors.primary,
  },
});
