/**
 * Firebase client for Expo (iOS, Android, web).
 *
 * **Auth (native):** `initializeAuth` + `getReactNativePersistence(AsyncStorage)`
 * from `@firebase/auth` (Metro uses the package `"react-native"` export).
 * The `firebase/auth/react-native` import path is **not** in `firebase@12`
 * `package.json` exports; `@firebase/auth` is the supported RN entry.
 *
 * **Auth (web):** `getAuth` with default browser persistence.
 *
 * Native persistence is loaded with `require()` so web bundles never static-import
 * `getReactNativePersistence` (it is not exported from the browser build).
 */
import type { Auth, Dependencies } from '@firebase/auth';
import { getAuth } from '@firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { Platform } from 'react-native';

const firebaseConfig = {
  apiKey: 'AIzaSyDbXyGYAVJU818J7mpiJXOOexAbOQuLJvo',
  authDomain: 'halforfer.firebaseapp.com',
  projectId: 'halforfer',
  storageBucket: 'halforfer.firebasestorage.app',
  messagingSenderId: '297728229596',
  appId: '1:297728229596:web:1921b79403d9e2d11db419',
  measurementId: 'G-JC37LM61J6',
};

function getOrCreateApp(): FirebaseApp {
  if (getApps().length === 0) {
    return initializeApp(firebaseConfig);
  }
  return getApp();
}

function isAuthAlreadyInitialized(e: unknown): boolean {
  return (
    typeof e === 'object' &&
    e !== null &&
    'code' in e &&
    (e as { code: string }).code === 'auth/already-initialized'
  );
}

function getOrCreateAuth(app: FirebaseApp): Auth {
  if (Platform.OS === 'web') {
    return getAuth(app);
  }

  /** Runtime module is `@firebase/auth` RN build; types use public `Dependencies`. */
  /* RN-only exports must not be static-imported for Expo web bundles. */
  /* eslint-disable @typescript-eslint/no-require-imports */
  const {
    initializeAuth: initAuth,
    getAuth: getAuthImpl,
    getReactNativePersistence,
  } = require('@firebase/auth') as {
    initializeAuth: (app: FirebaseApp, deps?: Dependencies) => Auth;
    getAuth: (app?: FirebaseApp) => Auth;
    getReactNativePersistence: (
      storage: typeof AsyncStorage,
    ) => Dependencies['persistence'];
  };
  /* eslint-enable @typescript-eslint/no-require-imports */

  try {
    return initAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch (e) {
    if (isAuthAlreadyInitialized(e)) {
      return getAuthImpl(app);
    }
    throw e;
  }
}

const app = getOrCreateApp();

export const auth = getOrCreateAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
