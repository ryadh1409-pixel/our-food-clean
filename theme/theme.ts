/**
 * HalfOrder design system — minimal, high-contrast (Uber / Airbnb style).
 */
import { Platform, StyleSheet, type TextStyle } from 'react-native';

export const palette = {
  primaryGreen: '#4CAF50',
  primaryOrange: '#FF7A00',
  background: '#FFFFFF',
  lightGray: '#F5F5F5',
  textDark: '#222222',
} as const;

export const colors = {
  ...palette,
  textMuted: '#6B7280',
  textSecondary: '#8E8E93',
  border: '#E8E8E8',
  borderSubtle: '#F0F0F0',
  white: '#FFFFFF',
  danger: '#D32F2F',
  /** Primary CTA — orange */
  primary: palette.primaryOrange,
  primaryLight: '#FF9E4A',
  primaryDark: '#E06D00',
  surface: palette.lightGray,
  /** Legacy alias — use lightGray / surface for panels */
  backgroundDark: palette.lightGray,
  text: palette.textDark,
  textOnPrimary: '#FFFFFF',
  accentBlue: '#1565C0',
  iconInactive: '#9CA3AF',
  dotInactive: '#E0E0E0',
  success: palette.primaryGreen,
  warning: '#F9A825',
  /** Semantic UI (banners, chat, third‑party) */
  whatsapp: '#25D366',
  successBackground: '#ECFDF5',
  successTextDark: '#166534',
  successBannerBorder: '#4CAF50',
  warningBackground: '#FFFBEB',
  warningTextDark: '#92400E',
  warningSoft: '#FEF3C7',
  dangerBackground: '#FEF2F2',
  dangerText: '#B91C1C',
  dangerBorder: '#FECACA',
  surfaceMuted: '#F1F5F9',
  borderStrong: '#CBD5E1',
  textSlate: '#475569',
  textSlateDark: '#334155',
  /** Light tint for “my” chat bubble */
  chatBubbleMine: '#FFEDD5',
  overlayScrim: 'rgba(0,0,0,0.55)',
  timerAccent: '#EA580C',
  /** Native shadow (iOS/web) */
  shadow: '#000000',
  /** Subtle page wash (chat chrome) */
  chromeWash: '#F8FAFC',
  /** Dark UI (match flow, map chrome) */
  sheetDark: '#0B0B0B',
  surfaceDark: '#1C1C1E',
  surfaceDarkElevated: '#2C2C2E',
  /** Map route emphasis (primary with alpha) */
  mapRouteTint: 'rgba(255, 122, 0, 0.55)',
  imessageGreen: '#34C759',
  instagramBrand: '#E4405F',
  bannerNavy: '#1A1A2E',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 40,
  screen: 24,
  section: 20,
  tight: 12,
  /** Minimum tap target (iOS HIG / accessibility) */
  touchMin: 44,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 9999,
  button: 12,
  card: 16,
  input: 12,
  dot: 6,
};

export const typography = {
  hero: {
    fontSize: 32,
    fontWeight: '700' as TextStyle['fontWeight'],
    lineHeight: 38,
    letterSpacing: -0.8,
    color: colors.textDark,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: '700' as TextStyle['fontWeight'],
    lineHeight: 34,
    letterSpacing: -0.6,
    color: colors.textDark,
  },
  title: {
    fontSize: 20,
    fontWeight: '600' as TextStyle['fontWeight'],
    lineHeight: 26,
    color: colors.textDark,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: '400' as TextStyle['fontWeight'],
    lineHeight: 24,
    color: colors.textMuted,
  },
  body: {
    fontSize: 16,
    fontWeight: '400' as TextStyle['fontWeight'],
    lineHeight: 24,
    color: colors.textDark,
  },
  bodyMedium: {
    fontSize: 16,
    fontWeight: '500' as TextStyle['fontWeight'],
    lineHeight: 24,
    color: colors.textDark,
  },
  bodyMuted: {
    fontSize: 15,
    fontWeight: '400' as TextStyle['fontWeight'],
    lineHeight: 22,
    color: colors.textMuted,
  },
  caption: {
    fontSize: 13,
    fontWeight: '400' as TextStyle['fontWeight'],
    lineHeight: 18,
    color: colors.textMuted,
  },
  button: {
    fontSize: 16,
    fontWeight: '600' as TextStyle['fontWeight'],
    letterSpacing: 0.15,
  },
};

/** Green → orange (diagonal). Use with expo-linear-gradient. */
export const gradients = {
  brand: {
    colors: [palette.primaryGreen, palette.primaryOrange] as [string, string],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
  },
  brandHorizontal: {
    colors: [palette.primaryGreen, palette.primaryOrange] as [string, string],
    start: { x: 0, y: 0.5 },
    end: { x: 1, y: 0.5 },
  },
} as const;

export const theme = {
  colors,
  spacing,
  radius,
  typography,
};

/** Subtle elevation — cards, floating panels */
export const shadows = {
  card: Platform.select({
    ios: {
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.07,
      shadowRadius: 14,
    },
    android: { elevation: 3 },
    default: {},
  }),
} as const;

const shadowCard = shadows.card;

/**
 * Reusable UI blocks — compose with TouchableOpacity + Text children.
 */
export const layoutStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  containerMuted: {
    flex: 1,
    backgroundColor: colors.lightGray,
  },
  /** White card with light border + soft shadow */
  card: {
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    ...shadowCard,
  },
  /** Flat gray panel (No shadow) */
  cardFlat: {
    backgroundColor: colors.lightGray,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  /** Orange — main call-to-action */
  primaryButton: {
    backgroundColor: colors.primaryOrange,
    paddingVertical: 16,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  primaryButtonText: {
    ...typography.button,
    color: colors.textOnPrimary,
  },
  /** Green — secondary emphasis */
  secondaryButton: {
    backgroundColor: colors.primaryGreen,
    paddingVertical: 16,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  secondaryButtonText: {
    ...typography.button,
    color: colors.textOnPrimary,
  },
  outlineButton: {
    backgroundColor: colors.background,
    paddingVertical: 16,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.border,
  },
  outlineButtonText: {
    ...typography.button,
    color: colors.textDark,
  },
  ghostButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  ghostButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textMuted,
  },
});

/** Expo template hook compatibility */
export const Colors = {
  light: {
    text: colors.textDark,
    background: colors.background,
    tint: colors.primaryOrange,
    icon: colors.iconInactive,
    tabIconDefault: colors.iconInactive,
    tabIconSelected: colors.primaryOrange,
  },
  dark: {
    text: '#ECEDEE',
    background: '#151718',
    tint: colors.primaryOrange,
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: colors.primaryOrange,
  },
} as const;
