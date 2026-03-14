import { Platform, View, Text } from 'react-native';

export default function MapScreen() {
  if (Platform.OS === 'web') {
    const Web = require('./index.web').default;
    return <Web />;
  }
  const Native = require('./index.native').default;
  return <Native />;
}
