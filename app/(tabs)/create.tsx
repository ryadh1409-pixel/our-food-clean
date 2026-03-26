import { KEYBOARD_TOOLBAR_NATIVE_ID, KeyboardToolbar } from '@/components/KeyboardToolbar';
import { trackOrderCreated } from '@/services/analytics';
import { auth, db } from '@/services/firebase';
import { getUserLocation } from '@/services/location';
import { logError } from '@/utils/errorLogger';
import { useRouter } from 'expo-router';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  Timestamp,
  where,
} from 'firebase/firestore';
import { useRef, useState } from 'react';
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { theme } from '@/constants/theme';

export default function CreateScreen() {
  const c = theme.colors;
  const router = useRouter();
  const maxPeopleRef = useRef<TextInput>(null);
  const totalPriceRef = useRef<TextInput>(null);
  const sharingPriceRef = useRef<TextInput>(null);
  const restaurantRef = useRef<TextInput>(null);
  const restaurantLocationRef = useRef<TextInput>(null);

  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [maxPeople, setMaxPeople] = useState('');
  const [totalPrice, setTotalPrice] = useState('');
  const [sharingPrice, setSharingPrice] = useState('');
  const [loading, setLoading] = useState(false);

  const total = Number(totalPrice) || 0;
  const share = Number(sharingPrice) || 0;
  const splitCount =
    share > 0 && total >= share ? Math.floor(total / share) : 0;
  const pricePerPerson = share > 0 ? share : 0;
  const [foodType, setFoodType] = useState('pizza');
  const [restaurantName, setRestaurantName] = useState('');
  const [restaurantLocation, setRestaurantLocation] = useState('');
  const [orderTime, setOrderTime] = useState('Now');

  const inputRefs = [
    maxPeopleRef,
    totalPriceRef,
    sharingPriceRef,
    restaurantRef,
    restaurantLocationRef,
  ];

  const handleAccessoryDone = () => {
    Keyboard.dismiss();
    setFocusedIndex(null);
  };

  const handleAccessoryNext = () => {
    if (focusedIndex !== null && focusedIndex < inputRefs.length - 1) {
      const nextRef = inputRefs[focusedIndex + 1];
      nextRef.current?.focus();
    }
  };

  const handleAccessoryPrev = () => {
    if (focusedIndex !== null && focusedIndex > 0) {
      const prevRef = inputRefs[focusedIndex - 1];
      prevRef.current?.focus();
    }
  };

  const handleCreate = async () => {
    const num = Number(maxPeople);
    if (Number.isNaN(num) || num < 1) {
      Alert.alert('Error', 'Enter a valid max people');
      return;
    }
    const price = Number(totalPrice);
    const share = Number(sharingPrice);
    if (Number.isNaN(price) || price < 0 || Number.isNaN(share) || share <= 0) {
      Alert.alert('Error', 'Enter valid total price and sharing price');
      return;
    }
    if (price < share) {
      Alert.alert('Error', 'Total price must be at least the sharing price');
      return;
    }
    const uid = auth.currentUser?.uid;
    if (!uid) {
      Alert.alert('Error', 'You must be signed in to create an order.');
      return;
    }
    try {
      setLoading(true);
      const ordersRef = collection(db, 'orders');

      const activeQ = query(
        ordersRef,
        where('hostId', '==', uid),
        where('status', '==', 'open'),
      );
      const activeSnap = await getDocs(activeQ);
      if (!activeSnap.empty) {
        setLoading(false);
        Alert.alert('You already have an active order.');
        return;
      }

      const existingQ = query(
        ordersRef,
        where('hostId', '==', uid),
        where('status', '==', 'open'),
      );
      const existingSnap = await getDocs(existingQ);
      if (!existingSnap.empty) {
        const existingId = existingSnap.docs[0].id;
        Keyboard.dismiss();
        router.push(`/order/${existingId}` as const);
        return;
      }

      const now = new Date();
      const offsetMinutes: Record<string, number> = {
        Now: 0,
        '15 min': 15,
        '30 min': 30,
        '1 hour': 60,
      };
      const mins = offsetMinutes[orderTime] ?? 0;
      const orderAt = new Date(now.getTime() + mins * 60 * 1000);

      let location: { latitude: number; longitude: number } | null = null;
      try {
        location = await getUserLocation();
      } catch {
        // Map/location optional: create order without coordinates; it won't appear in nearby list
      }

      const nowMs = Date.now();
      const expiresAt = nowMs + 30 * 60 * 1000;

      const orderData = {
        hostId: uid,
        createdBy: uid,
        participantIds: [uid],
        status: 'open',
        createdAt: serverTimestamp(),
        expiresAt,
        maxPeople: num,
        totalPrice: price,
        sharingPrice: Math.round(share * 100) / 100,
        pricePerPerson: Math.round(share * 100) / 100,
        foodType,
        restaurantName: restaurantName.trim() || 'Not specified',
        restaurantLocation: restaurantLocation.trim() || '',
        orderTime,
        orderAt: Timestamp.fromDate(orderAt),
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
      const { createAlert } = await import('@/services/alerts');
      await createAlert('new_order', 'New order created');
      const { incrementGrowthOrders } =
        await import('@/services/growthMetrics');
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

      const orderSnap = await getDoc(doc(db, 'orders', ref.id));
      const fromFirestore = orderSnap.exists() ? orderSnap.data() : null;
      console.log('ORDER FROM FIRESTORE:', fromFirestore);

      // Analytics: track order creation event for this user
      await trackOrderCreated(uid, ref.id);

      Keyboard.dismiss();
      router.push(`/order/${ref.id}` as const);
    } catch (error) {
      logError(error, { alert: false });
      Alert.alert(
        'Error',
        error instanceof Error ? error.message : 'Failed to create order',
      );
    } finally {
      setLoading(false);
    }
  };

  const isNative = Platform.OS === 'ios' || Platform.OS === 'android';

  const keyboardToolbar =
    Platform.OS === 'ios' ? (
      <KeyboardToolbar
        onFocusPrevious={handleAccessoryPrev}
        onFocusNext={handleAccessoryNext}
        focusedIndex={focusedIndex}
        totalInputs={inputRefs.length}
      />
    ) : null;

  const formLabel = {
    fontSize: 16,
    fontWeight: '600' as const,
    color: c.textSlateDark,
    marginBottom: 8,
  };
  const formInput = {
    borderWidth: 1,
    borderColor: c.borderStrong,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    color: c.text,
    fontSize: 16,
  };
  const formHelper = { fontSize: 13, color: c.textMuted, marginBottom: 16 };

  const content = (
    <View
      style={{
        flex: 1,
        justifyContent: 'center',
        padding: 24,
        backgroundColor: c.background,
      }}
    >
      <Text
        style={{
          fontSize: 22,
          fontWeight: '600',
          marginBottom: 16,
          color: c.text,
        }}
      >
        Create Order
      </Text>

      <Text style={formLabel}>Max people</Text>
      <TextInput
        ref={maxPeopleRef}
        placeholder="e.g. 3"
        value={maxPeople}
        onChangeText={setMaxPeople}
        keyboardType="numeric"
        inputAccessoryViewID={
          Platform.OS === 'ios' ? KEYBOARD_TOOLBAR_NATIVE_ID : undefined
        }
        onFocus={() => setFocusedIndex(0)}
        style={formInput}
        placeholderTextColor={c.iconInactive}
      />

      <Text style={formLabel}>Total price</Text>
      <TextInput
        ref={totalPriceRef}
        placeholder="Total price ($)"
        value={totalPrice}
        onChangeText={setTotalPrice}
        keyboardType="numeric"
        inputAccessoryViewID={
          Platform.OS === 'ios' ? KEYBOARD_TOOLBAR_NATIVE_ID : undefined
        }
        onFocus={() => setFocusedIndex(1)}
        style={formInput}
        placeholderTextColor={c.iconInactive}
      />

      <Text style={formLabel}>Sharing price</Text>
      <TextInput
        ref={sharingPriceRef}
        placeholder="Sharing price ($)"
        value={sharingPrice}
        onChangeText={setSharingPrice}
        keyboardType="numeric"
        inputAccessoryViewID={
          Platform.OS === 'ios' ? KEYBOARD_TOOLBAR_NATIVE_ID : undefined
        }
        onFocus={() => setFocusedIndex(2)}
        style={formInput}
        placeholderTextColor={c.iconInactive}
      />

      {pricePerPerson > 0 && splitCount > 0 ? (
        <Text style={formHelper}>
          ${pricePerPerson.toFixed(2)} per person ({splitCount} people)
        </Text>
      ) : null}

      <Text style={formLabel}>Food Type</Text>
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
        <TouchableOpacity
          onPress={() => setFoodType('pizza')}
          style={{
            backgroundColor: foodType === 'pizza' ? c.primary : c.surface,
            paddingVertical: 10,
            paddingHorizontal: 14,
            borderRadius: 8,
          }}
        >
          <Text
            style={{
              color:
                foodType === 'pizza' ? c.textOnPrimary : c.text,
              fontWeight: '600',
            }}
          >
            pizza
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setFoodType('noodles')}
          style={{
            backgroundColor: foodType === 'noodles' ? c.primary : c.surface,
            paddingVertical: 10,
            paddingHorizontal: 14,
            borderRadius: 8,
          }}
        >
          <Text
            style={{
              color:
                foodType === 'noodles' ? c.textOnPrimary : c.text,
              fontWeight: '600',
            }}
          >
            noodles
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={formLabel}>Restaurant name</Text>
      <TextInput
        ref={restaurantRef}
        placeholder="Enter the restaurant you are ordering from"
        value={restaurantName}
        onChangeText={setRestaurantName}
        inputAccessoryViewID={
          Platform.OS === 'ios' ? KEYBOARD_TOOLBAR_NATIVE_ID : undefined
        }
        onFocus={() => setFocusedIndex(3)}
        style={formInput}
        placeholderTextColor={c.iconInactive}
      />

      <Text style={formLabel}>Restaurant location</Text>
      <TextInput
        ref={restaurantLocationRef}
        placeholder="Address or area"
        value={restaurantLocation}
        onChangeText={setRestaurantLocation}
        inputAccessoryViewID={
          Platform.OS === 'ios' ? KEYBOARD_TOOLBAR_NATIVE_ID : undefined
        }
        onFocus={() => setFocusedIndex(4)}
        style={formInput}
        placeholderTextColor={c.iconInactive}
      />

      <Text style={formLabel}>Order in</Text>
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 8,
          marginBottom: 16,
        }}
      >
        {['Now', '15 min', '30 min', '1 hour'].map((opt) => (
          <TouchableOpacity
            key={opt}
            onPress={() => setOrderTime(opt)}
            style={{
              backgroundColor: orderTime === opt ? c.primary : c.surface,
              paddingVertical: 8,
              paddingHorizontal: 12,
              borderRadius: 8,
            }}
          >
            <Text
              style={{
                color:
                  orderTime === opt ? c.textOnPrimary : c.text,
                fontWeight: '600',
                fontSize: 14,
              }}
            >
              {opt}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        onPress={handleCreate}
        style={{
          backgroundColor: c.primary,
          padding: 14,
          borderRadius: 10,
          alignItems: 'center',
          opacity: loading ? 0.7 : 1,
        }}
        disabled={loading}
      >
        <Text style={{ color: c.textOnPrimary, fontWeight: '600' }}>
          {loading ? 'Creating...' : 'Create Order'}
        </Text>
      </TouchableOpacity>
    </View>
  );

  const inner = isNative ? (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      {content}
    </TouchableWithoutFeedback>
  ) : (
    content
  );

  return (
    <>
      {keyboardToolbar}
      {isNative ? (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          {inner}
        </KeyboardAvoidingView>
      ) : (
        <View style={{ flex: 1 }}>{inner}</View>
      )}
    </>
  );
}
