import AsyncStorage from '@react-native-async-storage/async-storage';
import { Redirect } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import AppLogo from '@/components/AppLogo';

const ONBOARDING_COMPLETE_KEY = 'onboardingComplete';

/** App entry: onboarding gate → `/(tabs)` (not a tab screen; tabs use `(tabs)/index`). */
export default function Index() {
  const [done, setDone] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ob = await AsyncStorage.getItem(ONBOARDING_COMPLETE_KEY);
      if (!cancelled) {
        setDone(ob === 'true');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (done === null) {
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
  return <Redirect href="/(tabs)" />;
}
