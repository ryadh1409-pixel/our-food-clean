import { TermsFooter } from '@/components/TermsFooter';
import { shadows, theme } from '@/constants/theme';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { showNotice } from '@/utils/toast';

const c = theme.colors;

const FEATURES = [
  'Priority placement for your shared meal offers',
  'Unlimited likes on the swipe feed',
  'Badges and trust highlights on your profile',
] as const;

/**
 * Subscription / paywall layout (IAP can be wired here later).
 * TermsFooter mirrors App Store subscription footnotes.
 */
export default function SubscribeScreen() {
  const router = useRouter();
  const [working, setWorking] = useState(false);

  const handleSubscribe = () => {
    setWorking(true);
    // Replace with StoreKit / RevenueCat when billing is integrated.
    setTimeout(() => {
      setWorking(false);
      showNotice(
        'Coming soon',
        'HalfOrder Plus will be available in an upcoming release. Thanks for your interest.',
      );
    }, 400);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={16}
          style={styles.backHit}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={styles.backLabel}>Done</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        bounces
      >
        <View style={styles.heroCard}>
          <View style={styles.iconBadge}>
            <MaterialIcons name="workspace-premium" size={36} color={c.primary} />
          </View>
          <Text style={styles.title}>HalfOrder Plus</Text>
          <Text style={styles.subtitle}>
            Get more from the food sharing app where you coordinate shared meals with people
            nearby.
          </Text>
          <Text style={styles.priceLine}>$4.99 / month · Cancel anytime</Text>
        </View>

        <View style={styles.featuresCard}>
          <Text style={styles.featuresHeading}>What you get</Text>
          {FEATURES.map((line) => (
            <View key={line} style={styles.featureRow}>
              <MaterialIcons name="check-circle" size={22} color={c.success} />
              <Text style={styles.featureText}>{line}</Text>
            </View>
          ))}
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.subscribeBtn,
            pressed && styles.subscribeBtnPressed,
            working && styles.subscribeBtnDisabled,
          ]}
          onPress={handleSubscribe}
          disabled={working}
          accessibilityRole="button"
          accessibilityLabel="Subscribe to HalfOrder Plus"
        >
          {working ? (
            <ActivityIndicator color={c.textOnPrimary} />
          ) : (
            <Text style={styles.subscribeBtnText}>Subscribe</Text>
          )}
        </Pressable>

        <Text style={styles.finePrint}>
          Payment will be charged to your App Store or Google Play account at confirmation of
          purchase. Subscription renews monthly unless canceled at least 24 hours before the end of
          the current period.
        </Text>

        <TermsFooter style={{ marginTop: theme.spacing.xs }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: c.chromeWash,
  },
  topBar: {
    paddingHorizontal: theme.spacing.section,
    paddingVertical: theme.spacing.sm,
    alignItems: 'flex-end',
  },
  backHit: {
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  backLabel: {
    fontSize: 17,
    fontWeight: '600',
    color: c.accentBlue,
  },
  scroll: {
    paddingHorizontal: theme.spacing.section,
    paddingBottom: Platform.select({ ios: 28, default: 24 }),
  },
  heroCard: {
    backgroundColor: c.white,
    borderRadius: 16,
    padding: theme.spacing.lg,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.borderSubtle,
    ...shadows.card,
  },
  iconBadge: {
    width: 72,
    height: 72,
    borderRadius: 18,
    backgroundColor: c.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.md,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: c.text,
    textAlign: 'center',
    letterSpacing: Platform.OS === 'ios' ? -0.4 : 0,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 23,
    color: c.textSlate,
    textAlign: 'center',
    marginBottom: 12,
  },
  priceLine: {
    fontSize: 15,
    fontWeight: '600',
    color: c.textMuted,
  },
  featuresCard: {
    marginTop: theme.spacing.md,
    backgroundColor: c.white,
    borderRadius: 16,
    padding: theme.spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.borderSubtle,
  },
  featuresHeading: {
    fontSize: 13,
    fontWeight: '700',
    color: c.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: theme.spacing.md,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 14,
  },
  featureText: {
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
    color: c.text,
  },
  subscribeBtn: {
    marginTop: theme.spacing.lg,
    backgroundColor: c.primary,
    paddingVertical: 16,
    borderRadius: theme.radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  subscribeBtnPressed: {
    opacity: 0.92,
  },
  subscribeBtnDisabled: {
    opacity: 0.75,
  },
  subscribeBtnText: {
    fontSize: 17,
    fontWeight: '700',
    color: c.textOnPrimary,
  },
  finePrint: {
    marginTop: theme.spacing.md,
    fontSize: 12,
    lineHeight: 17,
    color: c.textSecondary,
    textAlign: 'center',
    paddingHorizontal: theme.spacing.xs,
  },
});
