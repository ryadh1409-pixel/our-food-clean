import { haversineDistanceKm } from '@/lib/haversine';
import { getUserLocation } from '@/services/location';
import { auth, db } from '@/services/firebase';
import { trackOrderCreated } from '@/services/analytics';
import { useRouter } from 'expo-router';
import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { isUserBanned } from '@/services/adminGuard';
import { createAlert } from '@/services/alerts';
import React, { useState } from 'react';
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DEFAULT_SERVICE_FEE } from '@/constants/pricing';
import { theme } from '@/constants/theme';

const MEAL_TYPES = ['Pizza', 'Noodles'] as const;
const MERGE_RADIUS_KM = 0.5; // 500 meters

export default function CreateOrderScreen() {
  const router = useRouter();
  const [restaurantName, setRestaurantName] = useState('');
  const [mealType, setMealType] = useState<'Pizza' | 'Noodles'>('Pizza');
  const [totalPrice, setTotalPrice] = useState('');
  const [sharePrice, setSharePrice] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [mergeSuggestion, setMergeSuggestion] = useState<{
    orderId: string;
    restaurantName: string;
  } | null>(null);
  const [pendingCreate, setPendingCreate] = useState<{
    name: string;
    total: number;
    share: number;
    whatsapp: string;
    userName: string;
    location: { latitude: number; longitude: number } | null;
  } | null>(null);

  const handleTotalPriceChange = (text: string) => {
    setTotalPrice(text);
    const n = Number(text);
    if (!Number.isNaN(n) && n > 0) {
      setSharePrice((n / 2).toFixed(2));
    }
  };

  const handleCreate = async () => {
    const name = restaurantName.trim();
    if (!name) {
      Alert.alert('Error', 'Enter restaurant name.');
      return;
    }
    const total = Number(totalPrice);
    const share = Number(sharePrice);
    if (Number.isNaN(total) || total <= 0) {
      Alert.alert('Error', 'Enter a valid total price.');
      return;
    }
    if (Number.isNaN(share) || share <= 0) {
      Alert.alert('Error', 'Enter a valid sharing price.');
      return;
    }
    if (share > total) {
      Alert.alert('Error', 'Sharing price cannot exceed total price.');
      return;
    }
    const uid = auth.currentUser?.uid;
    if (!uid) {
      Alert.alert('Error', 'You must be signed in to create an order.');
      router.push('/(auth)/login?redirectTo=/order/create');
      return;
    }
    if (await isUserBanned(uid)) {
      Alert.alert(
        'Access denied',
        'Your account has been restricted. You cannot create orders.',
      );
      return;
    }
    const userName =
      auth.currentUser?.displayName?.trim() ||
      auth.currentUser?.email?.split('@')[0] ||
      'User';
    const whatsapp = whatsappNumber.trim().replace(/\D/g, '');
    if (!whatsapp) {
      Alert.alert('Error', 'Enter a WhatsApp number.');
      return;
    }

    setLoading(true);
    setMergeSuggestion(null);
    setPendingCreate(null);
    try {
      const ordersRef = collection(db, 'orders');
      const activeOrdersQuery = query(
        ordersRef,
        where('userId', '==', uid),
        where('status', 'in', ['active', 'waiting', 'matched']),
      );
      const activeSnap = await getDocs(activeOrdersQuery);
      if (!activeSnap.empty) {
        setLoading(false);
        Alert.alert('Error', 'You already have an active order.');
        return;
      }

      let location: { latitude: number; longitude: number } | null = null;
      try {
        location = await getUserLocation();
        const userRef = doc(db, 'users', uid);
        await updateDoc(userRef, {
          location: {
            latitude: location.latitude,
            longitude: location.longitude,
          },
          lastLatitude: location.latitude,
          lastLongitude: location.longitude,
          lastLocationUpdatedAt: serverTimestamp(),
        });
      } catch {
        // continue without location
      }

      const sameRestaurantQuery = query(
        ordersRef,
        where('restaurantName', '==', name),
        where('status', 'in', ['active', 'waiting']),
      );
      const sameRestaurantSnap = await getDocs(sameRestaurantQuery);
      let nearbyOrder: { id: string; restaurantName: string } | null = null;
      if (location && !sameRestaurantSnap.empty) {
        let minDist = MERGE_RADIUS_KM + 1;
        sameRestaurantSnap.docs.forEach((d) => {
          const data = d.data();
          const hostId = data?.hostId ?? data?.creatorId ?? data?.userId;
          if (hostId === uid) return;
          const lat = data?.latitude ?? data?.location?.latitude;
          const lng = data?.longitude ?? data?.location?.longitude;
          if (typeof lat !== 'number' || typeof lng !== 'number') return;
          const dist = haversineDistanceKm(
            location!.latitude,
            location!.longitude,
            lat,
            lng,
          );
          if (dist <= MERGE_RADIUS_KM && dist < minDist) {
            minDist = dist;
            nearbyOrder = {
              id: d.id,
              restaurantName:
                typeof data.restaurantName === 'string'
                  ? data.restaurantName
                  : name,
            };
          }
        });
      }

      if (nearbyOrder) {
        setPendingCreate({
          name,
          total,
          share,
          whatsapp,
          userName,
          location,
        });
        setMergeSuggestion({
          orderId: nearbyOrder.id,
          restaurantName: nearbyOrder.restaurantName,
        });
        setLoading(false);
        return;
      }

      await doCreateOrder(
        uid,
        userName,
        name,
        mealType,
        total,
        share,
        whatsapp,
        location,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to create order';
      Alert.alert('Error', msg);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinTheirOrder = async () => {
    if (!mergeSuggestion || !auth.currentUser) return;
    const uid = auth.currentUser.uid;
    if (await isUserBanned(uid)) {
      Alert.alert(
        'Access denied',
        'Your account has been restricted. You cannot join orders.',
      );
      setMergeSuggestion(null);
      setPendingCreate(null);
      return;
    }
    const displayName =
      auth.currentUser.displayName?.trim() ||
      auth.currentUser.email?.split('@')[0] ||
      'User';
    setLoading(true);
    try {
      const orderRef = doc(db, 'orders', mergeSuggestion.orderId);
      await updateDoc(orderRef, {
        status: 'matched',
        participantIds: arrayUnion(uid),
        user2Id: uid,
        user2Name: displayName,
      });
      const messagesRef = collection(
        db,
        'orders',
        mergeSuggestion.orderId,
        'messages',
      );
      await addDoc(messagesRef, {
        userId: uid,
        userName: displayName,
        text: 'You both want the same restaurant. Start chatting to share the order.',
        createdAt: serverTimestamp(),
        type: 'system',
      });
      await createAlert('order_matched', 'Order matched');
      const { incrementGrowthMatches } =
        await import('@/services/growthMetrics');
      await incrementGrowthMatches();
      setMergeSuggestion(null);
      setPendingCreate(null);
      Keyboard.dismiss();
      router.replace(`/match/${mergeSuggestion.orderId}` as const);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to join');
    } finally {
      setLoading(false);
    }
  };

  const handleKeepMyOrder = async () => {
    if (!pendingCreate || !auth.currentUser) return;
    const uid = auth.currentUser.uid;
    const { name, total, share, whatsapp, userName, location } = pendingCreate;
    setLoading(true);
    setMergeSuggestion(null);
    setPendingCreate(null);
    try {
      await doCreateOrder(
        uid,
        userName,
        name,
        mealType,
        total,
        share,
        whatsapp,
        location,
      );
    } catch (e) {
      Alert.alert(
        'Error',
        e instanceof Error ? e.message : 'Failed to create order',
      );
    } finally {
      setLoading(false);
    }
  };

  async function doCreateOrder(
    uid: string,
    userName: string,
    name: string,
    mealType: 'Pizza' | 'Noodles',
    total: number,
    share: number,
    whatsapp: string,
    location: { latitude: number; longitude: number } | null,
  ) {
    const ordersRef = collection(db, 'orders');
    const nowMs = Date.now();
    const expiresAt = nowMs + 30 * 60 * 1000;
    const orderData = {
      userId: uid,
      creatorId: uid,
      hostId: uid,
      userName,
      restaurantName: name,
      mealType,
      totalPrice: total,
      subtotal: total,
      tax: 0,
      sharePrice: share,
      serviceFee: DEFAULT_SERVICE_FEE,
      whatsappNumber: whatsapp,
      status: 'open',
      createdAt: serverTimestamp(),
      expiresAt,
      timezone: 'America/Toronto',
      participantIds: [uid],
      maxParticipants: 2,
      ...(location && {
        location: {
          latitude: location.latitude,
          longitude: location.longitude,
        },
        latitude: location.latitude,
        longitude: location.longitude,
      }),
    };
    const ref = await addDoc(ordersRef, orderData);
    await createAlert('new_order', 'New order created');
    // Analytics: track order creation event for this user
    await trackOrderCreated(uid, ref.id);
    const { incrementGrowthOrders } = await import('@/services/growthMetrics');
    await incrementGrowthOrders();
    const tenMinAgo = Timestamp.fromMillis(Date.now() - 10 * 60 * 1000);
    const recentQ = query(
      collection(db, 'orders'),
      where('createdAt', '>=', tenMinAgo),
    );
    const recentSnap = await getDocs(recentQ);
    if (recentSnap.size >= 10) {
      await createAlert('high_activity', 'High activity detected');
    }
    const messagesRef = collection(db, 'orders', ref.id, 'messages');
    await addDoc(messagesRef, {
      userId: uid,
      userName,
      text: 'Waiting for another person to join this order',
      createdAt: serverTimestamp(),
      type: 'system',
    });
    Keyboard.dismiss();
    router.replace(`/order/${ref.id}` as const);
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Modal
        visible={mergeSuggestion != null}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (pendingCreate) handleKeepMyOrder();
          else {
            setMergeSuggestion(null);
            setPendingCreate(null);
          }
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              Someone nearby wants the same restaurant.
            </Text>
            <Text style={styles.modalSubtitle}>
              Do you want to share the order?
            </Text>
            {mergeSuggestion ? (
              <Text style={styles.modalRestaurant}>
                {mergeSuggestion.restaurantName}
              </Text>
            ) : null}
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonPrimary]}
                onPress={handleJoinTheirOrder}
                disabled={loading}
              >
                <Text style={styles.modalButtonTextPrimary}>
                  Join their order
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonSecondary]}
                onPress={handleKeepMyOrder}
                disabled={loading}
              >
                <Text style={styles.modalButtonTextSecondary}>
                  Keep my order
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboard}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title}>Create Order</Text>

          <Text style={styles.label}>Restaurant Name</Text>
          <TextInput
            style={styles.input}
            placeholder="Restaurant name"
            placeholderTextColor={theme.colors.textMuted}
            value={restaurantName}
            onChangeText={setRestaurantName}
            editable={!loading}
          />
          <Text style={styles.helper}>
            Enter the restaurant you are ordering from.
          </Text>

          <Text style={styles.label}>Meal Type</Text>
          <View style={styles.mealRow}>
            {MEAL_TYPES.map((type) => (
              <TouchableOpacity
                key={type}
                style={[
                  styles.mealBtn,
                  mealType === type && styles.mealBtnActive,
                ]}
                onPress={() => setMealType(type)}
                disabled={loading}
              >
                <Text
                  style={[
                    styles.mealBtnText,
                    mealType === type && styles.mealBtnTextActive,
                  ]}
                >
                  {type}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.helper}>
            Select the type of food you want to share.
          </Text>

          <Text style={styles.label}>Total Price ($)</Text>
          <TextInput
            style={styles.input}
            placeholder="0.00"
            placeholderTextColor={theme.colors.textMuted}
            value={totalPrice}
            onChangeText={handleTotalPriceChange}
            keyboardType="decimal-pad"
            editable={!loading}
          />
          <Text style={styles.helper}>The full price of the meal.</Text>

          <Text style={styles.label}>Sharing Price ($)</Text>
          <TextInput
            style={styles.input}
            placeholder="0.00"
            placeholderTextColor={theme.colors.textMuted}
            value={sharePrice}
            onChangeText={setSharePrice}
            keyboardType="decimal-pad"
            editable={!loading}
          />
          <Text style={styles.helper}>
            The amount your partner pays when joining the order (usually half of
            the total price). Example: If total price is $20, sharing price can
            be $10.
          </Text>

          <Text style={styles.label}>WhatsApp Number</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 14165551234"
            placeholderTextColor={theme.colors.textMuted}
            value={whatsappNumber}
            onChangeText={setWhatsappNumber}
            keyboardType="phone-pad"
            editable={!loading}
          />
          <Text style={styles.helper}>
            Your WhatsApp number so your partner can contact you after joining.
          </Text>

          <TouchableOpacity
            style={[styles.primaryButton, loading && styles.buttonDisabled]}
            onPress={handleCreate}
            disabled={loading}
          >
            <Text style={styles.primaryButtonText}>
              {loading ? 'Creating...' : 'Create Order'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  keyboard: { flex: 1 },
  scrollContent: {
    padding: theme.spacing.screen,
    paddingBottom: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 8,
  },
  helper: {
    fontSize: 12,
    color: theme.colors.textMuted,
    marginTop: -8,
    marginBottom: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
    marginBottom: 16,
  },
  mealRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  mealBtn: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  mealBtnActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  mealBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
  },
  mealBtnTextActive: {
    color: theme.colors.textOnPrimary,
  },
  primaryButton: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 16,
    borderRadius: theme.radius.button,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryButtonText: {
    color: theme.colors.textOnPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: { opacity: 0.7 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 340,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 15,
    color: theme.colors.textMuted,
    textAlign: 'center',
    marginBottom: 12,
  },
  modalRestaurant: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.primary,
    textAlign: 'center',
    marginBottom: 20,
  },
  modalButtons: {
    gap: 12,
  },
  modalButton: {
    paddingVertical: 14,
    borderRadius: theme.radius.button,
    alignItems: 'center',
  },
  modalButtonPrimary: {
    backgroundColor: theme.colors.primary,
  },
  modalButtonSecondary: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  modalButtonTextPrimary: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.textOnPrimary,
  },
  modalButtonTextSecondary: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
  },
});
