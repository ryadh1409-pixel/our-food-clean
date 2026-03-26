import { useAuth } from '@/services/AuthContext';
import { db } from '@/services/firebase';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '@/constants/theme';

const c = theme.colors;

export default function WalletScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [balance, setBalance] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  const uid = user?.uid ?? null;

  useEffect(() => {
    if (!uid) {
      setLoading(false);
      return;
    }
    const userRef = doc(db, 'users', uid);
    const unsub = onSnapshot(
      userRef,
      (snap) => {
        const data = snap.data();
        const b =
          typeof data?.walletBalance === 'number' ? data.walletBalance : 0;
        setBalance(b);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return () => unsub();
  }, [uid]);

  const handleAddFunds = async () => {
    if (!uid) return;
    // Simulate adding funds: increment by 10 for demo
    try {
      await setDoc(
        doc(db, 'users', uid),
        { walletBalance: balance + 10 },
        { merge: true },
      );
    } catch {
      // ignore
    }
  };

  if (!uid) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.centered}>
          <Text style={styles.hint}>Sign in to view your wallet.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Wallet</Text>
      </View>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <ActivityIndicator
            size="large"
            color={c.primary}
            style={{ marginTop: 48 }}
          />
        ) : (
          <>
            <View style={styles.balanceCard}>
              <Text style={styles.balanceLabel}>Balance</Text>
              <Text style={styles.balanceValue}>${balance.toFixed(2)}</Text>
            </View>
            <TouchableOpacity
              style={styles.addFundsButton}
              onPress={handleAddFunds}
              activeOpacity={0.8}
            >
              <Text style={styles.addFundsText}>Add Funds</Text>
            </TouchableOpacity>
            <Text style={styles.disclaimer}>
              For now, balance is simulated. Add Funds adds $10 for demo.
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  backText: {
    fontSize: 16,
    color: c.primary,
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: c.text,
    marginLeft: 16,
  },
  scrollContent: {
    padding: 20,
  },
  balanceCard: {
    backgroundColor: c.surfaceDark,
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    marginBottom: 24,
  },
  balanceLabel: {
    fontSize: 16,
    color: c.textSecondary,
    marginBottom: 8,
  },
  balanceValue: {
    fontSize: 36,
    fontWeight: '700',
    color: c.white,
  },
  addFundsButton: {
    backgroundColor: c.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  addFundsText: {
    fontSize: 16,
    fontWeight: '600',
    color: c.textOnPrimary,
  },
  disclaimer: {
    fontSize: 12,
    color: c.textMuted,
    marginTop: 16,
    textAlign: 'center',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  hint: {
    fontSize: 16,
    color: c.textMuted,
  },
});
