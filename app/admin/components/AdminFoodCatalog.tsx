/**
 * Home menu templates: list (scrolls with parent) + fixed FAB + form modal.
 */
import { adminCardShell, adminColors as COLORS } from '@/constants/adminTheme';
import { useAuth } from '@/services/AuthContext';
import {
  addTemplate,
  deleteTemplate,
  subscribeTemplates,
  updateTemplate,
} from '@/services/adminService';
import { FOOD_TEMPLATES_MAX } from '@/services/foodTemplates';
import { pickAndUploadImage } from '@/services/uploadImage';
import type { FoodTemplate, FoodTemplateWrite } from '@/types/food';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { systemConfirm } from '@/components/SystemDialogHost';
import { getUserFriendlyError } from '@/utils/errorHandler';
import { showError, showSuccess } from '@/utils/toast';

function parsePrice(raw: string): number | null {
  const n = Number(String(raw).replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

type CatalogContextValue = {
  list: FoodTemplate[];
  loading: boolean;
  error: string | null;
  openCreate: () => void;
  openEdit: (row: FoodTemplate) => void;
};

const CatalogContext = createContext<CatalogContextValue | null>(null);

export function AdminFoodCatalogProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const [list, setList] = useState<FoodTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [priceStr, setPriceStr] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!enabled || !user) {
      setLoading(false);
      setList([]);
      return;
    }
    setLoading(true);
    const unsub = subscribeTemplates(
      (rows) => {
        setList(rows);
        setError(null);
        setLoading(false);
      },
      (e) => {
        setError(e.message);
        setLoading(false);
      },
    );
    return () => unsub();
  }, [enabled, user]);

  const resetForm = useCallback(() => {
    setEditingId(null);
    setName('');
    setDescription('');
    setPriceStr('');
    setImageUrl('');
    setActive(true);
  }, []);

  const openCreate = useCallback(() => {
    resetForm();
    setModalOpen(true);
  }, [resetForm]);

  const openEdit = useCallback((row: FoodTemplate) => {
    setEditingId(row.id);
    setName(row.name);
    setDescription(row.description);
    setPriceStr(String(row.price));
    setImageUrl(row.imageUrl);
    setActive(row.active);
    setModalOpen(true);
  }, []);

  const onPickImage = async () => {
    const uid = user?.uid;
    if (!uid) return;
    setUploading(true);
    try {
      const { url, error: uploadErr } = await pickAndUploadImage({
        uid,
        folder: 'foodTemplates',
        quality: 0.85,
      });
      if (uploadErr) showError(uploadErr);
      if (url) setImageUrl(url);
    } finally {
      setUploading(false);
    }
  };

  const onSave = async () => {
    const price = parsePrice(priceStr);
    if (!name.trim()) {
      showError('Enter a name.');
      return;
    }
    if (!description.trim()) {
      showError('Enter a description.');
      return;
    }
    if (price === null) {
      showError('Enter a valid price.');
      return;
    }
    if (!imageUrl.trim()) {
      showError('Upload an image.');
      return;
    }

    const payload: FoodTemplateWrite = {
      name: name.trim(),
      description: description.trim(),
      price,
      imageUrl: imageUrl.trim(),
      active,
    };

    setSaving(true);
    try {
      if (editingId) {
        await updateTemplate(editingId, payload);
        setModalOpen(false);
        resetForm();
        showSuccess('Template updated.');
      } else {
        if (list.length >= FOOD_TEMPLATES_MAX) {
          showError(
            `Maximum ${FOOD_TEMPLATES_MAX} templates. Delete one to add another.`,
          );
          return;
        }
        await addTemplate(payload);
        setModalOpen(false);
        resetForm();
        showSuccess('Template added.');
      }
    } catch (e) {
      showError(getUserFriendlyError(e));
    } finally {
      setSaving(false);
    }
  };

  const ctx = useMemo<CatalogContextValue>(
    () => ({
      list,
      loading,
      error,
      openCreate,
      openEdit,
    }),
    [list, loading, error, openCreate, openEdit],
  );

  if (!enabled) {
    return <>{children}</>;
  }

  return (
    <CatalogContext.Provider value={ctx}>
      {children}
      <Modal
        visible={modalOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          setModalOpen(false);
          resetForm();
        }}
      >
        <View style={modalStyles.sheet}>
          <View style={modalStyles.sheetHeader}>
            <Text style={modalStyles.sheetTitle}>
              {editingId ? 'Edit card' : 'New card'}
            </Text>
            <TouchableOpacity
              onPress={() => {
                setModalOpen(false);
                resetForm();
              }}
              hitSlop={12}
            >
              <Text style={modalStyles.close}>Close</Text>
            </TouchableOpacity>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={modalStyles.sheetBody}
          >
            <TouchableOpacity
              style={modalStyles.uploadBtn}
              onPress={onPickImage}
              disabled={uploading}
            >
              {uploading ? (
                <ActivityIndicator color="#07241A" />
              ) : (
                <Text style={modalStyles.uploadBtnText}>
                  {imageUrl ? 'Change image' : 'Pick image'}
                </Text>
              )}
            </TouchableOpacity>
            {imageUrl ? (
              <Image
                source={{ uri: imageUrl }}
                style={modalStyles.preview}
              />
            ) : null}
            <TextInput
              style={modalStyles.input}
              placeholder="Name"
              placeholderTextColor={COLORS.textMuted}
              value={name}
              onChangeText={setName}
            />
            <TextInput
              style={[modalStyles.input, modalStyles.inputMulti]}
              placeholder="Description"
              placeholderTextColor={COLORS.textMuted}
              value={description}
              onChangeText={setDescription}
              multiline
            />
            <TextInput
              style={modalStyles.input}
              placeholder="Price"
              placeholderTextColor={COLORS.textMuted}
              value={priceStr}
              onChangeText={setPriceStr}
              keyboardType="decimal-pad"
            />
            <View style={modalStyles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={modalStyles.switchLabel}>Visible on Home</Text>
                <Text style={modalStyles.switchHint}>
                  Off hides this item from the menu strip (still counts toward
                  max {FOOD_TEMPLATES_MAX}).
                </Text>
              </View>
              <Switch value={active} onValueChange={setActive} />
            </View>
            <TouchableOpacity
              style={modalStyles.saveBtn}
              onPress={onSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#07241A" />
              ) : (
                <Text style={modalStyles.saveText}>
                  {editingId ? 'Save changes' : 'Create template'}
                </Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </CatalogContext.Provider>
  );
}

function confirmDeleteTemplate(row: FoodTemplate) {
  void (async () => {
    const ok = await systemConfirm({
      title: 'Delete',
      message: `Remove “${row.name}”?`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteTemplate(row.id);
      showSuccess('Template removed.');
    } catch (e) {
      showError(getUserFriendlyError(e));
    }
  })();
}

export function AdminFoodCatalogList() {
  const ctx = useContext(CatalogContext);
  if (!ctx) return null;
  const { list, loading, error, openEdit } = ctx;

  if (error) {
    return (
      <View style={styles.errorBanner}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator color={COLORS.primary} />
        <Text style={styles.loaderCap}>Loading catalog…</Text>
      </View>
    );
  }

  if (list.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.emptyTitle}>No menu cards yet</Text>
        <Text style={styles.emptySub}>
          Tap the + button to add your first item (max {FOOD_TEMPLATES_MAX}).
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.listWrap}>
      {list.map((row) => (
        <View key={row.id} style={[adminCardShell, styles.card]}>
          {row.imageUrl ? (
            <Image source={{ uri: row.imageUrl }} style={styles.cardImage} />
          ) : (
            <View style={[styles.cardImage, styles.cardImagePh]} />
          )}
          {!row.active ? (
            <View style={styles.hiddenPill}>
              <Text style={styles.hiddenPillText}>Hidden</Text>
            </View>
          ) : null}
          <View style={styles.cardBody}>
            <Text style={styles.cardName}>{row.name}</Text>
            <Text style={styles.cardPrice}>${row.price.toFixed(2)}</Text>
            {row.description ? (
              <Text style={styles.cardDesc} numberOfLines={3}>
                {row.description}
              </Text>
            ) : null}
            <View style={styles.cardActions}>
              <TouchableOpacity
                style={styles.btnEdit}
                onPress={() => openEdit(row)}
              >
                <Text style={styles.btnEditText}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.btnDel}
                onPress={() => confirmDeleteTemplate(row)}
              >
                <Text style={styles.btnDelText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

export function AdminFoodCatalogFab() {
  const ctx = useContext(CatalogContext);
  if (!ctx) return null;
  const { list, openCreate } = ctx;
  const atCap = list.length >= FOOD_TEMPLATES_MAX;

  return (
    <View style={fabStyles.wrap} pointerEvents="box-none">
      <TouchableOpacity
        style={[fabStyles.fab, atCap && fabStyles.fabMuted]}
        onPress={() => {
          if (atCap) {
            showError(
              `You already have ${FOOD_TEMPLATES_MAX} templates. Delete one to add another.`,
            );
            return;
          }
          openCreate();
        }}
        activeOpacity={0.9}
      >
        <Text style={fabStyles.fabPlus}>＋</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  listWrap: { gap: 14, marginTop: 8 },
  card: { overflow: 'hidden', padding: 0, marginBottom: 0 },
  cardImage: {
    width: '100%',
    height: 160,
    backgroundColor: '#11161F',
  },
  cardImagePh: { minHeight: 160 },
  hiddenPill: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  hiddenPillText: { color: '#FDE68A', fontWeight: '800', fontSize: 11 },
  cardBody: { padding: 14 },
  cardName: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '800',
  },
  cardPrice: {
    color: '#34D399',
    fontSize: 20,
    fontWeight: '800',
    marginTop: 6,
  },
  cardDesc: {
    color: COLORS.textMuted,
    fontSize: 13,
    marginTop: 8,
    lineHeight: 18,
  },
  cardActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  btnEdit: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: 'rgba(52, 211, 153, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.45)',
  },
  btnEditText: { color: '#A7F3D0', fontWeight: '800' },
  btnDel: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.45)',
  },
  btnDelText: { color: '#FCA5A5', fontWeight: '800' },
  loader: { paddingVertical: 24, alignItems: 'center' },
  loaderCap: { marginTop: 8, color: COLORS.textMuted, fontWeight: '600' },
  emptyWrap: {
    paddingVertical: 20,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  emptyTitle: { color: COLORS.text, fontWeight: '800', fontSize: 16 },
  emptySub: {
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  errorBanner: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: COLORS.dangerBg,
    marginTop: 8,
  },
  errorText: { color: COLORS.error, fontWeight: '600' },
});

const fabStyles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    paddingBottom: 24,
    paddingRight: 20,
  },
  fab: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#34D399',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
  },
  fabMuted: { opacity: 0.5 },
  fabPlus: {
    color: '#07241A',
    fontSize: 28,
    fontWeight: '300',
    marginTop: -2,
  },
});

const modalStyles = StyleSheet.create({
  sheet: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingTop: 8,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  sheetTitle: { color: COLORS.text, fontSize: 20, fontWeight: '800' },
  close: { color: COLORS.primary, fontWeight: '700', fontSize: 16 },
  sheetBody: { padding: 18, paddingBottom: 40 },
  uploadBtn: {
    backgroundColor: '#34D399',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  uploadBtnText: { color: '#07241A', fontWeight: '800' },
  preview: {
    width: '100%',
    height: 180,
    borderRadius: 14,
    marginBottom: 14,
    backgroundColor: '#111',
  },
  input: {
    backgroundColor: '#11161F',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    color: COLORS.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
    fontSize: 16,
  },
  inputMulti: { minHeight: 88, textAlignVertical: 'top' },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
    marginTop: 4,
  },
  switchLabel: { color: COLORS.text, fontWeight: '700' },
  switchHint: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 4,
    lineHeight: 16,
  },
  saveBtn: {
    backgroundColor: '#34D399',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveText: { color: '#07241A', fontWeight: '800', fontSize: 16 },
});
