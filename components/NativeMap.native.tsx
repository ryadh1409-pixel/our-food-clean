import { Platform, Text, View } from 'react-native';

let MapView: any;
let Marker: any;

if (Platform.OS !== 'web') {
  const maps = require('react-native-maps');
  MapView = maps.default;
  Marker = maps.Marker;
}

export default function NativeMap({
  latitude,
  longitude,
}: {
  latitude: number;
  longitude: number;
}) {
  if (Platform.OS === 'web') {
    return (
      <View
        style={{ height: 200, justifyContent: 'center', alignItems: 'center' }}
      >
        <Text>Map available on mobile only</Text>
      </View>
    );
  }
  return (
    <MapView
      style={{ height: 200, borderRadius: 12 }}
      initialRegion={{
        latitude,
        longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }}
    >
      <Marker coordinate={{ latitude, longitude }} />
    </MapView>
  );
}
