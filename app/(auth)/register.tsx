import { KeyboardToolbar, KEYBOARD_TOOLBAR_NATIVE_ID } from '@/components/KeyboardToolbar';
import {
  isCompleteNaProfilePhone,
  isProfilePhoneStorageEmpty,
  profilePhoneForFirestore,
  profileWhatsAppOnChangeText,
} from '@/lib/profileWhatsAppPhone';
import { useAuth } from '@/services/AuthContext';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '@/constants/theme';
import { systemActionSheet } from '@/components/SystemDialogHost';
import { getUserFriendlyError } from '@/utils/errorHandler';
import { showError, showSuccess } from '@/utils/toast';

const c = theme.colors;

const REGISTER_INPUTS = 5;
const PHOTO_SIZE = 92;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const placeholderColor = 'rgba(255,255,255,0.42)';

export default function RegisterScreen() {
  const router = useRouter();
  const { signUpWithEmail } = useAuth();
  const nameRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const whatsappRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmPasswordRef = useRef<TextInput>(null);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('+1 ');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [whatsappCoordinationConsent, setWhatsappCoordinationConsent] = useState(false);
  const [loading, setLoading] = useState(false);

  const refs = [nameRef, emailRef, whatsappRef, passwordRef, confirmPasswordRef];
  const focusPrev = () => {
    if (focusedIndex !== null && focusedIndex > 0) {
      refs[focusedIndex - 1].current?.focus();
      setFocusedIndex(focusedIndex - 1);
    }
  };
  const focusNext = () => {
    if (focusedIndex !== null && focusedIndex < REGISTER_INPUTS - 1) {
      refs[focusedIndex + 1].current?.focus();
      setFocusedIndex(focusedIndex + 1);
    }
  };

  const pickFromLibrary = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showError(
        'Permission to access photos is required. Enable Photos access for HalfOrder in Settings to add a profile picture.',
      );
      return;
    }
    let result: Awaited<
      ReturnType<typeof ImagePicker.launchImageLibraryAsync>
    >;
    try {
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.85,
        allowsEditing: true,
        aspect: [1, 1],
      });
    } catch {
      showError('Could not open your photo library. Please try again.');
      return;
    }
    if (!result.canceled && result.assets[0]?.uri) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  const pickFromCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      showError(
        'Permission to use the camera is required. Enable Camera access for HalfOrder in Settings.',
      );
      return;
    }
    let result: Awaited<ReturnType<typeof ImagePicker.launchCameraAsync>>;
    try {
      result = await ImagePicker.launchCameraAsync({
        quality: 0.85,
        allowsEditing: true,
        aspect: [1, 1],
      });
    } catch {
      showError('Could not open the camera. Please try again.');
      return;
    }
    if (!result.canceled && result.assets[0]?.uri) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  const openPhotoOptions = () => {
    void systemActionSheet({
      title: 'Profile photo',
      message: 'Choose a source',
      actions: [
        { label: 'Take photo', onPress: () => void pickFromCamera() },
        { label: 'Choose from library', onPress: () => void pickFromLibrary() },
        ...(photoUri
          ? [
              {
                label: 'Remove photo',
                destructive: true,
                onPress: () => setPhotoUri(null),
              },
            ]
          : []),
      ],
    });
  };

  const validate = (): string => {
    const nameTrim = name.trim();
    if (!nameTrim) return 'Enter your name';

    const emailTrim = email.trim();
    if (!emailTrim || !emailTrim.includes('@')) return 'Enter a valid email';
    if (!EMAIL_RE.test(emailTrim)) return 'Enter a valid email';

    if (!whatsapp.trim() || isProfilePhoneStorageEmpty(whatsapp)) {
      return 'Enter WhatsApp number';
    }
    if (!isCompleteNaProfilePhone(whatsapp)) {
      return 'Enter a complete WhatsApp number';
    }

    if (!whatsappCoordinationConsent) {
      return 'Please accept WhatsApp usage to continue.';
    }

    if (password.length < 6) return 'Password must be at least 6 characters';
    if (password !== confirmPassword) return 'Passwords do not match';
    return '';
  };

  const handleSignup = async () => {
    const validationError = validate();
    if (validationError) {
      showError(validationError);
      return;
    }

    const nameTrim = name.trim();
    const emailTrim = email.trim();

    Keyboard.dismiss();
    setLoading(true);
    try {
      await signUpWithEmail({
        email: emailTrim,
        password,
        fullName: nameTrim,
        whatsapp: profilePhoneForFirestore(whatsapp),
        whatsappConsent: true,
        localPhotoUri: photoUri,
      });
      showSuccess('Account created successfully 🎉');
      router.replace('/verify-email' as Parameters<typeof router.replace>[0]);
    } catch (err: unknown) {
      showError(getUserFriendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <KeyboardToolbar
        onFocusPrevious={focusPrev}
        onFocusNext={focusNext}
        focusedIndex={focusedIndex}
        totalInputs={REGISTER_INPUTS}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboard}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <View style={styles.scrollHost}>
            <ScrollView
              contentContainerStyle={styles.scroll}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Create account</Text>
                <Text style={styles.cardSubtitle}>Add your details to get started</Text>

                <TouchableOpacity
                  style={styles.photoWrap}
                  onPress={openPhotoOptions}
                  disabled={loading}
                  activeOpacity={0.85}
                  accessibilityLabel="Add profile photo"
                >
                  {photoUri ? (
                    <Image source={{ uri: photoUri }} style={styles.photoImage} contentFit="cover" />
                  ) : (
                    <View style={styles.photoEmpty}>
                      <MaterialIcons name="add-a-photo" size={36} color={placeholderColor} />
                    </View>
                  )}
                </TouchableOpacity>
                <Text style={styles.photoCaption}>Add profile photo (optional)</Text>

                <View style={styles.fields}>
                  <TextInput
                    ref={nameRef}
                    style={styles.fieldInput}
                    placeholder="Full name"
                    placeholderTextColor={placeholderColor}
                    value={name}
                    onChangeText={setName}
                    autoCapitalize="words"
                    editable={!loading}
                    inputAccessoryViewID={
                      Platform.OS === 'ios' ? KEYBOARD_TOOLBAR_NATIVE_ID : undefined
                    }
                    onFocus={() => setFocusedIndex(0)}
                  />

                  <TextInput
                    ref={emailRef}
                    style={styles.fieldInput}
                    placeholder="Email"
                    placeholderTextColor={placeholderColor}
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!loading}
                    inputAccessoryViewID={
                      Platform.OS === 'ios' ? KEYBOARD_TOOLBAR_NATIVE_ID : undefined
                    }
                    onFocus={() => setFocusedIndex(1)}
                  />

                  <TextInput
                    ref={whatsappRef}
                    style={styles.fieldInput}
                    placeholder="WhatsApp number"
                    placeholderTextColor={placeholderColor}
                    value={whatsapp}
                    onChangeText={(t) => setWhatsapp(profileWhatsAppOnChangeText(t))}
                    keyboardType="phone-pad"
                    editable={!loading}
                    inputAccessoryViewID={
                      Platform.OS === 'ios' ? KEYBOARD_TOOLBAR_NATIVE_ID : undefined
                    }
                    onFocus={() => setFocusedIndex(2)}
                  />

                  <Text style={styles.fieldHelper}>
                    This number is used only to coordinate pickup with other users. It will not be
                    shared publicly.
                  </Text>

                  <TouchableOpacity
                    style={styles.consentRow}
                    onPress={() => setWhatsappCoordinationConsent((v) => !v)}
                    disabled={loading}
                    activeOpacity={0.75}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: whatsappCoordinationConsent }}
                    accessibilityLabel="I agree to use my WhatsApp number for coordination"
                  >
                    <MaterialIcons
                      name={whatsappCoordinationConsent ? 'check-box' : 'check-box-outline-blank'}
                      size={22}
                      color={whatsappCoordinationConsent ? c.primary : placeholderColor}
                      style={styles.consentIcon}
                    />
                    <Text style={styles.consentLabel}>
                      I agree to use my WhatsApp number for coordination.
                    </Text>
                  </TouchableOpacity>

                  <TextInput
                    ref={passwordRef}
                    style={styles.fieldInput}
                    placeholder="Password"
                    placeholderTextColor={placeholderColor}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    editable={!loading}
                    inputAccessoryViewID={
                      Platform.OS === 'ios' ? KEYBOARD_TOOLBAR_NATIVE_ID : undefined
                    }
                    onFocus={() => setFocusedIndex(3)}
                  />

                  <TextInput
                    ref={confirmPasswordRef}
                    style={[styles.fieldInput, styles.lastField]}
                    placeholder="Confirm password"
                    placeholderTextColor={placeholderColor}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry
                    editable={!loading}
                    inputAccessoryViewID={
                      Platform.OS === 'ios' ? KEYBOARD_TOOLBAR_NATIVE_ID : undefined
                    }
                    onFocus={() => setFocusedIndex(4)}
                  />
                </View>

                <TouchableOpacity
                  style={[styles.primaryBtn, loading && styles.primaryBtnLoading]}
                  onPress={() => void handleSignup()}
                  disabled={loading}
                  activeOpacity={0.9}
                >
                  {loading ? (
                    <ActivityIndicator color={c.textOnPrimary} />
                  ) : (
                    <Text style={styles.primaryBtnText}>Create Account</Text>
                  )}
                </TouchableOpacity>
              </View>

              <View style={styles.footer}>
                <Text style={styles.footerMuted}>Already have an account? </Text>
                <TouchableOpacity onPress={() => router.back()} disabled={loading} hitSlop={8}>
                  <Text style={styles.footerLink}>Log in</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: c.sheetDark,
  },
  keyboard: { flex: 1 },
  scrollHost: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 36,
  },
  card: {
    backgroundColor: c.surfaceDark,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  cardTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: c.white,
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  cardSubtitle: {
    fontSize: 15,
    color: c.textSecondary,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 8,
  },
  photoWrap: {
    alignSelf: 'center',
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    borderRadius: PHOTO_SIZE / 2,
    marginTop: 16,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.14)',
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  photoImage: {
    width: '100%',
    height: '100%',
  },
  photoEmpty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoCaption: {
    textAlign: 'center',
    fontSize: 14,
    color: c.textSecondary,
    marginTop: 10,
    marginBottom: 16,
  },
  fields: {
    marginTop: 0,
  },
  fieldInput: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    fontSize: 16,
    color: c.white,
  },
  fieldHelper: {
    fontSize: 13,
    lineHeight: 18,
    color: c.textSecondary,
    marginTop: -4,
    marginBottom: 10,
  },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 12,
  },
  consentIcon: {
    marginTop: 1,
  },
  consentLabel: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: 'rgba(255,255,255,0.88)',
    fontWeight: '500',
  },
  lastField: {
    marginBottom: 8,
  },
  primaryBtn: {
    backgroundColor: c.primary,
    borderRadius: 14,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  primaryBtnLoading: {
    backgroundColor: c.iconInactive,
  },
  primaryBtnText: {
    color: c.textOnPrimary,
    fontSize: 17,
    fontWeight: '700',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 28,
  },
  footerMuted: {
    color: c.textSecondary,
    fontSize: 15,
  },
  footerLink: {
    color: c.primary,
    fontSize: 15,
    fontWeight: '700',
  },
});
