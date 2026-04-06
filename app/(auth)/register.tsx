import { KeyboardToolbar, KEYBOARD_TOOLBAR_NATIVE_ID } from '@/components/KeyboardToolbar';
import {
  isCompleteNaProfilePhone,
  isProfilePhoneStorageEmpty,
  profilePhoneForFirestore,
  profileWhatsAppOnChangeText,
} from '@/lib/profileWhatsAppPhone';
import { useAuth } from '@/services/AuthContext';
import {
  ImagePickerPermissionError,
  pickImageFromLibrary,
  takePhoto,
} from '@/services/imagePicker';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { systemActionSheet } from '@/components/SystemDialogHost';
import { getUserFriendlyError } from '@/utils/errorHandler';
import { showError, showSuccess } from '@/utils/toast';

const REGISTER_INPUTS = 5;
const PHOTO_SIZE = 92;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Auth stack dark theme — aligned with login / onboarding */
const AUTH = {
  bg: '#0B0F14',
  card: '#111827',
  text: '#FFFFFF',
  textMuted: 'rgba(255,255,255,0.72)',
  inputBg: '#1F2937',
  inputBorder: '#374151',
  placeholder: '#9CA3AF',
  primary: '#F97316',
} as const;

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
  const [pickingPhoto, setPickingPhoto] = useState(false);

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

  const handleChooseFromLibrary = async () => {
    setPickingPhoto(true);
    try {
      const uri = await pickImageFromLibrary({ quality: 0.7 });
      if (uri) {
        setPhotoUri(uri);
      }
    } catch (e) {
      if (e instanceof ImagePickerPermissionError) {
        Alert.alert('Photo access needed', e.message);
      } else if (e instanceof Error && e.message === 'PICKER_LAUNCH_FAILED') {
        Alert.alert('Error', 'Could not open photo library.');
      } else {
        Alert.alert('Error', 'Could not open photo library.');
      }
    } finally {
      setPickingPhoto(false);
    }
  };

  const handleTakePhoto = async () => {
    setPickingPhoto(true);
    try {
      const uri = await takePhoto({ quality: 0.7 });
      if (uri) {
        setPhotoUri(uri);
      }
    } catch (e) {
      if (e instanceof ImagePickerPermissionError) {
        Alert.alert('Camera access needed', e.message);
      } else if (e instanceof Error && e.message === 'CAMERA_LAUNCH_FAILED') {
        Alert.alert('Error', 'Could not open the camera.');
      } else {
        Alert.alert('Error', 'Could not open the camera.');
      }
    } finally {
      setPickingPhoto(false);
    }
  };

  const openPhotoOptions = () => {
    if (pickingPhoto || loading) return;
    void systemActionSheet({
      title: 'Profile photo',
      message: 'Choose a source',
      actions: [
        { label: 'Take photo', onPress: () => void handleTakePhoto() },
        {
          label: 'Choose from library',
          onPress: () => void handleChooseFromLibrary(),
        },
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
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <KeyboardToolbar
        onFocusPrevious={focusPrev}
        onFocusNext={focusNext}
        focusedIndex={focusedIndex}
        totalInputs={REGISTER_INPUTS}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoid}
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
                  disabled={loading || pickingPhoto}
                  activeOpacity={0.85}
                  accessibilityLabel="Add profile photo"
                >
                  {pickingPhoto ? (
                    <View style={[styles.photoEmpty, styles.photoLoading]}>
                      <ActivityIndicator size="large" color={AUTH.primary} />
                    </View>
                  ) : photoUri ? (
                    <Image source={{ uri: photoUri }} style={styles.photoImage} contentFit="cover" />
                  ) : (
                    <View style={styles.photoEmpty}>
                      <MaterialIcons name="add-a-photo" size={36} color={AUTH.placeholder} />
                    </View>
                  )}
                </TouchableOpacity>
                <Text style={styles.photoCaption}>Add profile photo (optional)</Text>

                <View style={styles.fields}>
                  <TextInput
                    ref={nameRef}
                    style={styles.fieldInput}
                    placeholder="Full name"
                    placeholderTextColor={AUTH.placeholder}
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
                    placeholderTextColor={AUTH.placeholder}
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
                    placeholderTextColor={AUTH.placeholder}
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
                      color={whatsappCoordinationConsent ? AUTH.primary : AUTH.placeholder}
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
                    placeholderTextColor={AUTH.placeholder}
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
                    placeholderTextColor={AUTH.placeholder}
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
                    <ActivityIndicator color="#FFFFFF" />
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
    backgroundColor: AUTH.bg,
  },
  keyboardAvoid: { flex: 1, backgroundColor: '#0B0F14' },
  scrollHost: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 120,
  },
  card: {
    backgroundColor: AUTH.card,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(55,65,81,0.6)',
  },
  cardTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: AUTH.text,
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  cardSubtitle: {
    fontSize: 15,
    color: AUTH.textMuted,
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
    borderWidth: 1,
    borderColor: AUTH.inputBorder,
    overflow: 'hidden',
    backgroundColor: AUTH.inputBg,
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
  photoLoading: {
    backgroundColor: AUTH.inputBg,
  },
  photoCaption: {
    textAlign: 'center',
    fontSize: 14,
    color: AUTH.textMuted,
    marginTop: 10,
    marginBottom: 16,
  },
  fields: {
    marginTop: 0,
  },
  fieldInput: {
    backgroundColor: '#1F2937',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    fontSize: 16,
    color: '#FFFFFF',
  },
  fieldHelper: {
    fontSize: 13,
    lineHeight: 18,
    color: AUTH.textMuted,
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
    color: AUTH.text,
    fontWeight: '500',
  },
  lastField: {
    marginBottom: 8,
  },
  primaryBtn: {
    backgroundColor: AUTH.primary,
    borderRadius: 14,
    height: 55,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  primaryBtnLoading: {
    backgroundColor: '#9CA3AF',
  },
  primaryBtnText: {
    color: '#FFFFFF',
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
    color: AUTH.textMuted,
    fontSize: 15,
  },
  footerLink: {
    color: AUTH.primary,
    fontSize: 15,
    fontWeight: '700',
  },
});
