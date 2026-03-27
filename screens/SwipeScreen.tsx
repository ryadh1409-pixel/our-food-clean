import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export function SwipeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>HalfOrder</Text>
      <Text style={styles.subtitle}>Swipe through nearby shared orders</Text>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Pepperoni Pizza</Text>
        <Text style={styles.meta}>$10 each • Save 50%</Text>
        <Text style={styles.meta}>0.5 km away • Arrives in 20 min</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0D10',
    padding: 20,
    paddingTop: 52,
  },
  title: {
    color: '#F8FAFC',
    fontSize: 28,
    fontWeight: '800',
  },
  subtitle: {
    color: '#9CA3AF',
    marginTop: 6,
    marginBottom: 18,
    fontSize: 14,
  },
  card: {
    borderRadius: 20,
    padding: 20,
    backgroundColor: '#141922',
    borderWidth: 1,
    borderColor: '#232A35',
  },
  cardTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 6,
  },
  meta: {
    color: '#D1D5DB',
    fontSize: 14,
    marginBottom: 4,
  },
});
