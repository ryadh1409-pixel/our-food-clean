import React, { useState } from 'react';
import { Image, Text, View } from 'react-native';

type AppLogoProps = {
  width?: number;
  height?: number;
  marginTop?: number;
};

export default function AppLogo({
  width = 180,
  height = 80,
  marginTop = 20,
}: AppLogoProps) {
  const [loadFailed, setLoadFailed] = useState(false);

  if (loadFailed) {
    return (
      <View style={{ alignItems: 'center', marginTop }}>
        <Text style={{ fontSize: 24, fontWeight: '800', color: '#1e3a5f' }}>
          HalfOrder
        </Text>
      </View>
    );
  }

  return (
    <View
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        marginTop,
        backgroundColor: 'transparent',
      }}
    >
      <Image
        source={require('../assets/images/halforder-logo.png')}
        style={{ width, height }}
        resizeMode="contain"
        onError={() => setLoadFailed(true)}
      />
    </View>
  );
}
