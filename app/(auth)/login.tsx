import { KeyboardToolbar, KEYBOARD_TOOLBAR_NATIVE_ID } from '@/components/KeyboardToolbar';
import { userNeedsEmailVerification } from '@/lib/authEmailVerification';
import { useAuth } from '@/services/AuthContext';
import { auth } from '@/services/firebase';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
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
import { getUserFriendlyError } from '@/utils/errorHandler';
import { showError } from '@/utils/toast';

const LOGIN_INPUTS = 2;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const c = theme.colors;

export default function LoginScreen() {
  const router = useRouter();
  const { redirectTo } = useLocalSearchParams<{ redirectTo?: string }>();
  const { signInWithEmail } = useAuth();
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const focusPrev = () => {
    if (focusedIndex !== null && focusedIndex > 0) {
      emailRef.current?.focus();
      setFocusedIndex(0);
    }
  };
  const focusNext = () => {
    if (focusedIndex !== null && focusedIndex < LOGIN_INPUTS - 1) {
      passwordRef.current?.focus();
      setFocusedIndex(1);
    }
  };

  const validateFields = (): boolean => {
    const trimmed = email.trim();
    if (!trimmed) {
      showError('Please enter your email.');
      return false;
    }
    if (!EMAIL_RE.test(trimmed)) {
      showError('Please enter a valid email address.');
      return false;
    }
    if (!password) {
      showError('Please enter your password.');
      return false;
    }
    return true;
  };

  const handleLogin = async () => {
    if (!validateFields()) {
      return;
    }

    const trimmed = email.trim();
    setLoading(true);
    try {
      await signInWithEmail(trimmed, password);
      const signedIn = auth.currentUser;
      if (userNeedsEmailVerification(signedIn)) {
        router.replace('/verify-email' as Parameters<typeof router.replace>[0]);
        return;
      }
      if (redirectTo) {
        router.replace(redirectTo as Parameters<typeof router.replace>[0]);
      } else {
        router.replace('/(tabs)');
      }
    } catch (err: unknown) {
      showError(getUserFriendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardToolbar
        onFocusPrevious={focusPrev}
        onFocusNext={focusNext}
        focusedIndex={focusedIndex}
        totalInputs={LOGIN_INPUTS}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboard}
      >
        <View style={styles.content}>
          <Text style={styles.title}>HalfOrder</Text>
          <Text style={styles.subtitle}>Split meals. Pay half.</Text>

          <View style={styles.form}>
            <TextInput
              ref={emailRef}
              style={styles.input}
              placeholder="Email"
              placeholderTextColor={c.iconInactive}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
              inputAccessoryViewID={
                Platform.OS === 'ios' ? KEYBOARD_TOOLBAR_NATIVE_ID : undefined
              }
              onFocus={() => setFocusedIndex(0)}
            />
            <TextInput
              ref={passwordRef}
              style={[styles.input, styles.passwordInput]}
              placeholder="Password"
              placeholderTextColor={c.iconInactive}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
              inputAccessoryViewID={
                Platform.OS === 'ios' ? KEYBOARD_TOOLBAR_NATIVE_ID : undefined
              }
              onFocus={() => setFocusedIndex(1)}
            />
            <View style={styles.forgotRow}>
              <TouchableOpacity
                onPress={() => router.push('/(auth)/reset-password')}
                disabled={loading}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.forgotLink}>Forgot Password?</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.primaryBtn, loading && styles.primaryBtnLoading]}
              onPress={() => void handleLogin()}
              disabled={loading}
              activeOpacity={0.9}
            >
              {loading ? (
                <ActivityIndicator color={c.textOnPrimary} />
              ) : (
                <Text style={styles.primaryBtnText}>Log in</Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>{'Don\'t have an account? '}</Text>
            <TouchableOpacity
              onPress={() => router.push('/register')}
              disabled={loading}
            >
              <Text style={styles.link}>Sign up</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  keyboard: { flex: 1 },
  content: {
    flex: 1,
    paddingHorizontal: theme.spacing.screen,
    paddingTop: 48,
    alignItems: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: c.text,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: c.textMuted,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 32,
  },
  form: { width: '100%', maxWidth: 400 },
  input: {
    borderWidth: 1,
    borderColor: c.borderStrong,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    fontSize: 16,
    color: c.text,
    backgroundColor: c.background,
  },
  passwordInput: {
    marginBottom: 4,
  },
  forgotRow: {
    alignSelf: 'flex-end',
    marginBottom: 8,
  },
  forgotLink: {
    fontSize: 14,
    color: c.primary,
    fontWeight: '600',
  },
  primaryBtn: {
    backgroundColor: c.primary,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 54,
    marginTop: 8,
  },
  primaryBtnLoading: {
    backgroundColor: c.iconInactive,
  },
  primaryBtnText: {
    color: c.textOnPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 40,
  },
  footerText: { color: c.textMuted, fontSize: 15 },
  link: { color: c.primary, fontSize: 15, fontWeight: '600' },
});
