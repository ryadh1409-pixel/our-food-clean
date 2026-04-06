/**
 * Developer test tool: runs order flow test (create order, simulate join, verify).
 * For development only.
 */
import { useAuth } from '@/services/AuthContext';
import { db } from '@/services/firebase';
import { Redirect, useRouter } from 'expo-router';
import { addDoc, collection, doc, getDoc, serverTimestamp } from 'firebase/firestore';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { adminColors as C } from '@/constants/adminTheme';
import { showError, showSuccess } from '@/utils/toast';

function TestOrderFlowScreenDev() {
  const router = useRouter();
  const { user } = useAuth();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);

  const currentUserUid = user?.uid ?? null;

  const runTest = async () => {
    if (!currentUserUid) {
      showError('You must be signed in to run the test.');
      setResult('Order flow test failed');
      setErrorDetail('Not signed in');
      return;
    }

    setRunning(true);
    setResult(null);
    setErrorDetail(null);

    try {
      const ordersRef = collection(db, 'orders');
      const orderData = {
        createdBy: currentUserUid,
        participants: [currentUserUid],
        joinedAtMap: { [currentUserUid]: serverTimestamp() },
        usersAccepted: [] as string[],
        foodName: 'Dev test order',
        image: 'https://example.com/dev-test.jpg',
        pricePerPerson: 10,
        totalPrice: 30,
        maxPeople: 3,
        status: 'open',
        createdAt: serverTimestamp(),
      };
      const ref = await addDoc(ordersRef, orderData);
      const orderId = ref.id;

      const orderRef = doc(db, 'orders', orderId);
      const snap = await getDoc(orderRef);
      if (!snap.exists()) {
        setResult('Order flow test failed');
        setErrorDetail('Order not found after create');
        showError('Order not found after create');
        return;
      }

      const data = snap.data();
      const plist = Array.isArray(data?.participants)
        ? data.participants.filter((x): x is string => typeof x === 'string')
        : [];

      if (plist.length !== 1 || !plist.includes(currentUserUid)) {
        const detail = `Expected participants === [current user], got: ${plist.join(', ')}`;
        setResult('Order flow test failed');
        setErrorDetail(detail);
        showError(detail);
        return;
      }

      setResult('Order flow test passed');
      setErrorDetail(null);
      showSuccess('Order flow test passed');
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setResult('Order flow test failed');
      setErrorDetail(message);
      showError(message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <TouchableOpacity onPress={() => router.back()} style={styles.backRow}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>
      <Text style={styles.title}>Order Flow Test</Text>
      <Text style={styles.subtitle}>
        Creates a valid test order (participants + joinedAtMap) and verifies
        membership fields. A second-user join requires signing in as that user.
      </Text>
      <TouchableOpacity
        style={[styles.button, running && styles.buttonDisabled]}
        onPress={runTest}
        disabled={running}
      >
        {running ? (
          <ActivityIndicator color={C.onPrimary} />
        ) : (
          <Text style={styles.buttonText}>Run Order Flow Test</Text>
        )}
      </TouchableOpacity>
      {result !== null && (
        <View style={styles.resultBox}>
          <Text
            style={[
              styles.resultText,
              result.includes('passed') ? styles.resultPass : styles.resultFail,
            ]}
          >
            {result}
          </Text>
          {errorDetail ? (
            <Text style={styles.errorDetail}>{errorDetail}</Text>
          ) : null}
        </View>
      )}
    </SafeAreaView>
  );
}

export default function TestOrderFlowScreen() {
  if (!__DEV__) {
    return <Redirect href="/admin" />;
  }
  return <TestOrderFlowScreenDev />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.card,
    padding: 20,
  },
  backRow: {
    marginBottom: 16,
  },
  backText: {
    fontSize: 16,
    color: C.accentBlue,
    fontWeight: '600',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: C.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: C.textMuted,
    marginBottom: 24,
  },
  button: {
    backgroundColor: C.primary,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: C.onPrimary,
  },
  resultBox: {
    marginTop: 24,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.background,
  },
  resultText: {
    fontSize: 16,
    fontWeight: '600',
  },
  resultPass: {
    color: C.successText,
  },
  resultFail: {
    color: C.error,
  },
  errorDetail: {
    fontSize: 13,
    color: C.textMuted,
    marginTop: 8,
  },
});
