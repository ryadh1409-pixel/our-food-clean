import { StyleSheet, Text, View } from 'react-native';

import AppLogo from '@/components/AppLogo';
import { BrandGradientBar } from '@/components/BrandGradientBar';
import { spacing, typography } from '@/theme/theme';

type LogoMode = 'none' | 'hero' | 'inline';

type Props = {
  /** Screen title (omit on hero + logo when the mark includes wordmark). */
  title?: string;
  subtitle?: string;
  variant?: 'hero' | 'screen';
  align?: 'left' | 'center';
  /**
   * `hero` — centered logo above text (typical home).
   * `inline` — small mark left of title (stack / list screens).
   */
  logo?: LogoMode;
};

/**
 * Brand gradient hairline + optional logo + title hierarchy.
 */
export function ScreenHeader({
  title,
  subtitle,
  variant = 'screen',
  align = 'left',
  logo = 'none',
}: Props) {
  const titleStyle =
    variant === 'hero' ? typography.hero : typography.screenTitle;
  const centered = align === 'center';

  if (logo === 'hero') {
    return (
      <View style={styles.wrap}>
        <BrandGradientBar height={3} />
        <View style={[styles.inner, styles.innerHero, centered && styles.innerCentered]}>
          <AppLogo variant="hero" marginTop={0} style={styles.logoHero} />
          {title ? (
            <Text style={[titleStyle, centered && styles.textCenter, styles.titleBelowLogo]}>
              {title}
            </Text>
          ) : null}
          {subtitle ? (
            <Text
              style={[
                typography.subtitle,
                styles.subGap,
                centered && styles.textCenter,
                !title && styles.subtitleTightTop,
              ]}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
    );
  }

  if (logo === 'inline' && title) {
    return (
      <View style={styles.wrap}>
        <BrandGradientBar height={3} />
        <View style={[styles.inner, styles.inlineRow]}>
          <AppLogo
            size={Math.min(44, spacing.screen * 1.75)}
            marginTop={0}
            style={styles.logoInline}
          />
          <View style={styles.inlineTextCol}>
            <Text style={[titleStyle, styles.inlineTitle]}>{title}</Text>
            {subtitle ? (
              <Text style={[typography.bodyMuted, styles.subGapTight]}>
                {subtitle}
              </Text>
            ) : null}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <BrandGradientBar height={3} />
      <View style={[styles.inner, centered && styles.innerCentered]}>
        {title ? (
          <Text style={[titleStyle, centered && styles.textCenter]}>{title}</Text>
        ) : null}
        {subtitle ? (
          <Text
            style={[
              typography.subtitle,
              styles.subGap,
              centered && styles.textCenter,
            ]}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
  },
  inner: {
    paddingHorizontal: spacing.screen,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  innerHero: {
    paddingTop: spacing.md + 4,
    paddingBottom: spacing.sm + 4,
  },
  innerCentered: {
    alignItems: 'center',
  },
  textCenter: {
    textAlign: 'center',
  },
  subGap: {
    marginTop: spacing.sm,
  },
  subGapTight: {
    marginTop: spacing.xs,
  },
  subtitleTightTop: {
    marginTop: spacing.sm + 2,
  },
  titleBelowLogo: {
    marginTop: spacing.md,
  },
  logoHero: {
    marginBottom: 0,
  },
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: spacing.md,
  },
  logoInline: {
    marginRight: spacing.md - 4,
  },
  inlineTextCol: {
    flex: 1,
    justifyContent: 'center',
  },
  inlineTitle: {
    fontSize: 22,
    lineHeight: 28,
  },
});

