import { submitComplaint } from '@/services/complaints';
import { moderateUserContent } from '@/utils/contentModeration';
import { useAuth } from '@/services/AuthContext';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
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
import { showError, showSuccess } from '@/utils/toast';

const c = theme.colors;

export default function ComplaintScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    const trimmed = message.trim();
    if (!trimmed) {
      showError('Please enter your message.');
      return;
    }
    const mod = moderateUserContent(trimmed, { maxLength: 2000 });
    if (!mod.ok) {
      showError(mod.reason);
      return;
    }
    if (!user) {
      showError('Please sign in to submit a complaint or inquiry.');
      return;
    }
    setSubmitting(true);
    try {
      await submitComplaint(
        { uid: user.uid, email: user.email ?? null },
        mod.text,
      );
      setMessage('');
      showSuccess('Your message has been sent. We will get back to you soon.');
      router.back();
    } catch (e) {
      showError(getUserFriendlyError(e));
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Complaint or inquiry</Text>
        </View>
        <View style={styles.centered}>
          <Text style={styles.hint}>
            Please sign in to submit a complaint or inquiry.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Complaint or inquiry</Text>
      </View>
      <KeyboardAvoidingView
        style={styles.content}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <Text style={styles.label}>Your message</Text>
        <TextInput
          value={message}
          onChangeText={setMessage}
          placeholder="Describe your complaint or inquiry..."
          placeholderTextColor={c.iconInactive}
          style={styles.input}
          multiline
          numberOfLines={5}
          maxLength={2000}
          editable={!submitting}
        />
        <TouchableOpacity
          style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={submitting || !message.trim()}
        >
          <Text style={styles.submitBtnText}>
            {submitting ? 'Sending...' : 'Submit'}
          </Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  backText: {
    fontSize: 16,
    color: c.primary,
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: c.text,
    marginLeft: 16,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: c.text,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: c.text,
    minHeight: 140,
    textAlignVertical: 'top',
  },
  submitBtn: {
    backgroundColor: c.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 24,
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: c.textOnPrimary,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  hint: {
    fontSize: 16,
    color: c.textMuted,
    textAlign: 'center',
  },
});
