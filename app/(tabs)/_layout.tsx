import { Tabs } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { onAuthStateChanged } from '@firebase/auth';
import React, { useEffect, useState } from 'react';

import { HapticTab } from '@/components/haptic-tab';
import { Colors, theme } from '@/constants/theme';
import { auth } from '@/services/firebase';

const TAB_ICON_SIZE = 24;
const ACTIVE_COLOR = Colors.light.tabIconSelected;
const INACTIVE_COLOR = Colors.light.tabIconDefault;
const { colors: tabColors } = theme;

export default function TabLayout() {
  const [isAuthenticated, setIsAuthenticated] = useState(!!auth.currentUser);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) =>
      setIsAuthenticated(!!user),
    );
    return () => unsub();
  }, []);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: ACTIVE_COLOR,
        tabBarInactiveTintColor: INACTIVE_COLOR,
        tabBarStyle: {
          backgroundColor: tabColors.background,
          borderTopColor: tabColors.border,
          paddingTop: 6,
          height: 58,
        },
        headerShown: false,
        tabBarButton: HapticTab,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ focused }) => (
            <MaterialIcons
              name="home"
              size={TAB_ICON_SIZE}
              color={focused ? ACTIVE_COLOR : INACTIVE_COLOR}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: 'Orders',
          tabBarIcon: ({ focused }) => (
            <MaterialIcons
              name="receipt-long"
              size={TAB_ICON_SIZE}
              color={focused ? ACTIVE_COLOR : INACTIVE_COLOR}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="deals"
        options={{
          title: 'Deals',
          tabBarIcon: ({ focused }) => (
            <MaterialIcons
              name="local-offer"
              size={TAB_ICON_SIZE}
              color={focused ? ACTIVE_COLOR : INACTIVE_COLOR}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ focused }) => (
            <MaterialIcons
              name="person"
              size={TAB_ICON_SIZE}
              color={focused ? ACTIVE_COLOR : INACTIVE_COLOR}
            />
          ),
        }}
      />
      <Tabs.Screen name="create" options={{ href: null }} />
      <Tabs.Screen name="join" options={{ href: null }} />
      <Tabs.Screen name="explore" options={{ href: null }} />
    </Tabs>
  );
}
