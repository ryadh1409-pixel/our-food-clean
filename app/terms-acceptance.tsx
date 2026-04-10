import {
  emitTermsAccepted,
  normalizeReturnPathAfterTerms,
} from '@/constants/termsAcceptance';
import { LEGAL_URLS } from '@/constants/legalLinks';
import { theme } from '@/constants/theme';
import { setTermsAcceptedAsync } from '@/lib/termsAcceptedStorage';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { showError } from '@/utils/toast';

const c = theme.colors;

export default function TermsAcceptanceScreen() {
  const router = useRouter();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const [loading, setLoading] = useState(false);
  /** Required for Guideline 1.2 — explicit Terms + Privacy acknowledgment. */
  const [termsPrivacyAccepted, setTermsPrivacyAccepted] = useState(false);
  const [whatsappConsent, setWhatsappConsent] = useState(false);

  const openExternal = (url: string) => {
    void Linking.openURL(url);
  };

  const accept = async () => {
    if (!termsPrivacyAccepted || !whatsappConsent) return;
    setLoading(true);
    try {
      await setTermsAcceptedAsync(new Date().toISOString());
      emitTermsAccepted();
      const next = normalizeReturnPathAfterTerms(
        typeof returnTo === 'string' ? returnTo : undefined,
      );
      router.replace(next as Parameters<typeof router.replace>[0]);
    } catch {
      showError('Could not save your choice. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const canContinue = termsPrivacyAccepted && whatsappConsent && !loading;

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.kicker}>Before you continue</Text>
        <Text style={styles.headline}>Terms &amp; Privacy</Text>
        <Text style={styles.lead}>
          HalfOrder includes user-generated content (messages, profiles, order details). You must
          agree to our Terms of Use and Privacy Policy to use the app.
        </Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>What you agree to</Text>
          <View style={styles.bulletBlock}>
            <Text style={styles.bullet}>• Follow our community guidelines (no abuse, spam, or illegal content)</Text>
            <Text style={styles.bullet}>• Use reporting and blocking tools when needed</Text>
            <Text style={styles.bullet}>• Understand we may remove content or accounts that violate the rules</Text>
          </View>
          <View style={styles.linkRow}>
            <TouchableOpacity
              onPress={() => router.push('/terms' as Parameters<typeof router.push>[0])}
              style={styles.linkBtn}
              accessibilityRole="button"
              accessibilityLabel="Open Terms of Use in the app"
            >
              <MaterialIcons name="description" size={20} color={c.primary} />
              <Text style={styles.linkBtnText}>Terms of Use (in app)</Text>
              <MaterialIcons name="chevron-right" size={20} color={c.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push('/privacy' as Parameters<typeof router.push>[0])}
              style={styles.linkBtn}
              accessibilityRole="button"
              accessibilityLabel="Open Privacy Policy in the app"
            >
              <MaterialIcons name="privacy-tip" size={20} color={c.primary} />
              <Text style={styles.linkBtnText}>Privacy Policy (in app)</Text>
              <MaterialIcons name="chevron-right" size={20} color={c.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => void openExternal(LEGAL_URLS.terms)}
              style={styles.linkBtn}
              accessibilityRole="button"
              accessibilityLabel="Open Terms of Use in browser"
            >
              <MaterialIcons name="open-in-new" size={18} color={c.textSecondary} />
              <Text style={styles.linkBtnTextMuted}>Website: Terms</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => void openExternal(LEGAL_URLS.privacy)}
              style={styles.linkBtn}
              accessibilityRole="button"
              accessibilityLabel="Open Privacy Policy in browser"
            >
              <MaterialIcons name="open-in-new" size={18} color={c.textSecondary} />
              <Text style={styles.linkBtnTextMuted}>Website: Privacy</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <TouchableOpacity
            style={styles.checkboxRow}
            onPress={() => setTermsPrivacyAccepted((v) => !v)}
            activeOpacity={0.75}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: termsPrivacyAccepted }}
            accessibilityLabel="I agree to the Terms of Use and Privacy Policy"
          >
            <MaterialIcons
              name={termsPrivacyAccepted ? 'check-box' : 'check-box-outline-blank'}
              size={26}
              color={termsPrivacyAccepted ? c.primary : 'rgba(255,255,255,0.45)'}
              style={styles.checkboxIcon}
            />
            <Text style={styles.checkboxLabel}>
              I have read and agree to the{' '}
              <Text style={styles.checkboxEmphasis}>Terms of Use</Text> and{' '}
              <Text style={styles.checkboxEmphasis}>Privacy Policy</Text>.
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>WhatsApp for coordination</Text>
          <Text style={styles.sectionBody}>
            We use your WhatsApp number only to coordinate pickup between users. It is not sold or used
            for ads.
          </Text>
          <TouchableOpacity
            style={styles.checkboxRow}
            onPress={() => setWhatsappConsent((v) => !v)}
            activeOpacity={0.75}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: whatsappConsent }}
            accessibilityLabel="I agree to share my WhatsApp number for order coordination"
          >
            <MaterialIcons
              name={whatsappConsent ? 'check-box' : 'check-box-outline-blank'}
              size={26}
              color={whatsappConsent ? c.primary : 'rgba(255,255,255,0.45)'}
              style={styles.checkboxIcon}
            />
            <Text style={styles.checkboxLabel}>
              I agree to share my WhatsApp number for order coordination.
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.primary, (!canContinue || loading) && styles.primaryDisabled]}
          onPress={() => void accept()}
          disabled={!canContinue}
          activeOpacity={0.9}
          accessibilityRole="button"
          accessibilityLabel="I Agree and continue"
        >
          {loading ? (
            <ActivityIndicator color={c.textOnPrimary} />
          ) : (
            <Text style={styles.primaryText}>I Agree</Text>
          )}
        </TouchableOpacity>
        <Text style={styles.footerHint}>
          You cannot use HalfOrder without accepting the Terms, Privacy Policy, and WhatsApp
          coordination consent above.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: c.sheetDark,
  },
  scroll: {
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 28,
  },
  kicker: {
    fontSize: 13,
    fontWeight: '700',
    color: c.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  headline: {
    fontSize: 28,
    fontWeight: '700',
    color: c.white,
    letterSpacing: -0.5,
    marginBottom: 12,
  },
  lead: {
    fontSize: 16,
    lineHeight: 24,
    color: c.textSecondary,
    marginBottom: 22,
  },
  section: {
    backgroundColor: c.surfaceDark,
    borderRadius: 16,
    padding: 20,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: c.white,
    marginBottom: 12,
    letterSpacing: -0.3,
  },
  sectionBody: {
    fontSize: 15,
    lineHeight: 22,
    color: c.textSecondary,
    marginBottom: 14,
  },
  bulletBlock: {
    gap: 10,
    marginBottom: 14,
  },
  bullet: {
    fontSize: 15,
    lineHeight: 22,
    color: 'rgba(255,255,255,0.88)',
    fontWeight: '500',
  },
  linkRow: {
    gap: 8,
  },
  linkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderRadius: 10,
  },
  linkBtnText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: c.white,
  },
  linkBtnTextMuted: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: c.textSecondary,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  checkboxIcon: {
    marginTop: 2,
  },
  checkboxLabel: {
    flex: 1,
    fontSize: 16,
    lineHeight: 23,
    color: c.white,
    fontWeight: '500',
  },
  checkboxEmphasis: {
    fontWeight: '700',
    color: c.primary,
  },
  footer: {
    paddingHorizontal: 22,
    paddingTop: 14,
    paddingBottom: 22,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.12)',
    backgroundColor: c.sheetDark,
  },
  primary: {
    backgroundColor: c.primary,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 54,
  },
  primaryDisabled: {
    opacity: 0.42,
  },
  primaryText: {
    fontSize: 17,
    fontWeight: '700',
    color: c.textOnPrimary,
  },
  footerHint: {
    marginTop: 14,
    fontSize: 12,
    lineHeight: 17,
    color: c.textMuted,
    textAlign: 'center',
  },
});
