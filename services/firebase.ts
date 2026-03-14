import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  getReactNativePersistence,
  initializeAuth,
  getAuth,
} from 'firebase/auth';

import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: 'AIzaSyDbXyGYAVJU818J7mpiJXOOexAbOQuLJvo',
  authDomain: 'halforfer.firebaseapp.com',
  projectId: 'halforfer',
  storageBucket: 'halforfer.firebasestorage.app',
  messagingSenderId: '297728229596',
  appId: '1:297728229596:web:1921b79403d9e2d11db419',
  measurementId: 'G-JC37LM61J6',
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const auth =
  getApps().length > 0
    ? getAuth(app)
    : initializeAuth(app, {
        persistence: getReactNativePersistence(AsyncStorage),
      });
export const db = getFirestore(app);
export const storage = getStorage(app);
