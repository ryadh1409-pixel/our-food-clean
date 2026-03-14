import React from 'react';
import { View, Text } from 'react-native';

export function Marker(_props: unknown) {
  return null;
}

export function Polyline(_props: unknown) {
  return null;
}

export default function SafeMap(props: { style?: object }) {
  return (
    <View
      style={[
        {
          height: 200,
          justifyContent: 'center',
          alignItems: 'center',
        },
        props.style,
      ]}
    >
      <Text>Map available on mobile</Text>
    </View>
  );
}
