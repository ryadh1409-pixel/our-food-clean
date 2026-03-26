import AsyncStorage from '@react-native-async-storage/async-storage';
import { Redirect } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import AppLogo from '@/components/AppLogo';
import { TERMS_ACCEPTANCE_STORAGE_KEY } from '@/constants/termsAcceptance';

const ONBOARDING_COMPLETE_KEY = 'onboardingComplete';

export default function Index() {
  const [done, setDone] = useState<boolean | null>(null);
  const [termsAccepted, setTermsAccepted] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [ob, ta] = await Promise.all([
        AsyncStorage.getItem(ONBOARDING_COMPLETE_KEY),
        AsyncStorage.getItem(TERMS_ACCEPTANCE_STORAGE_KEY),
      ]);
      if (!cancelled) {
        setDone(ob === 'true');
        setTermsAccepted(ta != null && ta.length > 0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (done === null || termsAccepted === null) {
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

  if (!done) {
    return <Redirect href="/onboarding" />;
  }
  if (!termsAccepted) {
    return <Redirect href="/terms-acceptance" />;
  }
  return <Redirect href="/(tabs)" />;
}
