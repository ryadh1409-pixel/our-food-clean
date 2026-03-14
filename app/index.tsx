import AsyncStorage from '@react-native-async-storage/async-storage';
import { Redirect } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import AppLogo from '@/components/AppLogo';

const ONBOARDING_COMPLETE_KEY = 'onboardingComplete';

export default function Index() {
  const [done, setDone] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_COMPLETE_KEY).then((v) =>
      setDone(v === 'true'),
    );
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
        <AppLogo width={110} height={110} marginTop={0} />
        <ActivityIndicator size="large" style={{ marginTop: 40 }} />
      </View>
    );
  }

  return done ? <Redirect href="/(tabs)" /> : <Redirect href="/onboarding" />;
}
