/**
 * Admin consoles share the app design tokens.
 */
import { shadows, theme } from '@/constants/theme';

const t = theme.colors;

/** Consistent elevated card shell for admin lists / stats */
export const adminCardShell = {
  backgroundColor: t.background,
  borderRadius: theme.radius.lg,
  padding: theme.spacing.md,
  borderWidth: 1,
  borderColor: t.border,
  ...shadows.card,
} as const;

export const adminColors = {
  background: t.lightGray,
  card: t.background,
  text: t.text,
  textMuted: t.textMuted,
  primary: t.primary,
  border: t.border,
  error: t.dangerText,
  accentBlue: t.accentBlue,
  dangerBg: t.dangerBackground,
  successBg: t.successBackground,
  successText: t.successTextDark,
  onPrimary: t.textOnPrimary,
} as const;
