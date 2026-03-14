import { DEFAULT_CAMPUSES } from '@/constants/campuses';
import { useAuth } from '@/services/AuthContext';
import { db } from '@/services/firebase';
import { useRouter } from 'expo-router';
import { addDoc, collection, onSnapshot } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const ADMIN_EMAIL = 'support@halforder.app';

const COLORS = {
  background: '#F5F5F5',
  card: '#FFFFFF',
  text: '#000000',
  textMuted: '#666666',
  primary: '#FFD700',
  border: '#E5E5E5',
  error: '#B91C1C',
} as const;

type CampusDoc = { id: string; name: string; order?: number };

export default function AdminCampusesScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [campuses, setCampuses] = useState<CampusDoc[]>([]);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(true);

  const isAdmin = user?.email === ADMIN_EMAIL;

  useEffect(() => {
    if (!isAdmin) return;
    const unsub = onSnapshot(
      collection(db, 'campuses'),
      (snap) => {
        const list = snap.docs.map((d) => ({
          id: d.id,
          name: d.data()?.name ?? '',
          order: d.data()?.order,
        }));
        list.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
        setCampuses(list);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return () => unsub();
  }, [isAdmin]);

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) {
      Alert.alert('Error', 'Enter a campus name.');
      return;
    }
    if (!isAdmin) return;
    setAdding(true);
    try {
      await addDoc(collection(db, 'campuses'), {
        name,
        order: campuses.length,
      });
      setNewName('');
    } catch (e) {
      Alert.alert(
        'Error',
        e instanceof Error ? e.message : 'Failed to add campus',
      );
    } finally {
      setAdding(false);
    }
  };

  if (!user || !isAdmin) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centered}>
          <Text style={styles.unauthorized}>You are not authorized</Text>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backBtn}
          >
            <Text style={styles.backBtnText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const allNames = [
    ...new Set([...DEFAULT_CAMPUSES, ...campuses.map((c) => c.name)]),
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Campuses</Text>
      </View>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.help}>
          Default campuses (University of Toronto, TMU, York, Other) are always
          shown. Add more below; they will appear in sign-up and profile.
        </Text>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>All campuses</Text>
          {loading ? (
            <ActivityIndicator
              size="small"
              color={COLORS.primary}
              style={{ marginVertical: 16 }}
            />
          ) : (
            allNames.map((name) => (
              <View key={name} style={styles.row}>
                <Text style={styles.campusName}>{name}</Text>
                {DEFAULT_CAMPUSES.includes(
                  name as (typeof DEFAULT_CAMPUSES)[number],
                ) ? (
                  <Text style={styles.badge}>Default</Text>
                ) : null}
              </View>
            ))
          )}
        </View>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Add campus</Text>
          <TextInput
            value={newName}
            onChangeText={setNewName}
            placeholder="Campus name"
            placeholderTextColor={COLORS.textMuted}
            style={styles.input}
            editable={!adding}
          />
          <TouchableOpacity
            style={[styles.button, adding && styles.buttonDisabled]}
            onPress={handleAdd}
            disabled={adding || !newName.trim()}
          >
            {adding ? (
              <ActivityIndicator size="small" color="#000" />
            ) : (
              <Text style={styles.buttonText}>Add</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  unauthorized: {
    fontSize: 16,
    color: COLORS.error,
    marginBottom: 16,
    textAlign: 'center',
  },
  backBtn: { paddingVertical: 10, paddingHorizontal: 20 },
  backBtnText: { fontSize: 16, color: COLORS.primary, fontWeight: '600' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backText: {
    fontSize: 16,
    color: COLORS.primary,
    fontWeight: '600',
    marginRight: 12,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  scroll: { padding: 20, paddingBottom: 40 },
  help: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginBottom: 20,
    lineHeight: 20,
  },
  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: COLORS.card,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  campusName: { fontSize: 15, color: COLORS.text, flex: 1 },
  badge: {
    fontSize: 11,
    color: COLORS.textMuted,
    backgroundColor: COLORS.border,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: COLORS.text,
    backgroundColor: COLORS.card,
    marginBottom: 12,
  },
  button: {
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: COLORS.text, fontWeight: '600', fontSize: 16 },
});
