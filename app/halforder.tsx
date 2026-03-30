import { Redirect } from 'expo-router';

/** Legacy entry: main app uses `/(tabs)` only. */
export default function HalfOrderLegacyRedirect() {
  return <Redirect href="/(tabs)" />;
}
