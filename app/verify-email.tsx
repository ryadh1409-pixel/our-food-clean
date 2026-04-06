import { userNeedsEmailVerification } from '@/lib/authEmailVerification';
import { useAuth } from '@/services/AuthContext';
import { auth } from '@/services/firebase';
import { logError } from '@/utils/errorLogger';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { sendEmailVerification } from 'firebase/auth';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { theme } from '@/constants/theme';

const c = theme.colors;
const COOLDOWN_SEC = 30;
const POLL_MS = 3000;
const NAV_DELAY_MS = 850;

export default function VerifyEmailScreen() {
  const router = useRouter();
  const { user, loading: authLoading, reloadAuthUser, signOutUser } = useAuth();
  const [checking, setChecking] = useState(true);
  const [verified, setVerified] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [message, setMessage] = useState('');
  const [messageIsSuccess, setMessageIsSuccess] = useState(true);
  const [actionError, setActionError] = useState('');

  const successScale = useRef(new Animated.Value(0)).current;
  const navigateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/(auth)/login' as Parameters<typeof router.replace>[0]);
      return;
    }
    if (!userNeedsEmailVerification(user)) {
      router.replace('/(tabs)' as Parameters<typeof router.replace>[0]);
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((prev) => prev - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  useEffect(() => {
    if (!verified) return;
    successScale.setValue(0);
    Animated.spring(successScale, {
      toValue: 1,
      friction: 7,
      tension: 80,
      useNativeDriver: true,
    }).start();
  }, [verified, successScale]);

  useEffect(() => {
    if (authLoading || verified) return;
    const session = auth.currentUser;
    if (!session?.uid || !userNeedsEmailVerification(session)) return;

    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const tick = async () => {
      if (cancelled) return;
      try {
        await reloadAuthUser();
        const u = auth.currentUser;
        if (u?.emailVerified) {
          if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
          }
          setVerified(true);
          setChecking(false);
          if (navigateTimerRef.current) clearTimeout(navigateTimerRef.current);
          navigateTimerRef.current = setTimeout(() => {
            router.replace('/(tabs)' as Parameters<typeof router.replace>[0]);
          }, NAV_DELAY_MS);
          return;
        }
      } catch (error) {
        logError(error);
      } finally {
        if (!cancelled) setChecking(false);
      }
    };

    void tick();
    intervalId = setInterval(() => void tick(), POLL_MS);

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
      if (navigateTimerRef.current) {
        clearTimeout(navigateTimerRef.current);
        navigateTimerRef.current = null;
      }
    };
  }, [authLoading, verified, reloadAuthUser, router]);

  const onVerified = async () => {
    setLoading(true);
    setMessage('');
    setActionError('');
    try {
      await reloadAuthUser();
      const u = auth.currentUser;
      if (u?.emailVerified) {
        setVerified(true);
        if (navigateTimerRef.current) clearTimeout(navigateTimerRef.current);
        navigateTimerRef.current = setTimeout(() => {
          router.replace('/(tabs)' as Parameters<typeof router.replace>[0]);
        }, NAV_DELAY_MS);
      } else {
        setActionError('Please verify your email first. Open the link we sent, then try again.');
      }
    } catch (e) {
      logError(e);
      setActionError('Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || verified) return;

    const u = auth.currentUser;
    if (!u?.email) {
      setMessageIsSuccess(false);
      setMessage('Something went wrong. Try again.');
      return;
    }

    try {
      setResendLoading(true);
      setMessage('');
      setActionError('');
      await sendEmailVerification(u);
      setMessageIsSuccess(true);
      setMessage('Verification email sent again 📩');
      setCooldown(COOLDOWN_SEC);
    } catch (error) {
      logError(error);
      setMessageIsSuccess(false);
      setMessage('Something went wrong. Try again.');
    } finally {
      setResendLoading(false);
    }
  };

  const resendDisabled =
    resendLoading || cooldown > 0 || loading || verified;
  const resendLabel = resendLoading
    ? 'Sending...'
    : cooldown > 0
      ? `Resend in ${cooldown}s`
      : 'Resend Email';

  const anyBusy = loading || resendLoading;

  if (authLoading || !user) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={c.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={[styles.banner, verified && styles.bannerSuccess]}>
        <MaterialIcons
          name={verified ? 'mark-email-read' : 'mark-email-unread'}
          size={20}
          color={verified ? c.success : '#FBBF24'}
          style={styles.bannerIcon}
        />
        <Text style={[styles.bannerText, verified && styles.bannerTextSuccess]}>
          {verified ? 'Email verified' : 'Email not verified'}
        </Text>
      </View>

      <View style={styles.body}>
        <Text style={styles.title}>Verify your email</Text>
        <Text style={styles.bodyText}>
          We sent a verification link to your email. Please check your inbox.
        </Text>

        {verified ? (
          <Animated.View
            style={[styles.successBlock, { transform: [{ scale: successScale }] }]}
          >
            <MaterialIcons name="check-circle" size={72} color={c.success} />
            <Text style={styles.successTitle}>{"You're all set!"}</Text>
            <Text style={styles.successSub}>Taking you to the app…</Text>
            <ActivityIndicator color={c.primary} style={styles.successSpinner} />
          </Animated.View>
        ) : (
          <>
            <View style={styles.waitingBlock}>
              <ActivityIndicator size="large" color={c.primary} />
              <Text style={styles.waitingText}>
                {checking ? 'Checking verification status…' : 'Waiting for verification…'}
              </Text>
              <Text style={styles.waitingHint}>
                {
                  "We'll continue checking automatically. You can also tap I verified after you open the link."
                }
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.primaryBtn, (loading || verified) && styles.btnBusy]}
              onPress={() => void onVerified()}
              disabled={anyBusy || verified}
              activeOpacity={0.9}
            >
              {loading ? (
                <ActivityIndicator color={c.textOnPrimary} />
              ) : (
                <Text style={styles.primaryBtnText}>I verified</Text>
              )}
            </TouchableOpacity>

            {actionError !== '' ? (
              <Text style={styles.actionError} accessibilityLiveRegion="polite">
                ⚠️ {actionError}
              </Text>
            ) : null}

            <TouchableOpacity
              style={[styles.secondaryBtn, resendDisabled && styles.secondaryBtnDisabled]}
              onPress={() => void handleResend()}
              disabled={resendDisabled}
              activeOpacity={0.85}
            >
              {resendLoading ? (
                <View style={styles.resendRow}>
                  <ActivityIndicator color={c.primary} size="small" style={styles.resendSpinner} />
                  <Text style={[styles.secondaryBtnText, styles.secondaryBtnTextMuted]}>
                    Sending...
                  </Text>
                </View>
              ) : (
                <View style={styles.resendRow}>
                  <MaterialIcons
                    name="refresh"
                    size={20}
                    color={cooldown > 0 ? c.iconInactive : c.primary}
                    style={styles.resendIcon}
                  />
                  <Text
                    style={[
                      styles.secondaryBtnText,
                      cooldown > 0 && styles.secondaryBtnTextMuted,
                    ]}
                  >
                    {resendLabel}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </>
        )}

        {!verified && message !== '' ? (
          <Text
            style={[
              styles.feedbackText,
              messageIsSuccess ? styles.feedbackSuccess : styles.feedbackError,
            ]}
            accessibilityLiveRegion="polite"
          >
            {message}
          </Text>
        ) : null}

        {!verified ? (
          <TouchableOpacity
            style={styles.footerLinkWrap}
            onPress={() => void signOutUser()}
            disabled={anyBusy}
            hitSlop={12}
          >
            <Text style={styles.footerLink}>Use a different account</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: c.sheetDark,
  },
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(251, 191, 36, 0.14)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(251, 191, 36, 0.35)',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  bannerSuccess: {
    backgroundColor: 'rgba(76, 175, 80, 0.18)',
    borderBottomColor: 'rgba(76, 175, 80, 0.35)',
  },
  bannerIcon: {
    marginRight: 8,
  },
  bannerText: {
    color: '#FDE68A',
    fontSize: 15,
    fontWeight: '600',
  },
  bannerTextSuccess: {
    color: c.success,
  },
  body: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 36,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: c.white,
    letterSpacing: -0.4,
    marginBottom: 16,
  },
  bodyText: {
    fontSize: 16,
    lineHeight: 24,
    color: c.textSecondary,
    marginBottom: 28,
  },
  waitingBlock: {
    alignItems: 'center',
    marginBottom: 28,
  },
  waitingText: {
    marginTop: 14,
    fontSize: 16,
    fontWeight: '600',
    color: c.white,
    textAlign: 'center',
  },
  waitingHint: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 20,
    color: c.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  successBlock: {
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 32,
  },
  successTitle: {
    marginTop: 16,
    fontSize: 22,
    fontWeight: '700',
    color: c.white,
  },
  successSub: {
    marginTop: 8,
    fontSize: 15,
    color: c.textSecondary,
    textAlign: 'center',
  },
  successSpinner: {
    marginTop: 20,
  },
  primaryBtn: {
    backgroundColor: c.primary,
    borderRadius: 14,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnBusy: {
    opacity: 0.85,
  },
  primaryBtnText: {
    fontSize: 17,
    fontWeight: '700',
    color: c.textOnPrimary,
  },
  actionError: {
    color: c.danger,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 10,
    marginBottom: 10,
    fontWeight: '500',
  },
  secondaryBtn: {
    marginTop: 16,
    minHeight: 52,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    justifyContent: 'center',
  },
  secondaryBtnDisabled: {
    opacity: 0.55,
  },
  resendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resendIcon: {
    marginRight: 8,
  },
  resendSpinner: {
    marginRight: 10,
  },
  secondaryBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: c.primary,
  },
  secondaryBtnTextMuted: {
    color: c.textSecondary,
  },
  feedbackText: {
    marginTop: 14,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '500',
    textAlign: 'center',
  },
  feedbackSuccess: {
    color: c.success,
  },
  feedbackError: {
    color: c.danger,
  },
  footerLinkWrap: {
    marginTop: 28,
    alignSelf: 'center',
    paddingVertical: 8,
  },
  footerLink: {
    fontSize: 15,
    color: c.textSecondary,
    fontWeight: '600',
  },
});
