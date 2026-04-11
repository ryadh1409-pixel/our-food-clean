import AppLogo from '@/components/AppLogo';
import { ONBOARDING_COMPLETE_KEY } from '@/constants/onboarding';
import { useUserTermsStatus } from '@/hooks/useUserTermsStatus';
import { useAuth } from '@/services/AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Redirect } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

type GateState =
  | { phase: 'loading' }
  | { phase: 'ready'; onboardingDone: boolean };

/**
 * Onboarding → (signed-in) Firestore Terms → tabs.
 * Terms are enforced per account via `users/{uid}.hasAcceptedTerms`, not device storage.
 */
export default function Index() {
  const [gate, setGate] = useState<GateState>({ phase: 'loading' });
  const { user, loading: authLoading } = useAuth();
  const { ready: termsReady, accepted: termsAccepted } = useUserTermsStatus(
    user?.uid,
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const obRaw = await AsyncStorage.getItem(ONBOARDING_COMPLETE_KEY);
        if (!cancelled) {
          setGate({
            phase: 'ready',
            onboardingDone: obRaw === 'true',
          });
        }
      } catch {
        if (!cancelled) {
          setGate({
            phase: 'ready',
            onboardingDone: false,
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const waitingForTerms =
    Boolean(user) && !termsReady && gate.phase === 'ready';

  if (gate.phase === 'loading' || authLoading || waitingForTerms) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          paddingTop: 60,
        }}
      >
        <AppLogo size={112} marginTop={0} />
        <ActivityIndicator size="large" style={{ marginTop: 40 }} />
      </View>
    );
  }

  if (!gate.onboardingDone) {
    return <Redirect href="/onboarding" />;
  }

  if (user && termsReady && !termsAccepted) {
    return (
      <Redirect
        href={
          '/terms-acceptance?returnTo=/(tabs)' as Parameters<
            typeof Redirect
          >[0]['href']
        }
      />
    );
  }

  return <Redirect href="/(tabs)" />;
}
