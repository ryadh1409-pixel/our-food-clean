import { KeyboardToolbar, KEYBOARD_TOOLBAR_NATIVE_ID } from '@/components/KeyboardToolbar';
import {
  isCompleteNaProfilePhone,
  isProfilePhoneStorageEmpty,
  profilePhoneForFirestore,
  profileWhatsAppOnChangeText,
} from '@/lib/profileWhatsAppPhone';
import { useAuth } from '@/services/AuthContext';
import { logError } from '@/utils/errorLogger';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '@/constants/theme';

const c = theme.colors;

const REGISTER_INPUTS = 5;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function RegisterScreen() {
  const router = useRouter();
  const { signUpWithEmail } = useAuth();
  const fullNameRef = useRef<TextInput>(null);
  const whatsappRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmPasswordRef = useRef<TextInput>(null);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [fullName, setFullName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refs = [fullNameRef, whatsappRef, emailRef, passwordRef, confirmPasswordRef];
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
      Alert.alert('Permission needed', 'Allow photo library access to add a profile picture.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (!result.canceled && result.assets[0]?.uri) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  const pickFromCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow camera access to take a profile picture.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.85,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (!result.canceled && result.assets[0]?.uri) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  const openPhotoOptions = () => {
    Alert.alert('Profile photo', 'Add a photo (optional but recommended)', [
      { text: 'Take photo', onPress: () => void pickFromCamera() },
      { text: 'Choose from library', onPress: () => void pickFromLibrary() },
      ...(photoUri
        ? [{ text: 'Remove photo', style: 'destructive' as const, onPress: () => setPhotoUri(null) }]
        : []),
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleRegister = async () => {
    const nameTrim = fullName.trim();
    const emailTrim = email.trim();
    const wa = whatsapp.trim();

    if (!nameTrim) {
      Alert.alert('Required', 'Please enter your full name.');
      return;
    }
    if (!wa || isProfilePhoneStorageEmpty(whatsapp)) {
      Alert.alert('Required', 'Please enter your WhatsApp number.');
      return;
    }
    if (!isCompleteNaProfilePhone(whatsapp)) {
      Alert.alert(
        'WhatsApp number',
        'Enter a complete number (10 digits after +1 for US/Canada), or use your full international number.',
      );
      return;
    }
    if (!emailTrim) {
      Alert.alert('Required', 'Please enter your email.');
      return;
    }
    if (!EMAIL_RE.test(emailTrim)) {
      Alert.alert('Invalid email', 'Please enter a valid email address.');
      return;
    }
    if (!password || password.length < 6) {
      Alert.alert('Password', 'Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Password', 'Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await signUpWithEmail({
        email: emailTrim,
        password,
        fullName: nameTrim,
        whatsapp: profilePhoneForFirestore(whatsapp),
        localPhotoUri: photoUri,
      });
      router.replace('/(tabs)');
    } catch (error: unknown) {
      logError(error, { alert: false });
      const msg =
        error && typeof error === 'object' && 'message' in error
          ? String((error as { message: string }).message)
          : 'Registration failed. Please try again.';
      Alert.alert('Error', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
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
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title}>Create account</Text>
          <Text style={styles.subtitle}>Join HalfOrder in seconds</Text>

          <TouchableOpacity
            style={styles.photoRing}
            onPress={openPhotoOptions}
            disabled={loading}
            activeOpacity={0.85}
            accessibilityLabel="Add profile photo"
          >
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.photoImage} contentFit="cover" />
            ) : (
              <View style={styles.photoPlaceholder}>
                <MaterialIcons name="add-a-photo" size={32} color={c.iconInactive} />
                <Text style={styles.photoPlaceholderText}>Add photo</Text>
              </View>
            )}
          </TouchableOpacity>
          <Text style={styles.photoHint}>Optional — recommended</Text>

          <View style={styles.form}>
            <Text style={styles.label}>
              Full name <Text style={styles.req}>*</Text>
            </Text>
            <TextInput
              ref={fullNameRef}
              style={styles.input}
              placeholder="Thamer Khaled"
              placeholderTextColor={c.iconInactive}
              value={fullName}
              onChangeText={setFullName}
              autoCapitalize="words"
              editable={!loading}
              inputAccessoryViewID={
                Platform.OS === 'ios' ? KEYBOARD_TOOLBAR_NATIVE_ID : undefined
              }
              onFocus={() => setFocusedIndex(0)}
            />

            <Text style={styles.label}>
              WhatsApp <Text style={styles.req}>*</Text>
            </Text>
            <TextInput
              ref={whatsappRef}
              style={styles.input}
              placeholder="+1 416 555 0100"
              placeholderTextColor={c.iconInactive}
              value={whatsapp}
              onChangeText={(t) => setWhatsapp(profileWhatsAppOnChangeText(t))}
              keyboardType="phone-pad"
              editable={!loading}
              inputAccessoryViewID={
                Platform.OS === 'ios' ? KEYBOARD_TOOLBAR_NATIVE_ID : undefined
              }
              onFocus={() => setFocusedIndex(1)}
            />

            <Text style={styles.label}>
              Email <Text style={styles.req}>*</Text>
            </Text>
            <TextInput
              ref={emailRef}
              style={styles.input}
              placeholder="you@example.com"
              placeholderTextColor={c.iconInactive}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
              inputAccessoryViewID={
                Platform.OS === 'ios' ? KEYBOARD_TOOLBAR_NATIVE_ID : undefined
              }
              onFocus={() => setFocusedIndex(2)}
            />

            <Text style={styles.label}>
              Password <Text style={styles.req}>*</Text>
            </Text>
            <TextInput
              ref={passwordRef}
              style={styles.input}
              placeholder="At least 6 characters"
              placeholderTextColor={c.iconInactive}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              editable={!loading}
              inputAccessoryViewID={
                Platform.OS === 'ios' ? KEYBOARD_TOOLBAR_NATIVE_ID : undefined
              }
              onFocus={() => setFocusedIndex(3)}
            />

            <Text style={styles.label}>
              Confirm password <Text style={styles.req}>*</Text>
            </Text>
            <TextInput
              ref={confirmPasswordRef}
              style={styles.input}
              placeholder="••••••••"
              placeholderTextColor={c.iconInactive}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              editable={!loading}
              inputAccessoryViewID={
                Platform.OS === 'ios' ? KEYBOARD_TOOLBAR_NATIVE_ID : undefined
              }
              onFocus={() => setFocusedIndex(4)}
            />

            <TouchableOpacity
              style={[styles.primaryBtn, loading && styles.btnDisabled]}
              onPress={() => void handleRegister()}
              disabled={loading}
              activeOpacity={0.9}
            >
              {loading ? (
                <ActivityIndicator color={c.textOnPrimary} />
              ) : (
                <Text style={styles.primaryBtnText}>Create account</Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account? </Text>
            <TouchableOpacity onPress={() => router.back()} disabled={loading}>
              <Text style={styles.link}>Log in</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const PHOTO_SIZE = 112;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: c.sheetDark },
  keyboard: { flex: 1 },
  scroll: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: c.white,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    color: c.textSecondary,
    marginTop: 6,
    marginBottom: 24,
  },
  photoRing: {
    alignSelf: 'center',
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    borderRadius: PHOTO_SIZE / 2,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.15)',
    overflow: 'hidden',
    marginBottom: 8,
    backgroundColor: c.background,
  },
  photoImage: {
    width: '100%',
    height: '100%',
  },
  photoPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  photoPlaceholderText: {
    fontSize: 12,
    fontWeight: '600',
    color: c.textSecondary,
  },
  photoHint: {
    alignSelf: 'center',
    fontSize: 12,
    color: c.textTertiary,
    marginBottom: 20,
  },
  form: {
    gap: 4,
    backgroundColor: c.background,
    padding: 22,
    borderRadius: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: c.textSlateDark,
    marginBottom: 6,
    marginTop: 10,
  },
  req: { color: c.primary },
  input: {
    backgroundColor: c.background,
    borderWidth: 1,
    borderColor: c.borderStrong,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: c.text,
    marginBottom: 4,
  },
  primaryBtn: {
    backgroundColor: c.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 54,
    marginTop: 16,
  },
  primaryBtnText: {
    color: c.textOnPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  btnDisabled: { opacity: 0.65 },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 28,
  },
  footerText: { color: c.textSecondary, fontSize: 15 },
  link: { color: c.primary, fontSize: 15, fontWeight: '700' },
});
