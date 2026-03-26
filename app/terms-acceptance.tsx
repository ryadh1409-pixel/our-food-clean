import {
  TERMS_ACCEPTANCE_STORAGE_KEY,
  emitTermsAccepted,
  normalizeReturnPathAfterTerms,
} from '@/constants/termsAcceptance';
import { theme } from '@/constants/theme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const SUPPORT_EMAIL = 'support@halforder.app';

export default function TermsAcceptanceScreen() {
  const router = useRouter();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const [loading, setLoading] = useState(false);

  const accept = async () => {
    setLoading(true);
    try {
      await AsyncStorage.setItem(
        TERMS_ACCEPTANCE_STORAGE_KEY,
        new Date().toISOString(),
      );
      emitTermsAccepted();
      const next = normalizeReturnPathAfterTerms(
        typeof returnTo === 'string' ? returnTo : undefined,
      );
      router.replace(next as Parameters<typeof router.replace>[0]);
    } catch {
      Alert.alert('Error', 'Could not save your choice. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Terms of Use</Text>
        <Text style={styles.p}>
          You must accept the HalfOrder Terms of Use and Privacy Policy before
          using the app.
        </Text>
        <TouchableOpacity
          onPress={() => router.push('/terms')}
          style={styles.linkBtn}
        >
          <Text style={styles.linkBtnText}>Read Terms of Use</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => router.push('/privacy')}
          style={styles.linkBtn}
        >
          <Text style={styles.linkBtnText}>Read Privacy Policy</Text>
        </TouchableOpacity>
        <Text style={styles.pSmall}>
          HalfOrder includes user-generated content. You can report objectionable
          content and block users from order and chat screens. We review reports as
          described in our Terms.
        </Text>
        <Text style={styles.pSmall}>
          Questions:{' '}
          <Text
            style={styles.mail}
            onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
          >
            {SUPPORT_EMAIL}
          </Text>
        </Text>
      </ScrollView>
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.primary, loading && styles.primaryDisabled]}
          onPress={accept}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={theme.colors.textOnPrimary} />
          ) : (
            <Text style={styles.primaryText}>I Agree</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  scroll: { padding: 24, paddingBottom: 120 },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 16,
  },
  p: {
    fontSize: 16,
    lineHeight: 24,
    color: theme.colors.text,
    marginBottom: 16,
  },
  pSmall: {
    fontSize: 14,
    lineHeight: 22,
    color: theme.colors.textMuted,
    marginTop: 16,
  },
  linkBtn: { marginBottom: 8 },
  linkBtnText: {
    fontSize: 16,
    color: theme.colors.accentBlue,
    fontWeight: '600',
  },
  mail: { color: theme.colors.accentBlue, textDecorationLine: 'underline' },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  primary: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 16,
    borderRadius: theme.radius.button,
    alignItems: 'center',
  },
  primaryDisabled: { opacity: 0.7 },
  primaryText: {
    fontSize: 17,
    fontWeight: '700',
    color: theme.colors.textOnPrimary,
  },
});
