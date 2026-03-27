import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import React from 'react';

import { BrowseScreen } from '@/screens/BrowseScreen';
import { ChatScreen } from '@/screens/ChatScreen';
import { LikesScreen } from '@/screens/LikesScreen';
import { ProfileScreen } from '@/screens/ProfileScreen';
import { SwipeScreen } from '@/screens/SwipeScreen';

const Tab = createBottomTabNavigator();

const tabBarStyle = {
  backgroundColor: '#0F141B',
  borderTopColor: '#1F2937',
  height: 64,
  paddingTop: 6,
};

export function HalfOrderTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: '#34D399',
        tabBarInactiveTintColor: '#9CA3AF',
        tabBarStyle,
        tabBarIcon: ({ focused, color }) => {
          const byRoute: Record<string, React.ComponentProps<typeof MaterialIcons>['name']> = {
            Swipe: 'style',
            Browse: 'travel-explore',
            Likes: 'favorite-border',
            Chat: 'chat-bubble-outline',
            Profile: 'person-outline',
          };
          return (
            <MaterialIcons
              name={byRoute[route.name] ?? 'circle'}
              size={22}
              color={focused ? '#34D399' : color}
            />
          );
        },
      })}
    >
      <Tab.Screen name="Swipe" component={SwipeScreen} />
      <Tab.Screen name="Browse" component={BrowseScreen} />
      <Tab.Screen name="Likes" component={LikesScreen} />
      <Tab.Screen name="Chat" component={ChatScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}
