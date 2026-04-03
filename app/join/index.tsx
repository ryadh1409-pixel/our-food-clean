import { Redirect, useLocalSearchParams } from 'expo-router';

/**
 * Handles `https://halforder.app/join?orderId=…` → same flow as `/join/:orderId`.
 */
export default function JoinQueryRedirectScreen() {
  const { orderId } = useLocalSearchParams<{
    orderId?: string | string[];
  }>();
  const raw = Array.isArray(orderId) ? orderId[0] : orderId;
  const id = typeof raw === 'string' ? raw.trim() : '';
  if (id) {
    return <Redirect href={`/join/${id}`} />;
  }
  return <Redirect href="/(tabs)" />;
}
