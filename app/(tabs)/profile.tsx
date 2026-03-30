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
import { uploadProfilePhoto } from '@/services/profilePhoto';
import {
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  updateDoc,
  type DocumentData,
} from 'firebase/firestore';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { updateProfile, type User } from '@firebase/auth';
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

const tc = theme.colors;

/** Reads `users/{uid}` fields with the same aliases as `getTrustScoreProfile`. */
function pickRatingAverage(data: DocumentData): number {
  if (
    typeof data.ratingAverage === 'number' &&
    Number.isFinite(data.ratingAverage)
  ) {
    return data.ratingAverage;
  }
  if (
    typeof data.averageRating === 'number' &&
    Number.isFinite(data.averageRating)
  ) {
    return data.averageRating;
  }
  return 0;
}

function pickRatingCount(data: DocumentData): number {
  if (typeof data.ratingCount === 'number' && Number.isFinite(data.ratingCount)) {
    return Math.max(0, Math.round(data.ratingCount));
  }
  if (
    typeof data.totalRatings === 'number' &&
    Number.isFinite(data.totalRatings)
  ) {
    return Math.max(0, Math.round(data.totalRatings));
  }
  return 0;
}

function resolvePhotoURL(
  data: DocumentData | undefined,
  authUser: User | null,
): string | null {
  const docUrl = data?.photoURL;
  if (typeof docUrl === 'string' && docUrl.trim().length > 0) {
    return docUrl.trim();
  }
  const authUrl = authUser?.photoURL;
  if (typeof authUrl === 'string' && authUrl.trim().length > 0) {
    return authUrl.trim();
  }
  return null;
}

function mapUsersCollectionToProfile(
  data: DocumentData | undefined,
  authUser: User | null,
): {
  displayName: string;
  emailFromDoc: string | null;
  photoURL: string | null;
  notificationsEnabled: boolean;
  ordersCount: number;
  averageRating: number;
  totalRatings: number;
} {
  const authDisplay = authUser?.displayName?.trim() ?? '';
  const photoURL = resolvePhotoURL(data, authUser);
  if (!data) {
    return {
      displayName: authDisplay,
      emailFromDoc: null,
      photoURL,
      notificationsEnabled: true,
      ordersCount: 0,
      averageRating: 0,
      totalRatings: 0,
    };
  }

  const fromDoc =
    typeof data.displayName === 'string' ? data.displayName.trim() : '';
  const emailRaw = data.email;
  const emailFromDoc =
    typeof emailRaw === 'string' && emailRaw.trim().length > 0
      ? emailRaw.trim()
      : null;

  const orders =
    typeof data.ordersCount === 'number' && Number.isFinite(data.ordersCount)
      ? data.ordersCount
      : 0;

  return {
    displayName: fromDoc || authDisplay,
    emailFromDoc,
    photoURL,
    notificationsEnabled: data.notificationsEnabled !== false,
    ordersCount: orders,
    averageRating: pickRatingAverage(data),
    totalRatings: pickRatingCount(data),
  };
}

type Palette = {
  bg: string;
  surface: string;
  surfaceMuted: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  border: string;
  inputBg: string;
  chipBg: string;
  primary: string;
  onPrimary: string;
  danger: string;
  success: string;
  star: string;
};

/** Single dark palette — matches tab shell; avoids `useColorScheme` (was missing import → runtime crash). */
function useProfilePalette(): Palette {
  return useMemo(
    () => ({
      bg: '#0B0D10',
      surface: '#141A22',
      surfaceMuted: '#1B222C',
      text: '#F8FAFC',
      textSecondary: 'rgba(248,250,252,0.68)',
      textTertiary: 'rgba(248,250,252,0.45)',
      border: 'rgba(255,255,255,0.1)',
      inputBg: '#0F1319',
      chipBg: 'rgba(255,255,255,0.06)',
      primary: '#FF7A00',
      onPrimary: '#FFFFFF',
      danger: '#F87171',
      success: '#34D399',
      star: '#FBBF24',
    }),
    [],
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const pal = useProfilePalette();
  const isDark = true;
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
  const [averageRating, setAverageRating] = useState(0);
  const [totalRatings, setTotalRatings] = useState(0);
  /** `users/{uid}.email` when set; UI falls back to Auth email. */
  const [emailFromFirestore, setEmailFromFirestore] = useState<string | null>(
    null,
  );
  const [photoURL, setPhotoURL] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
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
      setEmailFromFirestore(null);
      setPhotoURL(null);
      setProfileLoading(false);
      return;
    }
    const userRef = doc(db, 'users', uid);
    const unsubscribe = onSnapshot(
      userRef,
      (snap) => {
        const authUser = auth.currentUser;
        const mapped = mapUsersCollectionToProfile(
          snap.exists() ? (snap.data() as DocumentData) : undefined,
          authUser,
        );

        setDisplayNameInput(mapped.displayName);
        setInitialDisplayName(mapped.displayName);
        setNotificationsEnabled(mapped.notificationsEnabled);
        setOrdersCount(mapped.ordersCount);
        setAverageRating(mapped.averageRating);
        setTotalRatings(mapped.totalRatings);
        setEmailFromFirestore(mapped.emailFromDoc);
        setPhotoURL(mapped.photoURL);

        setProfileLoading(false);
      },
      () => {
        const authUser = auth.currentUser;
        const mapped = mapUsersCollectionToProfile(undefined, authUser);
        setDisplayNameInput(mapped.displayName);
        setInitialDisplayName(mapped.displayName);
        setNotificationsEnabled(mapped.notificationsEnabled);
        setOrdersCount(mapped.ordersCount);
        setAverageRating(mapped.averageRating);
        setTotalRatings(mapped.totalRatings);
        setEmailFromFirestore(mapped.emailFromDoc);
        setPhotoURL(mapped.photoURL);
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
      const msg = 'Not signed in. Please sign in again.';
      setNameErrorMessage(msg);
      Alert.alert('Could not save', msg);
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
      const msg =
        err instanceof Error ? err.message : 'Something went wrong, try again';
      setNameErrorMessage(msg);
      Alert.alert('Could not save', msg);
      nameFeedbackClearRef.current = setTimeout(() => {
        setNameErrorMessage('');
        nameFeedbackClearRef.current = null;
      }, 4000);
    } finally {
      setSavingName(false);
    }
  };

  const handlePickProfilePhoto = async () => {
    if (!uid || uploadingPhoto) return;
    const currentUser = auth.currentUser;
    if (!currentUser) {
      Alert.alert('Could not save', 'Not signed in.');
      return;
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        'Permission needed',
        'Allow photo library access to set a profile picture.',
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (result.canceled || !result.assets?.[0]?.uri) return;

    const imageUri = result.assets[0].uri;
    setUploadingPhoto(true);
    try {
      const downloadURL = await uploadProfilePhoto(uid, imageUri);
      await updateProfile(currentUser, { photoURL: downloadURL });

      const userRef = doc(db, 'users', uid);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        await updateDoc(userRef, { photoURL: downloadURL });
      } else {
        await setDoc(userRef, { photoURL: downloadURL }, { merge: true });
      }

      setPhotoURL(downloadURL);
      Alert.alert('Photo updated', 'Your profile picture has been saved.');
    } catch (e) {
      logError(e, { alert: false });
      console.error('[Profile] photo upload failed:', e);
      const msg =
        e instanceof Error ? e.message : 'Could not upload image. Try again.';
      Alert.alert('Upload failed', msg);
    } finally {
      setUploadingPhoto(false);
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

  const emailLabel =
    emailFromFirestore ?? user?.email ?? 'Not set';
  const displayName = displayNameInput.trim() || 'User';
  const canSaveName =
    !savingName &&
    displayNameInput.trim().length > 0 &&
    displayNameInput.trim() !== initialDisplayName.trim();
  const saveButtonLabel = savingName ? 'Saving…' : nameSaved ? 'Saved ✓' : 'Save name';
  const initialLetter = displayName.slice(0, 1).toUpperCase() || '?';

  const ratingValue =
    totalRatings > 0
      ? averageRating
      : trustScore && trustScore.count > 0
        ? trustScore.average
        : null;
  const reviewCount =
    totalRatings > 0 ? totalRatings : trustScore?.count ?? 0;

  const dynamicStyles = useMemo(
    () => createDynamicStyles(pal, isDark),
    [pal, isDark],
  );

  if (profileLoading && uid) {
    return (
      <SafeAreaView style={[dynamicStyles.container, dynamicStyles.centered]}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <ActivityIndicator size="large" color={pal.primary} />
      </SafeAreaView>
    );
  }

  if (!uid) {
    return (
      <SafeAreaView style={dynamicStyles.container}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <ScreenHeader title="My Account" logo="inline" />
          <View style={styles.profileBody}>
            <View style={[dynamicStyles.card, { marginTop: 8 }]}>
              <Text style={[dynamicStyles.bodyMuted]}>
                Sign in to manage your account and settings.
              </Text>
              <TouchableOpacity
                style={dynamicStyles.primaryButton}
                onPress={() => router.push('/(auth)/login')}
              >
                <Text style={dynamicStyles.primaryButtonText}>Sign In</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.footer}>
              <Text style={dynamicStyles.footerMuted}>❤️ Made with love in Toronto</Text>
              <Text style={dynamicStyles.footerMuted}>v1.0</Text>
              <View style={styles.legalRow}>
                <TouchableOpacity onPress={() => router.push('/terms')}>
                  <Text style={dynamicStyles.legalLink}>Terms</Text>
                </TouchableOpacity>
                <Text style={styles.legalSpacer}> </Text>
                <TouchableOpacity onPress={() => router.push('/privacy')}>
                  <Text style={dynamicStyles.legalLink}>Privacy</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={dynamicStyles.container} edges={['top']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <KeyboardToolbar focusedIndex={focusedInputIndex} totalInputs={1} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.profileBody}>
          <View style={dynamicStyles.headerRow}>
            <View>
              <Text style={dynamicStyles.screenTitle}>Profile</Text>
              <Text style={dynamicStyles.headerSubtitle} numberOfLines={1}>
                {emailLabel}
              </Text>
            </View>
            <AppLogo size={40} marginTop={0} />
          </View>

          <View style={dynamicStyles.hero}>
            <TouchableOpacity
              style={dynamicStyles.avatarRing}
              onPress={handlePickProfilePhoto}
              activeOpacity={0.85}
              disabled={uploadingPhoto}
              accessibilityLabel="Change profile photo"
            >
              {uploadingPhoto ? (
                <ActivityIndicator size="large" color={pal.primary} />
              ) : photoURL ? (
                <Image
                  source={{ uri: photoURL }}
                  style={dynamicStyles.avatarImage}
                  contentFit="cover"
                  transition={200}
                />
              ) : (
                <Text style={dynamicStyles.avatarLetter}>{initialLetter}</Text>
              )}
            </TouchableOpacity>
            <Text style={dynamicStyles.photoHint}>Tap photo to change</Text>
            <Text style={dynamicStyles.heroName} numberOfLines={1}>
              {displayName}
            </Text>

            <View style={dynamicStyles.ratingRow}>
              <MaterialIcons name="star" size={22} color={pal.star} />
              <Text style={dynamicStyles.ratingNumber}>
                {ratingValue != null ? ratingValue.toFixed(1) : '—'}
              </Text>
              <Text style={dynamicStyles.reviewCount}>
                {reviewCount > 0
                  ? `· ${reviewCount} review${reviewCount === 1 ? '' : 's'}`
                  : '· No reviews yet'}
              </Text>
            </View>
            {trustScore ? (
              <View style={dynamicStyles.trustChip}>
                <Text style={dynamicStyles.trustChipText}>{trustScore.label}</Text>
              </View>
            ) : null}
          </View>

          <TouchableOpacity
            style={dynamicStyles.quickAction}
            onPress={() => router.push('/help')}
            activeOpacity={0.85}
          >
            <MaterialIcons name="help-outline" size={24} color={pal.primary} />
            <Text style={dynamicStyles.quickActionText}>Help & support guides</Text>
            <MaterialIcons name="chevron-right" size={22} color={pal.textTertiary} />
          </TouchableOpacity>

          <Text style={dynamicStyles.sectionHeading}>Account</Text>
          <View style={dynamicStyles.card}>
            <Text style={dynamicStyles.label}>Display name</Text>
            <TextInput
              ref={displayNameInputRef}
              style={dynamicStyles.input}
              value={displayNameInput}
              onChangeText={setDisplayNameInput}
              placeholder="Your name"
              placeholderTextColor={pal.textTertiary}
              editable={!savingName}
              inputAccessoryViewID={
                Platform.OS === 'ios' ? KEYBOARD_TOOLBAR_NATIVE_ID : undefined
              }
              onFocus={() => setFocusedInputIndex(0)}
            />
            <TouchableOpacity
              style={[
                dynamicStyles.primaryButton,
                nameSaved && { backgroundColor: pal.success },
                !canSaveName && !nameSaved && dynamicStyles.buttonDisabled,
              ]}
              disabled={!canSaveName}
              onPress={() => {
                void handleSaveDisplayName();
              }}
            >
              {savingName ? (
                <ActivityIndicator size="small" color={pal.onPrimary} />
              ) : (
                <Text style={dynamicStyles.primaryButtonText}>
                  {saveButtonLabel}
                </Text>
              )}
            </TouchableOpacity>
            {nameSuccessMessage ? (
              <Text style={dynamicStyles.feedbackOk}>{nameSuccessMessage}</Text>
            ) : null}
            {nameErrorMessage ? (
              <Text style={dynamicStyles.feedbackErr}>{nameErrorMessage}</Text>
            ) : null}

            <View style={dynamicStyles.divider} />

            <View style={dynamicStyles.readonlyRow}>
              <View style={dynamicStyles.readonlyIcon}>
                <MaterialIcons name="mail-outline" size={20} color={pal.textSecondary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={dynamicStyles.label}>Email</Text>
                <Text style={dynamicStyles.readOnlyValue}>{emailLabel}</Text>
                <View style={dynamicStyles.readonlyHintRow}>
                  <MaterialIcons name="lock" size={14} color={pal.textTertiary} />
                  <Text style={dynamicStyles.hint}>Read-only — managed by your login</Text>
                </View>
              </View>
            </View>

            <View style={dynamicStyles.divider} />

            <Text style={dynamicStyles.label}>Tax gifts earned</Text>
            <Text style={dynamicStyles.statLine}>
              🎁 {Math.floor(ordersCount / 3)} (every 3 completed orders)
            </Text>
          </View>

          <Text style={dynamicStyles.sectionHeading}>Notifications</Text>
          <View style={dynamicStyles.card}>
            <View style={dynamicStyles.rowBetween}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={dynamicStyles.cardTitle}>Push & updates</Text>
                <Text style={dynamicStyles.bodyMuted}>
                  Order updates and reminders from HalfOrder
                </Text>
              </View>
              <Switch
                value={notificationsEnabled}
                onValueChange={handleNotificationsToggle}
                trackColor={{
                  false: isDark ? '#3F3F46' : tc.border,
                  true: isDark ? 'rgba(255,122,0,0.45)' : tc.primaryLight,
                }}
                thumbColor={notificationsEnabled ? pal.primary : pal.inputBg}
              />
            </View>
          </View>

          <Text style={dynamicStyles.sectionHeading}>Preferences</Text>
          <View style={dynamicStyles.card}>
            <Text style={dynamicStyles.label}>Language</Text>
            <Text style={dynamicStyles.readOnlyValue}>
              {Platform.OS === 'ios'
                ? 'Follows iOS settings'
                : 'Follows system language'}
            </Text>
          </View>

          <Text style={dynamicStyles.sectionHeading}>Support & legal</Text>
          <View style={dynamicStyles.card}>
            <TouchableOpacity onPress={openSupportEmail} activeOpacity={0.75}>
              <Text style={dynamicStyles.label}>Customer support</Text>
              <Text style={dynamicStyles.link}>{SUPPORT_EMAIL}</Text>
            </TouchableOpacity>
            <View style={dynamicStyles.divider} />
            <View style={dynamicStyles.legalGrid}>
              <TouchableOpacity
                style={dynamicStyles.outlineBtn}
                onPress={() => router.push('/terms')}
              >
                <Text style={dynamicStyles.outlineBtnText}>Terms of Use</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={dynamicStyles.outlineBtn}
                onPress={() => router.push('/privacy')}
              >
                <Text style={dynamicStyles.outlineBtnText}>Privacy Policy</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={[dynamicStyles.primaryButton, { marginTop: 14 }]}
              onPress={() => router.push('/complaint')}
            >
              <Text style={dynamicStyles.primaryButtonText}>
                Submit complaint or inquiry
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={dynamicStyles.sectionHeading}>Report a user</Text>
          <View style={dynamicStyles.card}>
            <TextInput
              value={reportUserId}
              onChangeText={setReportUserId}
              placeholder="Reported user ID"
              placeholderTextColor={pal.textTertiary}
              style={dynamicStyles.input}
            />
            <View style={styles.reasonRow}>
              {(['spam', 'inappropriate', 'scam', 'other'] as ReportReason[]).map(
                (reason) => {
                  const active = reason === reportReason;
                  return (
                    <TouchableOpacity
                      key={reason}
                      style={[
                        dynamicStyles.chip,
                        active && dynamicStyles.chipActive,
                      ]}
                      onPress={() => setReportReason(reason)}
                    >
                      <Text
                        style={[
                          dynamicStyles.chipText,
                          active && dynamicStyles.chipTextActive,
                        ]}
                      >
                        {reason}
                      </Text>
                    </TouchableOpacity>
                  );
                },
              )}
            </View>
            <TextInput
              value={reportMessage}
              onChangeText={setReportMessage}
              placeholder="Details (optional)"
              placeholderTextColor={pal.textTertiary}
              style={[dynamicStyles.input, styles.inputMultiline]}
              multiline
            />
            <TouchableOpacity
              style={[
                dynamicStyles.primaryButton,
                submittingReport && dynamicStyles.buttonDisabled,
              ]}
              onPress={handleSubmitProfileReport}
              disabled={submittingReport}
            >
              {submittingReport ? (
                <ActivityIndicator size="small" color={pal.onPrimary} />
              ) : (
                <Text style={dynamicStyles.primaryButtonText}>Submit report</Text>
              )}
            </TouchableOpacity>
          </View>

          <Text style={dynamicStyles.sectionHeading}>Blocked users</Text>
          <View style={dynamicStyles.card}>
            {blockedUsers.length === 0 ? (
              <Text style={dynamicStyles.bodyMuted}>No blocked users</Text>
            ) : (
              blockedUsers.map((id) => (
                <View key={id} style={dynamicStyles.blockedRow}>
                  <Text style={dynamicStyles.blockedId} numberOfLines={1}>
                    {id}
                  </Text>
                  <TouchableOpacity
                    style={dynamicStyles.smallPrimaryBtn}
                    onPress={() => handleUnblockUser(id)}
                    disabled={unblockingId === id}
                  >
                    {unblockingId === id ? (
                      <ActivityIndicator size="small" color={pal.onPrimary} />
                    ) : (
                      <Text style={dynamicStyles.smallPrimaryBtnText}>Unblock</Text>
                    )}
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>

          <View style={dynamicStyles.card}>
            <Text style={dynamicStyles.bodyMuted}>
              To report or block from an order, open the chat or Safety section on
              Join. See Terms for how we handle reports.
            </Text>
            <TouchableOpacity
              style={[dynamicStyles.dangerButton, deletingAccount && dynamicStyles.buttonDisabled]}
              onPress={handleDeleteAccount}
              disabled={deletingAccount}
            >
              {deletingAccount ? (
                <ActivityIndicator size="small" color={pal.onPrimary} />
              ) : (
                <Text style={dynamicStyles.dangerButtonText}>Delete account</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={dynamicStyles.signOutRow} onPress={handleSignOut}>
              <Text style={dynamicStyles.signOutText}>Sign out</Text>
            </TouchableOpacity>
          </View>

          {user?.email === ADMIN_EMAIL ? (
            <View style={dynamicStyles.card}>
              <Text style={dynamicStyles.label}>Admin</Text>
              <TouchableOpacity
                style={dynamicStyles.primaryButton}
                onPress={() => router.push('/admin')}
              >
                <Text style={dynamicStyles.primaryButtonText}>Open admin panel</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <View style={styles.footer}>
            <Text style={dynamicStyles.footerMuted}>❤️ Made with love in Toronto</Text>
            <Text style={dynamicStyles.footerMuted}>v1.0</Text>
            <View style={styles.legalRow}>
              <TouchableOpacity onPress={() => router.push('/terms')}>
                <Text style={dynamicStyles.legalLink}>Terms</Text>
              </TouchableOpacity>
              <Text style={styles.legalSpacer}> </Text>
              <TouchableOpacity onPress={() => router.push('/privacy')}>
                <Text style={dynamicStyles.legalLink}>Privacy</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function createDynamicStyles(pal: Palette, isDarkMode: boolean) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: pal.bg,
    },
    centered: {
      justifyContent: 'center',
      alignItems: 'center',
    },
    screenTitle: {
      fontSize: 28,
      fontWeight: '800',
      color: pal.text,
      letterSpacing: -0.5,
    },
    headerSubtitle: {
      marginTop: 4,
      fontSize: 14,
      color: pal.textSecondary,
      maxWidth: '88%',
    },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 20,
    },
    hero: {
      alignItems: 'center',
      marginBottom: 18,
      paddingVertical: 8,
    },
    avatarRing: {
      width: 92,
      height: 92,
      borderRadius: 46,
      backgroundColor: pal.surfaceMuted,
      borderWidth: 2,
      borderColor: pal.primary,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 6,
      overflow: 'hidden',
      ...shadows.card,
    },
    avatarImage: {
      width: 86,
      height: 86,
      borderRadius: 43,
    },
    avatarLetter: {
      fontSize: 36,
      fontWeight: '800',
      color: pal.text,
    },
    photoHint: {
      fontSize: 12,
      fontWeight: '600',
      color: pal.textTertiary,
      marginBottom: 8,
    },
    heroName: {
      fontSize: 22,
      fontWeight: '800',
      color: pal.text,
      marginBottom: 8,
    },
    ratingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      flexWrap: 'wrap',
      justifyContent: 'center',
    },
    ratingNumber: {
      fontSize: 18,
      fontWeight: '800',
      color: pal.text,
    },
    reviewCount: {
      fontSize: 15,
      color: pal.textSecondary,
      fontWeight: '600',
    },
    trustChip: {
      marginTop: 10,
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: pal.chipBg,
      borderWidth: 1,
      borderColor: pal.border,
    },
    trustChipText: {
      fontSize: 13,
      fontWeight: '700',
      color: pal.text,
    },
    quickAction: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 16,
      borderRadius: theme.radius.lg,
      backgroundColor: pal.surface,
      borderWidth: 1,
      borderColor: pal.border,
      marginBottom: 22,
      ...shadows.card,
    },
    quickActionText: {
      flex: 1,
      fontSize: 16,
      fontWeight: '600',
      color: pal.text,
    },
    sectionHeading: {
      fontSize: 13,
      fontWeight: '800',
      color: pal.textTertiary,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginBottom: 8,
      marginTop: 4,
    },
    card: {
      backgroundColor: pal.surface,
      borderRadius: theme.radius.lg,
      borderWidth: 1,
      borderColor: pal.border,
      padding: theme.spacing.section,
      marginBottom: theme.spacing.md,
      ...shadows.card,
    },
    label: {
      fontSize: 14,
      fontWeight: '700',
      color: pal.textSecondary,
      marginBottom: 8,
    },
    cardTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: pal.text,
      marginBottom: 4,
    },
    bodyMuted: {
      fontSize: 14,
      color: pal.textSecondary,
      lineHeight: 20,
    },
    input: {
      borderWidth: 1,
      borderColor: pal.border,
      borderRadius: theme.radius.input,
      padding: 14,
      fontSize: 16,
      color: pal.text,
      backgroundColor: pal.inputBg,
      marginBottom: 12,
    },
    primaryButton: {
      backgroundColor: pal.primary,
      borderRadius: theme.radius.button,
      paddingVertical: 14,
      alignItems: 'center',
      marginBottom: 8,
    },
    primaryButtonText: {
      color: pal.onPrimary,
      fontSize: 16,
      fontWeight: '700',
    },
    buttonDisabled: {
      opacity: 0.55,
    },
    feedbackOk: {
      fontSize: 13,
      color: pal.success,
      marginBottom: 8,
      fontWeight: '600',
    },
    feedbackErr: {
      fontSize: 13,
      color: pal.danger,
      marginBottom: 8,
      fontWeight: '600',
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: pal.border,
      marginVertical: 16,
    },
    readonlyRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
    },
    readonlyIcon: {
      marginTop: 22,
    },
    readOnlyValue: {
      fontSize: 16,
      fontWeight: '600',
      color: pal.text,
    },
    readonlyHintRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 6,
    },
    hint: {
      fontSize: 12,
      color: pal.textTertiary,
      fontWeight: '500',
    },
    statLine: {
      fontSize: 15,
      fontWeight: '600',
      color: pal.text,
    },
    rowBetween: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    link: {
      fontSize: 16,
      color: tc.accentBlue,
      fontWeight: '600',
      textDecorationLine: 'underline',
    },
    legalGrid: {
      gap: 10,
    },
    outlineBtn: {
      borderWidth: 1,
      borderColor: pal.border,
      borderRadius: theme.radius.button,
      paddingVertical: 12,
      alignItems: 'center',
      backgroundColor: pal.inputBg,
    },
    outlineBtnText: {
      fontSize: 15,
      fontWeight: '700',
      color: pal.text,
    },
    chip: {
      borderWidth: 1,
      borderColor: pal.border,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
      backgroundColor: pal.inputBg,
    },
    chipActive: {
      borderColor: pal.primary,
      backgroundColor: isDarkMode ? 'rgba(255,122,0,0.15)' : tc.primaryLight,
    },
    chipText: {
      color: pal.textSecondary,
      fontSize: 12,
      fontWeight: '600',
      textTransform: 'capitalize',
    },
    chipTextActive: {
      color: pal.text,
    },
    blockedRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderWidth: 1,
      borderColor: pal.border,
      borderRadius: 12,
      padding: 10,
      marginTop: 8,
      backgroundColor: pal.inputBg,
    },
    blockedId: {
      flex: 1,
      fontSize: 13,
      color: pal.text,
      marginRight: 10,
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    smallPrimaryBtn: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 10,
      backgroundColor: pal.primary,
      minWidth: 80,
      alignItems: 'center',
    },
    smallPrimaryBtnText: {
      color: pal.onPrimary,
      fontWeight: '800',
      fontSize: 12,
    },
    dangerButton: {
      backgroundColor: pal.danger,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
      marginTop: 10,
    },
    dangerButtonText: {
      color: pal.onPrimary,
      fontSize: 16,
      fontWeight: '700',
    },
    signOutRow: {
      paddingVertical: 16,
      alignItems: 'center',
      marginTop: 4,
      borderTopWidth: 1,
      borderTopColor: pal.border,
    },
    signOutText: {
      color: pal.text,
      fontWeight: '700',
      fontSize: 16,
    },
    footerMuted: {
      fontSize: 13,
      color: pal.textTertiary,
    },
    legalLink: {
      fontSize: 12,
      color: pal.textSecondary,
      textDecorationLine: 'underline',
    },
  });
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 40,
    flexGrow: 1,
  },
  profileBody: {
    paddingHorizontal: theme.spacing.section,
    paddingTop: 8,
  },
  footer: {
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 28,
    gap: 4,
  },
  legalRow: {
    flexDirection: 'row',
    marginTop: 8,
  },
  legalSpacer: {
    width: 12,
  },
  reasonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  inputMultiline: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
});
