import React from 'react';
import { Text, View } from 'react-native';

export default function CreateTabDisabledScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: '#06080C', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <Text style={{ color: '#F8FAFC', fontSize: 22, fontWeight: '800', textAlign: 'center' }}>
        Create disabled
      </Text>
      <Text style={{ color: 'rgba(248,250,252,0.65)', marginTop: 8, textAlign: 'center' }}>
        Swipe right on admin cards to join food matches.
      </Text>
    </View>
  );
}
