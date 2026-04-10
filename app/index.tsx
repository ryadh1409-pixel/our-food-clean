import AppLogo from '@/components/AppLogo';
import { ONBOARDING_COMPLETE_KEY } from '@/constants/onboarding';
import { getTermsAcceptedAsync } from '@/lib/termsAcceptedStorage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Redirect } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

type GateState =
  | { phase: 'loading' }
  | { phase: 'ready'; onboardingDone: boolean; termsAccepted: boolean };

/** Onboarding → Terms / UEG acceptance → tabs. */
export default function Index() {
  const [gate, setGate] = useState<GateState>({ phase: 'loading' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [obRaw, termsAccepted] = await Promise.all([
          AsyncStorage.getItem(ONBOARDING_COMPLETE_KEY),
          getTermsAcceptedAsync(),
        ]);
        if (!cancelled) {
          setGate({
            phase: 'ready',
            onboardingDone: obRaw === 'true',
            termsAccepted,
          });
        }
      } catch {
        if (!cancelled) {
          setGate({
            phase: 'ready',
            onboardingDone: false,
            termsAccepted: false,
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (gate.phase === 'loading') {
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

  if (!gate.termsAccepted) {
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
