/**
 * Developer test tool: runs order flow test (create order, simulate join, verify).
 * For development only.
 */
import { useAuth } from '@/services/AuthContext';
import { db } from '@/services/firebase';
import { Redirect, useRouter } from 'expo-router';
import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { adminColors as C } from '@/constants/adminTheme';

const TEST_USER_2 = 'test_user_2';

function TestOrderFlowScreenDev() {
  const router = useRouter();
  const { user } = useAuth();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);

  const currentUserUid = user?.uid ?? null;

  const runTest = async () => {
    if (!currentUserUid) {
      Alert.alert('Error', 'You must be signed in to run the test.');
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
        hostId: currentUserUid,
        participantIds: [currentUserUid],
        maxPeople: 3,
        totalPrice: 30,
        status: 'open',
        createdAt: serverTimestamp(),
      };
      const ref = await addDoc(ordersRef, orderData);
      const orderId = ref.id;

      const orderRef = doc(db, 'orders', orderId);
      await updateDoc(orderRef, {
        participantIds: arrayUnion(TEST_USER_2),
      });

      const snap = await getDoc(orderRef);
      if (!snap.exists()) {
        setResult('Order flow test failed');
        setErrorDetail('Order not found after update');
        Alert.alert('Order flow test failed', 'Order not found after update');
        return;
      }

      const data = snap.data();
      const participantIds = Array.isArray(data?.participantIds)
        ? data.participantIds
        : [];

      if (participantIds.length !== 2) {
        setResult('Order flow test failed');
        setErrorDetail(
          `Expected participantIds.length === 2, got ${participantIds.length}`,
        );
        Alert.alert(
          'Order flow test failed',
          `participantIds.length should be 2, got ${participantIds.length}`,
        );
        return;
      }

      if (
        !participantIds.includes(currentUserUid) ||
        !participantIds.includes(TEST_USER_2)
      ) {
        const detail = `participantIds should contain both users, got: ${participantIds.join(', ')}`;
        setResult('Order flow test failed');
        setErrorDetail(detail);
        Alert.alert('Order flow test failed', detail);
        return;
      }

      setResult('Order flow test passed');
      setErrorDetail(null);
      Alert.alert('Success', 'Order flow test passed');
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setResult('Order flow test failed');
      setErrorDetail(message);
      Alert.alert('Order flow test failed', message);
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
        Creates a test order, simulates a second user joining, and verifies
        participantIds.
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
