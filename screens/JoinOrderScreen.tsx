import AppLogo from '@/components/AppLogo';
import { theme } from '@/constants/theme';
import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type JoinOrderScreenProps = {
  orderId: string;
  restaurantName: string;
  onJoin: () => void | Promise<void>;
  joining?: boolean;
  expired?: boolean;
};

/**
 * Join Order screen: shown when user opens an order invite link.
 * Displays order info and a Join button; deep link navigates to /order/{orderId}.
 */
export default function JoinOrderScreen({
  orderId,
  restaurantName,
  onJoin,
  joining = false,
  expired = false,
}: JoinOrderScreenProps) {
  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <AppLogo />
        <Text style={styles.title}>{'You\'re invited'}</Text>
        <Text style={styles.restaurant}>{restaurantName || 'This order'}</Text>
        <Text style={styles.subtitle}>Want to split the order?</Text>
        {expired ? (
          <Text style={styles.expiredMessage}>This order has expired.</Text>
        ) : (
          <TouchableOpacity
            style={[styles.joinButton, joining && styles.joinButtonDisabled]}
            onPress={() => onJoin()}
            disabled={joining}
            activeOpacity={0.85}
          >
            {joining ? (
              <ActivityIndicator size="small" color="#000" />
            ) : (
              <Text style={styles.joinButtonText}>Join Order</Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  content: {
    alignItems: 'center',
    maxWidth: 320,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.colors.text,
    marginTop: 24,
    marginBottom: 8,
  },
  restaurant: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.primary,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: theme.colors.textMuted,
    marginBottom: 24,
    textAlign: 'center',
  },
  joinButton: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    minWidth: 200,
    alignItems: 'center',
  },
  joinButtonDisabled: {
    opacity: 0.8,
  },
  joinButtonText: {
    color: theme.colors.textOnPrimary ?? '#000',
    fontWeight: '700',
    fontSize: 16,
  },
  expiredMessage: {
    fontSize: 16,
    fontWeight: '600',
    color: '#DC2626',
    textAlign: 'center',
    marginTop: 8,
  },
});
