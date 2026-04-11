import {
  emitTermsAccepted,
  normalizeReturnPathAfterTerms,
} from '@/constants/termsAcceptance';
import TermsScreen from '@/screens/TermsScreen';
import { acceptTermsOfService } from '@/services/userTerms';
import { useAuth } from '@/services/AuthContext';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { showError } from '@/utils/toast';

/**
 * Post-login Terms of Service (Firestore `hasAcceptedTerms`). WebView + scroll-to-enable.
 * Cannot be bypassed: root `_layout` redirects here until accepted.
 */
export default function TermsAcceptanceScreen() {
  const router = useRouter();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const { user, loading: authLoading } = useAuth();

  const resolvedReturn =
    typeof returnTo === 'string' && returnTo.trim() ? returnTo.trim() : '/(tabs)';
  const loginRedirectPath = `/terms-acceptance?returnTo=${encodeURIComponent(resolvedReturn)}`;

  if (authLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!user) {
    return (
      <Redirect
        href={
          `/(auth)/login?redirectTo=${encodeURIComponent(loginRedirectPath)}` as Parameters<
            typeof Redirect
          >[0]['href']
        }
      />
    );
  }

  const handleAgree = async () => {
    try {
      await acceptTermsOfService(user.uid);
      emitTermsAccepted();
      const next = normalizeReturnPathAfterTerms(resolvedReturn);
      router.replace(next as Parameters<typeof router.replace>[0]);
    } catch {
      showError('Could not save your acceptance. Please try again.');
    }
  };

  return <TermsScreen onAgree={handleAgree} />;
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0d0f14',
  },
});
