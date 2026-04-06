import { KEYBOARD_TOOLBAR_NATIVE_ID, KeyboardToolbar } from '@/components/KeyboardToolbar';
import { ScreenHeader } from '@/components/ScreenHeader';
import { systemConfirm } from '@/components/SystemDialogHost';
import { isAdminUser } from '@/constants/adminUid';
import { theme } from '@/constants/theme';
import {
  displayFromStoredProfilePhone,
  isCompleteNaProfilePhone,
  isIncompleteNaProfilePhone,
  isProfilePhoneStorageEmpty,
  profilePhoneForFirestore,
  profileWhatsAppOnChangeText,
} from '@/lib/profileWhatsAppPhone';
import { useTrustScore } from '@/hooks/useTrustScore';
import { useAuth } from '@/services/AuthContext';
import {
  getBlockedUsersByBlocker,
  unblockUser,
} from '@/services/blocks';
import { deleteUserAccount } from '@/services/deleteUserAccount';
import { auth, db, ensureAuthReady } from '@/services/firebase';
import { uploadProfilePhoto } from '@/services/profilePhoto';
import {
  reportContentIdUser,
  submitReport,
  type ReportReason,
} from '@/services/reports';
import { moderateUserContent } from '@/utils/contentModeration';
import { getUserFriendlyError } from '@/utils/errorHandler';
import { logError } from '@/utils/errorLogger';
import { showError, showNotice, showSuccess } from '@/utils/toast';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { updateProfile, type User } from '@firebase/auth';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  deleteField,
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  updateDoc,
  type DocumentData,
} from 'firebase/firestore';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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

const SUPPORT_EMAIL = 'support@halforder.app';

const tc = theme.colors;

/** Reads `users/{uid}` fields with the same aliases as `getTrustScoreProfile`. */
function pickRatingAverage(data: DocumentData): number {
  if (typeof data.rating === 'number' && Number.isFinite(data.rating)) {
    return data.rating;
  }
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
  if (
    typeof data.reviewsCount === 'number' &&
    Number.isFinite(data.reviewsCount)
  ) {
    return Math.max(0, Math.round(data.reviewsCount));
  }
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
  phone: string;
  notificationsEnabled: boolean;
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
      phone: '',
      notificationsEnabled: true,
      averageRating: 0,
      totalRatings: 0,
    };
  }

  const nameFromDoc =
    typeof data.name === 'string' ? data.name.trim() : '';
  const fromDoc =
    typeof data.displayName === 'string' ? data.displayName.trim() : '';
  const emailRaw = data.email;
  const emailFromDoc =
    typeof emailRaw === 'string' && emailRaw.trim().length > 0
      ? emailRaw.trim()
      : null;
  const phone =
    typeof data.phone === 'string' && data.phone.trim().length > 0
      ? data.phone.trim()
      : '';

  return {
    displayName: nameFromDoc || fromDoc || authDisplay,
    emailFromDoc,
    photoURL,
    phone,
    notificationsEnabled: data.notificationsEnabled !== false,
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
      bg: '#000000',
      surface: '#1C1C1E',
      surfaceMuted: '#2C2C2E',
      text: '#FFFFFF',
      textSecondary: 'rgba(255,255,255,0.65)',
      textTertiary: 'rgba(255,255,255,0.42)',
      border: 'rgba(255,255,255,0.12)',
      inputBg: '#141414',
      chipBg: 'rgba(255,255,255,0.08)',
      primary: '#FF7A00',
      onPrimary: '#FFFFFF',
      danger: '#F87171',
      success: '#34D399',
      star: '#FFD60A',
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
  const [phone, setPhone] = useState('');
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [savingName, setSavingName] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);
  const [nameSuccessMessage, setNameSuccessMessage] = useState('');
  const [nameErrorMessage, setNameErrorMessage] = useState('');
  const [initialDisplayName, setInitialDisplayName] = useState('');
  const [initialPhone, setInitialPhone] = useState('');
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
        setAverageRating(mapped.averageRating);
        setTotalRatings(mapped.totalRatings);
        setEmailFromFirestore(mapped.emailFromDoc);
        setPhotoURL(mapped.photoURL);
        const phoneDisp = displayFromStoredProfilePhone(mapped.phone);
        setPhone(phoneDisp);
        setInitialPhone(phoneDisp);

        setProfileLoading(false);
      },
      () => {
        const authUser = auth.currentUser;
        const mapped = mapUsersCollectionToProfile(undefined, authUser);
        setDisplayNameInput(mapped.displayName);
        setInitialDisplayName(mapped.displayName);
        setNotificationsEnabled(mapped.notificationsEnabled);
        setAverageRating(mapped.averageRating);
        setTotalRatings(mapped.totalRatings);
        setEmailFromFirestore(mapped.emailFromDoc);
        setPhotoURL(mapped.photoURL);
        const phoneDisp = displayFromStoredProfilePhone(mapped.phone);
        setPhone(phoneDisp);
        setInitialPhone(phoneDisp);
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

    const phoneDigits = profilePhoneForFirestore(phone);
    const initialDigits = profilePhoneForFirestore(initialPhone);
    const phoneChanged = phoneDigits !== initialDigits;
    const phoneTreatEmpty = isProfilePhoneStorageEmpty(phone);

    if (phoneChanged) {
      if (!phoneTreatEmpty && !isCompleteNaProfilePhone(phone)) {
        showError(
          'Enter a complete WhatsApp number (10 digits after +1), or clear the field to only +1.',
        );
        return;
      }
    }

    const trimmedPhone = phoneChanged
      ? phoneTreatEmpty
        ? ''
        : phoneDigits
      : isProfilePhoneStorageEmpty(initialDigits)
        ? ''
        : initialDigits;
    const currentUser = auth.currentUser;
    if (!currentUser) {
      const msg = 'Not signed in. Please sign in again.';
      setNameErrorMessage(msg);
      showError(msg);
      return;
    }
    if (!trimmed) {
      showError('Display name cannot be empty.');
      return;
    }
    const mod = moderateUserContent(trimmed, { maxLength: 80 });
    if (!mod.ok) {
      showError(mod.reason);
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
      await currentUser.reload();
        await setDoc(
        userRef,
        {
          displayName: mod.text,
          name: mod.text,
          avatar: currentUser.photoURL ?? null,
          phone: trimmedPhone,
          whatsapp: trimmedPhone,
          dateOfBirth: deleteField(),
        },
        { merge: true },
      );
      setDisplayNameInput(mod.text);
      setInitialDisplayName(mod.text);
      const nextDisp = displayFromStoredProfilePhone(trimmedPhone);
      setPhone(nextDisp);
      setInitialPhone(nextDisp);
      setNameSaved(true);
      setNameSuccessMessage('Name updated');
      nameFeedbackClearRef.current = setTimeout(() => {
        setNameSaved(false);
        setNameSuccessMessage('');
        nameFeedbackClearRef.current = null;
      }, 2000);
    } catch (err) {
      logError(err);
      const msg = getUserFriendlyError(err);
      setNameErrorMessage(msg);
      showError(msg);
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
    await ensureAuthReady();
    const currentUser = auth.currentUser;
    if (!currentUser) {
      showError('Authentication is still initializing.');
      return;
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showError('Allow photo library access to set a profile picture.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (result.canceled || !result.assets?.[0]?.uri) return;

    const imageUri = result.assets[0].uri;
    setUploadingPhoto(true);
    try {
      const downloadURL = await uploadProfilePhoto(imageUri);
      await updateProfile(currentUser, { photoURL: downloadURL });

      const userRef = doc(db, 'users', uid);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        await updateDoc(userRef, { photoURL: downloadURL });
      } else {
        await setDoc(userRef, { photoURL: downloadURL }, { merge: true });
      }

      setPhotoURL(downloadURL);
      showSuccess('Your profile picture has been saved.');
    } catch (e) {
      logError(e);
      const msg = getUserFriendlyError(e);
      showError(msg);
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
      logError(e);
      setNotificationsEnabled(!value);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOutUser();
    } catch (err) {
      logError(err);
      showError(getUserFriendlyError(err));
      return;
    }
    router.replace('/(auth)/login');
  };

  const handleDeleteAccount = () => {
    if (!user) return;
    void (async () => {
      const ok = await systemConfirm({
        title: 'Delete Account',
        message:
          'Are you sure you want to delete your account? This action cannot be undone.',
        confirmLabel: 'Delete',
        destructive: true,
      });
      if (ok) void confirmDeleteAccount();
    })();
  };

  const handleSubmitProfileReport = async () => {
    if (!uid) return;
    const target = reportUserId.trim();
    if (!target) {
      showError('Enter the user ID you want to report.');
      return;
    }
    if (target === uid) {
      showError('You cannot report yourself.');
      return;
    }
    setSubmittingReport(true);
    try {
      await submitReport({
        reporterId: uid,
        reportedUserId: target,
        contentId: reportContentIdUser(target),
        reason: reportReason,
      });
      showSuccess('Thanks. We will review this report.');
    } catch (e) {
      showError(getUserFriendlyError(e));
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
      showSuccess('User has been unblocked.');
    } catch (e) {
      showError(getUserFriendlyError(e));
    } finally {
      setUnblockingId(null);
    }
  };

  const confirmDeleteAccount = async () => {
    if (!user) return;
    setDeletingAccount(true);
    try {
      await deleteUserAccount(user);
      showSuccess('Your account has been permanently removed.');
      router.replace('/(auth)/login');
    } catch (err: unknown) {
      logError(err);
      showError(getUserFriendlyError(err));
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
        showNotice('Contact Support', `Please email us at ${SUPPORT_EMAIL}`);
      }
    } catch {
      showNotice('Contact Support', `Please email us at ${SUPPORT_EMAIL}`);
    }
  };

  const emailLabel =
    emailFromFirestore ?? user?.email ?? 'Not set';
  const displayName = displayNameInput.trim() || 'User';
  const canSaveName =
    !savingName &&
    displayNameInput.trim().length > 0 &&
    (displayNameInput.trim() !== initialDisplayName.trim() ||
      phone.trim() !== initialPhone.trim());
  const saveButtonLabel = savingName ? 'Saving…' : nameSaved ? 'Saved ✓' : 'Save name';
  const initialLetter = displayName.slice(0, 1).toUpperCase() || '?';

  const reviewCount =
    totalRatings > 0 ? totalRatings : trustScore?.count ?? 0;
  const ratingValue =
    totalRatings > 0
      ? averageRating
      : trustScore && trustScore.count > 0
        ? trustScore.average
        : null;
  const showNewUserBadge = reviewCount === 0;

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
      <KeyboardToolbar focusedIndex={focusedInputIndex} totalInputs={2} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.profileBody}>
          <View style={dynamicStyles.profileHeader}>
            <View style={dynamicStyles.profileHeaderTextCol}>
              <Text style={dynamicStyles.profileNameTitle} numberOfLines={2}>
                {displayName}
              </Text>
              <Text
                style={dynamicStyles.profileEmailLine}
                numberOfLines={1}
              >
                {emailLabel}
              </Text>
              <View style={dynamicStyles.profileRatingRow}>
                <MaterialIcons name="star" size={20} color={pal.star} />
                {showNewUserBadge ? (
                  <Text style={dynamicStyles.profileNewUserLabel}>New user</Text>
                ) : (
                  <>
                    <Text style={dynamicStyles.profileRatingValue}>
                      {ratingValue != null ? ratingValue.toFixed(1) : '—'}
                    </Text>
                    <Text style={dynamicStyles.profileReviewMeta}>
                      {reviewCount > 0
                        ? ` · ${reviewCount} review${reviewCount === 1 ? '' : 's'}`
                        : ''}
                    </Text>
                  </>
                )}
              </View>
              {trustScore || isAdminUser(user) ? (
                <View style={dynamicStyles.trustChip}>
                  <Text style={dynamicStyles.trustChipText}>
                    {isAdminUser(user) ? 'Admin' : (trustScore?.label ?? '')}
                  </Text>
                </View>
              ) : null}
            </View>
            <View style={dynamicStyles.profilePhotoCol}>
              <TouchableOpacity
                style={dynamicStyles.profileAvatarWrap}
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
                    style={dynamicStyles.profileAvatarImage}
                    contentFit="cover"
                    transition={200}
                  />
                ) : (
                  <Text style={dynamicStyles.profileAvatarLetter}>{initialLetter}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={dynamicStyles.quickAction}
            onPress={() => router.push('/help')}
            activeOpacity={0.85}
          >
            <MaterialIcons name="help-outline" size={22} color={pal.primary} />
            <View style={dynamicStyles.quickActionTextCol}>
              <Text style={dynamicStyles.quickActionText}>Help &amp; Support</Text>
              <Text style={dynamicStyles.quickActionSub}>Guides and FAQs</Text>
            </View>
            <MaterialIcons name="chevron-right" size={22} color={pal.textTertiary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={dynamicStyles.quickAction}
            onPress={() => router.push('/privacy')}
            activeOpacity={0.85}
          >
            <MaterialIcons name="privacy-tip" size={22} color={pal.primary} />
            <View style={dynamicStyles.quickActionTextCol}>
              <Text style={dynamicStyles.quickActionText}>Privacy Policy</Text>
              <Text style={dynamicStyles.quickActionSub}>How we use your data</Text>
            </View>
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
            <Text style={dynamicStyles.label}>WhatsApp (for coordination)</Text>
            <View style={dynamicStyles.phoneFieldShell}>
              <MaterialCommunityIcons
                name="whatsapp"
                size={24}
                color="#25D366"
                style={dynamicStyles.phoneFieldIcon}
              />
              <TextInput
                style={dynamicStyles.phoneFieldInput}
                value={phone}
                onChangeText={(t) => setPhone(profileWhatsAppOnChangeText(t))}
                placeholder="+1 437 000 0000"
                placeholderTextColor={pal.textTertiary}
                keyboardType="phone-pad"
                editable={!savingName}
                inputAccessoryViewID={
                  Platform.OS === 'ios' ? KEYBOARD_TOOLBAR_NATIVE_ID : undefined
                }
                onFocus={() => setFocusedInputIndex(1)}
              />
            </View>
            <Text style={dynamicStyles.phoneFieldHint}>
              Used only to coordinate pickup
              {isIncompleteNaProfilePhone(phone)
                ? ' · Enter all 10 digits after +1.'
                : ''}
            </Text>
            <TouchableOpacity
              style={[
                dynamicStyles.saveNameButton,
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
                <Text style={dynamicStyles.saveNameButtonText}>
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
              {(['spam', 'abuse', 'inappropriate'] as ReportReason[]).map(
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

          {isAdminUser(user) ? (
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
    profileHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      paddingVertical: 20,
      paddingHorizontal: 4,
      marginBottom: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: 'rgba(255,255,255,0.1)',
    },
    profileHeaderTextCol: {
      flex: 1,
      paddingRight: 16,
      minWidth: 0,
    },
    profileNameTitle: {
      fontSize: 32,
      fontWeight: '800',
      color: pal.text,
      letterSpacing: -1,
      lineHeight: 38,
    },
    profileEmailLine: {
      marginTop: 8,
      fontSize: 14,
      fontWeight: '500',
      color: pal.textSecondary,
    },
    profileRatingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      marginTop: 14,
    },
    profileRatingValue: {
      marginLeft: 6,
      fontSize: 20,
      fontWeight: '800',
      color: pal.text,
      letterSpacing: -0.3,
    },
    profileNewUserLabel: {
      marginLeft: 6,
      fontSize: 17,
      fontWeight: '700',
      color: pal.textSecondary,
      letterSpacing: -0.2,
    },
    profileReviewMeta: {
      fontSize: 15,
      fontWeight: '600',
      color: pal.textTertiary,
    },
    profilePhotoCol: {
      alignItems: 'flex-end',
    },
    profileAvatarWrap: {
      width: 88,
      height: 88,
      borderRadius: 44,
      backgroundColor: pal.surfaceMuted,
      borderWidth: 2,
      borderColor: 'rgba(255,255,255,0.18)',
      justifyContent: 'center',
      alignItems: 'center',
      overflow: 'hidden',
    },
    profileAvatarImage: {
      width: 88,
      height: 88,
      borderRadius: 44,
    },
    profileAvatarLetter: {
      fontSize: 32,
      fontWeight: '800',
      color: pal.text,
    },
    trustChip: {
      alignSelf: 'flex-start',
      marginTop: 12,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: pal.chipBg,
      borderWidth: 1,
      borderColor: pal.border,
    },
    trustChipText: {
      fontSize: 12,
      fontWeight: '700',
      color: pal.text,
      letterSpacing: 0.2,
    },
    quickAction: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingVertical: 18,
      paddingHorizontal: 18,
      borderRadius: 16,
      backgroundColor: pal.surface,
      borderWidth: 1,
      borderColor: pal.border,
      marginBottom: 12,
    },
    quickActionTextCol: {
      flex: 1,
      minWidth: 0,
    },
    quickActionText: {
      fontSize: 16,
      fontWeight: '700',
      color: pal.text,
      letterSpacing: -0.2,
    },
    quickActionSub: {
      marginTop: 3,
      fontSize: 13,
      fontWeight: '500',
      color: pal.textTertiary,
    },
    sectionHeading: {
      fontSize: 12,
      fontWeight: '800',
      color: pal.textTertiary,
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginBottom: 10,
      marginTop: 16,
    },
    card: {
      backgroundColor: pal.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: pal.border,
      padding: 20,
      marginBottom: 12,
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
    phoneFieldShell: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: pal.border,
      borderRadius: theme.radius.input,
      backgroundColor: pal.inputBg,
      marginBottom: 8,
      paddingHorizontal: 14,
      minHeight: 52,
    },
    phoneFieldIcon: {
      marginRight: 4,
    },
    phoneFieldInput: {
      flex: 1,
      paddingVertical: 14,
      paddingLeft: 6,
      fontSize: 16,
      color: pal.text,
      marginBottom: 0,
    },
    phoneFieldHint: {
      fontSize: 12,
      fontWeight: '500',
      color: pal.textTertiary,
      marginBottom: 14,
      lineHeight: 17,
    },
    primaryButton: {
      backgroundColor: pal.primary,
      borderRadius: 14,
      paddingVertical: 16,
      alignItems: 'center',
      marginBottom: 8,
      minHeight: 52,
    },
    primaryButtonText: {
      color: pal.onPrimary,
      fontSize: 16,
      fontWeight: '800',
      letterSpacing: -0.2,
    },
    saveNameButton: {
      backgroundColor: pal.primary,
      borderRadius: 14,
      paddingVertical: 16,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 8,
      minHeight: 54,
      width: '100%',
      alignSelf: 'stretch',
    },
    saveNameButtonText: {
      color: pal.onPrimary,
      fontSize: 16,
      fontWeight: '800',
      letterSpacing: -0.2,
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
    paddingHorizontal: 20,
    paddingTop: 16,
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
