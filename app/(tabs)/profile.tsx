import AppLogo from '@/components/AppLogo';
import { KeyboardToolbar, KEYBOARD_TOOLBAR_NATIVE_ID } from '@/components/KeyboardToolbar';
import { ScreenHeader } from '@/components/ScreenHeader';
import { logError } from '@/utils/errorLogger';
import { moderateUserContent } from '@/utils/contentModeration';
import { useTrustScore } from '@/hooks/useTrustScore';
import { useAuth } from '@/services/AuthContext';
import {
  deleteUserAccount,
  getDeleteAccountAuthErrorMessage,
} from '@/services/deleteUserAccount';
import {
  getBlockedUsersByBlocker,
  unblockUser,
} from '@/services/blocks';
import { submitReport, type ReportReason } from '@/services/reports';
import { auth, db } from '@/services/firebase';
import { doc, onSnapshot, setDoc, type DocumentData } from 'firebase/firestore';
import { useRouter } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import React, { useEffect, useRef, useState } from 'react';
import { updateProfile } from '@firebase/auth';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { shadows, theme } from '@/constants/theme';

const SUPPORT_EMAIL = 'support@halforder.app';
const ADMIN_EMAIL = 'support@halforder.app';

const c = theme.colors;

export default function ProfileScreen() {
  const router = useRouter();
  const { user, signOutUser } = useAuth();
  const [displayNameInput, setDisplayNameInput] = useState('');
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [savingName, setSavingName] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);
  const [nameSuccessMessage, setNameSuccessMessage] = useState('');
  const [nameErrorMessage, setNameErrorMessage] = useState('');
  const [initialDisplayName, setInitialDisplayName] = useState('');
  const [ordersCount, setOrdersCount] = useState<number>(0);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [reportUserId, setReportUserId] = useState('');
  const [reportReason, setReportReason] = useState<ReportReason>('spam');
  const [reportMessage, setReportMessage] = useState('');
  const [submittingReport, setSubmittingReport] = useState(false);
  const [blockedUsers, setBlockedUsers] = useState<string[]>([]);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);
  const [focusedInputIndex, setFocusedInputIndex] = useState<number | null>(null);
  const displayNameInputRef = useRef<TextInput>(null);
  const nameFeedbackClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const uid = user?.uid ?? null;
  const trustScore = useTrustScore(uid);

  useEffect(() => {
    if (!uid) {
      setProfileLoading(false);
      return;
    }
    const userRef = doc(db, 'users', uid);
    const unsubscribe = onSnapshot(
      userRef,
      (snap) => {
        if (!snap.exists()) {
          setDisplayNameInput('');
          setInitialDisplayName('');
          setNotificationsEnabled(false);
          setOrdersCount(0);
        } else {
          const data = snap.data() as DocumentData;
          const nextDisplayName =
            typeof data.displayName === 'string' ? data.displayName : '';
          setDisplayNameInput(
            nextDisplayName,
          );
          setInitialDisplayName(nextDisplayName);
          setNotificationsEnabled(data.notificationsEnabled !== false);
          setOrdersCount(
            typeof data.ordersCount === 'number' ? data.ordersCount : 0,
          );
        }
        setProfileLoading(false);
      },
      () => {
        setDisplayNameInput('');
        setInitialDisplayName('');
        setNotificationsEnabled(false);
        setProfileLoading(false);
      },
    );
    return () => unsubscribe();
  }, [uid]);

  useEffect(() => {
    if (!uid) {
      setBlockedUsers([]);
      return;
    }
    let cancelled = false;
    getBlockedUsersByBlocker(uid)
      .then((ids) => {
        if (!cancelled) setBlockedUsers(ids);
      })
      .catch(() => {
        if (!cancelled) setBlockedUsers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  useEffect(() => {
    return () => {
      if (nameFeedbackClearRef.current != null) {
        clearTimeout(nameFeedbackClearRef.current);
      }
    };
  }, []);

  const handleSaveDisplayName = async () => {
    if (savingName) return;
    const trimmed = displayNameInput.trim();
    if (!uid) return;
    const currentUser = auth.currentUser;
    if (!currentUser) {
      setNameErrorMessage('Something went wrong, try again');
      return;
    }
    if (!trimmed) {
      Alert.alert('Error', 'Display name cannot be empty.');
      return;
    }
    const mod = moderateUserContent(trimmed, { maxLength: 80 });
    if (!mod.ok) {
      Alert.alert('Display name', mod.reason);
      return;
    }
    if (nameFeedbackClearRef.current != null) {
      clearTimeout(nameFeedbackClearRef.current);
      nameFeedbackClearRef.current = null;
    }
    setSavingName(true);
    setNameSaved(false);
    setNameSuccessMessage('');
    setNameErrorMessage('');
    try {
      const userRef = doc(db, 'users', uid);
      await updateProfile(currentUser, { displayName: mod.text });
      await setDoc(userRef, { displayName: mod.text }, { merge: true });
      setDisplayNameInput(mod.text);
      setInitialDisplayName(mod.text);
      setNameSaved(true);
      setNameSuccessMessage('Name updated');
      nameFeedbackClearRef.current = setTimeout(() => {
        setNameSaved(false);
        setNameSuccessMessage('');
        nameFeedbackClearRef.current = null;
      }, 2000);
    } catch (err) {
      logError(err, { alert: false });
      setNameErrorMessage('Something went wrong, try again');
      nameFeedbackClearRef.current = setTimeout(() => {
        setNameErrorMessage('');
        nameFeedbackClearRef.current = null;
      }, 2000);
    } finally {
      setSavingName(false);
    }
  };

  const handleNotificationsToggle = async (value: boolean) => {
    if (!uid) return;
    setNotificationsEnabled(value);
    try {
      const userRef = doc(db, 'users', uid);
      await setDoc(userRef, { notificationsEnabled: value }, { merge: true });
    } catch (e) {
      logError(e, { alert: false });
      setNotificationsEnabled(!value);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOutUser();
    } catch (err) {
      logError(err, { alert: false });
      const message = err instanceof Error ? err.message : 'Failed to sign out';
      Alert.alert('Error', message);
      return;
    }
    router.replace('/(auth)/login');
  };

  const handleDeleteAccount = () => {
    if (!user) return;
    Alert.alert(
      'Delete Account',
      'Are you sure you want to delete your account? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void confirmDeleteAccount();
          },
        },
      ],
    );
  };

  const handleSubmitProfileReport = async () => {
    if (!uid) return;
    const target = reportUserId.trim();
    if (!target) {
      Alert.alert('Missing user ID', 'Enter the user ID you want to report.');
      return;
    }
    if (target === uid) {
      Alert.alert('Invalid target', 'You cannot report yourself.');
      return;
    }
    setSubmittingReport(true);
    try {
      await submitReport({
        reporterId: uid,
        reportedUserId: target,
        reason: reportReason,
        message: reportMessage.trim(),
      });
      setReportMessage('');
      Alert.alert('Report submitted', 'Thanks. We will review this report.');
    } catch (e) {
      Alert.alert(
        'Report failed',
        e instanceof Error ? e.message : 'Please try again.',
      );
    } finally {
      setSubmittingReport(false);
    }
  };

  const handleUnblockUser = async (blockedUserId: string) => {
    if (!uid) return;
    setUnblockingId(blockedUserId);
    try {
      await unblockUser(uid, blockedUserId);
      setBlockedUsers((prev) => prev.filter((id) => id !== blockedUserId));
      Alert.alert('Unblocked', 'User has been unblocked.');
    } catch (e) {
      Alert.alert(
        'Unblock failed',
        e instanceof Error ? e.message : 'Please try again.',
      );
    } finally {
      setUnblockingId(null);
    }
  };

  const confirmDeleteAccount = async () => {
    if (!user) return;
    setDeletingAccount(true);
    try {
      await deleteUserAccount(user);
      Alert.alert(
        'Account deleted',
        'Your account has been permanently removed.',
        [
          {
            text: 'OK',
            onPress: () => router.replace('/(auth)/login'),
          },
        ],
      );
    } catch (err: unknown) {
      logError(err, { alert: false });
      const code =
        err && typeof err === 'object' && 'code' in err
          ? String((err as { code: string }).code)
          : '';
      const message = code
        ? getDeleteAccountAuthErrorMessage(code)
        : err instanceof Error
          ? err.message
          : 'Something went wrong.';
      Alert.alert('Could not delete account', message);
    } finally {
      setDeletingAccount(false);
    }
  };

  const openSupportEmail = async () => {
    const url = `mailto:${SUPPORT_EMAIL}`;
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Contact Support', `Please email us at ${SUPPORT_EMAIL}`);
      }
    } catch {
      Alert.alert('Contact Support', `Please email us at ${SUPPORT_EMAIL}`);
    }
  };

  if (profileLoading && uid) {
    return (
      <SafeAreaView style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={c.primary} />
      </SafeAreaView>
    );
  }

  if (!uid) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <ScreenHeader title="My Account" logo="inline" />
          <View style={styles.profileBody}>
          <View style={styles.card}>
            <Text style={styles.cardHint}>
              Sign in to manage your account and settings.
            </Text>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => router.push('/(auth)/login')}
            >
              <Text style={styles.primaryButtonText}>Sign In</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.footer}>
            <Text style={styles.footerText}>❤️ Made with love in Toronto</Text>
            <Text style={styles.versionText}>v1.0</Text>
            <View style={styles.legalRow}>
              <TouchableOpacity onPress={() => router.push('/terms')}>
                <Text style={styles.legalLink}>Terms</Text>
              </TouchableOpacity>
              <Text style={styles.legalSpacer}> </Text>
              <TouchableOpacity onPress={() => router.push('/privacy')}>
                <Text style={styles.legalLink}>Privacy</Text>
              </TouchableOpacity>
            </View>
          </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const emailLabel = user?.email ?? 'Not set';
  const displayName = displayNameInput || 'User';
  const canSaveName =
    !savingName &&
    displayNameInput.trim().length > 0 &&
    displayNameInput.trim() !== initialDisplayName.trim();
  const saveButtonLabel = savingName ? 'Saving...' : nameSaved ? 'Saved ✓' : 'Save';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardToolbar focusedIndex={focusedInputIndex} totalInputs={1} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeader title="Profile" logo="inline" />
        <View style={styles.profileBody}>
        {/* Profile header: logo, name, rating */}
        <View style={styles.profileHeader}>
          <View style={styles.profileLogoRing}>
            <AppLogo size={72} marginTop={0} />
          </View>
          <Text style={styles.profileName} numberOfLines={1}>
            {displayName}
          </Text>
          {trustScore && trustScore.count > 0 ? (
            <View style={styles.profileRatingBadge}>
              <Text style={styles.profileStar}>★</Text>
              <Text style={styles.profileRatingText}>
                {trustScore.average.toFixed(1)} rating
              </Text>
              <Text style={styles.profileReviewsText}>
                ({trustScore.count} review{trustScore.count === 1 ? '' : 's'})
              </Text>
            </View>
          ) : null}
        </View>

        {/* Help */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/help')}
            activeOpacity={0.8}
          >
            <MaterialIcons
              name="help-outline"
              size={28}
              color={c.primary}
            />
            <Text style={styles.actionCardTitle}>Help</Text>
          </TouchableOpacity>
        </View>

        {/* Account section */}
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Display name</Text>
          <TextInput
            ref={displayNameInputRef}
            style={styles.input}
            value={displayNameInput}
            onChangeText={setDisplayNameInput}
            placeholder="Add your name"
            placeholderTextColor={c.iconInactive}
            editable={!savingName}
            inputAccessoryViewID={
              Platform.OS === 'ios' ? KEYBOARD_TOOLBAR_NATIVE_ID : undefined
            }
            onFocus={() => setFocusedInputIndex(0)}
          />
          <TouchableOpacity
            style={[
              styles.primaryButton,
              nameSaved && styles.primaryButtonSaved,
              !canSaveName && !nameSaved && styles.buttonDisabled,
            ]}
            disabled={!canSaveName}
            onPress={handleSaveDisplayName}
          >
            <Text style={styles.primaryButtonText}>{saveButtonLabel}</Text>
          </TouchableOpacity>
          {nameSuccessMessage ? (
            <Text style={styles.successMessage}>{nameSuccessMessage}</Text>
          ) : null}
          {nameErrorMessage ? (
            <Text style={styles.errorMessage}>{nameErrorMessage}</Text>
          ) : null}

          <Text style={styles.sectionLabel}>Email</Text>
          <Text style={styles.readOnlyValue}>{emailLabel}</Text>

          <View style={{ marginTop: 12 }}>
            <Text style={styles.sectionLabel}>Tax Gifts Earned</Text>
            <Text style={styles.taxGiftsStat}>
              🎁 Tax Gifts Earned: {Math.floor(ordersCount / 3)}
            </Text>
          </View>

          <View style={styles.cardRow}>
            <Text style={styles.sectionLabel}>Enable Notifications</Text>
            <Switch
              value={notificationsEnabled}
              onValueChange={handleNotificationsToggle}
              trackColor={{ false: c.border, true: c.primaryLight }}
              thumbColor={c.white}
            />
          </View>

          <Text style={[styles.sectionLabel, { marginTop: 12 }]}>Language</Text>
          <Text style={styles.readOnlyValue}>English</Text>

          <Text style={[styles.sectionLabel, { marginTop: 12 }]}>
            Customer Support
          </Text>
          <TouchableOpacity onPress={openSupportEmail} activeOpacity={0.7}>
            <Text style={styles.linkText}>{SUPPORT_EMAIL}</Text>
          </TouchableOpacity>
          <Text style={[styles.sectionLabel, { marginTop: 12 }]}>Legal</Text>
          <View style={styles.legalButtonsRow}>
            <TouchableOpacity
              style={styles.legalActionButton}
              onPress={() => router.push('/terms')}
              activeOpacity={0.75}
            >
              <Text style={styles.legalActionText}>Terms of Use</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.legalActionButton}
              onPress={() => router.push('/privacy')}
              activeOpacity={0.75}
            >
              <Text style={styles.legalActionText}>Privacy Policy</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={[styles.primaryButton, { marginTop: 12 }]}
            onPress={() => router.push('/complaint')}
            activeOpacity={0.7}
          >
            <Text style={styles.primaryButtonText}>
              Submit complaint or inquiry
            </Text>
          </TouchableOpacity>

          <Text style={[styles.sectionLabel, { marginTop: 10 }]}>Report User</Text>
          <TextInput
            value={reportUserId}
            onChangeText={setReportUserId}
            placeholder="Reported user ID"
            placeholderTextColor={c.textMuted}
            style={styles.input}
          />
          <View style={styles.reasonRow}>
            {(['spam', 'inappropriate', 'scam', 'other'] as ReportReason[]).map((reason) => {
              const active = reason === reportReason;
              return (
                <TouchableOpacity
                  key={reason}
                  style={[styles.reasonChip, active && styles.reasonChipActive]}
                  onPress={() => setReportReason(reason)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.reasonChipText, active && styles.reasonChipTextActive]}>
                    {reason}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <TextInput
            value={reportMessage}
            onChangeText={setReportMessage}
            placeholder="Message"
            placeholderTextColor={c.textMuted}
            style={[styles.input, styles.inputMultiline]}
            multiline
          />
          <TouchableOpacity
            style={[styles.primaryButton, submittingReport && styles.buttonDisabled]}
            onPress={handleSubmitProfileReport}
            disabled={submittingReport}
            activeOpacity={0.8}
          >
            {submittingReport ? (
              <ActivityIndicator size="small" color={c.textOnPrimary} />
            ) : (
              <Text style={styles.primaryButtonText}>Submit Report</Text>
            )}
          </TouchableOpacity>

          <Text style={[styles.sectionLabel, { marginTop: 16 }]}>Blocked Users</Text>
          {blockedUsers.length === 0 ? (
            <Text style={styles.readOnlyValue}>No blocked users</Text>
          ) : (
            blockedUsers.map((id) => (
              <View key={id} style={styles.blockedRow}>
                <Text style={styles.blockedUserId}>{id}</Text>
                <TouchableOpacity
                  style={styles.unblockBtn}
                  onPress={() => handleUnblockUser(id)}
                  disabled={unblockingId === id}
                  activeOpacity={0.8}
                >
                  {unblockingId === id ? (
                    <ActivityIndicator size="small" color={c.textOnPrimary} />
                  ) : (
                    <Text style={styles.unblockBtnText}>Unblock</Text>
                  )}
                </TouchableOpacity>
              </View>
            ))
          )}

          <Text style={[styles.sectionLabel, { marginTop: 24 }]}>Settings</Text>
          <Text style={styles.settingsHint}>
            To report or block someone: open your shared order (chat bar or
            Safety section), use Help for completed orders, or Report host /
            Block host on Join. See Terms for how we handle reports.
          </Text>
          <TouchableOpacity
            style={[
              styles.dangerButton,
              deletingAccount && styles.buttonDisabled,
            ]}
            onPress={handleDeleteAccount}
            disabled={deletingAccount}
            activeOpacity={0.85}
          >
            {deletingAccount ? (
              <ActivityIndicator size="small" color={c.textOnPrimary} />
            ) : (
              <Text style={styles.dangerButtonText}>Delete Account</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.signOutButton}
            onPress={handleSignOut}
          >
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>

        {/* Admin Panel */}
        {user?.email === ADMIN_EMAIL ? (
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>Admin</Text>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => router.push('/admin')}
              activeOpacity={0.7}
            >
              <Text style={styles.primaryButtonText}>Open Admin Panel</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={styles.footer}>
          <Text style={styles.footerText}>❤️ Made with love in Toronto</Text>
          <Text style={styles.versionText}>v1.0</Text>
          <View style={styles.legalRow}>
            <TouchableOpacity onPress={() => router.push('/terms')}>
              <Text style={styles.legalLink}>Terms</Text>
            </TouchableOpacity>
            <Text style={styles.legalSpacer}> </Text>
            <TouchableOpacity onPress={() => router.push('/privacy')}>
              <Text style={styles.legalLink}>Privacy</Text>
            </TouchableOpacity>
          </View>
        </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.background,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingBottom: 32,
  },
  profileBody: {
    paddingHorizontal: 16,
  },
  profileHeader: {
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  profileLogoRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: c.chromeWash,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.sm + 4,
    borderWidth: 1,
    borderColor: c.borderSubtle,
    ...shadows.card,
  },
  profileName: {
    fontSize: 20,
    fontWeight: '700',
    color: c.text,
    marginBottom: 4,
  },
  profileRatingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  profileStar: {
    color: c.warning,
    fontSize: 16,
  },
  profileRatingText: {
    fontSize: 14,
    fontWeight: '600',
    color: c.text,
  },
  profileReviewsText: {
    fontSize: 14,
    color: c.textMuted,
  },
  actionRow: {
    marginBottom: theme.spacing.lg,
  },
  actionCard: {
    width: '100%',
    backgroundColor: c.surface,
    borderRadius: theme.radius.lg,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.section,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: theme.spacing.touchMin + 28,
    borderWidth: 1,
    borderColor: c.border,
    ...shadows.card,
  },
  actionCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: c.text,
    marginTop: theme.spacing.sm,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: c.text,
    marginBottom: theme.spacing.tight,
  },
  card: {
    backgroundColor: c.background,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.section,
    marginBottom: theme.spacing.md,
    ...shadows.card,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: theme.spacing.tight,
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: c.textSlateDark,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: c.borderStrong,
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    color: c.text,
    marginBottom: 12,
  },
  readOnlyValue: {
    fontSize: 16,
    color: c.textMuted,
    marginBottom: 16,
  },
  taxGiftsStat: {
    fontSize: 13,
    color: c.textMuted,
    marginTop: 4,
  },
  primaryButton: {
    backgroundColor: c.primary,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  primaryButtonSaved: {
    backgroundColor: c.success,
  },
  primaryButtonText: {
    color: c.textOnPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  successMessage: {
    fontSize: 13,
    color: c.textMuted,
    marginBottom: 12,
  },
  errorMessage: {
    fontSize: 13,
    color: c.dangerText,
    marginBottom: 12,
  },
  settingsHint: {
    fontSize: 13,
    color: c.textMuted,
    lineHeight: 18,
    marginBottom: 16,
  },
  dangerButton: {
    backgroundColor: c.danger,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  dangerButtonText: {
    color: c.textOnPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  signOutButton: {
    paddingVertical: 12,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: c.border,
    marginTop: 8,
  },
  signOutText: {
    color: c.text,
    fontWeight: '600',
    fontSize: 16,
  },
  linkText: {
    fontSize: 16,
    color: c.accentBlue,
    textDecorationLine: 'underline',
  },
  legalButtonsRow: {
    marginBottom: 12,
    gap: theme.spacing.sm,
  },
  legalActionButton: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: theme.radius.button,
    minHeight: theme.spacing.touchMin,
    paddingVertical: 12,
    paddingHorizontal: 14,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: c.background,
  },
  legalActionText: {
    fontSize: 15,
    fontWeight: '600',
    color: c.textSlateDark,
  },
  reasonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
    marginBottom: 8,
  },
  reasonChip: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: c.background,
  },
  reasonChipActive: {
    borderColor: c.primary,
    backgroundColor: c.primaryLight,
  },
  reasonChipText: {
    color: c.textMuted,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  reasonChipTextActive: {
    color: c.text,
  },
  inputMultiline: {
    minHeight: 82,
    textAlignVertical: 'top',
    paddingTop: 10,
  },
  blockedRow: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 12,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: c.background,
  },
  blockedUserId: {
    color: c.text,
    fontSize: 13,
    flex: 1,
    marginRight: 10,
  },
  unblockBtn: {
    minHeight: 34,
    borderRadius: 10,
    paddingHorizontal: 12,
    backgroundColor: c.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  unblockBtnText: {
    color: c.textOnPrimary,
    fontWeight: '700',
    fontSize: 12,
  },
  cardHint: {
    fontSize: 14,
    color: c.textMuted,
    marginBottom: 16,
  },
  footer: {
    paddingTop: 24,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 14,
    color: c.textMuted,
    marginBottom: 4,
  },
  versionText: {
    fontSize: 13,
    color: c.textMuted,
  },
  legalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  legalLink: {
    fontSize: 12,
    color: c.textMuted,
    textDecorationLine: 'underline',
  },
  legalSpacer: {
    fontSize: 12,
    color: c.textMuted,
  },
});
