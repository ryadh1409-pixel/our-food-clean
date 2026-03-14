import { KeyboardToolbar, KEYBOARD_TOOLBAR_NATIVE_ID } from '@/components/KeyboardToolbar';
import { useAuth } from '@/services/AuthContext';
import { logError } from '@/utils/errorLogger';
import { useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const BG = '#0D0D0D';
const BRAND = '#2563EB';
const FORM_LABEL = '#374151';
const FORM_INPUT = '#111827';
const FORM_PLACEHOLDER = '#9CA3AF';
const FORM_HELPER = '#6B7280';

const REGISTER_INPUTS = 3;

export default function RegisterScreen() {
  const router = useRouter();
  const { signUpWithEmail } = useAuth();
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmPasswordRef = useRef<TextInput>(null);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const refs = [emailRef, passwordRef, confirmPasswordRef];
  const focusPrev = () => {
    if (focusedIndex !== null && focusedIndex > 0) {
      refs[focusedIndex - 1].current?.focus();
      setFocusedIndex(focusedIndex - 1);
    }
  };
  const focusNext = () => {
    if (focusedIndex !== null && focusedIndex < REGISTER_INPUTS - 1) {
      refs[focusedIndex + 1].current?.focus();
      setFocusedIndex(focusedIndex + 1);
    }
  };

  const handleRegister = async () => {
    if (!email || !password || !confirmPassword) {
      Alert.alert('Error', 'Please fill all fields.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Error', 'Password should be at least 6 characters.');
      return;
    }
    setLoading(true);
    try {
      await signUpWithEmail(email.trim(), password);
      router.replace('/(tabs)');
    } catch (error: unknown) {
      logError(error, { alert: false });
      const msg =
        error && typeof error === 'object' && 'message' in error
          ? String((error as { message: string }).message)
          : 'Registration failed. Please try again.';
      Alert.alert('Error', msg);
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
        totalInputs={REGISTER_INPUTS}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboard}
      >
        <View style={styles.content}>
          <Text style={styles.title}>HalfOrder</Text>
          <Text style={styles.subtitle}>Split meals. Pay half.</Text>

          <View style={styles.form}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              ref={emailRef}
              style={styles.input}
              placeholder="you@example.com"
              placeholderTextColor={FORM_PLACEHOLDER}
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
            <Text style={styles.label}>Password</Text>
            <TextInput
              ref={passwordRef}
              style={styles.input}
              placeholder="At least 6 characters"
              placeholderTextColor={FORM_PLACEHOLDER}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              editable={!loading}
              inputAccessoryViewID={
                Platform.OS === 'ios' ? KEYBOARD_TOOLBAR_NATIVE_ID : undefined
              }
              onFocus={() => setFocusedIndex(1)}
            />
            <Text style={styles.label}>Confirm password</Text>
            <TextInput
              ref={confirmPasswordRef}
              style={styles.input}
              placeholder="••••••••"
              placeholderTextColor={FORM_PLACEHOLDER}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              editable={!loading}
              inputAccessoryViewID={
                Platform.OS === 'ios' ? KEYBOARD_TOOLBAR_NATIVE_ID : undefined
              }
              onFocus={() => setFocusedIndex(2)}
            />

            <TouchableOpacity
              style={[styles.primaryBtn, loading && styles.btnDisabled]}
              onPress={handleRegister}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>Create account</Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account? </Text>
            <TouchableOpacity onPress={() => router.back()} disabled={loading}>
              <Text style={styles.link}>Log in</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  keyboard: { flex: 1 },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 48,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: FORM_HELPER,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 40,
  },
  form: { gap: 16, backgroundColor: '#FFFFFF', padding: 24, borderRadius: 16 },
  label: { fontSize: 16, fontWeight: '600', color: FORM_LABEL, marginBottom: 4 },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: FORM_INPUT,
  },
  primaryBtn: {
    backgroundColor: BRAND,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  btnDisabled: { opacity: 0.7 },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 32,
  },
  footerText: { color: FORM_HELPER, fontSize: 15 },
  link: { color: BRAND, fontSize: 15, fontWeight: '600' },
});
