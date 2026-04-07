import { deleteUserAccount } from '@/services/deleteUserAccount';
import { getUserFriendlyError } from '@/utils/errorHandler';
import { logError } from '@/utils/errorLogger';
import { showNotice } from '@/utils/toast';
import type { User } from '@firebase/auth';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const PALETTE = {
  overlay: 'rgba(0,0,0,0.72)',
  sheet: '#161B22',
  sheetBorder: 'rgba(255,255,255,0.08)',
  title: '#F9FAFB',
  subtitle: 'rgba(255,255,255,0.62)',
  secondaryBtnBg: 'rgba(255,255,255,0.08)',
  secondaryBtnBorder: 'rgba(255,255,255,0.14)',
  secondaryLabel: '#E5E7EB',
  destructive: '#DC2626',
  destructivePressed: '#B91C1C',
  error: '#F87171',
  successIcon: '#34D399',
} as const;

type Phase = 'confirm' | 'success';

export type DeleteAccountModalProps = {
  visible: boolean;
  user: User | null;
  onDismiss: () => void;
  /** Called after success delay (sign-out already done by `deleteUser`). */
  onNavigateLogin: () => void;
};

export function DeleteAccountModal({
  visible,
  user,
  onDismiss,
  onNavigateLogin,
}: DeleteAccountModalProps) {
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<Phase>('confirm');
  const [submitting, setSubmitting] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslate = useRef(new Animated.Value(16)).current;
  const sheetOpacity = useRef(new Animated.Value(0)).current;
  const successOpacity = useRef(new Animated.Value(0)).current;
  const successScale = useRef(new Animated.Value(0.92)).current;

  const runEnterAnimation = useCallback(() => {
    backdropOpacity.setValue(0);
    sheetOpacity.setValue(0);
    sheetTranslate.setValue(16);
    Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 1,
        duration: 280,
        useNativeDriver: true,
      }),
      Animated.spring(sheetTranslate, {
        toValue: 0,
        damping: 26,
        stiffness: 280,
        useNativeDriver: true,
      }),
      Animated.timing(sheetOpacity, {
        toValue: 1,
        duration: 240,
        useNativeDriver: true,
      }),
    ]).start();
  }, [backdropOpacity, sheetOpacity, sheetTranslate]);

  const resetAndDismiss = useCallback(() => {
    setPhase('confirm');
    setSubmitting(false);
    setErrorText(null);
    onDismiss();
  }, [onDismiss]);

  useEffect(() => {
    if (!visible) {
      setPhase('confirm');
      setSubmitting(false);
      setErrorText(null);
      backdropOpacity.setValue(0);
      sheetOpacity.setValue(0);
      sheetTranslate.setValue(16);
      successOpacity.setValue(0);
      successScale.setValue(0.92);
      return;
    }
    runEnterAnimation();
  }, [visible, runEnterAnimation, backdropOpacity, sheetOpacity, sheetTranslate, successOpacity, successScale]);

  useEffect(() => {
    if (phase !== 'success' || !visible) return;
    successOpacity.setValue(0);
    successScale.setValue(0.92);
    Animated.parallel([
      Animated.timing(successOpacity, {
        toValue: 1,
        duration: 320,
        useNativeDriver: true,
      }),
      Animated.spring(successScale, {
        toValue: 1,
        friction: 8,
        tension: 80,
        useNativeDriver: true,
      }),
    ]).start();

    const t = setTimeout(() => {
      onNavigateLogin();
    }, 1500);
    return () => clearTimeout(t);
  }, [phase, visible, onNavigateLogin, successOpacity, successScale]);

  const handleCancel = () => {
    if (submitting || phase === 'success') return;
    Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(sheetOpacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) resetAndDismiss();
    });
  };

  const handleDelete = async () => {
    if (!user || submitting || phase !== 'confirm') return;
    setErrorText(null);
    setSubmitting(true);
    try {
      await deleteUserAccount(user);
      setSubmitting(false);
      setPhase('success');
    } catch (err: unknown) {
      logError(err);
      setSubmitting(false);
      const code =
        err &&
        typeof err === 'object' &&
        'code' in err &&
        typeof (err as { code: unknown }).code === 'string'
          ? (err as { code: string }).code
          : '';
      if (code === 'auth/requires-recent-login') {
        showNotice(
          'Session expired',
          'For your security, sign in again. Then you can delete your account from Settings.',
        );
        onDismiss();
        onNavigateLogin();
        return;
      }
      setErrorText(getUserFriendlyError(err));
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={handleCancel}
    >
      <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <Animated.View
          pointerEvents="none"
          style={[styles.backdrop, { opacity: backdropOpacity }]}
        />
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={phase === 'confirm' && !submitting ? handleCancel : undefined}
          accessibilityLabel="Close"
        />
        {phase === 'confirm' ? (
          <Animated.View
            style={[
              styles.sheet,
              {
                opacity: sheetOpacity,
                transform: [{ translateY: sheetTranslate }],
              },
            ]}
          >
            <Text style={styles.title}>Delete account</Text>
            <Text style={styles.subtitle}>
              This action is permanent and cannot be undone.
            </Text>

            {errorText ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{errorText}</Text>
              </View>
            ) : null}

            <View style={styles.actions}>
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={handleCancel}
                disabled={submitting}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Cancel account deletion"
              >
                <Text style={styles.secondaryLabel}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.destructiveBtn, submitting && styles.destructiveBtnDisabled]}
                onPress={() => void handleDelete()}
                disabled={submitting}
                activeOpacity={0.88}
                accessibilityRole="button"
                accessibilityLabel="Permanently delete account"
              >
                {submitting ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.destructiveLabel}>Delete</Text>
                )}
              </TouchableOpacity>
            </View>
          </Animated.View>
        ) : (
          <Animated.View
            style={[
              styles.successSheet,
              { opacity: successOpacity, transform: [{ scale: successScale }] },
            ]}
          >
            <View style={styles.successIconWrap}>
              <MaterialIcons
                name="check-circle"
                size={72}
                color={PALETTE.successIcon}
              />
            </View>
            <Text style={styles.successTitle}>Account deleted</Text>
            <Text style={styles.successSubtitle}>We’re sorry to see you go.</Text>
          </Animated.View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: PALETTE.overlay,
  },
  sheet: {
    width: '100%',
    maxWidth: 400,
    zIndex: 2,
    backgroundColor: PALETTE.sheet,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: PALETTE.sheetBorder,
    paddingHorizontal: 26,
    paddingTop: 28,
    paddingBottom: 26,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.45,
    shadowRadius: 28,
    elevation: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: PALETTE.title,
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 10,
    fontSize: 16,
    lineHeight: 23,
    color: PALETTE.subtitle,
    textAlign: 'center',
  },
  errorBox: {
    marginTop: 18,
    padding: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(248,113,113,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.25)',
  },
  errorText: {
    color: PALETTE.error,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    fontWeight: '500',
  },
  actions: {
    marginTop: 26,
    gap: 12,
  },
  secondaryBtn: {
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: PALETTE.secondaryBtnBorder,
    backgroundColor: PALETTE.secondaryBtnBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryLabel: {
    fontSize: 17,
    fontWeight: '600',
    color: PALETTE.secondaryLabel,
  },
  destructiveBtn: {
    height: 52,
    borderRadius: 14,
    backgroundColor: PALETTE.destructive,
    alignItems: 'center',
    justifyContent: 'center',
  },
  destructiveBtnDisabled: {
    opacity: 0.72,
  },
  destructiveLabel: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  successSheet: {
    width: '100%',
    maxWidth: 360,
    zIndex: 2,
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 28,
  },
  successIconWrap: {
    marginBottom: 20,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: PALETTE.title,
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  successSubtitle: {
    marginTop: 10,
    fontSize: 16,
    lineHeight: 23,
    color: PALETTE.subtitle,
    textAlign: 'center',
  },
});
