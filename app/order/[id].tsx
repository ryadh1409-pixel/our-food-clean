import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  doc,
  onSnapshot,
  type DocumentSnapshot,
} from 'firebase/firestore';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as ExpoLinking from 'expo-linking';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { theme } from '@/constants/theme';
import { buildOrderWhatsAppInviteLink } from '@/lib/invite-link';
import { ScreenFadeIn } from '@/components/ScreenFadeIn';
import { ShimmerSkeleton } from '@/components/ShimmerSkeleton';
import { blockUser as blockUserProfile } from '@/services/block';
import { hasBlockBetween } from '@/services/blocks';
import { cancelHalfOrder } from '@/services/halfOrderCancel';
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

const PLACEHOLDER_FOOD_IMAGE =
  'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=1200&q=80';

function openWhatsAppToMatch(
  phone: string | null | undefined,
  displayName: string,
): boolean {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (!digits) return false;
  const first =
    displayName.trim().split(/\s+/)[0] || displayName.trim() || 'there';
  const text = `Hey ${first}, we matched on HalfOrder 🍕`;
  const url = `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
  void ExpoLinking.openURL(url).catch(() => {});
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
  const [countdownSec, setCountdownSec] = useState(0);
  const [isBlocked, setIsBlocked] = useState(false);
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

  const partnerUserId = useMemo(() => {
    if (!viewerUid || !order?.memberIds || order.memberIds.length < 2) return null;
    return order.memberIds.find((x) => x !== viewerUid) ?? null;
  }, [viewerUid, order?.memberIds]);

  const otherParticipant = useMemo(() => {
    if (!partnerUserId || !order?.participants?.length) return null;
    return (
      order.participants.find((p) => p.userId === partnerUserId) ?? null
    );
  }, [order?.participants, partnerUserId]);

  const partnerDistanceKm = useMemo(() => {
    if (!otherParticipant?.location || !viewerProfile?.location) return null;
    const km = getDistanceKm(viewerProfile.location, otherParticipant.location);
    return Number.isFinite(km) ? km : null;
  }, [viewerProfile?.location, otherParticipant?.location]);

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
    const prev = prevJoinedCountRef.current;
    prevJoinedCountRef.current = order.peopleJoined;
    if (prev === 1 && order.peopleJoined >= 2 && auth.currentUser?.uid) {
      Alert.alert(
        'Someone joined your order!',
        'Open chat to coordinate.',
      );
    }
  }, [order?.peopleJoined, order?.id, detailSource, order?.usesHalfUsers]);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    const other = partnerUserId;
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
  }, [partnerUserId]);

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
          Alert.alert(
            'Someone joined your order!',
            'Say hi in chat.',
          );
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
          Alert.alert('Someone joined your order!', 'Say hi in chat.');
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
      const msg = e instanceof Error ? e.message : 'Failed to join order.';
      console.error('[order join]', msg, e);
      Alert.alert('Join failed', msg);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(
        () => {},
      );
    } finally {
      setJoining(false);
    }
  };

  const handleBlockUser = () => {
    const uid = auth.currentUser?.uid;
    const target = partnerUserId;
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
              await blockUserProfile(target, uid);
              setIsBlocked(true);
              Alert.alert('Blocked', 'User has been blocked.');
            } catch (e) {
              const msg = e instanceof Error ? e.message : 'Failed to block user.';
              Alert.alert('Block failed', msg);
            } finally {
              setBlocking(false);
            }
          })();
        },
      },
    ]);
  };

  const handleOpenWhatsApp = () => {
    if (!otherParticipant) return;
    const ok = openWhatsAppToMatch(
      otherParticipant.phone,
      otherParticipant.name,
    );
    if (!ok) {
      Alert.alert('No phone', 'This user has no phone number on file.');
    }
  };

  const handleWhatsAppOrderInvite = () => {
    if (!order?.id) return;
    const url = buildOrderWhatsAppInviteLink(order.id);
    void ExpoLinking.openURL(url).catch(() => {
      Alert.alert('Could not open WhatsApp');
    });
  };

  const handleReportUser = () => {
    const uid = auth.currentUser?.uid;
    if (!uid || !order || !partnerUserId) return;
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
                reportedUserId: partnerUserId,
                orderId: order.id,
                reason,
              });
              Alert.alert('Thanks', 'We received your report.');
            } catch (e) {
              const msg = e instanceof Error ? e.message : 'Could not submit report.';
              Alert.alert('Report failed', msg);
            }
          })();
        },
      })),
      { text: 'Cancel', style: 'cancel' },
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
                const msg = e instanceof Error ? e.message : 'Could not cancel.';
                Alert.alert('Cancel failed', msg);
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
        <Text style={styles.price}>${order.pricePerPerson.toFixed(2)} per person</Text>
        <View style={styles.card}>
          <Text style={styles.meta}>Total: ${order.totalPrice.toFixed(2)}</Text>
          <Text style={styles.meta}>
            Joined: {order.peopleJoined}/{order.maxPeople}
          </Text>
          <Text style={styles.meta}>Remaining spots: {remainingSpots}</Text>
          <Text style={styles.meta}>
            {order.usesHalfUsers && order.peopleJoined >= 2 && partnerDistanceKm != null
              ? `Distance: ${formatDistanceKm(partnerDistanceKm, 1)}`
              : order.usesHalfUsers && order.peopleJoined >= 2
                ? 'Distance: —'
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
        {isHalfCancelled ? (
          <View style={styles.cancelledBanner}>
            <Text style={styles.cancelledBannerText}>This order was cancelled.</Text>
          </View>
        ) : null}
        {detailSource === 'order' &&
        order.usesHalfUsers &&
        alreadyMember &&
        order.peopleJoined < 2 ? (
          <View style={styles.waitingCard}>
            <Text style={styles.waitingTitle}>Waiting for someone to join…</Text>
            <Text style={styles.waitingSub}>
              You will get a notification when someone joins. You can open chat anytime.
            </Text>
            <TouchableOpacity
              style={styles.inviteWhatsAppBtn}
              onPress={handleWhatsAppOrderInvite}
              activeOpacity={0.85}
            >
              <Text style={styles.inviteWhatsAppBtnText}>Invite via WhatsApp</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        {detailSource === 'order' &&
        order.usesHalfUsers &&
        alreadyMember &&
        order.peopleJoined >= 2 &&
        partnerUserId ? (
          <View style={styles.partnerCard}>
            <Text style={styles.partnerSectionTitle}>Other participant</Text>
            <View style={styles.partnerRow}>
              {otherParticipant?.avatar ? (
                <Image
                  source={{ uri: otherParticipant.avatar }}
                  style={styles.partnerAvatar}
                />
              ) : (
                <View style={[styles.partnerAvatar, styles.partnerAvatarPlaceholder]} />
              )}
              <View style={styles.partnerTextCol}>
                <Text style={styles.partnerName}>
                  {otherParticipant?.name ?? 'Order partner'}
                </Text>
                <Text style={styles.partnerMeta}>
                  {partnerDistanceKm != null
                    ? `📍 ${partnerDistanceKm.toFixed(1)} km away`
                    : '📍 Distance unknown'}
                </Text>
              </View>
            </View>
            <View style={styles.actionGrid}>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => router.push(`/chat/${order.id}` as never)}
                activeOpacity={0.85}
              >
                <Text style={styles.actionBtnText}>Chat</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={handleOpenWhatsApp}
                activeOpacity={0.85}
              >
                <Text style={styles.actionBtnText}>WhatsApp</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnDangerOutline]}
                onPress={handleBlockUser}
                disabled={blocking}
                activeOpacity={0.85}
              >
                <Text style={styles.actionBtnDangerText}>
                  {blocking ? '…' : 'Block'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={handleReportUser}
                activeOpacity={0.85}
              >
                <Text style={styles.actionBtnText}>Report</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={styles.inviteWhatsAppBtn}
              onPress={handleWhatsAppOrderInvite}
              activeOpacity={0.85}
            >
              <Text style={styles.inviteWhatsAppBtnText}>Share order invite (WhatsApp)</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.cancelOrderBtn, cancelling && styles.joinButtonDisabled]}
              onPress={handleCancelOrder}
              disabled={cancelling || isHalfCancelled}
              activeOpacity={0.85}
            >
              <Text style={styles.cancelOrderBtnText}>
                {cancelling ? 'Cancelling…' : 'Cancel order'}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}
        {detailSource === 'order' &&
        order.usesHalfUsers &&
        !isHalfCancelled &&
        !(alreadyMember && order.peopleJoined >= 2) ? (
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
  waitingCard: {
    marginTop: 14,
    padding: 16,
    borderRadius: 16,
    backgroundColor: '#141922',
    borderWidth: 1,
    borderColor: '#232A35',
  },
  waitingTitle: { color: '#F8FAFC', fontSize: 17, fontWeight: '800', marginBottom: 6 },
  waitingSub: { color: '#9CA3AF', fontSize: 14, lineHeight: 20 },
  inviteWhatsAppBtn: {
    marginTop: 14,
    backgroundColor: '#14532d',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#22c55e',
  },
  inviteWhatsAppBtnText: { color: '#bbf7d0', fontWeight: '800', fontSize: 15 },
  partnerCard: {
    marginTop: 14,
    padding: 16,
    borderRadius: 16,
    backgroundColor: '#141922',
    borderWidth: 1,
    borderColor: '#232A35',
    gap: 12,
  },
  partnerSectionTitle: { color: '#94A3B8', fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  partnerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  partnerAvatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#1e293b' },
  partnerAvatarPlaceholder: { borderWidth: 1, borderColor: '#334155' },
  partnerTextCol: { flex: 1, gap: 4 },
  partnerName: { color: '#F8FAFC', fontSize: 18, fontWeight: '800' },
  partnerMeta: { color: '#9CA3AF', fontSize: 14 },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 4,
  },
  actionBtn: {
    flexGrow: 1,
    minWidth: '44%',
    backgroundColor: '#1e293b',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  actionBtnText: { color: '#7dd3fc', fontWeight: '800', fontSize: 15 },
  actionBtnDangerOutline: {
    backgroundColor: '#261317',
    borderColor: '#4B1D24',
  },
  actionBtnDangerText: { color: '#FCA5A5', fontWeight: '800', fontSize: 15 },
  cancelOrderBtn: {
    marginTop: 4,
    backgroundColor: '#1c1917',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#44403c',
  },
  cancelOrderBtnText: { color: '#d6d3d1', fontWeight: '800', fontSize: 15 },
});
