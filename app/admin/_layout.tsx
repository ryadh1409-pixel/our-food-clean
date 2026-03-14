import { Stack } from 'expo-router';

export default function AdminLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" options={{ title: 'Admin' }} />
      <Stack.Screen name="dashboard" options={{ title: 'Dashboard' }} />
      <Stack.Screen name="complaints" options={{ title: 'User Complaints' }} />
      <Stack.Screen
        name="notifications"
        options={{ title: 'Notification Tracking' }}
      />
      <Stack.Screen name="map" options={{ title: 'Activity Map' }} />
      <Stack.Screen name="broadcast" options={{ title: 'Broadcast' }} />
      <Stack.Screen name="campuses" options={{ title: 'Campuses' }} />
    </Stack>
  );
}
