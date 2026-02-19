import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Replace these placeholder values with your Firebase project config
// (Firebase Console → Project Settings → Your apps → Config)

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDbXyGYAVJU818J7mpiJXOOexAbOQuLJvo",
  authDomain: "halforfer.firebaseapp.com",
  projectId: "halforfer",
  storageBucket: "halforfer.firebasestorage.app",
  messagingSenderId: "297728229596",
  appId: "1:297728229596:web:1921b79403d9e2d11db419",
  measurementId: "G-JC37LM61J6"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
export const db = getFirestore(app);