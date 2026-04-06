import {
  TERMS_ACCEPTANCE_STORAGE_KEY,
  emitTermsAccepted,
  normalizeReturnPathAfterTerms,
} from '@/constants/termsAcceptance';
import { theme } from '@/constants/theme';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
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
  const [whatsappConsent, setWhatsappConsent] = useState(false);

  const accept = async () => {
    if (!whatsappConsent) return;
    setLoading(true);
    try {
      await AsyncStorage.setItem(
        TERMS_ACCEPTANCE_STORAGE_KEY,
        new Date().toISOString(),
      );
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

  const canContinue = whatsappConsent && !loading;

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.headline}>Terms of Use</Text>
        <Text style={styles.lead}>
          HalfOrder includes user-generated content. By continuing, you agree to follow these rules
          and our full Terms of Use and Privacy Policy (linked in the app).
        </Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Community guidelines</Text>
          <View style={styles.bulletBlock}>
            <Text style={styles.bullet}>• No abusive or harmful content</Text>
            <Text style={styles.bullet}>• No spam</Text>
            <Text style={styles.bullet}>• Respect other users</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>WhatsApp Number Usage</Text>
          <Text style={styles.sectionBody}>
            We use your WhatsApp number only to help coordinate order pickup between users. Your number
            is never sold or shared outside the app.
          </Text>

          <TouchableOpacity
            style={styles.checkboxRow}
            onPress={() => setWhatsappConsent((v) => !v)}
            activeOpacity={0.75}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: whatsappConsent }}
            accessibilityLabel="I agree to share my WhatsApp number for order coordination purposes"
          >
            <MaterialIcons
              name={whatsappConsent ? 'check-box' : 'check-box-outline-blank'}
              size={26}
              color={whatsappConsent ? c.primary : 'rgba(255,255,255,0.45)'}
              style={styles.checkboxIcon}
            />
            <Text style={styles.checkboxLabel}>
              I agree to share my WhatsApp number for order coordination purposes.
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
        >
          {loading ? (
            <ActivityIndicator color={c.textOnPrimary} />
          ) : (
            <Text style={styles.primaryText}>Agree and Continue</Text>
          )}
        </TouchableOpacity>
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
    paddingTop: 24,
    paddingBottom: 28,
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
    marginBottom: 28,
  },
  section: {
    backgroundColor: c.surfaceDark,
    borderRadius: 16,
    padding: 22,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: c.white,
    marginBottom: 12,
    letterSpacing: -0.3,
  },
  sectionBody: {
    fontSize: 15,
    lineHeight: 22,
    color: c.textSecondary,
    marginBottom: 18,
  },
  bulletBlock: {
    gap: 12,
  },
  bullet: {
    fontSize: 16,
    lineHeight: 24,
    color: 'rgba(255,255,255,0.88)',
    fontWeight: '500',
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
  footer: {
    paddingHorizontal: 22,
    paddingTop: 16,
    paddingBottom: 20,
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
});
