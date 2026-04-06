import {
  adminCardShell,
  adminColors as COLORS,
} from '@/constants/adminTheme';
import {
  ADMIN_FOOD_CARD_SLOT_COUNT,
  type AdminFoodCardSlotId,
} from '@/constants/adminFoodCards';
import { auth, storage } from '@/services/firebase';
import { generateFoodCardAiDescription } from '@/services/foodCardAiDescription';
import {
  saveAdminFoodCardSlot,
  subscribeAdminFoodCardSlots,
  type AdminFoodCardSlot,
} from '@/services/adminFoodCardSlots';
import * as ImagePicker from 'expo-image-picker';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { getUserFriendlyError } from '@/utils/errorHandler';
import { showError, showNotice, showSuccess } from '@/utils/toast';

type Draft = {
  title: string;
  image: string;
  price: string;
  sharingPrice: string;
  venueLocation: string;
  active: boolean;
  aiDescription: string;
  restaurantName: string;
};

function emptyDraft(): Draft {
  return {
    title: '',
    image: '',
    price: '',
    sharingPrice: '',
    venueLocation: '',
    active: false,
    aiDescription: '',
    restaurantName: 'HalfOrder',
  };
}

export function AdminCardsDashboard() {
  const [remote, setRemote] = useState<AdminFoodCardSlot[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [aiBusyId, setAiBusyId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribeAdminFoodCardSlots((rows) => {
      setRemote(rows);
      setDrafts((prev) => {
        const next = { ...prev };
        rows.forEach((r) => {
          if (!next[r.docId]) {
            next[r.docId] = {
              title: r.title,
              image: r.image,
              price: r.price > 0 ? String(r.price) : '',
              sharingPrice:
                r.sharingPrice > 0 ? String(r.sharingPrice) : '',
              venueLocation: r.venueLocation,
              active: r.active,
              aiDescription: r.aiDescription,
              restaurantName: r.restaurantName,
            };
          }
        });
        return next;
      });
    });
    return unsub;
  }, []);

  const ensureDraft = (docId: string): Draft =>
    drafts[docId] ?? emptyDraft();

  const setField = (
    docId: AdminFoodCardSlotId,
    patch: Partial<Draft>,
  ) => {
    setDrafts((prev) => ({
      ...prev,
      [docId]: { ...ensureDraft(docId), ...patch },
    }));
  };

  const syncDraftFromRemote = (r: AdminFoodCardSlot) => {
    setDrafts((prev) => ({
      ...prev,
      [r.docId]: {
        title: r.title,
        image: r.image,
        price: r.price > 0 ? String(r.price) : '',
        sharingPrice:
          r.sharingPrice > 0 ? String(r.sharingPrice) : '',
        venueLocation: r.venueLocation,
        active: r.active,
        aiDescription: r.aiDescription,
        restaurantName: r.restaurantName,
      },
    }));
  };

  const pickImage = async (docId: AdminFoodCardSlotId) => {
    const p = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!p.granted) {
      showError('Allow photo library access to upload.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.82,
    });
    if (result.canceled || !result.assets[0]?.uri) return;
    try {
      setUploadingId(docId);
      const uri = result.assets[0].uri;
      const blob = await (await fetch(uri)).blob();
      const path = `foodCardSlots/${docId}/${Date.now()}.jpg`;
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, blob);
      const url = await getDownloadURL(storageRef);
      setField(docId, { image: url });
    } catch (e) {
      showError(getUserFriendlyError(e));
    } finally {
      setUploadingId(null);
    }
  };

  const onSave = async (slot: AdminFoodCardSlot) => {
    const docId = slot.docId;
    const d = ensureDraft(docId);
    const priceNum = Number(d.price);
    const sharingNum = Number(d.sharingPrice);
    if (!d.title.trim() || !d.image.trim()) {
      showError('Title and image are required to save.');
      return;
    }
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      showError('Enter a valid total price.');
      return;
    }
    if (!Number.isFinite(sharingNum) || sharingNum <= 0) {
      showError('Enter a valid price per person (sharing).');
      return;
    }
    setSavingId(docId);
    try {
      await saveAdminFoodCardSlot(docId, {
        id: slot.id,
        title: d.title,
        image: d.image,
        price: priceNum,
        sharingPrice: sharingNum,
        venueLocation: d.venueLocation,
        active: d.active,
        aiDescription: d.aiDescription,
        restaurantName: d.restaurantName,
      });
      showSuccess(`Card ${docId} updated.`);
    } catch (e) {
      showError(getUserFriendlyError(e));
    } finally {
      setSavingId(null);
    }
  };

  const onGenerateAi = (slot: AdminFoodCardSlot) => {
    const docId = slot.docId;
    const d = ensureDraft(docId);
    void (async () => {
      setAiBusyId(docId);
      try {
        const gen = await generateFoodCardAiDescription({
          title: d.title.trim() || slot.title || 'Dish',
          restaurantName:
            d.restaurantName.trim() || slot.restaurantName || 'Restaurant',
        });
        if (gen) setField(docId, { aiDescription: gen });
        else {
          showNotice(
            'OpenAI',
            'Configure EXPO_PUBLIC_OPENAI_API_KEY or type a description manually.',
          );
        }
      } finally {
        setAiBusyId(null);
      }
    })();
  };

  if (!remote) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading catalog slots…</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.headTitle}>Food cards (fixed {ADMIN_FOOD_CARD_SLOT_COUNT} slots)</Text>
      <Text style={styles.headSub}>
        Only active slots appear in the app. Each slot uses document id 1–10. New
        joins reuse the same card.
      </Text>
      {remote.map((slot) => {
        const docId = slot.docId;
        const d = ensureDraft(docId);
        return (
          <View key={docId} style={styles.slotCard}>
            <View style={styles.slotHeader}>
              <Text style={styles.slotTitle}>Card {docId}</Text>
              <View style={styles.activeRow}>
                <Text style={styles.activeLabel}>Active</Text>
                <Switch
                  value={d.active}
                  onValueChange={(v) => setField(docId, { active: v })}
                  trackColor={{
                    false: 'rgba(255,255,255,0.15)',
                    true: 'rgba(52,211,153,0.55)',
                  }}
                  thumbColor={d.active ? '#34D399' : '#64748B'}
                />
              </View>
            </View>
            <TouchableOpacity
              style={styles.uploadBtn}
              onPress={() => pickImage(docId)}
              disabled={uploadingId === docId}
            >
              <Text style={styles.uploadBtnText}>
                {uploadingId === docId ? 'Uploading…' : 'Upload image'}
              </Text>
            </TouchableOpacity>
            {d.image ? (
              <Image source={{ uri: d.image }} style={styles.preview} />
            ) : null}
            <TextInput
              style={styles.input}
              placeholder="Title"
              placeholderTextColor={COLORS.textMuted}
              value={d.title}
              onChangeText={(t) => setField(docId, { title: t })}
            />
            <TextInput
              style={styles.input}
              placeholder="Restaurant / venue label"
              placeholderTextColor={COLORS.textMuted}
              value={d.restaurantName}
              onChangeText={(t) => setField(docId, { restaurantName: t })}
            />
            <TextInput
              style={styles.input}
              placeholder="Total price (USD)"
              placeholderTextColor={COLORS.textMuted}
              value={d.price}
              onChangeText={(t) => setField(docId, { price: t })}
              keyboardType="decimal-pad"
            />
            <TextInput
              style={styles.input}
              placeholder="Price per person (Sharing)"
              placeholderTextColor={COLORS.textMuted}
              value={d.sharingPrice}
              onChangeText={(t) => setField(docId, { sharingPrice: t })}
              keyboardType="decimal-pad"
            />
            <TextInput
              style={styles.input}
              placeholder="Location"
              placeholderTextColor={COLORS.textMuted}
              value={d.venueLocation}
              onChangeText={(t) => setField(docId, { venueLocation: t })}
            />
            <TextInput
              style={[styles.input, styles.multiline]}
              placeholder="AI description (optional)"
              placeholderTextColor={COLORS.textMuted}
              value={d.aiDescription}
              onChangeText={(t) => setField(docId, { aiDescription: t })}
              multiline
            />
            <TouchableOpacity
              style={[styles.secondaryBtn, aiBusyId === docId && styles.btnDisabled]}
              disabled={aiBusyId === docId}
              onPress={() => onGenerateAi(slot)}
            >
              <Text style={styles.secondaryBtnText}>
                {aiBusyId === docId ? 'Generating…' : 'Generate AI description'}
              </Text>
            </TouchableOpacity>
            <View style={styles.actions}>
              <TouchableOpacity
                style={styles.ghostBtn}
                onPress={() => syncDraftFromRemote(slot)}
              >
                <Text style={styles.ghostBtnText}>Reset</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, savingId === docId && styles.btnDisabled]}
                disabled={savingId === docId}
                onPress={() => onSave(slot)}
              >
                {savingId === docId ? (
                  <ActivityIndicator color="#07241A" />
                ) : (
                  <Text style={styles.saveBtnText}>Save slot</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        );
      })}
      <Text style={styles.footerId}>Signed in: {auth.currentUser?.uid ?? '—'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingBottom: 8 },
  center: { padding: 24, alignItems: 'center' },
  loadingText: { marginTop: 10, color: COLORS.textMuted },
  headTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 8,
  },
  headSub: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginBottom: 16,
    lineHeight: 18,
  },
  slotCard: {
    ...adminCardShell,
    marginBottom: 16,
    padding: 14,
  },
  slotHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  slotTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  activeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  activeLabel: { color: COLORS.textMuted, fontSize: 13, fontWeight: '600' },
  uploadBtn: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(52,211,153,0.5)',
    paddingVertical: 10,
    alignItems: 'center',
    marginBottom: 10,
  },
  uploadBtnText: { color: '#6EE7B7', fontWeight: '700' },
  preview: {
    width: '100%',
    height: 160,
    borderRadius: 12,
    marginBottom: 10,
  },
  input: {
    backgroundColor: '#11161F',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    color: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginBottom: 10,
  },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  secondaryBtn: {
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(99,102,241,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(129,140,248,0.4)',
    alignItems: 'center',
    marginBottom: 12,
  },
  secondaryBtnText: { color: '#C7D2FE', fontWeight: '700' },
  btnDisabled: { opacity: 0.55 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  ghostBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
  },
  ghostBtnText: { color: COLORS.textMuted, fontWeight: '700' },
  saveBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#34D399',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: { color: '#07241A', fontWeight: '800' },
  footerId: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 8,
  },
});
