import { Text, View } from 'react-native';

export default function NativeMap(_props: {
  latitude?: number;
  longitude?: number;
}) {
  return (
    <View
      style={{
        height: 200,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#f2f2f2',
        borderRadius: 12,
      }}
    >
      <Text>Map available on mobile only</Text>
    </View>
  );
}
