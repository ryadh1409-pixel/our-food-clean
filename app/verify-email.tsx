import { userNeedsEmailVerification } from '@/lib/authEmailVerification';
import { useAuth } from '@/services/AuthContext';
import { auth } from '@/services/firebase';
import { logError } from '@/utils/errorLogger';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { sendEmailVerification } from 'firebase/auth';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { theme } from '@/constants/theme';

const c = theme.colors;

export default function VerifyEmailScreen() {
  const router = useRouter();
  const { user, loading, reloadAuthUser, signOutUser } = useAuth();
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [resendBusy, setResendBusy] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/(auth)/login' as Parameters<typeof router.replace>[0]);
      return;
    }
    if (!userNeedsEmailVerification(user)) {
      router.replace('/(tabs)' as Parameters<typeof router.replace>[0]);
    }
  }, [loading, user, router]);

  const onVerified = async () => {
    setVerifyBusy(true);
    try {
      await reloadAuthUser();
      const u = auth.currentUser;
      if (u?.emailVerified) {
        router.replace('/(tabs)' as Parameters<typeof router.replace>[0]);
      } else {
        Alert.alert('Please verify your email first', 'Open the link we sent, then try again.');
      }
    } catch (e) {
      logError(e, { alert: false });
      Alert.alert('Error', 'Could not refresh your account. Try again.');
    } finally {
      setVerifyBusy(false);
    }
  };

  const onResend = async () => {
    const u = auth.currentUser;
    if (!u || !u.email) {
      Alert.alert('Error', 'No email on file.');
      return;
    }
    setResendBusy(true);
    try {
      await sendEmailVerification(u);
      Alert.alert('Email sent', 'Check your inbox for a new verification link.');
    } catch (e) {
      logError(e, { alert: false });
      Alert.alert('Error', 'Could not resend the email. Try again later.');
    } finally {
      setResendBusy(false);
    }
  };

  const anyBusy = verifyBusy || resendBusy;

  if (loading || !user) {
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
      <View style={styles.banner}>
        <MaterialIcons name="mark-email-unread" size={20} color="#FBBF24" style={styles.bannerIcon} />
        <Text style={styles.bannerText}>Email not verified</Text>
      </View>

      <View style={styles.body}>
        <Text style={styles.title}>Verify your email</Text>
        <Text style={styles.bodyText}>
          We sent a verification link to your email. Open it to confirm your account, then tap I
          verified.
        </Text>

        <TouchableOpacity
          style={[styles.primaryBtn, verifyBusy && styles.btnBusy]}
          onPress={() => void onVerified()}
          disabled={anyBusy}
          activeOpacity={0.9}
        >
          {verifyBusy ? (
            <ActivityIndicator color={c.textOnPrimary} />
          ) : (
            <Text style={styles.primaryBtnText}>I verified</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.secondaryBtn, resendBusy && styles.secondaryBtnBusy]}
          onPress={() => void onResend()}
          disabled={anyBusy}
          activeOpacity={0.85}
        >
          {resendBusy ? (
            <ActivityIndicator color={c.primary} />
          ) : (
            <>
              <MaterialIcons name="refresh" size={20} color={c.primary} style={styles.resendIcon} />
              <Text style={styles.secondaryBtnText}>Resend email</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.footerLinkWrap}
          onPress={() => void signOutUser()}
          disabled={anyBusy}
          hitSlop={12}
        >
          <Text style={styles.footerLink}>Use a different account</Text>
        </TouchableOpacity>
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
  bannerIcon: {
    marginRight: 8,
  },
  bannerText: {
    color: '#FDE68A',
    fontSize: 15,
    fontWeight: '600',
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
    marginBottom: 36,
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
  secondaryBtn: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  secondaryBtnBusy: {
    opacity: 0.8,
  },
  resendIcon: {
    marginRight: 8,
  },
  secondaryBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: c.primary,
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
