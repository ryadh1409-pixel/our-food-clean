import {
  ConfirmationResult,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  RecaptchaVerifier,
  signInWithEmailAndPassword,
  signInWithPhoneNumber,
  signOut as firebaseSignOut,
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
import { claimReferralInboxRewards } from '@/services/referralRewards';
import { subscribeExpoPushTokenRefresh } from '@/services/notifications';
import {
  persistUserPushTokens,
  registerExpoPushTokenAndSyncToFirestore,
} from '@/services/pushNotifications';

const REFERRAL_CREDIT = 2;

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signInWithPhone: (phoneNumber: string) => Promise<void>;
  confirmPhoneCode: (code: string) => Promise<void>;
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
    if (data?.email == null) updates.email = email ?? null;
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

  await setDoc(userRef, {
    uid,
    displayName: displayName ?? '',
    email: email ?? null,
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

  const signUpWithEmail = useCallback(
    async (email: string, password: string) => {
      const trimmed = typeof email === 'string' ? email.trim() : '';
      if (!trimmed || !password) {
        throw new Error('Please fill in all fields.');
      }
      let userCredential;
      try {
        userCredential = await createUserWithEmailAndPassword(
          auth,
          trimmed,
          password,
        );
      } catch (err: unknown) {
        logError(err, { alert: false });
        const msg =
          err && typeof err === 'object' && 'message' in err
            ? String((err as { message: string }).message)
            : 'Registration failed';
        throw new Error(msg);
      }
      const uid = userCredential.user.uid;
      const userEmail = userCredential.user.email ?? trimmed;
      try {
        await setDoc(doc(db, 'users', uid), {
          email: userEmail,
          createdAt: serverTimestamp(),
          trustScore: 0,
          averageRating: 0,
          totalRatings: 0,
          totalOrdersCompleted: 0,
          cancellationRate: 0,
          reportCount: 0,
        });
      } catch (e) {
        logError(e);
        // Do not throw: Auth succeeded; ensureUserDocument will run on onAuthStateChanged
      }
      try {
        await ensureUserDocument(
          uid,
          userCredential.user.displayName ?? null,
          userCredential.user.email ?? null,
          userCredential.user.phoneNumber ?? null,
          userCredential.user.photoURL ?? null,
        );
      } catch (e) {
        console.warn('ensureUserDocument failed (non-fatal):', e);
      }
    },
    [],
  );

  const signInWithEmail = useCallback(
    async (email: string, password: string) => {
      const trimmed = email.trim();
      try {
        const cred = await signInWithEmailAndPassword(auth, trimmed, password);
        try {
          await ensureUserDocument(
            cred.user.uid,
            cred.user.displayName ?? null,
            cred.user.email ?? null,
            cred.user.phoneNumber ?? null,
            cred.user.photoURL ?? null,
          );
        } catch (e) {
          logError(e);
          throw e;
        }
      } catch (err: unknown) {
        logError(err);
        throw err;
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
