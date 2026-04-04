import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import {
  doc,
  onSnapshot,
  type DocumentSnapshot,
} from 'firebase/firestore';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import {
  PAYMENT_DISCLAIMER_ORDER_DETAILS,
  PAYMENT_DISCLAIMER_SAFETY,
  PAYMENT_MATCH_ALERT_MESSAGE,
  PAYMENT_MATCH_ALERT_TITLE,
} from '@/constants/paymentDisclaimer';
import { theme } from '@/constants/theme';
import { buildOrderWhatsAppInviteLink } from '@/lib/invite-link';
import { friendlyErrorMessage } from '@/lib/friendlyError';
import { AIDescription } from '@/components/AIDescription';
import { OrderCardView } from '@/components/OrderCardView';
import { ScreenFadeIn } from '@/components/ScreenFadeIn';
import { ShimmerSkeleton } from '@/components/ShimmerSkeleton';
import { blockUser } from '@/services/block';
import { hasBlockBetween } from '@/services/blocks';
import { cancelHalfOrder } from '@/services/halfOrderCancel';
import { completeHalfOrder } from '@/services/halfOrderLifecycle';
import { auth, db } from '@/services/firebase';
import {
  getDistanceKm,
  formatDistanceKm,
} from '@/services/haversineKm';
import {
  memberIdsFromOrderData,
  normalizeParticipantRecords,
  parseOrderHost,
  type OrderHost,
  type OrderParticipant,
} from '@/services/orders';
import { submitUserReport } from '@/services/userSafety';
import {
  joinHalfOrderByOrderId,
  joinOrder as joinFirestoreOrder,
} from '@/services/joinOrder';
import { joinOrder as joinFoodCardOrder } from '@/services/foodCards';
import { normalizeParticipantsStrings } from '@/services/orderLifecycle';
import { submitOrderEmailInvite } from '@/services/orderInviteEmail';
import { claimReferralInboxRewards } from '@/services/referralRewards';

const PLACEHOLDER_FOOD_IMAGE =
  'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=1200&q=80';

function openWhatsAppToUser(
  phone: string | null | undefined,
  displayName: string,
): boolean {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (!digits) return false;
  const name = displayName.trim() || 'there';
  const text = `Hey ${name} 🍕`;
  const url = `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
  void Linking.openURL(url).catch(() => {});
  return true;
}

type OrderDetails = {
  id: string;
  foodName: string;
  image: string;
  pricePerPerson: number;
  totalPrice: number;
  peopleJoined: number;
  maxPeople: number;
  location: string;
  distance: number;
  timeRemaining: number;
  createdBy: string;
  host: OrderHost | null;
  participants: OrderParticipant[];
  usesHalfUsers?: boolean;
  memberIds?: string[];
  foodCardStatus?: string;
  orderStatus?: string;
  hostId?: string;
  /** From `food_cards` when opened as a card. */
  aiDescription?: string;
};

function mapOrderDocument(snap: DocumentSnapshot): OrderDetails {
  const d = snap.data();
  if (!d) {
    throw new Error('Missing order data');
  }
  const usersList = Array.isArray(d?.users)
    ? (d.users as unknown[]).filter((x): x is string => typeof x === 'string' && x.length > 0)
    : [];
  const richParticipants = normalizeParticipantRecords(d?.participants);
  const partCountLegacy = normalizeParticipantsStrings(d?.participants).length;
  const peopleJoined =
    usersList.length > 0
      ? usersList.length
      : richParticipants.length > 0
        ? richParticipants.length
        : partCountLegacy > 0
          ? partCountLegacy
          : Number(d?.peopleJoined ?? 1);
  const createdBy =
    typeof d?.createdBy === 'string' && d.createdBy
      ? d.createdBy
      : usersList[0] ?? '';
  const hostId =
    typeof d?.hostId === 'string' && d.hostId.trim()
      ? d.hostId.trim()
      : createdBy;
  const memberIds = memberIdsFromOrderData(d);
  let host = parseOrderHost(d?.host);
  if (!host && richParticipants[0]) {
    const p0 = richParticipants[0];
    host = {
      userId: p0.userId,
      name: p0.name,
      avatar: p0.avatar,
      phone: p0.phone,
      expoPushToken: p0.expoPushToken,
    };
  }
  const orderStatus =
    typeof d?.status === 'string' && d.status.trim() ? d.status.trim() : undefined;
  return {
    id: snap.id,
    foodName: String(d?.foodName ?? 'Shared order'),
    image:
      typeof d?.image === 'string' && d.image.trim()
        ? d.image
        : PLACEHOLDER_FOOD_IMAGE,
    pricePerPerson: Number(d?.pricePerPerson ?? 0),
    totalPrice: Number(d?.totalPrice ?? 0),
    peopleJoined,
    maxPeople: Number(d?.maxPeople ?? d?.maxUsers ?? 2),
    location: String(d?.location ?? 'Nearby'),
    distance: Number(d?.distance ?? 0),
    timeRemaining: Number(d?.timeRemaining ?? 20),
    createdBy: String(createdBy),
    hostId: String(hostId),
    host,
    participants: richParticipants,
    usesHalfUsers: usersList.length > 0,
    memberIds,
    orderStatus,
  };
}

function mapFoodCardDocument(snap: DocumentSnapshot): OrderDetails {
  const d = snap.data();
  if (!d) {
    throw new Error('Missing food card data');
  }
  const max =
    typeof d.maxUsers === 'number' && d.maxUsers > 0 ? d.maxUsers : 2;
  const exp = typeof d.expiresAt === 'number' ? d.expiresAt : 0;
  const msLeft = Math.max(0, exp - Date.now());
  const timeRemainingMinutes =
    msLeft > 0 ? Math.max(1, Math.ceil(msLeft / 60000)) : 0;
  const img =
    typeof d.image === 'string' && d.image.trim()
      ? d.image.trim()
      : PLACEHOLDER_FOOD_IMAGE;
  const loc =
    typeof d.restaurantName === 'string' && d.restaurantName.trim()
      ? d.restaurantName.trim()
      : d.location
        ? 'Location on file'
        : 'Nearby';
  const ownerId = String(d.ownerId ?? '');
  const aiDesc =
    typeof d.aiDescription === 'string' && d.aiDescription.trim()
      ? d.aiDescription.trim()
      : '';
  return {
    id: snap.id,
    foodName: String(d.title ?? 'Food card'),
    image: img,
    pricePerPerson: Number(d.splitPrice ?? 0),
    totalPrice: Number(d.price ?? 0),
    peopleJoined: 0,
    maxPeople: max,
    location: loc,
    distance: 0,
    timeRemaining: timeRemainingMinutes || 1,
    createdBy: ownerId,
    host: null,
    participants: [],
    hostId: ownerId || undefined,
    foodCardStatus: typeof d.status === 'string' ? d.status : undefined,
    aiDescription: aiDesc || undefined,
  };
}

export default function OrderDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const orderId = String(params.id ?? '');

  const [order, setOrder] = useState<OrderDetails | null>(null);
  const [detailSource, setDetailSource] = useState<'order' | 'food_card' | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [countdownSec, setCountdownSec] = useState(0);
  const [isBlocked, setIsBlocked] = useState(false);
  const [emailInviteOpen, setEmailInviteOpen] = useState(false);
  const [emailInviteInput, setEmailInviteInput] = useState('');
  const [emailInviteSending, setEmailInviteSending] = useState(false);
  const prevJoinedCountRef = useRef<number | null>(null);

  useEffect(() => {
    if (!orderId.trim()) {
      setOrder(null);
      setDetailSource(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setOrder(null);
    setDetailSource(null);

    let primaryOrderRow: OrderDetails | null = null;
    let linkedOrderRow: OrderDetails | null = null;
    let cardRow: OrderDetails | null = null;
    let primaryHeard = false;
    let cardHeard = false;
    let linkedHeard = true;
    let unsubLinked: (() => void) | null = null;

    const settle = () => {
      if (!primaryHeard || !cardHeard || !linkedHeard) return;
      const orderRow = primaryOrderRow ?? linkedOrderRow ?? null;
      if (orderRow) {
        setDetailSource('order');
        setOrder(orderRow);
        setCountdownSec(Math.max(orderRow.timeRemaining, 0) * 60);
      } else if (cardRow) {
        setDetailSource('food_card');
        setOrder(cardRow);
        setCountdownSec(Math.max(cardRow.timeRemaining, 0) * 60);
      } else {
        setDetailSource(null);
        setOrder(null);
      }
      setLoading(false);
    };

    const subLinkedOrder = (rawOid: unknown) => {
      if (unsubLinked) {
        unsubLinked();
        unsubLinked = null;
      }
      linkedOrderRow = null;
      const oid =
        typeof rawOid === 'string' && rawOid.trim() ? rawOid.trim() : '';
      if (!oid || oid === orderId) {
        linkedHeard = true;
        settle();
        return;
      }
      linkedHeard = false;
      unsubLinked = onSnapshot(
        doc(db, 'orders', oid),
        (snap) => {
          linkedHeard = true;
          try {
            linkedOrderRow = snap.exists() ? mapOrderDocument(snap) : null;
          } catch {
            linkedOrderRow = null;
          }
          settle();
        },
        () => {
          linkedHeard = true;
          linkedOrderRow = null;
          settle();
        },
      );
    };

    const unsubOrderPrimary = onSnapshot(
      doc(db, 'orders', orderId),
      (snap) => {
        primaryHeard = true;
        try {
          primaryOrderRow = snap.exists() ? mapOrderDocument(snap) : null;
        } catch {
          primaryOrderRow = null;
        }
        settle();
      },
      () => {
        primaryHeard = true;
        primaryOrderRow = null;
        settle();
      },
    );

    const unsubCard = onSnapshot(
      doc(db, 'food_cards', orderId),
      (snap) => {
        cardHeard = true;
        try {
          cardRow = snap.exists() ? mapFoodCardDocument(snap) : null;
          const oid = snap.exists() ? snap.data()?.orderId : undefined;
          subLinkedOrder(oid);
        } catch {
          cardRow = null;
          subLinkedOrder(undefined);
        }
        settle();
      },
      () => {
        cardHeard = true;
        cardRow = null;
        subLinkedOrder(undefined);
        settle();
      },
    );

    return () => {
      unsubOrderPrimary();
      unsubCard();
      if (unsubLinked) unsubLinked();
    };
  }, [orderId]);

  const { uid: viewerUid, profile: viewerProfile } = useCurrentUser();

  useFocusEffect(
    useCallback(() => {
      if (!viewerUid) return;
      void claimReferralInboxRewards(viewerUid);
    }, [viewerUid]),
  );

  const halfParticipantCount = useMemo(() => {
    if (!order?.usesHalfUsers) return 0;
    const n = Math.max(
      order.participants.length,
      order.memberIds?.length ?? 0,
      order.peopleJoined,
    );
    return Math.min(n, Math.max(1, order.maxPeople));
  }, [
    order?.usesHalfUsers,
    order?.participants.length,
    order?.memberIds,
    order?.peopleJoined,
    order?.maxPeople,
  ]);

  const otherUser = useMemo(() => {
    if (!viewerUid || !order?.participants?.length) return undefined;
    return order.participants.find((p) => p.userId !== viewerUid);
  }, [viewerUid, order?.participants]);

  const partnerIdForSafety = useMemo(() => {
    if (otherUser?.userId) return otherUser.userId;
    if (!viewerUid || (order?.memberIds?.length ?? 0) < 2) return null;
    return order!.memberIds!.find((x) => x !== viewerUid) ?? null;
  }, [otherUser?.userId, viewerUid, order?.memberIds]);

  const partnerDistanceKm = useMemo(() => {
    if (!otherUser?.location || !viewerProfile?.location) return null;
    const km = getDistanceKm(viewerProfile.location, otherUser.location);
    return Number.isFinite(km) ? km : null;
  }, [viewerProfile?.location, otherUser?.location]);

  const isHalfCancelled =
    order?.usesHalfUsers === true && order.orderStatus === 'cancelled';

  useEffect(() => {
    if (!order || detailSource !== 'order') {
      prevJoinedCountRef.current = null;
      return;
    }
    if (!order.usesHalfUsers) {
      prevJoinedCountRef.current = order.peopleJoined;
      return;
    }
    const count = Math.min(
      Math.max(1, order.maxPeople),
      Math.max(
        order.participants.length,
        order.memberIds?.length ?? 0,
        order.peopleJoined,
      ),
    );
    const prev = prevJoinedCountRef.current;
    prevJoinedCountRef.current = count;
    if (prev === 1 && count >= 2 && auth.currentUser?.uid) {
      Alert.alert(PAYMENT_MATCH_ALERT_TITLE, PAYMENT_MATCH_ALERT_MESSAGE);
    }
  }, [
    order?.peopleJoined,
    order?.participants,
    order?.memberIds,
    order?.maxPeople,
    order?.id,
    detailSource,
    order?.usesHalfUsers,
  ]);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    const other = partnerIdForSafety;
    if (!uid || !other) {
      setIsBlocked(false);
      return;
    }
    let cancelled = false;
    hasBlockBetween(uid, other)
      .then((v) => {
        if (!cancelled) setIsBlocked(v);
      })
      .catch(() => {
        if (!cancelled) setIsBlocked(false);
      });
    return () => {
      cancelled = true;
    };
  }, [partnerIdForSafety]);

  useEffect(() => {
    if (countdownSec <= 0) return;
    const id = setInterval(() => {
      setCountdownSec((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, [countdownSec]);

  const remainingSpots = useMemo(() => {
    if (!order) return 0;
    return Math.max(order.maxPeople - order.peopleJoined, 0);
  }, [order]);

  const alreadyMember = !!(
    viewerUid &&
    order?.memberIds &&
    order.memberIds.includes(viewerUid)
  );

  const countdownLabel = useMemo(() => {
    const mins = Math.floor(countdownSec / 60);
    const secs = countdownSec % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }, [countdownSec]);

  const handleJoinOrder = async () => {
    if (!order || !detailSource) return;
    const uid = auth.currentUser?.uid;
    if (!uid) {
      router.push(
        `/(auth)/login?redirectTo=/order/${order.id}` as never,
      );
      return;
    }
    setJoining(true);
    try {
      if (detailSource === 'food_card') {
        const result = await joinFoodCardOrder(order.id, uid);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
          () => {},
        );
        if (result.justBecamePair) {
          Alert.alert(PAYMENT_MATCH_ALERT_TITLE, PAYMENT_MATCH_ALERT_MESSAGE);
        }
        router.replace(`/order/${result.orderId}` as never);
        return;
      }
      if (order.usesHalfUsers) {
        const half = await joinHalfOrderByOrderId(order.id);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
          () => {},
        );
        if (half.justBecamePair) {
          Alert.alert(PAYMENT_MATCH_ALERT_TITLE, PAYMENT_MATCH_ALERT_MESSAGE);
        }
        router.push(`/order/${order.id}` as never);
        return;
      }
      await joinFirestoreOrder(order.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );
      router.push(`/order/${order.id}` as never);
    } catch (e) {
      console.error('[order join]', e);
      Alert.alert('Join failed', friendlyErrorMessage(e));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(
        () => {},
      );
    } finally {
      setJoining(false);
    }
  };

  const handleBlockUser = () => {
    const uid = auth.currentUser?.uid;
    const target = partnerIdForSafety;
    if (!uid || !target) return;
    Alert.alert('Block user', 'They will not be able to match or join orders with you.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Block',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setBlocking(true);
            try {
              await blockUser(target, uid);
              setIsBlocked(true);
              Alert.alert('Blocked', 'User has been blocked.');
            } catch (e) {
              Alert.alert('Block failed', friendlyErrorMessage(e));
            } finally {
              setBlocking(false);
            }
          })();
        },
      },
    ]);
  };

  const openWhatsApp = () => {
    const displayName = otherUser?.name ?? 'there';
    const phone = otherUser?.phone;
    const ok = openWhatsAppToUser(phone, displayName);
    if (!ok) {
      Alert.alert('No phone', 'This user has no phone number on file.');
    }
  };

  const handleWhatsAppOrderInvite = () => {
    if (!order?.id) return;
    const url = buildOrderWhatsAppInviteLink(order.id);
    void Linking.openURL(url).catch(() => {
      Alert.alert('Could not open WhatsApp');
    });
  };

  const inviterDisplayName =
    viewerProfile?.name?.trim() ||
    auth.currentUser?.displayName?.trim() ||
    auth.currentUser?.email?.split('@')[0] ||
    'Friend';

  const submitEmailInvite = async () => {
    if (!order?.id) return;
    setEmailInviteSending(true);
    try {
      await submitOrderEmailInvite({
        email: emailInviteInput,
        orderId: order.id,
        inviterName: inviterDisplayName,
      });
      setEmailInviteOpen(false);
      setEmailInviteInput('');
      Alert.alert('Invite sent', 'If email is configured, they will get a link in their inbox.');
    } catch (e) {
      Alert.alert('Could not send', friendlyErrorMessage(e));
    } finally {
      setEmailInviteSending(false);
    }
  };

  const handleReportUser = () => {
    const uid = auth.currentUser?.uid;
    const reported = partnerIdForSafety;
    if (!uid || !order || !reported) return;
    const reasons = [
      'Harassment',
      'Spam or scam',
      'Inappropriate content',
      'Other',
    ];
    Alert.alert('Report user', 'Why are you reporting?', [
      ...reasons.map((reason) => ({
        text: reason,
        onPress: () => {
          void (async () => {
            try {
              await submitUserReport({
                reporterId: uid,
                reportedUserId: reported,
                orderId: order.id,
                reason,
              });
              Alert.alert('Thanks', 'We received your report.');
            } catch (e) {
              Alert.alert('Report failed', friendlyErrorMessage(e));
            }
          })();
        },
      })),
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleCompleteOrder = () => {
    if (!order?.usesHalfUsers || !order.id) return;
    Alert.alert('Mark complete?', 'This order will move to Completed.', [
      { text: 'Not now', style: 'cancel' },
      {
        text: 'Complete',
        onPress: () => {
          void (async () => {
            setCompleting(true);
            try {
              await completeHalfOrder(order.id);
              Alert.alert('Done', 'Order marked complete.');
            } catch (e) {
              Alert.alert('Error', friendlyErrorMessage(e));
            } finally {
              setCompleting(false);
            }
          })();
        },
      },
    ]);
  };

  const handleCancelOrder = () => {
    if (!order?.usesHalfUsers || !order.id) return;
    Alert.alert(
      'Cancel order',
      'The other person will be notified. Continue?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Cancel order',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setCancelling(true);
              try {
                await cancelHalfOrder(order.id);
                Alert.alert('Cancelled', 'This half order was cancelled.');
              } catch (e) {
                Alert.alert('Cancel failed', friendlyErrorMessage(e));
              } finally {
                setCancelling(false);
              }
            })();
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingWrap}>
        <ShimmerSkeleton width="92%" height={220} borderRadius={18} style={styles.skeletonGap} />
        <ShimmerSkeleton width="72%" height={22} style={styles.skeletonGapLine} />
        <ShimmerSkeleton width="44%" height={14} />
        <ActivityIndicator size="small" color={theme.colors.primary} style={{ marginTop: 16 }} />
      </SafeAreaView>
    );
  }

  if (!order) {
    return (
      <SafeAreaView style={styles.loadingWrap}>
        <Text style={styles.emptyText}>Order not found.</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScreenFadeIn style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.content}>
        <Image source={{ uri: order.image }} style={styles.image} />
        <Text style={styles.foodName}>{order.foodName}</Text>
        {detailSource === 'food_card' ? (
          <AIDescription
            description={order.aiDescription}
            title={order.foodName}
            containerStyle={styles.aiDescOrderWrap}
          />
        ) : null}
        {detailSource === 'order' &&
        order.usesHalfUsers &&
        alreadyMember &&
        !isHalfCancelled ? (
          <OrderCardView
            participants={order.participants.map((p) => ({
              userId: p.userId,
              name: p.name,
              avatar: p.avatar,
            }))}
            maxUsers={order.maxPeople}
            status={order.orderStatus}
            viewerUserId={viewerUid}
          />
        ) : null}
        <Text style={styles.price}>${order.pricePerPerson.toFixed(2)} per person</Text>
        <View style={styles.card}>
          <Text style={styles.meta}>Total: ${order.totalPrice.toFixed(2)}</Text>
          <Text style={styles.meta}>
            {order.usesHalfUsers
              ? `Joined: ${halfParticipantCount}/${order.maxPeople}${
                  halfParticipantCount >= order.maxPeople ? ' ✅' : ''
                }`
              : `Joined: ${order.peopleJoined}/${order.maxPeople}`}
          </Text>
          <Text style={styles.meta}>Remaining spots: {remainingSpots}</Text>
          <Text style={styles.meta}>
            {order.usesHalfUsers && halfParticipantCount >= 2 && partnerDistanceKm != null
              ? `Distance: ${formatDistanceKm(partnerDistanceKm, 1)}`
              : order.usesHalfUsers && halfParticipantCount >= 2
                ? 'Distance: unknown'
                : `Distance: ${order.distance.toFixed(1)} km`}
          </Text>
          <Text style={styles.meta}>Location: {order.location}</Text>
          {detailSource === 'order' && order.usesHalfUsers && order.host ? (
            <View style={styles.hostRow}>
              {order.host.avatar ? (
                <Image source={{ uri: order.host.avatar }} style={styles.hostAvatar} />
              ) : (
                <View style={[styles.hostAvatar, styles.hostAvatarPlaceholder]} />
              )}
              <View style={styles.hostTextCol}>
                <Text style={styles.hostLabel}>Host</Text>
                <TouchableOpacity
                  onPress={() =>
                    order.host?.userId
                      ? router.push({
                          pathname: '/user/[id]',
                          params: { id: order.host.userId },
                        } as never)
                      : undefined
                  }
                  disabled={!order.host?.userId}
                  activeOpacity={0.8}
                >
                  <Text style={styles.hostName}>{order.host.name}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}
          <View style={styles.timerRow}>
            <Text style={styles.timerLabel}>Time remaining</Text>
            <Text style={styles.timerValue}>{countdownLabel}</Text>
          </View>
        </View>
        {order.usesHalfUsers ? (
          <View style={styles.paymentDisclaimerBox}>
            <Text style={styles.paymentDisclaimerIcon}>💡</Text>
            <View style={styles.paymentDisclaimerTextCol}>
              <Text style={styles.paymentDisclaimerMain}>
                {PAYMENT_DISCLAIMER_ORDER_DETAILS}
              </Text>
              <Text style={styles.paymentDisclaimerSafety}>
                {PAYMENT_DISCLAIMER_SAFETY}
              </Text>
            </View>
          </View>
        ) : null}
        {detailSource === 'order' && order.usesHalfUsers && alreadyMember ? (
          <View style={styles.sectionDivider} />
        ) : null}
        {isHalfCancelled ? (
          <View style={styles.cancelledBanner}>
            <Text style={styles.cancelledBannerText}>This order was cancelled.</Text>
          </View>
        ) : null}
        {detailSource === 'order' &&
        order.usesHalfUsers &&
        alreadyMember &&
        halfParticipantCount === 1 ? (
          <LinearGradient
            colors={['rgba(251,191,36,0.15)', 'rgba(20,25,34,1)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.waitingCardGradient}
          >
            <View style={styles.waitingCard}>
              <Text style={styles.waitingEmoji}>✨</Text>
              <Text style={styles.waitingTitle}>Almost there</Text>
              <Text style={styles.waitingCentered}>
                Share this order so someone can join your half — you’ll match in
                chat as soon as they hop in.
              </Text>
              <TouchableOpacity
                style={styles.invitePrimaryBtn}
                onPress={handleWhatsAppOrderInvite}
                activeOpacity={0.88}
              >
                <Text style={styles.invitePrimaryBtnText}>Invite via WhatsApp</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.inviteSecondaryBtn}
                onPress={() => setEmailInviteOpen(true)}
                activeOpacity={0.85}
              >
                <Text style={styles.inviteSecondaryBtnText}>Invite by email</Text>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        ) : null}
        {detailSource === 'order' &&
        order.usesHalfUsers &&
        alreadyMember &&
        halfParticipantCount === 2 ? (
          <View style={styles.partnerCard}>
            <Text style={styles.matchedWithLabel}>Your match</Text>
            <View style={styles.partnerDualRow}>
              {viewerUid ? (
                <>
                  <View style={styles.partnerDualItem}>
                    {order.participants.find((p) => p.userId === viewerUid)
                      ?.avatar ? (
                      <Image
                        source={{
                          uri: order.participants.find(
                            (p) => p.userId === viewerUid,
                          )!.avatar!,
                        }}
                        style={styles.partnerAvatarMed}
                      />
                    ) : (
                      <View
                        style={[
                          styles.partnerAvatarMed,
                          styles.partnerAvatarPlaceholder,
                        ]}
                      >
                        <Text style={styles.partnerAvatarLetter}>
                          {(
                            order.participants.find((p) => p.userId === viewerUid)
                              ?.name ?? 'Y'
                          )
                            .charAt(0)
                            .toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <Text style={styles.partnerDualName}>You</Text>
                  </View>
                  <Text style={styles.partnerHeartBetween}>♥</Text>
                </>
              ) : null}
              <View style={styles.partnerDualItem}>
                {otherUser?.avatar ? (
                  <Image
                    source={{ uri: otherUser.avatar }}
                    style={styles.partnerAvatarMed}
                  />
                ) : (
                  <View
                    style={[
                      styles.partnerAvatarMed,
                      styles.partnerAvatarPlaceholder,
                    ]}
                  >
                    <Text style={styles.partnerAvatarLetter}>
                      {(otherUser?.name ?? '?').charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
                <Text style={styles.partnerDualName} numberOfLines={1}>
                  {otherUser?.name ?? 'Partner'}
                </Text>
              </View>
            </View>
            <Text style={styles.partnerMeta}>
              {partnerDistanceKm != null
                ? `${formatDistanceKm(partnerDistanceKm, 1)} away`
                : 'Distance unavailable'}
            </Text>
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => router.push(`/chat/${order.id}` as never)}
              style={styles.partnerChatCtaWrap}
            >
              <LinearGradient
                colors={['#34D399', '#059669']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.partnerChatCta}
              >
                <Text style={styles.partnerChatCtaText}>Open chat</Text>
              </LinearGradient>
            </TouchableOpacity>
            <Text style={styles.inviteMoreHint}>
              Coordinate pickup, then complete the order when you’re done.
            </Text>
            <View style={styles.primaryActionsRow}>
              <TouchableOpacity
                style={styles.primaryActionBtn}
                onPress={openWhatsApp}
                activeOpacity={0.85}
              >
                <Text style={styles.primaryActionBtnText}>WhatsApp</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryActionBtn, styles.primaryActionBtnDanger]}
                onPress={handleBlockUser}
                disabled={blocking || !partnerIdForSafety}
                activeOpacity={0.85}
              >
                <Text style={styles.primaryActionBtnDangerText}>
                  {blocking ? '…' : 'Block'}
                </Text>
              </TouchableOpacity>
            </View>
            <View style={styles.secondaryActionsRow}>
              <TouchableOpacity onPress={handleReportUser} disabled={!partnerIdForSafety}>
                <Text style={styles.secondaryActionLink}>Report</Text>
              </TouchableOpacity>
              <Text style={styles.secondaryDot}>·</Text>
              <TouchableOpacity onPress={handleCompleteOrder} disabled={completing}>
                <Text style={styles.secondaryActionLink}>
                  {completing ? '…' : 'Complete'}
                </Text>
              </TouchableOpacity>
              <Text style={styles.secondaryDot}>·</Text>
              <TouchableOpacity onPress={handleWhatsAppOrderInvite}>
                <Text style={styles.secondaryActionLink}>Share invite</Text>
              </TouchableOpacity>
              <Text style={styles.secondaryDot}>·</Text>
              <TouchableOpacity
                onPress={handleCancelOrder}
                disabled={cancelling || isHalfCancelled}
              >
                <Text style={styles.secondaryActionLinkDanger}>
                  {cancelling ? 'Cancelling…' : 'Cancel order'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
        {detailSource === 'order' &&
        order.usesHalfUsers &&
        !isHalfCancelled &&
        !(alreadyMember && halfParticipantCount >= 2) ? (
          <TouchableOpacity
            style={styles.chatNavButton}
            onPress={() => router.push(`/chat/${order.id}` as never)}
            activeOpacity={0.85}
          >
            <Text style={styles.chatNavButtonText}>Open order chat</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          style={[
            styles.joinButton,
            (joining ||
              alreadyMember ||
              remainingSpots <= 0 ||
              isBlocked ||
              isHalfCancelled ||
              (detailSource === 'food_card' &&
                order.foodCardStatus != null &&
                order.foodCardStatus !== 'active')) &&
              styles.joinButtonDisabled,
          ]}
          onPress={handleJoinOrder}
          disabled={
            joining ||
            alreadyMember ||
            remainingSpots <= 0 ||
            isBlocked ||
            isHalfCancelled ||
            (detailSource === 'food_card' &&
              order.foodCardStatus != null &&
              order.foodCardStatus !== 'active')
          }
          activeOpacity={0.85}
        >
          <Text style={styles.joinButtonText}>
            {joining
              ? 'Joining...'
              : alreadyMember
                ? 'Joined'
                : isHalfCancelled
                  ? 'Cancelled'
                  : isBlocked
                    ? 'Blocked'
                    : detailSource === 'food_card' &&
                        order.foodCardStatus != null &&
                        order.foodCardStatus !== 'active'
                      ? 'Not available'
                      : remainingSpots <= 0
                        ? 'Order Full'
                        : 'Join Order'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
      </ScreenFadeIn>
      <Modal
        visible={emailInviteOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setEmailInviteOpen(false)}
      >
        <View style={styles.emailModalBackdrop}>
          <View style={styles.emailModalCard}>
            <Text style={styles.emailModalTitle}>Email invite</Text>
            <Text style={styles.emailModalHint}>
              We’ll email them a link to this order (requires mail setup in Firebase).
            </Text>
            <TextInput
              style={styles.emailModalInput}
              placeholder="friend@example.com"
              placeholderTextColor="#64748B"
              value={emailInviteInput}
              onChangeText={setEmailInviteInput}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <View style={styles.emailModalActions}>
              <TouchableOpacity
                style={styles.emailModalCancel}
                onPress={() => {
                  setEmailInviteOpen(false);
                  setEmailInviteInput('');
                }}
              >
                <Text style={styles.emailModalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.emailModalSend,
                  emailInviteSending && styles.emailModalSendDisabled,
                ]}
                disabled={emailInviteSending}
                onPress={() => void submitEmailInvite()}
              >
                <Text style={styles.emailModalSendText}>
                  {emailInviteSending ? 'Sending…' : 'Send'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0D10' },
  loadingWrap: {
    flex: 1,
    backgroundColor: '#0B0D10',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: { color: '#E5E7EB', fontSize: 16 },
  skeletonGap: { marginBottom: 16 },
  skeletonGapLine: { marginBottom: 10 },
  backBtn: {
    marginTop: 14,
    backgroundColor: '#141922',
    borderColor: '#232A35',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  backBtnText: { color: '#C7D2FE', fontWeight: '700' },
  content: { padding: 16, paddingBottom: 32 },
  image: { width: '100%', height: 260, borderRadius: 20, marginBottom: 14 },
  foodName: { color: '#F8FAFC', fontSize: 28, fontWeight: '800' },
  aiDescOrderWrap: {
    marginTop: 4,
    marginBottom: 4,
  },
  price: { color: '#6EE7B7', fontSize: 18, fontWeight: '700', marginTop: 6, marginBottom: 14 },
  card: {
    backgroundColor: '#141922',
    borderColor: '#232A35',
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 6,
  },
  meta: { color: '#D1D5DB', fontSize: 14 },
  linkMeta: { textDecorationLine: 'underline' },
  hostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#232A35',
  },
  hostAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#1e293b' },
  hostAvatarPlaceholder: { borderWidth: 1, borderColor: '#334155' },
  hostTextCol: { flex: 1, gap: 2 },
  hostLabel: { color: '#94A3B8', fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  hostName: { color: '#F8FAFC', fontSize: 16, fontWeight: '800' },
  timerRow: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timerLabel: { color: '#FB923C', fontSize: 14, fontWeight: '700' },
  timerValue: { color: '#FB923C', fontSize: 24, fontWeight: '900' },
  paymentDisclaimerBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#1a2430',
    borderWidth: 1,
    borderColor: '#2a3644',
  },
  paymentDisclaimerIcon: { fontSize: 16, lineHeight: 20, marginTop: 1 },
  paymentDisclaimerTextCol: { flex: 1, gap: 6 },
  paymentDisclaimerMain: {
    color: '#94a3b8',
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '500',
  },
  paymentDisclaimerSafety: {
    color: '#64748b',
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '500',
  },
  chatNavButton: {
    backgroundColor: '#1e293b',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  chatNavButtonText: { color: '#7dd3fc', fontWeight: '800', fontSize: 16 },
  joinButton: {
    marginTop: 16,
    backgroundColor: '#34D399',
    borderRadius: 14,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinButtonDisabled: { opacity: 0.6 },
  joinButtonText: { color: '#052E1A', fontSize: 16, fontWeight: '800' },
  blockButton: {
    marginTop: 10,
    backgroundColor: '#261317',
    borderRadius: 14,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#4B1D24',
  },
  blockButtonText: { color: '#FCA5A5', fontSize: 14, fontWeight: '800' },
  cancelledBanner: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#3f1d1d',
    borderWidth: 1,
    borderColor: '#7f1d1d',
  },
  cancelledBannerText: { color: '#FECACA', fontWeight: '700', textAlign: 'center' },
  sectionDivider: {
    height: 1,
    backgroundColor: '#232A35',
    marginTop: 20,
    marginBottom: 4,
    alignSelf: 'stretch',
  },
  waitingCardGradient: {
    marginTop: 20,
    borderRadius: 18,
    padding: 1,
  },
  waitingCard: {
    paddingVertical: 26,
    paddingHorizontal: 22,
    borderRadius: 17,
    backgroundColor: '#131820',
    alignItems: 'center',
  },
  waitingEmoji: { fontSize: 32, marginBottom: 8 },
  waitingTitle: {
    color: '#FEF3C7',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 10,
  },
  waitingCentered: {
    color: 'rgba(226,232,240,0.88)',
    fontSize: 15,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
  },
  invitePrimaryBtn: {
    width: '100%',
    backgroundColor: '#25D366',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  invitePrimaryBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 16,
  },
  inviteSecondaryBtn: {
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  inviteSecondaryBtnText: {
    color: '#7dd3fc',
    fontWeight: '700',
    fontSize: 15,
  },
  emailModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    padding: 24,
  },
  emailModalCard: {
    backgroundColor: '#141922',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#232A35',
  },
  emailModalTitle: {
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 8,
  },
  emailModalHint: {
    color: '#94A3B8',
    fontSize: 13,
    marginBottom: 14,
    lineHeight: 18,
  },
  emailModalInput: {
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#F8FAFC',
    fontSize: 16,
    marginBottom: 16,
  },
  emailModalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  emailModalCancel: {
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  emailModalCancelText: { color: '#94A3B8', fontWeight: '700' },
  emailModalSend: {
    backgroundColor: '#2563EB',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
  },
  emailModalSendDisabled: { opacity: 0.6 },
  emailModalSendText: { color: '#FFFFFF', fontWeight: '800' },
  partnerCard: {
    marginTop: 20,
    padding: 20,
    borderRadius: 20,
    backgroundColor: '#141922',
    borderWidth: 1,
    borderColor: '#232A35',
    gap: 14,
  },
  matchedWithLabel: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  partnerDualRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    marginTop: 4,
  },
  partnerDualItem: { alignItems: 'center', width: 88 },
  partnerAvatarMed: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#1e293b',
    borderWidth: 3,
    borderColor: 'rgba(52,211,153,0.35)',
  },
  partnerAvatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: '#334155',
  },
  partnerAvatarLetter: {
    color: '#E2E8F0',
    fontSize: 28,
    fontWeight: '800',
  },
  partnerHeartBetween: {
    color: '#34D399',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 28,
  },
  partnerDualName: {
    marginTop: 8,
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    maxWidth: 88,
  },
  partnerMeta: {
    color: '#9CA3AF',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 4,
  },
  partnerChatCtaWrap: {
    width: '100%',
    marginTop: 4,
    borderRadius: 14,
    overflow: 'hidden',
  },
  partnerChatCta: {
    paddingVertical: 15,
    alignItems: 'center',
  },
  partnerChatCtaText: {
    color: '#052E1A',
    fontSize: 17,
    fontWeight: '900',
  },
  inviteMoreHint: {
    color: '#94A3B8',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  primaryActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
    width: '100%',
  },
  primaryActionBtn: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#334155',
    minHeight: 44,
  },
  primaryActionBtnDanger: {
    backgroundColor: '#261317',
    borderColor: '#4B1D24',
  },
  primaryActionBtnText: { color: '#7dd3fc', fontWeight: '800', fontSize: 14 },
  primaryActionBtnDangerText: { color: '#FCA5A5', fontWeight: '800', fontSize: 14 },
  secondaryActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 4,
    paddingBottom: 4,
  },
  secondaryActionLink: { color: '#94A3B8', fontSize: 13, fontWeight: '600' },
  secondaryDot: { color: '#475569', fontSize: 13 },
  secondaryActionLinkDanger: { color: '#fca5a5', fontSize: 13, fontWeight: '600' },
});
