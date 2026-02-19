import { useRouter } from 'expo-router';
import type { Firestore } from 'firebase/firestore';
import { doc, onSnapshot, runTransaction } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth, db } from '../../services/firebase';

function showAlert(title: string, message: string) {
  Alert.alert(title, message);
}

export type JoinOrderResult = { joinedCount: number; maxPeople: number };

export async function joinOrder(
  firestore: Firestore,
  orderId: string,
  userId: string
): Promise<JoinOrderResult> {
  const orderRef = doc(firestore, 'orders', orderId);

  return runTransaction(firestore, async (transaction) => {
    const orderSnap = await transaction.get(orderRef);

    if (!orderSnap.exists()) {
      throw new Error('Order not found');
    }

    const data = orderSnap.data();
    const status = data?.status ?? '';
    const maxPeople = Number(data?.maxPeople ?? 0);
    const joinedCount = Number(data?.joinedCount ?? 0);
    const participants: string[] = Array.isArray(data?.participants) ? data.participants : [];

    if (status !== 'open') {
      throw new Error('Order full');
    }
    if (joinedCount >= maxPeople) {
      throw new Error('Order full');
    }
    if (participants.includes(userId)) {
      throw new Error('Already joined');
    }

    const newJoinedCount = joinedCount + 1;
    const newStatus = newJoinedCount >= maxPeople ? 'full' : 'open';

    transaction.update(orderRef, {
      participants: [...participants, userId],
      joinedCount: newJoinedCount,
      status: newStatus,
    });
    

    return { joinedCount: newJoinedCount, maxPeople };
  });
}

type OrderSnapshot = {
  joinedCount: number;
  maxPeople: number;
  participants: string[];
};

export default function JoinScreen() {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [orderData, setOrderData] = useState<OrderSnapshot | null>(null);
  const router = useRouter();

  const trimmedCode = code.trim();
  const currentUser = auth.currentUser;

  useEffect(() => {
    if (!trimmedCode) {
      setOrderData(null);
      return;
    }
    const orderRef = doc(db, 'orders', trimmedCode);
    const unsubscribe = onSnapshot(
      orderRef,
      (snap) => {
        if (!snap.exists()) {
          setOrderData(null);
          return;
        }
        const d = snap.data();
        setOrderData({
          joinedCount: Number(d?.joinedCount ?? 0),
          maxPeople: Number(d?.maxPeople ?? 0),
          participants: Array.isArray(d?.participants) ? d.participants : [],
        });
      },
      () => setOrderData(null)
    );
    return () => unsubscribe();
  }, [trimmedCode]);

  const isFull = orderData != null && orderData.joinedCount >= orderData.maxPeople;
  const alreadyJoined =
    orderData != null &&
    currentUser != null &&
    orderData.participants.includes(currentUser.uid);
  const joinDisabled = !trimmedCode || loading || isFull || alreadyJoined;

  const handleJoin = async () => {
    console.log("HANDLE JOIN START");

    if (!code || !code.trim()) {
      console.log("EXIT: code empty");
      return;
    }

    setLoading(true);
    console.log("LOADING TRUE");

    try {
      console.log("BEFORE joinOrder");
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error('You must be signed in to join.');
      }
      await joinOrder(db, code.trim(), currentUser.uid);
      console.log("AFTER joinOrder SUCCESS");

      Alert.alert("SUCCESS");
      setCode("");
    } catch (e) {
      console.log("CATCH ERROR", e);
      Alert.alert("ERROR");
    } finally {
      console.log("FINALLY");
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, paddingHorizontal: 24, backgroundColor: '#fff' }}>
      <KeyboardAvoidingView
        style={{ flex: 1, justifyContent: 'center' }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={{ alignItems: 'center', width: '100%' }}>
          <Text
            style={{
              fontSize: 28,
              fontWeight: '700',
              color: '#22223b',
              marginBottom: 36,
              letterSpacing: 0.5,
            }}
          >
            Join Order
          </Text>

          <TextInput
            value={code}
            onChangeText={setCode}
            placeholder="Enter order code"
            autoCapitalize="none"
            autoCorrect={false}
            style={{
              width: '100%',
              maxWidth: 340,
              borderWidth: 1.5,
              borderColor: '#2563eb',
              borderRadius: 10,
              paddingVertical: 12,
              paddingHorizontal: 16,
              fontSize: 17,
              backgroundColor: '#f8fafc',
              marginBottom: 18,
              color: '#1a202c',
            }}
            editable={!loading}
            returnKeyType="done"
            textAlign="center"
            autoFocus={Platform.OS !== "web"} // Don't autoFocus on web to avoid keyboard popups
          />

          <TouchableOpacity
            style={{
              width: '100%',
              maxWidth: 340,
              backgroundColor: '#2563eb',
              borderRadius: 10,
              paddingVertical: 15,
              alignItems: 'center',
              marginTop: 6,
              marginBottom: 4,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.1,
              shadowRadius: 4,
              elevation: 2,
            }}
            onPress={() => {
              console.log("BUTTON PRESSED");
              handleJoin();
            }}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ color: '#fff', fontSize: 17, fontWeight: '600', letterSpacing: 0.25 }}>
                Join
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
