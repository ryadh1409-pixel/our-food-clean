import { auth, db, storage } from '@/services/firebase';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import {
  addDoc,
  collection,
  getDocs,
  query,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import React, { useState } from 'react';
import {
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

const ADMIN_EMAIL = 'support@halforder.app';

export default function AdminCardCreateScreen() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [restaurantName, setRestaurantName] = useState('');
  const [price, setPrice] = useState('');
  const [splitPrice, setSplitPrice] = useState('');
  const [location, setLocation] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const isAdmin = (auth.currentUser?.email ?? '').toLowerCase() === ADMIN_EMAIL;

  const pickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission required', 'Allow photo access to upload card images.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.82,
    });
    if (result.canceled || !result.assets[0]?.uri) return;

    try {
      setUploading(true);
      const uri = result.assets[0].uri;
      const response = await fetch(uri);
      const blob = await response.blob();
      const uid = auth.currentUser?.uid ?? 'admin';
      const path = `foodCards/${uid}/${Date.now()}.jpg`;
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, blob);
      const url = await getDownloadURL(storageRef);
      setImageUrl(url);
    } catch (e) {
      Alert.alert('Upload failed', e instanceof Error ? e.message : 'Could not upload image');
    } finally {
      setUploading(false);
    }
  };

  const onSave = async () => {
    if (!isAdmin) {
      Alert.alert('Access denied', 'Only admin can create food cards.');
      return;
    }
    const p = Number(price);
    const sp = Number(splitPrice);
    if (!title.trim() || !restaurantName.trim() || !imageUrl.trim()) {
      Alert.alert('Missing fields', 'Title, restaurant, and image are required.');
      return;
    }
    if (!Number.isFinite(p) || p <= 0 || !Number.isFinite(sp) || sp <= 0) {
      Alert.alert('Invalid values', 'Use valid positive prices.');
      return;
    }

    setSaving(true);
    try {
      const active = await getDocs(
        query(collection(db, 'food_cards'), where('status', '==', 'waiting')),
      );
      if (active.size >= 10) {
        Alert.alert('Limit reached', 'Maximum 10 active cards allowed.');
        return;
      }
      const now = Date.now();
      await addDoc(collection(db, 'food_cards'), {
        title: title.trim(),
        image: imageUrl.trim(),
        restaurantName: restaurantName.trim(),
        price: p,
        splitPrice: sp,
        location: location.trim() || null,
        createdAt: serverTimestamp(),
        expiresAt: now + 45 * 60 * 1000,
        status: 'waiting',
        user1: null,
        user2: null,
      });
      Alert.alert('Saved', 'Food card created successfully.');
      setTitle('');
      setRestaurantName('');
      setPrice('');
      setSplitPrice('');
      setLocation('');
      setImageUrl('');
      router.back();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not save card');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Admin Food Cards</Text>
        <Text style={styles.subtitle}>Admin controls all supply. Users only swipe and join.</Text>

        <TouchableOpacity style={styles.imageButton} onPress={pickImage} disabled={uploading}>
          <Text style={styles.imageButtonText}>{uploading ? 'Uploading...' : 'Upload Image'}</Text>
        </TouchableOpacity>
        {imageUrl ? <Image source={{ uri: imageUrl }} style={styles.preview} /> : null}

        <TextInput
          style={styles.input}
          placeholder="Title"
          placeholderTextColor="#94a3b8"
          value={title}
          onChangeText={setTitle}
        />
        <TextInput
          style={styles.input}
          placeholder="Restaurant Name"
          placeholderTextColor="#94a3b8"
          value={restaurantName}
          onChangeText={setRestaurantName}
        />
        <TextInput
          style={styles.input}
          placeholder="Total Price"
          placeholderTextColor="#94a3b8"
          value={price}
          onChangeText={setPrice}
          keyboardType="decimal-pad"
        />
        <TextInput
          style={styles.input}
          placeholder="Split Price"
          placeholderTextColor="#94a3b8"
          value={splitPrice}
          onChangeText={setSplitPrice}
          keyboardType="decimal-pad"
        />
        <TextInput
          style={styles.input}
          placeholder="Location"
          placeholderTextColor="#94a3b8"
          value={location}
          onChangeText={setLocation}
        />

        <TouchableOpacity style={styles.saveBtn} onPress={onSave} disabled={saving}>
          <Text style={styles.saveText}>{saving ? 'Saving...' : 'Save Card'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#06080C' },
  content: { padding: 16, paddingBottom: 40 },
  title: { color: '#F8FAFC', fontSize: 24, fontWeight: '800' },
  subtitle: { color: 'rgba(248,250,252,0.65)', marginTop: 6, marginBottom: 14 },
  imageButton: {
    height: 46,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#34D399',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  imageButtonText: { color: '#A7F3D0', fontWeight: '700' },
  preview: { width: '100%', height: 180, borderRadius: 14, marginBottom: 12 },
  input: {
    backgroundColor: '#11161F',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    color: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 10,
  },
  saveBtn: {
    marginTop: 6,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#34D399',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveText: { color: '#07241A', fontWeight: '800' },
});
