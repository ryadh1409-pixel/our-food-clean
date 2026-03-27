import { DarkTheme, NavigationContainer } from '@react-navigation/native';
import React from 'react';
import { StatusBar } from 'expo-status-bar';

import { HalfOrderTabs } from '@/navigation/HalfOrderTabs';

const halfOrderDarkTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: '#0B0D10',
    card: '#0F141B',
    text: '#F8FAFC',
    border: '#1F2937',
    primary: '#34D399',
  },
};

export function HalfOrderAppScreen() {
  return (
    <>
      <StatusBar style="light" />
      <NavigationContainer independent theme={halfOrderDarkTheme}>
        <HalfOrderTabs />
      </NavigationContainer>
    </>
  );
}
