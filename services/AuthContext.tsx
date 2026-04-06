import {
  ConfirmationResult,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  RecaptchaVerifier,
  reload,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPhoneNumber,
  signOut as firebaseSignOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  updateDoc,
  increment,
} from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAlert } from '@/services/alerts';
import { REFERRAL_ORDER_ID_KEY, REFERRAL_STORAGE_KEY } from '@/lib/invite-link';
import { mapFirebaseLoginError } from '@/lib/mapFirebaseLoginError';
import { mapFirebaseSignUpError } from '@/lib/mapFirebaseSignUpError';
import { logError } from '@/utils/errorLogger';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { theme } from '@/constants/theme';
import { auth, db } from '@/services/firebase';
import { uploadUserProfileImage } from '@/services/profilePhoto';
import { claimReferralInboxRewards } from '@/services/referralRewards';
import { subscribeExpoPushTokenRefresh } from '@/services/notifications';
import {
  persistUserPushTokens,
  registerExpoPushTokenAndSyncToFirestore,
} from '@/services/pushNotifications';

const REFERRAL_CREDIT = 2;

export type EmailSignUpPayload = {
  email: string;
  password: string;
  fullName: string;
  whatsapp: string;
  /** User accepted WhatsApp coordination consent on the sign-up form */
  whatsappConsent: boolean;
  /** Local file URI from ImagePicker; uploaded to `users/{uid}/profile.jpg` */
  localPhotoUri?: string | null;
};

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  signUpWithEmail: (payload: EmailSignUpPayload) => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signInWithPhone: (phoneNumber: string) => Promise<void>;
  confirmPhoneCode: (code: string) => Promise<void>;
  /** Reload current user from server (e.g. after email verification). */
  reloadAuthUser: () => Promise<void>;
  signOutUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function ensureUserDocument(
  uid: string,
  displayName: string | null,
  email: string | null,
  phoneNumber: string | null,
  photoURL: string | null = null,
): Promise<void> {
  const userRef = doc(db, 'users', uid);
  const snap = await getDoc(userRef);
  if (snap.exists()) {
    const data = snap.data();
    const updates: Record<string, unknown> = {};
    if (typeof data?.displayName !== 'string') updates.displayName = displayName ?? '';
    if (typeof data?.name !== 'string' && displayName) updates.name = displayName;
    if (data?.email == null) updates.email = email ?? null;
    if (
      typeof data?.phone !== 'string' &&
      phoneNumber &&
      phoneNumber.trim().length > 0
    ) {
      updates.phone = phoneNumber.trim();
    }
    if (
      typeof data?.whatsapp !== 'string' &&
      phoneNumber &&
      phoneNumber.trim().length > 0
    ) {
      updates.whatsapp = phoneNumber.trim();
    }
    if (
      (data?.photoURL == null || data?.photoURL === '') &&
      photoURL &&
      photoURL.trim()
    ) {
      updates.photoURL = photoURL.trim();
    }
    if (data?.uid === undefined) updates.uid = uid;
    if (data?.activeOrderId === undefined) updates.activeOrderId = null;
    if (data?.credits === undefined) updates.credits = 0;
    if (data?.role === undefined) updates.role = 'user';
    if (data?.notificationsEnabled === undefined) updates.notificationsEnabled = true;
    if (data?.ordersCount === undefined) updates.ordersCount = 0;
    if (data?.averageRating === undefined) updates.averageRating = 0;
    if (data?.totalRatings === undefined) updates.totalRatings = 0;
    if (data?.totalOrdersCompleted === undefined) updates.totalOrdersCompleted = 0;
    if (data?.cancellationRate === undefined) updates.cancellationRate = 0;
    if (data?.reportCount === undefined) updates.reportCount = 0;
    if (data?.trustScore === undefined) updates.trustScore = 0;
    if (data?.taxGiftEligible === undefined) updates.taxGiftEligible = false;
    if (data?.appOpenCount === undefined) updates.appOpenCount = 0;
    if (data?.ordersCreated === undefined) updates.ordersCreated = 0;
    if (data?.ordersJoined === undefined) updates.ordersJoined = 0;
    if (data?.activeOrderCount === undefined) updates.activeOrderCount = 0;
    if (data?.cancelledOrders === undefined) updates.cancelledOrders = 0;
    if (data?.cancellationCount24h === undefined) updates.cancellationCount24h = 0;
    if (data?.cancellationWindowStartMs === undefined)
      updates.cancellationWindowStartMs = 0;
    if (data?.restricted === undefined) updates.restricted = false;
    if (data?.suspicious === undefined) updates.suspicious = false;
    if (!Array.isArray(data?.suspiciousSignals)) updates.suspiciousSignals = [];
    if (data?.messagesSent === undefined) updates.messagesSent = 0;
    if (!Array.isArray(data?.badges)) updates.badges = [];
    if (Object.keys(updates).length > 0) {
      await setDoc(userRef, updates, { merge: true });
    }
    return;
  }

  let referredBy: string | null = null;
  try {
    const stored = await AsyncStorage.getItem(REFERRAL_STORAGE_KEY);
    if (stored?.trim() && stored.trim() !== uid) referredBy = stored.trim();
  } catch {
    // ignore
  }

  const phoneLine = phoneNumber?.trim() ?? '';
  await setDoc(userRef, {
    uid,
    name: displayName ?? '',
    displayName: displayName ?? '',
    email: email ?? null,
    phone: phoneLine,
    whatsapp: phoneLine,
    phoneNumber: phoneNumber ?? null,
    photoURL: photoURL?.trim() || null,
    createdAt: serverTimestamp(),
    activeOrderId: null,
    credits: referredBy ? REFERRAL_CREDIT : 0,
    referredBy: referredBy ?? null,
    role: 'user',
    notificationsEnabled: true,
    ordersCount: 0,
    averageRating: 0,
    totalRatings: 0,
    totalOrdersCompleted: 0,
    cancellationRate: 0,
    reportCount: 0,
    trustScore: 0,
    taxGiftEligible: false,
    appOpenCount: 0,
    ordersCreated: 0,
    ordersJoined: 0,
    activeOrderCount: 0,
    cancelledOrders: 0,
    cancellationCount24h: 0,
    cancellationWindowStartMs: 0,
    restricted: false,
    suspicious: false,
    suspiciousSignals: [],
    messagesSent: 0,
    badges: [],
  });
  await createAlert('new_user', 'New user joined');

  if (referredBy) {
    try {
      let referralOrderId: string | null = null;
      try {
        const storedOrderId = await AsyncStorage.getItem(REFERRAL_ORDER_ID_KEY);
        if (storedOrderId?.trim()) referralOrderId = storedOrderId.trim();
      } catch {
        // ignore
      }
      await addDoc(collection(db, 'referrals'), {
        referrerId: referredBy,
        newUserId: uid,
        orderId: referralOrderId ?? null,
        createdAt: serverTimestamp(),
      });
      await AsyncStorage.removeItem(REFERRAL_STORAGE_KEY);
      await AsyncStorage.removeItem(REFERRAL_ORDER_ID_KEY);
      const inviterRef = doc(db, 'users', referredBy);
      await updateDoc(inviterRef, { credits: increment(REFERRAL_CREDIT) });
      const today = new Date().toISOString().slice(0, 10);
      const metricsRef = doc(db, 'growthMetrics', today);
      const metricsSnap = await getDoc(metricsRef);
      const current = metricsSnap.exists() ? metricsSnap.data() : {};
      await setDoc(
        metricsRef,
        {
          date: today,
          referralUsers: (Number(current?.referralUsers) || 0) + 1,
          orders: Number(current?.orders) || 0,
          matches: Number(current?.matches) || 0,
        },
        { merge: true },
      );
    } catch (e) {
      console.warn('Referral credit/metrics update failed:', e);
    }
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [loading, setLoading] = useState(true);
  const phoneConfirmationRef = useRef<ConfirmationResult | null>(null);
  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser && !firebaseUser.isAnonymous) {
        try {
          await ensureUserDocument(
            firebaseUser.uid,
            firebaseUser.displayName ?? null,
            firebaseUser.email ?? null,
            firebaseUser.phoneNumber ?? null,
            firebaseUser.photoURL ?? null,
          );
        } catch {
          // non-fatal
        }
        registerExpoPushTokenAndSyncToFirestore(firebaseUser.uid).catch(
          () => {},
        );
        void claimReferralInboxRewards(firebaseUser.uid);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  /** Re-save Expo token when it rotates (must stay in sync with Firestore). */
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const u = user;
    if (!u?.uid || u.isAnonymous) return;
    const uid = u.uid;
    const sub = subscribeExpoPushTokenRefresh((token) => {
      persistUserPushTokens(uid, token).catch(() => {});
    });
    return () => sub.remove();
  }, [user?.uid, user?.isAnonymous]);

  const signUpWithEmail = useCallback(async (payload: EmailSignUpPayload) => {
    const trimmed = typeof payload.email === 'string' ? payload.email.trim() : '';
    const nameTrim = payload.fullName.trim();
    const waTrim = payload.whatsapp.trim();
    const pwd = payload.password;

    if (!trimmed || !pwd || !nameTrim || !waTrim) {
      throw new Error('Please fill in all required fields.');
    }
    if (!payload.whatsappConsent) {
      throw new Error('Please accept WhatsApp usage to continue.');
    }
    if (pwd.length < 6) {
      throw new Error('Password must be at least 6 characters.');
    }

    let userCredential;
    try {
      userCredential = await createUserWithEmailAndPassword(
        auth,
        trimmed,
        pwd,
      );
    } catch (err: unknown) {
      logError(err, { alert: false });
      throw new Error(mapFirebaseSignUpError(err));
    }

    const firebaseUser = userCredential.user;
    const uid = firebaseUser.uid;
    let photoURL: string | null = null;

    if (payload.localPhotoUri?.trim()) {
      try {
        photoURL = await uploadUserProfileImage(uid, payload.localPhotoUri.trim());
      } catch (e) {
        logError(e, { alert: false });
        console.warn('Profile image upload failed (continuing without photo):', e);
      }
    }

    try {
      await updateProfile(firebaseUser, {
        displayName: nameTrim,
        ...(photoURL ? { photoURL } : {}),
      });
    } catch (e) {
      logError(e, { alert: false });
    }

    try {
      await setDoc(
        doc(db, 'users', uid),
        {
          uid,
          name: nameTrim,
          displayName: nameTrim,
          email: trimmed,
          whatsapp: waTrim,
          phone: waTrim,
          photoURL: photoURL ?? null,
          rating: 5,
          reviewsCount: 0,
          averageRating: 5,
          totalRatings: 0,
          whatsappConsent: true,
          createdAt: serverTimestamp(),
          trustScore: 0,
          totalOrdersCompleted: 0,
          cancellationRate: 0,
          reportCount: 0,
        },
        { merge: true },
      );
    } catch (e) {
      logError(e);
    }

    try {
      await ensureUserDocument(uid, nameTrim, trimmed, waTrim, photoURL);
    } catch (e) {
      console.warn('ensureUserDocument failed (non-fatal):', e);
    }

    try {
      await sendEmailVerification(firebaseUser);
    } catch (e) {
      logError(e, { alert: false });
      console.warn('sendEmailVerification failed (user can resend from settings later):', e);
    }
  }, []);

  const signInWithEmail = useCallback(
    async (email: string, password: string) => {
      const trimmed = email.trim();
      let cred;
      try {
        cred = await signInWithEmailAndPassword(auth, trimmed, password);
      } catch (err: unknown) {
        logError(err, { alert: false });
        throw new Error(mapFirebaseLoginError(err));
      }
      try {
        await ensureUserDocument(
          cred.user.uid,
          cred.user.displayName ?? null,
          cred.user.email ?? null,
          cred.user.phoneNumber ?? null,
          cred.user.photoURL ?? null,
        );
      } catch (e) {
        logError(e, { alert: false });
        throw new Error('Something went wrong. Please try again.');
      }
    },
    [],
  );

  const signInWithPhone = useCallback(async (phoneNumber: string) => {
    if (typeof window === 'undefined') {
      throw new Error(
        'Phone sign-in is only available on supported platforms.',
      );
    }
    if (!recaptchaRef.current) {
      recaptchaRef.current = new RecaptchaVerifier(
        auth,
        'recaptcha-container',
        {
          size: 'invisible',
        },
      );
    }
    try {
      const confirmationResult = await signInWithPhoneNumber(
        auth,
        phoneNumber,
        recaptchaRef.current,
      );
      phoneConfirmationRef.current = confirmationResult;
    } catch (err: unknown) {
      const code =
        err && typeof err === 'object' && 'code' in err
          ? String((err as { code: string }).code)
          : '';
      if (code === 'auth/account-exists-with-different-credential') {
        throw new Error(
          'An account with this phone number already exists. Please sign in with your original method.',
        );
      }
      throw err;
    }
  }, []);

  const confirmPhoneCode = useCallback(async (code: string) => {
    const confirmationResult = phoneConfirmationRef.current;
    if (!confirmationResult)
      throw new Error('No phone verification in progress');
    try {
      const cred = await confirmationResult.confirm(code);
      phoneConfirmationRef.current = null;
      await ensureUserDocument(
        cred.user.uid,
        cred.user.displayName ?? null,
        cred.user.email ?? null,
        cred.user.phoneNumber ?? null,
        cred.user.photoURL ?? null,
      );
    } catch (err: unknown) {
      const code =
        err && typeof err === 'object' && 'code' in err
          ? String((err as { code: string }).code)
          : '';
      if (code === 'auth/account-exists-with-different-credential') {
        throw new Error(
          'An account with this phone number already exists. Please sign in with your original method.',
        );
      }
      throw err;
    }
  }, []);

  const reloadAuthUser = useCallback(async () => {
    const u = auth.currentUser;
    if (!u) throw new Error('Not signed in');
    await reload(u);
    setUser(auth.currentUser);
  }, []);

  const signOutUser = useCallback(async () => {
    await firebaseSignOut(auth);
  }, []);

  const value: AuthContextValue = {
    user,
    loading,
    signUpWithEmail,
    signInWithEmail,
    signInWithPhone,
    confirmPhoneCode,
    reloadAuthUser,
    signOutUser,
  };

  return (
    <AuthContext.Provider value={value}>
      {loading ? (
        <View
          style={{
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: theme.colors.sheetDark,
          }}
        >
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : (
        children
      )}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
