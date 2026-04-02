import ContactButtons from '@/components/ContactButtons';
import MatchCheckoutMap, { type MapPoint } from '@/components/MatchCheckoutMap';
import PaymentOption, { type PaymentChoice } from '@/components/PaymentOption';
import { createAlert } from '@/services/alerts';
import { auth, db } from '@/services/firebase';
import { getUserLocation } from '@/services/location';
import { haversineDistanceKm } from '@/lib/haversine';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '@/constants/theme';

const c = theme.colors;

type MeetingOption = 'meet_now' | 'meet_at_restaurant' | 'schedule';

export default function MatchCheckoutScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ orderId?: string }>();
  const orderId = (params.orderId ?? '') as string;

  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [restaurantName, setRestaurantName] = useState('');
  const [mealName, setMealName] = useState('');
  const [creatorName, setCreatorName] = useState('');
  const [otherUserName, setOtherUserName] = useState('');
  const [distanceM, setDistanceM] = useState<number | null>(null);
  const [restaurantPoint, setRestaurantPoint] = useState<MapPoint | null>(null);
  const [userAPoint, setUserAPoint] = useState<MapPoint | null>(null);
  const [userBPoint, setUserBPoint] = useState<MapPoint | null>(null);
  const [whatsappNumber, setWhatsappNumber] = useState<string | null>(null);
  const [meetingOption, setMeetingOption] = useState<MeetingOption>('meet_now');
  const [paymentChoice, setPaymentChoice] = useState<PaymentChoice>(
    'pay_at_restaurant_split',
  );
  const slideAnim = useRef(new Animated.Value(50)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!orderId) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const orderRef = doc(db, 'orders', orderId);
        const orderSnap = await getDoc(orderRef);
        if (!orderSnap.exists() || cancelled) {
          setLoading(false);
          return;
        }

        const d = orderSnap.data();
        const hostId = (d?.hostId ?? d?.userId ?? '') as string;
        const plist: string[] = Array.isArray(d?.participants)
          ? d.participants.filter((x): x is string => typeof x === 'string')
          : [];
        const uid = auth.currentUser?.uid ?? '';
        const otherId =
          plist.find((id) => id !== uid) ??
          (d?.user2Id as string) ??
          '';

        setRestaurantName(
          typeof d?.restaurantName === 'string' && d.restaurantName.trim()
            ? d.restaurantName
            : 'Restaurant',
        );
        setMealName(
          typeof d?.mealType === 'string' && d.mealType.trim()
            ? d.mealType
            : 'Meal',
        );
        const hostName =
          typeof d?.userName === 'string' && d.userName.trim()
            ? d.userName
            : 'Creator';
        const user2Name =
          typeof d?.user2Name === 'string' && d.user2Name.trim()
            ? d.user2Name
            : '';
        setCreatorName(hostName);
        setOtherUserName(uid === hostId ? user2Name || 'Match' : hostName);
        setWhatsappNumber(
          typeof d?.whatsappNumber === 'string' ? d.whatsappNumber : null,
        );

        const loc = d?.location ?? {};
        const orderLat =
          typeof d?.latitude === 'number'
            ? d.latitude
            : (loc as { latitude?: number }).latitude;
        const orderLng =
          typeof d?.longitude === 'number'
            ? d.longitude
            : (loc as { longitude?: number }).longitude;

        if (typeof orderLat === 'number' && typeof orderLng === 'number') {
          setRestaurantPoint({ latitude: orderLat, longitude: orderLng });
        }

        let myLat: number | null = null;
        let myLng: number | null = null;
        let otherLat: number | null = null;
        let otherLng: number | null = null;

        try {
          const myLoc = await getUserLocation();
          myLat = myLoc.latitude;
          myLng = myLoc.longitude;
          setUserAPoint({ latitude: myLat, longitude: myLng });
        } catch {
          // use order point as fallback for "user A" so map still works
          if (typeof orderLat === 'number' && typeof orderLng === 'number') {
            setUserAPoint({ latitude: orderLat, longitude: orderLng });
          }
        }

        if (otherId) {
          const otherRef = doc(db, 'users', otherId);
          const otherSnap = await getDoc(otherRef);
          if (otherSnap.exists() && !cancelled) {
            const o = otherSnap.data();
            const lat =
              o?.latitude ??
              o?.lastLatitude ??
              (o?.location as { latitude?: number })?.latitude;
            const lng =
              o?.longitude ??
              o?.lastLongitude ??
              (o?.location as { longitude?: number })?.longitude;
            if (typeof lat === 'number' && typeof lng === 'number') {
              otherLat = lat;
              otherLng = lng;
              setUserBPoint({ latitude: lat, longitude: lng });
            }
          }
        }

        if (
          typeof orderLat === 'number' &&
          typeof orderLng === 'number' &&
          myLat != null &&
          myLng != null &&
          otherLat != null &&
          otherLng != null &&
          !cancelled
        ) {
          const km = haversineDistanceKm(myLat, myLng, otherLat, otherLng);
          setDistanceM(Math.round(km * 1000));
        } else if (
          typeof orderLat === 'number' &&
          typeof orderLng === 'number' &&
          myLat != null &&
          myLng != null &&
          !cancelled
        ) {
          const km = haversineDistanceKm(myLat, myLng, orderLat, orderLng);
          setDistanceM(Math.round(km * 1000));
        }

        if (
          !userBPoint &&
          typeof orderLat === 'number' &&
          typeof orderLng === 'number'
        ) {
          setUserBPoint({ latitude: orderLat, longitude: orderLng });
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [orderId]);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  }, [slideAnim, opacityAnim]);

  const handleConfirm = async () => {
    if (!orderId) return;
    setConfirming(true);
    try {
      const orderRef = doc(db, 'orders', orderId);
      await updateDoc(orderRef, { status: 'matched' });
      const messagesRef = collection(db, 'orders', orderId, 'messages');
      await addDoc(messagesRef, {
        userId: auth.currentUser?.uid ?? '',
        userName: auth.currentUser?.displayName ?? 'User',
        text: 'Meeting confirmed.',
        createdAt: serverTimestamp(),
        type: 'system',
      });
      await createAlert('order_matched', 'Meeting confirmed');
      router.push(`/order/${orderId}` as never);
    } catch (e) {
      router.push(`/order/${orderId}` as never);
    } finally {
      setConfirming(false);
    }
  };

  const openChat = () => {
    router.push(`/order/${orderId}` as never);
  };

  const mapPoints =
    restaurantPoint && userAPoint && userBPoint
      ? { restaurant: restaurantPoint, userA: userAPoint, userB: userBPoint }
      : null;

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={c.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Animated.View
        style={[
          styles.wrapper,
          {
            opacity: opacityAnim,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.screenTitle}>Order checkout</Text>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Restaurant</Text>
            <Text style={styles.infoLine}>Restaurant: {restaurantName}</Text>
            <Text style={styles.infoLine}>Meal: {mealName}</Text>
            <Text style={styles.infoLine}>
              Sharing this order: {otherUserName || creatorName}
            </Text>
            <Text style={styles.infoLine}>
              Distance: {distanceM != null ? `${distanceM}m` : '—'}
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Meeting</Text>
            <View style={styles.meetingRow}>
              <TouchableOpacity
                style={[
                  styles.meetingBtn,
                  meetingOption === 'meet_now' && styles.meetingBtnSelected,
                ]}
                onPress={() => setMeetingOption('meet_now')}
              >
                <Text style={styles.meetingIcon}>⚡</Text>
                <Text style={styles.meetingLabel}>Meet Now</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.meetingBtn,
                  meetingOption === 'meet_at_restaurant' &&
                    styles.meetingBtnSelected,
                ]}
                onPress={() => setMeetingOption('meet_at_restaurant')}
              >
                <Text style={styles.meetingIcon}>📍</Text>
                <Text style={styles.meetingLabel}>At Restaurant</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.meetingBtn,
                  meetingOption === 'schedule' && styles.meetingBtnSelected,
                ]}
                onPress={() => setMeetingOption('schedule')}
              >
                <Text style={styles.meetingIcon}>🕒</Text>
                <Text style={styles.meetingLabel}>Schedule</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Map</Text>
            {mapPoints ? (
              <MatchCheckoutMap
                restaurant={mapPoints.restaurant}
                userA={mapPoints.userA}
                userB={mapPoints.userB}
                height={220}
              />
            ) : (
              <View style={styles.mapPlaceholder}>
                <Text style={styles.mapPlaceholderText}>Map unavailable</Text>
              </View>
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Contact</Text>
            <ContactButtons
              onChatInApp={openChat}
              whatsappNumber={whatsappNumber}
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Payment</Text>
            <PaymentOption value={paymentChoice} onChange={setPaymentChoice} />
          </View>

          <View style={{ height: 100 }} />
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.confirmBtn}
            onPress={handleConfirm}
            disabled={confirming}
            activeOpacity={0.9}
          >
            {confirming ? (
              <ActivityIndicator size="small" color={c.textOnPrimary} />
            ) : (
              <Text style={styles.confirmBtnText}>Confirm Meeting</Text>
            )}
          </TouchableOpacity>
        </View>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.sheetDark,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  wrapper: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 24,
  },
  screenTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: c.white,
    marginBottom: 20,
  },
  card: {
    backgroundColor: c.surfaceDark,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: c.textSecondary,
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  infoLine: {
    fontSize: 16,
    color: c.white,
    marginBottom: 6,
  },
  meetingRow: {
    flexDirection: 'row',
    gap: 10,
  },
  meetingBtn: {
    flex: 1,
    backgroundColor: c.surfaceDarkElevated,
    paddingVertical: 14,
    borderRadius: theme.radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: theme.spacing.touchMin,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  meetingBtnSelected: {
    borderColor: c.primary,
  },
  meetingIcon: {
    fontSize: 18,
    marginBottom: 4,
  },
  meetingLabel: {
    color: c.white,
    fontSize: 12,
    fontWeight: '600',
  },
  mapPlaceholder: {
    height: 220,
    backgroundColor: c.surfaceDarkElevated,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mapPlaceholderText: {
    color: c.textSecondary,
    fontSize: 14,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    paddingBottom: 24,
    backgroundColor: c.sheetDark,
  },
  confirmBtn: {
    backgroundColor: c.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  confirmBtnText: {
    color: c.textOnPrimary,
    fontSize: 17,
    fontWeight: '700',
  },
});
