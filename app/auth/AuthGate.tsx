import { shadows, theme } from '@/constants/theme';
import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const c = theme.colors;

export default function AuthGate() {
  const router = useRouter();

  const handleClose = () => router.back();
  const handleEmail = () => router.push('/login');

  return (
    <View style={styles.overlay}>
      <View style={styles.card}>
        <TouchableOpacity
          onPress={handleClose}
          style={styles.closeButton}
          hitSlop={12}
        >
          <Text style={styles.closeText}>×</Text>
        </TouchableOpacity>

        <Text style={styles.title}>HalfOrder</Text>
        <Text style={styles.subtitle}>Split meals. Pay half.</Text>
        <Text style={styles.description}>
          Sign in to join this order and start saving.
        </Text>

        <View style={styles.buttons}>
          <TouchableOpacity style={styles.primaryButton} onPress={handleEmail}>
            <Text style={styles.primaryButtonText}>Continue with Email</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: c.overlayScrim,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: c.background,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: c.border,
    ...shadows.card,
  },
  closeButton: {
    position: 'absolute',
    top: theme.spacing.sm,
    right: theme.spacing.sm,
    width: theme.spacing.touchMin,
    height: theme.spacing.touchMin,
    borderRadius: theme.radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeText: {
    fontSize: 20,
    color: c.iconInactive,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: c.text,
    textAlign: 'center',
    marginTop: 8,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: '600',
    color: c.textSlateDark,
    textAlign: 'center',
    marginTop: 8,
  },
  description: {
    fontSize: 13,
    color: c.textMuted,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  buttons: {
    gap: 10,
  },
  primaryButton: {
    backgroundColor: c.primary,
    borderRadius: theme.radius.button,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: theme.spacing.touchMin,
  },
  primaryButtonText: {
    color: c.textOnPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
});
