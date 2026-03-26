import { auth } from '@/services/firebase';
import { sendPasswordResetEmail } from '@firebase/auth';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { theme } from '@/constants/theme';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleReset = async () => {
    const trimmed = email.trim();
    setError('');
    setMessage('');
    if (!trimmed) {
      setError('Please enter your email');
      return;
    }
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, trimmed);
      setMessage('Check your email to reset your password.');
    } catch (err: unknown) {
      const code =
        err && typeof err === 'object' && 'code' in err
          ? String((err as { code: string }).code)
          : '';
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: string }).message)
          : 'Something went wrong.';
      if (code === 'auth/invalid-email') {
        setError('Please enter a valid email address.');
      } else if (code === 'auth/user-not-found') {
        setError('No account found with this email.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const busy = loading;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboard}
      >
        <View style={styles.content}>
          <Text style={styles.title}>Reset your password</Text>
          <Text style={styles.subtitle}>
            {'Enter your email and we\'ll send you a link to reset your password.'}
          </Text>

          <View style={styles.form}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={[styles.input, { fontSize: 16 }]}
              placeholder="you@example.com"
              placeholderTextColor={theme.colors.textMuted}
              value={email}
              onChangeText={(text) => {
                setEmail(text);
                setError('');
                setMessage('');
              }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!busy}
            />

            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            {message ? <Text style={styles.messageText}>{message}</Text> : null}

            <TouchableOpacity
              style={[styles.primaryBtn, busy && styles.btnDisabled]}
              onPress={handleReset}
              disabled={busy}
            >
              {loading ? (
                <ActivityIndicator color={theme.colors.textOnPrimary} />
              ) : (
                <Text style={styles.primaryBtnText}>Send Reset Email</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => router.back()}
              disabled={busy}
            >
              <Text style={styles.backBtnText}>Back to login</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  keyboard: { flex: 1 },
  content: {
    flex: 1,
    paddingHorizontal: theme.spacing.screen,
    paddingTop: 48,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: theme.colors.text,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: theme.colors.textMuted,
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 32,
    paddingHorizontal: 8,
  },
  form: { gap: 16, width: '100%', maxWidth: 400 },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 12,
    borderRadius: 8,
    color: theme.colors.text,
    backgroundColor: theme.colors.background,
  },
  errorText: {
    fontSize: 14,
    color: theme.colors.dangerText,
    marginTop: 4,
    textAlign: 'center',
  },
  messageText: {
    fontSize: 14,
    color: theme.colors.success,
    marginTop: 4,
    textAlign: 'center',
  },
  primaryBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.button,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryBtnText: {
    color: theme.colors.textOnPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  backBtn: {
    alignItems: 'center',
    paddingVertical: 14,
  },
  backBtnText: {
    fontSize: 15,
    color: theme.colors.primary,
    fontWeight: '600',
  },
  btnDisabled: { opacity: 0.7 },
});
