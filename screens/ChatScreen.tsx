import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export function ChatScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Chat</Text>
      <Text style={styles.subtitle}>Talk with people in your shared orders.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0D10', padding: 20, paddingTop: 52 },
  title: { color: '#F8FAFC', fontSize: 26, fontWeight: '800' },
  subtitle: { color: '#9CA3AF', marginTop: 8, fontSize: 15 },
});
