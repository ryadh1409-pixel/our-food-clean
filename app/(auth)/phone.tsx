import { useAuth } from '@/services/AuthContext';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth } from '@/services/firebase';
import { theme } from '@/constants/theme';

const c = theme.colors;

export default function PhoneLoginScreen() {
  const router = useRouter();
  const { signInWithPhone, confirmPhoneCode } = useAuth();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [loading, setLoading] = useState(false);

  const handleSendCode = async () => {
    const trimmed = phone.trim().replace(/\D/g, '');
    if (trimmed.length < 10) {
      Alert.alert('Error', 'Enter a valid phone number.');
      return;
    }
    const phoneNumber =
      trimmed.length >= 11 && trimmed.startsWith('1')
        ? `+${trimmed}`
        : `+1${trimmed}`;
    setLoading(true);
    try {
      await signInWithPhone(phoneNumber);
      setStep('code');
    } catch (err) {
      Alert.alert(
        'Error',
        err instanceof Error ? err.message : 'Failed to send code',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmCode = async () => {
    const trimmed = code.trim();
    if (!trimmed) {
      Alert.alert('Error', 'Enter the verification code.');
      return;
    }
    setLoading(true);
    try {
      await confirmPhoneCode(trimmed);
      router.replace('/(tabs)');
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Invalid code');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.content}>
        {Platform.OS === 'web' ? (
          <View nativeID="recaptcha-container" style={styles.recaptchaHidden} />
        ) : null}
        <Text style={styles.title}>Phone sign-in</Text>
        <Text style={styles.subtitle}>
          {step === 'phone'
            ? 'Enter your phone number to receive a code.'
            : 'Enter the code sent to your phone.'}
        </Text>

        {step === 'phone' ? (
          <>
            <Text style={styles.label}>Phone number</Text>
            <TextInput
              style={styles.input}
              placeholder="+1 234 567 8900"
              placeholderTextColor={c.textMuted}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              editable={!loading}
            />
            <TouchableOpacity
              style={[styles.primaryBtn, loading && styles.btnDisabled]}
              onPress={handleSendCode}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={c.textOnPrimary} />
              ) : (
                <Text style={styles.primaryBtnText}>Send code</Text>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.label}>Verification code</Text>
            <TextInput
              style={styles.input}
              placeholder="123456"
              placeholderTextColor={c.textMuted}
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              editable={!loading}
            />
            <TouchableOpacity
              style={[styles.primaryBtn, loading && styles.btnDisabled]}
              onPress={handleConfirmCode}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={c.textOnPrimary} />
              ) : (
                <Text style={styles.primaryBtnText}>Confirm</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => setStep('phone')}
              disabled={loading}
            >
              <Text style={styles.backBtnText}>Use different number</Text>
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity
          style={styles.linkBtn}
          onPress={() => router.back()}
          disabled={loading}
        >
          <Text style={styles.linkBtnText}>Back to login</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: c.sheetDark },
  content: { flex: 1, paddingHorizontal: 24, paddingTop: 48 },
  recaptchaHidden: { position: 'absolute', left: -9999, width: 1, height: 1 },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: c.white,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: c.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: c.textSecondary,
    marginBottom: 8,
  },
  input: {
    backgroundColor: c.surfaceDark,
    borderWidth: 1,
    borderColor: c.surfaceDarkElevated,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: c.white,
    marginBottom: 16,
  },
  primaryBtn: {
    backgroundColor: c.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryBtnText: {
    color: c.textOnPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  btnDisabled: { opacity: 0.7 },
  backBtn: { marginTop: 16, alignItems: 'center' },
  backBtnText: { color: c.textSecondary, fontSize: 14 },
  linkBtn: { marginTop: 32, alignItems: 'center' },
  linkBtnText: { color: c.primary, fontSize: 15, fontWeight: '600' },
});
