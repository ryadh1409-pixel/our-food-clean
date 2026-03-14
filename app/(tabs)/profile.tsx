import { KeyboardToolbar, KEYBOARD_TOOLBAR_NATIVE_ID } from '@/components/KeyboardToolbar';
import { DEFAULT_CAMPUSES, getCampusOptions } from '@/constants/campuses';
import { logError } from '@/utils/errorLogger';
import { useTrustScore } from '@/hooks/useTrustScore';
import { useAuth } from '@/services/AuthContext';
import { db, storage } from '@/services/firebase';
import { doc, onSnapshot, setDoc, type DocumentData } from 'firebase/firestore';
import { getDownloadURL, ref, uploadString } from 'firebase/storage';
import { useRouter } from 'expo-router';
import { readAsStringAsync } from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
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
const ADMIN_EMAIL = 'support@halforder.app';

const COLORS = {
  background: '#FFFFFF',
  primary: '#FFD54F',
  text: '#1A1A1A',
  border: '#E5E7EB',
  textMuted: '#6B7280',
  accentBlue: '#3B82F6',
  cardDark: '#1A1A1A',
  cardDarkText: '#FFFFFF',
} as const;

export default function ProfileScreen() {
  const router = useRouter();
  const { user, signOutUser } = useAuth();
  const [displayNameInput, setDisplayNameInput] = useState('');
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [savingName, setSavingName] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);
  const [nameSuccessMessage, setNameSuccessMessage] = useState('');
  const [ordersCount, setOrdersCount] = useState<number>(0);
  const [photoURL, setPhotoURL] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [campus, setCampus] = useState<string | null>(null);
  const [campusOptions, setCampusOptions] = useState<string[]>([
    ...DEFAULT_CAMPUSES,
  ]);
  const [savingCampus, setSavingCampus] = useState(false);
  const [focusedInputIndex, setFocusedInputIndex] = useState<number | null>(null);
  const displayNameInputRef = useRef<TextInput>(null);

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
          setNotificationsEnabled(false);
          setOrdersCount(0);
          setPhotoURL(null);
          setCampus(null);
        } else {
          const data = snap.data() as DocumentData;
          setDisplayNameInput(
            typeof data.displayName === 'string' ? data.displayName : '',
          );
          setNotificationsEnabled(data.notificationsEnabled !== false);
          setOrdersCount(
            typeof data.ordersCount === 'number' ? data.ordersCount : 0,
          );
          setPhotoURL(typeof data.photoURL === 'string' ? data.photoURL : null);
          setCampus(typeof data.campus === 'string' ? data.campus : null);
        }
        setProfileLoading(false);
      },
      () => {
        setDisplayNameInput('');
        setNotificationsEnabled(false);
        setProfileLoading(false);
      },
    );
    return () => unsubscribe();
  }, [uid]);

  useEffect(() => {
    getCampusOptions().then((list) => {
      setCampusOptions(list.length > 0 ? list : [...DEFAULT_CAMPUSES]);
    });
  }, []);

  const handleCampusSelect = async (selected: string) => {
    if (!uid || selected === campus) return;
    setSavingCampus(true);
    try {
      await setDoc(
        doc(db, 'users', uid),
        { campus: selected },
        { merge: true },
      );
      setCampus(selected);
    } catch (e) {
      logError(e, { alert: false });
      Alert.alert(
        'Error',
        e instanceof Error ? e.message : 'Failed to update campus',
      );
    } finally {
      setSavingCampus(false);
    }
  };

  const pickAndUploadPhoto = async () => {
    if (!uid) return;

    const permission =
      await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Permission required',
        'Allow access to your photos to upload a profile image.',
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });

    if (result.canceled || !result.assets?.[0]?.uri) return;

    const imageUri = result.assets[0].uri;
    setUploadingPhoto(true);

    try {
      const base64 = await readAsStringAsync(imageUri, {
        encoding: 'base64',
      });
      if (!base64) {
        throw new Error('Could not read image');
      }

      const storageRef = ref(storage, `profileImages/${uid}.jpg`);
      await uploadString(storageRef, base64, 'base64', {
        contentType: 'image/jpeg',
      });
      const downloadURL = await getDownloadURL(storageRef);

      await setDoc(
        doc(db, 'users', uid),
        { photoURL: downloadURL },
        { merge: true },
      );
      setPhotoURL(downloadURL);
    } catch (e) {
      logError(e, { alert: false });
      const message =
        e && typeof e === 'object' && 'message' in e
          ? String((e as { message: string }).message)
          : 'Upload failed';
      const friendly =
        message.includes('storage/') || message.includes('Firebase')
          ? 'Could not upload image. Please check your connection and try again.'
          : message;
      Alert.alert('Upload failed', friendly);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSaveDisplayName = async () => {
    const trimmed = displayNameInput.trim();
    if (!uid) return;
    if (!trimmed) {
      Alert.alert('Error', 'Display name cannot be empty.');
      return;
    }
    setSavingName(true);
    setNameSuccessMessage('');
    try {
      const userRef = doc(db, 'users', uid);
      await setDoc(userRef, { displayName: trimmed }, { merge: true });
      setDisplayNameInput(trimmed);
      setNameSuccessMessage('Name updated');
      setTimeout(() => setNameSuccessMessage(''), 2500);
    } catch (err) {
      logError(err, { alert: false });
      const message =
        err instanceof Error ? err.message : 'Failed to update display name';
      Alert.alert('Error', message);
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
        <ActivityIndicator size="large" color={COLORS.primary} />
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
          <Text style={styles.title}>My Account</Text>
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
        </ScrollView>
      </SafeAreaView>
    );
  }

  const emailLabel = user?.email ?? 'Not set';
  const displayName = displayNameInput || 'User';
  const initialLetter = displayName.charAt(0).toUpperCase();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardToolbar focusedIndex={focusedInputIndex} totalInputs={1} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Profile</Text>

        {/* Profile header: avatar, name, rating */}
        <View style={styles.profileHeader}>
          <TouchableOpacity
            style={styles.avatarTouch}
            onPress={pickAndUploadPhoto}
            disabled={uploadingPhoto}
          >
            {photoURL ? (
              <Image source={{ uri: photoURL }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarInitial}>{initialLetter}</Text>
              </View>
            )}
            {uploadingPhoto ? (
              <View style={styles.avatarOverlay}>
                <ActivityIndicator color="#fff" size="small" />
              </View>
            ) : (
              <View style={styles.avatarEditBadge}>
                <MaterialIcons
                  name="camera-alt"
                  size={14}
                  color={COLORS.text}
                />
              </View>
            )}
          </TouchableOpacity>
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

        {/* Action cards: Help, Wallet, Safety, Inbox */}
        <View style={styles.actionGrid}>
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/help')}
            activeOpacity={0.8}
          >
            <MaterialIcons
              name="help-outline"
              size={28}
              color={COLORS.primary}
            />
            <Text style={styles.actionCardTitle}>Help</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/wallet')}
            activeOpacity={0.8}
          >
            <MaterialIcons
              name="account-balance-wallet"
              size={28}
              color={COLORS.primary}
            />
            <Text style={styles.actionCardTitle}>Wallet</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/safety')}
            activeOpacity={0.8}
          >
            <MaterialIcons name="shield" size={28} color={COLORS.primary} />
            <Text style={styles.actionCardTitle}>Safety</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/inbox')}
            activeOpacity={0.8}
          >
            <MaterialIcons name="inbox" size={28} color={COLORS.primary} />
            <Text style={styles.actionCardTitle}>Inbox</Text>
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
            placeholderTextColor="#9CA3AF"
            editable={!savingName}
            inputAccessoryViewID={
              Platform.OS === 'ios' ? KEYBOARD_TOOLBAR_NATIVE_ID : undefined
            }
            onFocus={() => setFocusedInputIndex(0)}
          />
          <TouchableOpacity
            style={[styles.primaryButton, savingName && styles.buttonDisabled]}
            disabled={savingName}
            onPress={handleSaveDisplayName}
          >
            {savingName ? (
              <ActivityIndicator color={COLORS.text} />
            ) : (
              <Text style={styles.primaryButtonText}>Save</Text>
            )}
          </TouchableOpacity>
          {nameSuccessMessage ? (
            <Text style={styles.successMessage}>{nameSuccessMessage}</Text>
          ) : null}

          <Text style={styles.sectionLabel}>Email</Text>
          <Text style={styles.readOnlyValue}>{emailLabel}</Text>

          <Text style={[styles.sectionLabel, { marginTop: 12 }]}>Campus</Text>
          <Text style={styles.readOnlyValue}>{campus ?? 'Not set'}</Text>
          <View style={styles.campusChipRow}>
            {campusOptions.map((opt) => (
              <TouchableOpacity
                key={opt}
                style={[
                  styles.campusChip,
                  campus === opt && styles.campusChipActive,
                  savingCampus && styles.campusChipDisabled,
                ]}
                onPress={() => handleCampusSelect(opt)}
                disabled={savingCampus}
              >
                <Text
                  style={[
                    styles.campusChipText,
                    campus === opt && styles.campusChipTextActive,
                  ]}
                  numberOfLines={1}
                >
                  {opt}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

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
              trackColor={{ false: COLORS.border, true: COLORS.primary }}
              thumbColor={COLORS.background}
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
          <TouchableOpacity
            style={[styles.primaryButton, { marginTop: 12 }]}
            onPress={() => router.push('/complaint')}
            activeOpacity={0.7}
          >
            <Text style={styles.primaryButtonText}>
              Submit complaint or inquiry
            </Text>
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
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 20,
  },
  profileHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  avatarTouch: {
    position: 'relative',
    marginBottom: 12,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
  },
  avatarPlaceholder: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    fontSize: 32,
    fontWeight: '700',
    color: COLORS.textMuted,
  },
  avatarOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 44,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileName: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 4,
  },
  profileRatingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  profileStar: {
    color: '#FFD700',
    fontSize: 16,
  },
  profileRatingText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  profileReviewsText: {
    fontSize: 14,
    color: COLORS.textMuted,
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  actionCard: {
    flex: 1,
    minWidth: '47%',
    backgroundColor: COLORS.cardDark,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 100,
  },
  actionCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.cardDarkText,
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 12,
  },
  card: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    color: '#111827',
    marginBottom: 12,
  },
  readOnlyValue: {
    fontSize: 16,
    color: '#6B7280',
    marginBottom: 16,
  },
  campusChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
    marginBottom: 8,
  },
  campusChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  campusChipActive: {
    borderColor: COLORS.primary,
    backgroundColor: '#FEF9C3',
  },
  campusChipDisabled: {
    opacity: 0.6,
  },
  campusChipText: {
    fontSize: 13,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  campusChipTextActive: {
    color: COLORS.text,
    fontWeight: '600',
  },
  taxGiftsStat: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 4,
  },
  primaryButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  primaryButtonText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  successMessage: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 12,
  },
  signOutButton: {
    paddingVertical: 12,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    marginTop: 16,
  },
  signOutText: {
    color: COLORS.text,
    fontWeight: '600',
    fontSize: 16,
  },
  linkText: {
    fontSize: 16,
    color: COLORS.accentBlue,
    textDecorationLine: 'underline',
  },
  cardHint: {
    fontSize: 14,
    color: COLORS.textMuted,
    marginBottom: 16,
  },
  footer: {
    paddingTop: 24,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 14,
    color: COLORS.textMuted,
    marginBottom: 4,
  },
  versionText: {
    fontSize: 13,
    color: COLORS.textMuted,
  },
  legalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  legalLink: {
    fontSize: 12,
    color: COLORS.textMuted,
    textDecorationLine: 'underline',
  },
  legalSpacer: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
});
