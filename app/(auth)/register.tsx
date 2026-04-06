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

const c = theme.colors;

const REGISTER_INPUTS = 5;
const FIELD_GAP = 14;
const PHOTO_SIZE = 92;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const placeholderColor = 'rgba(255,255,255,0.42)';

export default function RegisterScreen() {
  const router = useRouter();
  const { signUpWithEmail } = useAuth();
  const fullNameRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const whatsappRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmPasswordRef = useRef<TextInput>(null);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('+1 ');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refs = [fullNameRef, emailRef, whatsappRef, passwordRef, confirmPasswordRef];
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
    Alert.alert('Profile photo', 'Choose a source', [
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
    if (!emailTrim) {
      Alert.alert('Required', 'Please enter your email.');
      return;
    }
    if (!EMAIL_RE.test(emailTrim)) {
      Alert.alert('Invalid email', 'Please enter a valid email address.');
      return;
    }
    if (!wa || isProfilePhoneStorageEmpty(whatsapp)) {
      Alert.alert('Required', 'Please enter your WhatsApp number.');
      return;
    }
    if (!isCompleteNaProfilePhone(whatsapp)) {
      Alert.alert(
        'WhatsApp number',
        'Enter a complete number (10 digits after +1), or adjust the country code if needed.',
      );
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

    Keyboard.dismiss();
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
                  ref={fullNameRef}
                  style={styles.input}
                  placeholder="Full name"
                  placeholderTextColor={placeholderColor}
                  value={fullName}
                  onChangeText={setFullName}
                  autoCapitalize="words"
                  editable={!loading}
                  inputAccessoryViewID={
                    Platform.OS === 'ios' ? KEYBOARD_TOOLBAR_NATIVE_ID : undefined
                  }
                  onFocus={() => setFocusedIndex(0)}
                />

                <TextInput
                  ref={emailRef}
                  style={styles.input}
                  placeholder="Email address"
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
                  style={styles.input}
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

                <TextInput
                  ref={passwordRef}
                  style={styles.input}
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
                  style={styles.input}
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
                style={[styles.primaryBtn, loading && styles.btnDisabled]}
                onPress={() => void handleRegister()}
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
    marginBottom: 8,
  },
  fields: {
    gap: FIELD_GAP,
    marginTop: 16,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
    color: c.white,
  },
  primaryBtn: {
    backgroundColor: c.primary,
    borderRadius: 14,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 22,
  },
  primaryBtnText: {
    color: c.textOnPrimary,
    fontSize: 17,
    fontWeight: '700',
  },
  btnDisabled: { opacity: 0.65 },
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
