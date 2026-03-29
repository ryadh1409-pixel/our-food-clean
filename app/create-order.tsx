import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { addDoc, collection, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenFadeIn } from '@/components/ScreenFadeIn';
import { auth, db } from '@/services/firebase';
import { runTapScale } from '@/utils/motion';

export default function CreateOrderScreen() {
  const router = useRouter();
  const [foodName, setFoodName] = useState('');
  const [totalPrice, setTotalPrice] = useState('');
  const [maxPeople, setMaxPeople] = useState('2');
  const [imageUrl, setImageUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const buttonScale = useState(new Animated.Value(1))[0];

  const pricePerPerson = useMemo(() => {
    const total = Number(totalPrice);
    const people = Number(maxPeople);
    if (!Number.isFinite(total) || !Number.isFinite(people) || people <= 0) return 0;
    return total / people;
  }, [totalPrice, maxPeople]);

  const handleCreateOrder = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      router.push('/(auth)/login?redirectTo=/create-order');
      return;
    }
    const total = Number(totalPrice);
    const people = Number(maxPeople);
    if (!foodName.trim()) {
      Alert.alert('Missing food name', 'Please enter the food name.');
      setError('Enter a food name.');
      return;
    }
    if (!Number.isFinite(total) || total <= 0) {
      Alert.alert('Invalid price', 'Please enter a valid total price.');
      setError('Enter a valid total price.');
      return;
    }
    if (!Number.isFinite(people) || people < 2) {
      Alert.alert('Invalid max people', 'Max people must be at least 2.');
      setError('Max people must be at least 2.');
      return;
    }
    if (!imageUrl.trim()) {
      Alert.alert('Missing image URL', 'Please enter an image URL.');
      setError('Enter an image URL.');
      return;
    }

    setError(null);
    runTapScale(buttonScale);
    setSaving(true);
    try {
      const displayName =
        auth.currentUser?.displayName ||
        auth.currentUser?.email?.split('@')[0] ||
        'User';
      const orderPayload = {
        foodName: foodName.trim(),
        image: imageUrl.trim(),
        pricePerPerson: Number((total / people).toFixed(2)),
        totalPrice: Number(total.toFixed(2)),
        peopleJoined: 1,
        maxPeople: people,
        usersJoined: [uid],
        users: [
          {
            uid,
            displayName,
            photoURL: auth.currentUser?.photoURL ?? null,
            joinedAt: serverTimestamp(),
          },
        ],
        createdBy: uid,
        createdAt: serverTimestamp(),
      };
      const orderRef = await addDoc(collection(db, 'orders'), orderPayload);
      await updateDoc(doc(db, 'orders', orderRef.id), { id: orderRef.id });
      Alert.alert('Order created', 'Your shared order is live now.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.replace('/(tabs)' as never);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to create order.';
      Alert.alert('Create failed', msg);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenFadeIn style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Create Order</Text>
        <Text style={styles.subtitle}>Add order details to share the cost</Text>

        <Text style={styles.label}>Food Name</Text>
        <TextInput
          value={foodName}
          onChangeText={setFoodName}
          placeholder="e.g. Pepperoni Pizza"
          placeholderTextColor="#9CA3AF"
          style={styles.input}
        />

        <Text style={styles.label}>Total Price</Text>
        <TextInput
          value={totalPrice}
          onChangeText={setTotalPrice}
          placeholder="e.g. 30"
          placeholderTextColor="#9CA3AF"
          keyboardType="decimal-pad"
          style={styles.input}
        />

        <Text style={styles.label}>Max People</Text>
        <TextInput
          value={maxPeople}
          onChangeText={setMaxPeople}
          placeholder="e.g. 3"
          placeholderTextColor="#9CA3AF"
          keyboardType="number-pad"
          style={styles.input}
        />

        <Text style={styles.helper}>
          Price per person: ${pricePerPerson > 0 ? pricePerPerson.toFixed(2) : '0.00'}
        </Text>

        <Text style={styles.label}>Image URL</Text>
        <TextInput
          value={imageUrl}
          onChangeText={setImageUrl}
          placeholder="https://example.com/food.jpg"
          placeholderTextColor="#9CA3AF"
          style={styles.input}
        />

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
          <TouchableOpacity
            style={[styles.createBtn, saving && styles.createBtnDisabled]}
            onPress={handleCreateOrder}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#052E1A" />
            ) : (
              <Text style={styles.createBtnText}>Save Order</Text>
            )}
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
      </ScreenFadeIn>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0D10' },
  content: { padding: 16, paddingBottom: 32 },
  title: { color: '#F8FAFC', fontSize: 28, fontWeight: '800' },
  subtitle: { color: '#9CA3AF', marginTop: 6, marginBottom: 18, fontSize: 14 },
  label: { color: '#E5E7EB', fontWeight: '700', marginBottom: 8, marginTop: 10 },
  input: {
    borderWidth: 1,
    borderColor: '#232A35',
    backgroundColor: '#141922',
    color: '#F8FAFC',
    borderRadius: 12,
    minHeight: 46,
    paddingHorizontal: 12,
  },
  helper: { color: '#6EE7B7', marginTop: 8, marginBottom: 2, fontWeight: '600' },
  createBtn: {
    marginTop: 18,
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: '#34D399',
    justifyContent: 'center',
    alignItems: 'center',
  },
  createBtnDisabled: { opacity: 0.7 },
  createBtnText: { color: '#052E1A', fontSize: 16, fontWeight: '800' },
  errorText: { color: '#FCA5A5', marginTop: 10, fontSize: 13, fontWeight: '600' },
});
