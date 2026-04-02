import { isUserBanned } from '@/services/adminGuard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import * as Linking from 'expo-linking';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import AppLogo from '@/components/AppLogo';
import SafeMap, { Marker } from '@/components/SafeMap';
import { TrustScoreLabel } from '@/components/TrustScoreLabel';
import JoinOrderScreen from '@/screens/JoinOrderScreen';
import { useTrustScore } from '@/hooks/useTrustScore';
import { useHiddenUserIds } from '@/hooks/useHiddenUserIds';
import { RateOrderPartnerModal } from '@/components/RateOrderPartnerModal';
import { getRatedUserIdsForOrder } from '@/services/ratings';
import {
  isBlockedByAny,
  reportAndBlock,
} from '@/services/report-block';
import { blockUser, submitUserReport } from '@/services/userSafety';
import {
  formatTorontoDate,
  formatTorontoTime,
  formatTorontoTimeHHMM,
} from '@/lib/format-toronto-time';
import { generateInviteLink, generateOrderShareLink } from '@/lib/invite-link';
import { isMessageSafe, reportBlockedMessage } from '@/services/chatSecurity';
import { checkTaxGift } from '@/services/taxGift';
import { auth, db } from '@/services/firebase';
import { isUserBlocked } from '@/services/block';
import { trackOrderJoined } from '@/services/analytics';
import { ensureOrderChatInitialized } from '@/services/chat';
import {
  ORDER_JOIN_WINDOW_MS,
  ensureParticipantRecordForUid,
  formatOrderCountdown,
  getJoinedAtMsForUser,
  joinOrderWithParticipantRecord,
} from '@/services/orderLifecycle';
import { shadows, theme } from '@/constants/theme';

const c = theme.colors;

type Message = {
  id: string;
  text: string;
  senderId: string;
  userName?: string;
  createdAt: number;
  seenBy: string[];
  type: 'user' | 'system';
};

type OrderState = {
  participants: string[];
  joinedAtMap: unknown;
  status: string;
  createdBy: string;
  allowed: boolean;
  restaurantName: string;
  restaurantLocation: string;
  hostId: string;
  userId?: string;
  userName?: string;
  mealType?: string;
  sharePrice?: number;
  serviceFee?: number;
  whatsappNumber?: string;
  createdAtMs: number | null;
  totalPrice: number | null;
  subtotal?: number | null;
  tax?: number | null;
  restaurantLat: number | null;
  restaurantLng: number | null;
  location: { latitude: number; longitude: number } | null;
  maxPeople: number;
  expiresAtMs: number | null;
} | null;

export default function OrderRoomScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; ref?: string }>();
  const orderId = (params.id ?? '') as string;
  const refParam = params.ref as string | undefined;

  useEffect(() => {
    if (
      refParam?.trim() &&
      orderId &&
      auth.currentUser?.uid !== refParam.trim()
    ) {
      (async () => {
        try {
          const { REFERRAL_ORDER_ID_KEY, REFERRAL_STORAGE_KEY } =
            await import('@/lib/invite-link');
          const AsyncStorage = (
            await import('@react-native-async-storage/async-storage')
          ).default;
          await AsyncStorage.setItem(REFERRAL_STORAGE_KEY, refParam.trim());
          await AsyncStorage.setItem(REFERRAL_ORDER_ID_KEY, orderId);
        } catch {
          // ignore
        }
      })();
    }
  }, [orderId, refParam]);

  const [order, setOrder] = useState<OrderState>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [typingUids, setTypingUids] = useState<Record<string, boolean>>({});
  const [isBlocked, setIsBlocked] = useState(false);
  const [hostName, setHostName] = useState<string>('');
  const [hostPhone, setHostPhone] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [ratingToUserId, setRatingToUserId] = useState<string | null>(null);
  const [pendingRatingUserIds, setPendingRatingUserIds] = useState<string[]>([]);
  const [didAutoPromptRating, setDidAutoPromptRating] = useState(false);
  const [firstOrderCompleted, setFirstOrderCompleted] = useState<
    boolean | null
  >(null);
  const [joiningAsGuest, setJoiningAsGuest] = useState(false);
  const [credits, setCredits] = useState<number>(0);
  const [creditExpiresAt, setCreditExpiresAt] = useState<number | null>(null);
  const [ordersCount, setOrdersCount] = useState<number>(0);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const [completedOrderAlreadyRated, setCompletedOrderAlreadyRated] = useState<
    boolean | null
  >(null);
  // Order chat messages are stored under `orders/{orderId}/messages`.
  const [incomingCall, setIncomingCall] = useState<{
    callId: string;
    callerId: string;
  } | null>(null);
  const [outgoingCallId, setOutgoingCallId] = useState<string | null>(null);
  const [activeCallId, setActiveCallId] = useState<string | null>(null);
  const [endingCall, setEndingCall] = useState(false);
  const [cancellingOrder, setCancellingOrder] = useState(false);
  const hasExpiredRef = useRef(false);
  useEffect(() => {
    hasExpiredRef.current = false;
  }, [orderId]);
  const flatListRef = useRef<FlatList<Message>>(null);
  const lastMessageTimeRef = useRef<number>(0);
  const CHAT_THROTTLE_MS = 2000;
  const hiddenUserIds = useHiddenUserIds();
  const currentUid = auth.currentUser?.uid ?? '';

  const participants = order?.participants ?? [];
  const otherParticipantId =
    participants.length >= 2
      ? (participants.find((id) => id !== auth.currentUser?.uid) ?? null)
      : null;
  const otherTrustScore = useTrustScore(otherParticipantId);
  const isClosed = order?.status === 'closed';
  const isWaiting = participants.length === 1;
  const allowed = order?.allowed ?? false;
  const canChat = allowed && participants.length >= 2;
  const currentUser = auth.currentUser;
  const isOwner = order?.createdBy === currentUser?.uid;
  const canCancel = order?.status === 'open';
  const showCancel = isOwner && canCancel;
  const whatsappNum =
    order?.whatsappNumber?.replace(/\D/g, '') ||
    hostPhone?.replace(/\D/g, '') ||
    '';
  const hasWhatsApp = whatsappNum.length > 0;

  useEffect(() => {
    if (!order || !currentUid) return;
    console.log('ORDER:', order);
    console.log('USER:', currentUid);
  }, [order, currentUid]);

  const setTyping = (value: boolean) => {
    const uid = auth.currentUser?.uid;
    if (!uid || !orderId || !allowed) return;
    const orderRef = doc(db, 'orders', orderId);
    updateDoc(orderRef, { [`typing.${uid}`]: value }).catch(() => {});
  };

  useEffect(() => {
    if (!orderId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    const orderRef = doc(db, 'orders', orderId);

    const unsubOrder = onSnapshot(
      orderRef,
      (orderSnap) => {
        if (cancelled) return;
        if (!orderSnap.exists()) {
          setOrder(null);
          setLoading(false);
          return;
        }
        const d = orderSnap.data();
        const ids: string[] = Array.isArray(d?.participants)
          ? d.participants.filter((x): x is string => typeof x === 'string')
          : [];
        const uid = auth.currentUser?.uid ?? '';
        console.log('UID:', uid);
        console.log('ORDER PARTICIPANTS:', ids);
        const createdRaw = d?.createdAt;
        let createdAtMs: number | null = null;
        if (
          createdRaw &&
          typeof createdRaw === 'object' &&
          typeof createdRaw.toMillis === 'function'
        ) {
          createdAtMs = createdRaw.toMillis();
        } else if (typeof createdRaw === 'number') {
          createdAtMs = createdRaw;
        }
        const restaurantName =
          typeof d?.restaurantName === 'string' &&
          d.restaurantName.trim().length > 0
            ? d.restaurantName
            : 'Not specified';
        const restaurantLocation =
          typeof d?.restaurantLocation === 'string' ? d.restaurantLocation : '';
        const hostId =
          (typeof d?.hostId === 'string' ? d.hostId : null) ??
          (typeof d?.userId === 'string' ? d.userId : '');
        const createdBy =
          typeof d?.createdBy === 'string'
            ? d.createdBy
            : typeof d?.creatorId === 'string'
              ? d.creatorId
              : hostId;
        const userId = typeof d?.userId === 'string' ? d.userId : hostId;
        const userName =
          typeof d?.userName === 'string' ? d.userName : undefined;
        const mealType =
          typeof d?.mealType === 'string' ? d.mealType : undefined;
        const sharePrice =
          typeof d?.sharePrice === 'number' ? d.sharePrice : undefined;
        const serviceFee = typeof d?.serviceFee === 'number' ? d.serviceFee : 0;
        const whatsappNumber =
          typeof d?.whatsappNumber === 'string' ? d.whatsappNumber : undefined;
        const totalPrice =
          typeof d?.totalPrice === 'number' ? d.totalPrice : null;
        const subtotal =
          typeof d?.subtotal === 'number' ? d.subtotal : totalPrice;
        const tax = typeof d?.tax === 'number' ? d.tax : null;
        const restaurantLat =
          typeof d?.restaurantLat === 'number' ? d.restaurantLat : null;
        const restaurantLng =
          typeof d?.restaurantLng === 'number' ? d.restaurantLng : null;
        const loc = d?.location;
        const location =
          loc &&
          typeof loc === 'object' &&
          typeof (loc as { latitude?: unknown }).latitude === 'number' &&
          typeof (loc as { longitude?: unknown }).longitude === 'number'
            ? {
                latitude: (loc as { latitude: number }).latitude,
                longitude: (loc as { longitude: number }).longitude,
              }
            : null;
        const maxPeople =
          typeof d?.maxPeople === 'number' && d.maxPeople >= 1
            ? d.maxPeople
            : 2;
        const expRaw = d?.expiresAt;
        const expiresAtMs =
          typeof expRaw === 'number'
            ? expRaw
            : typeof expRaw?.toMillis === 'function'
              ? expRaw.toMillis()
              : null;
        const typing = d?.typing;
        setOrder({
          participants: ids,
          joinedAtMap: d?.joinedAtMap,
          status: typeof d?.status === 'string' ? d.status : 'open',
          createdBy,
          allowed: uid !== '' && ids.includes(uid),
          restaurantName,
          restaurantLocation,
          hostId,
          userId,
          userName,
          mealType,
          sharePrice,
          serviceFee,
          whatsappNumber,
          createdAtMs,
          totalPrice,
          subtotal: subtotal ?? totalPrice,
          tax,
          restaurantLat,
          restaurantLng,
          location,
          maxPeople,
          expiresAtMs,
        });
        setTypingUids(
          typeof typing === 'object' && typing !== null
            ? (typing as Record<string, boolean>)
            : {},
        );
        setLoading(false);
      },
      () => {
        if (!cancelled) {
          setOrder(null);
          setLoading(false);
        }
      },
    );

    return () => {
      cancelled = true;
      unsubOrder();
    };
  }, [orderId]);

  useEffect(() => {
    const creatorId = order?.hostId || order?.userId;
    if (!creatorId) {
      setHostName('');
      setHostPhone(null);
      return;
    }
    if (order?.userName) {
      setHostName(order.userName);
    }
    const userRef = doc(db, 'users', creatorId);
    const unsubscribe = onSnapshot(
      userRef,
      (snap) => {
        if (!snap.exists()) {
          if (!order?.userName) setHostName('');
          setHostPhone(null);
          return;
        }
        const data = snap.data();
        const displayName =
          typeof data?.displayName === 'string' ? data.displayName : '';
        const phoneNumber =
          typeof data?.phoneNumber === 'string' ? data.phoneNumber : null;
        if (!order?.userName) setHostName(displayName);
        setHostPhone(phoneNumber);
      },
      () => {
        if (!order?.userName) setHostName('');
        setHostPhone(null);
      },
    );
    return () => unsubscribe();
  }, [order?.hostId, order?.userId, order?.userName]);

  // Ensure order chat is initialized (writes only to `orders/{orderId}/messages`).
  useEffect(() => {
    if (!orderId || !canChat) return;
    void ensureOrderChatInitialized(orderId).catch(() => {});
  }, [orderId, canChat]);

  // Real-time messages from orders/{orderId}/messages (updates instantly across devices)
  useEffect(() => {
    if (!orderId?.trim()) {
      setMessages([]);
      return undefined;
    }
    const q = query(
      collection(db, 'orders', orderId, 'messages'),
      orderBy('createdAt', 'asc'),
    );
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        console.log(
          '[OrderRoom] messages snapshot',
          orderId,
          'count',
          snapshot.docs.length,
        );
        const msgs: Message[] = snapshot.docs.map((docSnap) => {
          const d = docSnap.data();
          const created = d?.createdAt?.toMillis?.() ?? d?.createdAt ?? 0;
          const userName =
            typeof d?.senderName === 'string'
              ? d.senderName
              : typeof d?.userName === 'string'
                ? d.userName
                : undefined;
          const senderId =
            typeof d?.senderId === 'string'
              ? d.senderId
              : typeof d?.userId === 'string'
                ? d.userId
                : '';
          const msgType =
            d?.type === 'system' ? ('system' as const) : ('user' as const);
          return {
            id: docSnap.id,
            text: typeof d?.text === 'string' ? d.text : '',
            senderId,
            userName,
            createdAt: Number(created),
            seenBy: [],
            type: msgType,
          };
        });
        const visibleMessages = msgs.filter((m) => {
          if (m.type === 'system') return true;
          if (!m.senderId) return true;
          if (m.senderId === auth.currentUser?.uid) return true;
          return !hiddenUserIds.has(m.senderId);
        });
        setMessages(visibleMessages);
      },
      (err) => {
        console.warn('Messages listener error:', err);
      },
    );
    return () => unsubscribe();
  }, [hiddenUserIds, orderId]);

  const prevMessagesLengthRef = useRef(0);
  useEffect(() => {
    if (
      messages.length > 0 &&
      messages.length !== prevMessagesLengthRef.current
    ) {
      prevMessagesLengthRef.current = messages.length;
      setTimeout(
        () => flatListRef.current?.scrollToEnd({ animated: true }),
        50,
      );
    }
  }, [messages]);

  useEffect(() => {
    const uid = auth.currentUser?.uid ?? '';
    if (!uid || participants.length === 0) return;
    const others = participants.filter((u) => u !== uid);
    isBlockedByAny(uid, others).then(setIsBlocked);
  }, [participants.join(',')]);

  // Incoming voice call listener
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const q = query(
      collection(db, 'calls'),
      where('receiverId', '==', uid),
      where('status', '==', 'ringing'),
    );
    const unsub = onSnapshot(q, (snap) => {
      const first = snap.docs[0];
      if (first) {
        const d = first.data();
        setIncomingCall({ callId: first.id, callerId: d?.callerId ?? '' });
      } else {
        setIncomingCall(null);
      }
    });
    return () => unsub();
  }, [auth.currentUser?.uid]);

  // When caller: listen for callee to accept (status -> active)
  useEffect(() => {
    if (!outgoingCallId) return;
    const unsub = onSnapshot(doc(db, 'calls', outgoingCallId), (snap) => {
      const status = snap.data()?.status;
      if (status === 'active') {
        setActiveCallId(outgoingCallId);
      }
      if (status === 'ended' || status === 'declined') {
        setOutgoingCallId(null);
        setActiveCallId(null);
      }
    });
    return () => unsub();
  }, [outgoingCallId]);

  // When in call: listen for other side to end
  useEffect(() => {
    if (!activeCallId) return;
    const unsub = onSnapshot(doc(db, 'calls', activeCallId), (snap) => {
      const status = snap.data()?.status;
      if (status === 'ended' || status === 'declined') {
        setActiveCallId(null);
        setOutgoingCallId(null);
      }
    });
    return () => unsub();
  }, [activeCallId]);

  // Join window: 45 minutes from `participants[].joinedAt` (fallback: legacy `expiresAt`)
  useEffect(() => {
    if (!order || !orderId) {
      setRemainingMs(null);
      return;
    }
    const uid = auth.currentUser?.uid;
    if (!uid) {
      setRemainingMs(null);
      return;
    }
    const joinedMs = getJoinedAtMsForUser(order.joinedAtMap, uid);
    const updateRemaining = () => {
      const now = Date.now();
      if (joinedMs != null) {
        const remaining = ORDER_JOIN_WINDOW_MS - (now - joinedMs);
        if (remaining <= 0) {
          setRemainingMs(0);
          if (!hasExpiredRef.current && order.status !== 'expired') {
            hasExpiredRef.current = true;
            updateDoc(doc(db, 'orders', orderId), { status: 'expired' }).catch(
              () => {},
            );
          }
        } else {
          setRemainingMs(remaining);
        }
        return;
      }
      if (order.expiresAtMs != null) {
        const remaining = order.expiresAtMs - now;
        if (remaining <= 0) {
          setRemainingMs(0);
          if (!hasExpiredRef.current && order.status !== 'expired') {
            hasExpiredRef.current = true;
            updateDoc(doc(db, 'orders', orderId), { status: 'expired' }).catch(
              () => {},
            );
          }
        } else {
          setRemainingMs(remaining);
        }
        return;
      }
      setRemainingMs(null);
    };
    updateRemaining();
    const id = setInterval(updateRemaining, 1000);
    return () => clearInterval(id);
  }, [
    order?.joinedAtMap,
    order?.expiresAtMs,
    order?.status,
    orderId,
    auth.currentUser?.uid,
  ]);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!orderId || !uid || !order) return;
    if (!order.participants.includes(uid)) return;
    if (
      ['cancelled', 'expired', 'completed', 'closed'].includes(order.status)
    ) {
      return;
    }
    if (
      uid === order.createdBy &&
      order.participants.length === 1
    ) {
      return;
    }
    if (getJoinedAtMsForUser(order.joinedAtMap, uid) != null) return;
    void ensureParticipantRecordForUid(db, orderId, uid);
  }, [
    orderId,
    order?.participants,
    order?.status,
    order?.createdBy,
    order?.joinedAtMap,
  ]);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      setFirstOrderCompleted(null);
      return;
    }
    getDoc(doc(db, 'users', uid))
      .then((snap) => {
        if (!snap.exists()) {
          setFirstOrderCompleted(false);
          setCredits(0);
          setCreditExpiresAt(null);
          setOrdersCount(0);
          return;
        }
        const data = snap.data();
        setFirstOrderCompleted(data?.firstOrderCompleted === true);
        const exp =
          data?.creditExpiresAt?.toMillis?.() ?? data?.creditExpiresAt ?? null;
        const now = Date.now();
        if (exp != null && now > exp) {
          setCredits(0);
          setCreditExpiresAt(null);
        } else {
          setCredits(typeof data?.credits === 'number' ? data.credits : 0);
          setCreditExpiresAt(exp);
        }
        setOrdersCount(
          typeof data?.ordersCount === 'number' ? data.ordersCount : 0,
        );
      })
      .catch(() => {
        setFirstOrderCompleted(null);
        setCredits(0);
        setCreditExpiresAt(null);
        setOrdersCount(0);
      });
  }, [auth.currentUser?.uid]);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (order?.status !== 'completed' || !orderId || !uid) {
      setCompletedOrderAlreadyRated(null);
      setPendingRatingUserIds([]);
      setDidAutoPromptRating(false);
      return;
    }
    let cancelled = false;
    const others = (order.participants ?? []).filter((id) => id !== uid);
    getRatedUserIdsForOrder(orderId, uid).then((ratedSet) => {
      if (cancelled) return;
      const pending = others.filter((id) => !ratedSet.has(id));
      setPendingRatingUserIds(pending);
      setCompletedOrderAlreadyRated(pending.length === 0);
    });
    return () => {
      cancelled = true;
    };
  }, [order?.status, order?.participants, orderId, auth.currentUser?.uid]);

  useEffect(() => {
    if (
      order?.status === 'completed' &&
      !showRatingModal &&
      pendingRatingUserIds.length > 0 &&
      !didAutoPromptRating
    ) {
      setDidAutoPromptRating(true);
      setRatingToUserId(pendingRatingUserIds[0]);
      setShowRatingModal(true);
    }
  }, [order?.status, pendingRatingUserIds, showRatingModal, didAutoPromptRating]);

  useEffect(() => {
    console.log('createdBy:', order?.createdBy);
    console.log('user:', currentUser?.uid);
    console.log('status:', order?.status);
    console.log('showCancel:', showCancel);
  }, [order?.createdBy, currentUser?.uid, order?.status, showCancel]);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (
      !trimmed ||
      !orderId ||
      !allowed ||
      sending ||
      isClosed ||
      isBlocked ||
      isWaiting
    ) {
      if (!trimmed) {
        Alert.alert('Error', 'Message cannot be empty.');
      }
      return;
    }

    const uid = auth.currentUser?.uid ?? '';
    if (!uid) return;
    if (otherParticipantId && (await isUserBlocked(uid, otherParticipantId))) {
      setIsBlocked(true);
      Alert.alert('Blocked', 'You cannot send messages to this user.');
      return;
    }

    const containsLink = /(https?:\/\/|www\.)/i.test(trimmed);
    if (containsLink) {
      Alert.alert('Error', 'Links are not allowed in chat.');
      return;
    }

    const now = Date.now();
    if (now - lastMessageTimeRef.current < CHAT_THROTTLE_MS) {
      Alert.alert('Error', 'Please wait before sending another message.');
      return;
    }

    const check = isMessageSafe(trimmed);
    if (!check.safe) {
      Alert.alert(
        'Message blocked',
        check.reason ?? 'This message is not allowed.',
      );
      await reportBlockedMessage(db, uid, trimmed, check.reason ?? 'blocked');
      return;
    }

    const userName =
      auth.currentUser?.displayName ||
      auth.currentUser?.email?.split('@')[0] ||
      'User';

    if (!orderId) {
      Alert.alert('Error', 'Order not ready. Please try again.');
      return;
    }
    setSending(true);
    try {
      const messagesRef = collection(db, 'orders', orderId, 'messages');
      await addDoc(messagesRef, {
        text: trimmed,
        senderId: uid,
        senderName: userName,
        createdAt: serverTimestamp(),
      });
      lastMessageTimeRef.current = Date.now();
      setText('');
      Keyboard.dismiss();
      setTyping(false);
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message
          : 'Failed to send message. Please try again.';
      Alert.alert('Error', msg);
    } finally {
      setSending(false);
    }
  };

  const handlePressChat = () => {
    if (!canChat) return;
    flatListRef.current?.scrollToEnd({ animated: true });
  };

  const handlePressCall = async () => {
    if (canChat && otherParticipantId) {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      try {
        const callRef = await addDoc(collection(db, 'calls'), {
          callerId: uid,
          receiverId: otherParticipantId,
          status: 'ringing',
          orderId,
          createdAt: serverTimestamp(),
        });
        setOutgoingCallId(callRef.id);
        Alert.alert('Calling', 'Waiting for the other person to accept…');
      } catch (e) {
        Alert.alert(
          'Error',
          e instanceof Error ? e.message : 'Could not start call',
        );
      }
      return;
    }
    if (hostPhone) Linking.openURL(`tel:${hostPhone}`);
  };

  const handleAcceptCall = async () => {
    if (!incomingCall) return;
    const callId = incomingCall.callId;
    setIncomingCall(null);
    try {
      await updateDoc(doc(db, 'calls', callId), { status: 'active' });
      setActiveCallId(callId);
    } catch {
      setActiveCallId(null);
    }
  };

  const handleDeclineCall = async () => {
    if (!incomingCall) return;
    try {
      await updateDoc(doc(db, 'calls', incomingCall.callId), {
        status: 'declined',
      });
    } catch {
      // ignore
    }
    setIncomingCall(null);
  };

  const handleEndCall = async () => {
    const id = activeCallId;
    if (!id) return;
    setEndingCall(true);
    try {
      await updateDoc(doc(db, 'calls', id), { status: 'ended' });
    } catch {
      // ignore
    }
    setActiveCallId(null);
    setOutgoingCallId(null);
    setEndingCall(false);
  };

  const handlePressWhatsApp = () => {
    if (!hasWhatsApp) return;
    const num =
      order?.whatsappNumber?.replace(/\D/g, '') ||
      hostPhone?.replace(/\D/g, '') ||
      '';
    if (!num) return;
    const url = `https://wa.me/${num}`;
    if (Platform.OS === 'web') {
      (window as unknown as { open: (u: string) => void }).open(url, '_blank');
    } else {
      Linking.openURL(url);
    }
  };

  const orderShareLink = generateOrderShareLink(
    orderId,
    auth.currentUser?.uid ?? undefined,
  );
  const orderShareMessage = `🍔 Join my order on HalfOrder\n\nSplit the meal. Pay half.\n\nTap to join:\n${orderShareLink}`;

  const handleInvite = async () => {
    const link = `https://halforder.app/order/${orderId}`;
    const message = `Join my HalfOrder and split this meal 🍕 ${link}`;
    try {
      if (Platform.OS === 'web') {
        if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(message);
          Alert.alert('Copied', 'Invite message copied to clipboard. Share it anywhere!');
        } else {
          Alert.alert('Share', message);
        }
        return;
      }
      await Share.share({
        message,
        title: 'Join my HalfOrder order',
      });
    } catch (error) {
      console.log('Invite error:', error);
      if ((error as { message?: string })?.message !== 'User did not share') {
        Alert.alert('Share', 'Could not open share sheet.');
      }
    }
  };

  const handleInviteViaWhatsApp = async () => {
    const orderLink = `https://halforder.app/join/${orderId}`;
    const restaurantName = order?.restaurantName ?? 'This order';
    const mealType = order?.mealType ?? 'Not specified';
    const sharePrice =
      order?.sharePrice != null ? order.sharePrice.toFixed(2) : '—';
    const message = `Hey! I'm using HalfOrder to share meals and save money.\n\nJoin my order here:\n${orderLink}\n\nRestaurant: ${restaurantName}\nMeal: ${mealType}\nShare price: $${sharePrice}\n\nDownload HalfOrder and join!`;
    const encodedMessage = encodeURIComponent(message);
    const waUrl = `https://wa.me/?text=${encodedMessage}`;

    if (Platform.OS === 'web') {
      (window as unknown as { open: (u: string) => void }).open(
        waUrl,
        '_blank',
      );
      return;
    }
    try {
      await Linking.openURL(waUrl);
    } catch {
      Share.share({
        message,
        title: 'Join my HalfOrder order',
      }).catch(() =>
        Alert.alert(
          'Share',
          'Could not open WhatsApp. You can copy the message from the order screen.',
        ),
      );
    }
  };

  const handleShareOrderWhatsApp = () => {
    if (Platform.OS === 'web') {
      const encoded = encodeURIComponent(orderShareMessage);
      (window as unknown as { open: (u: string) => void }).open(
        `https://wa.me/?text=${encoded}`,
        '_blank',
      );
    } else {
      Share.share({
        message: orderShareMessage,
        title: 'Join my HalfOrder',
      }).catch(() => {
        Linking.openURL(
          `https://wa.me/?text=${encodeURIComponent(orderShareMessage)}`,
        );
      });
    }
  };

  const handleShareOrderSMS = () => {
    if (Platform.OS === 'web') {
      const encoded = encodeURIComponent(orderShareMessage);
      (window as unknown as { open: (u: string) => void }).open(
        `sms:?body=${encoded}`,
        '_self',
      );
    } else {
      Linking.openURL(
        `sms:?body=${encodeURIComponent(orderShareMessage)}`,
      ).catch(() =>
        Share.share({ message: orderShareMessage, title: 'Join my HalfOrder' }),
      );
    }
  };

  const handleCopyOrderLink = () => {
    if (
      Platform.OS === 'web' &&
      typeof navigator !== 'undefined' &&
      navigator.clipboard?.writeText
    ) {
      navigator.clipboard
        .writeText(orderShareLink)
        .then(() => Alert.alert('Copied', 'Link copied to clipboard.'));
    } else {
      Share.share({ message: orderShareLink, title: 'Copy link' })
        .then(() => {})
        .catch(() => Alert.alert('Link', orderShareLink));
    }
  };

  const doCompleteOrder = async () => {
    if (!order) return;
    setCompleting(true);
    try {
      const orderRef = doc(db, 'orders', orderId);
      const ids = order.participants ?? [];
      const [user1Id, user2Id] = ids;
      let user1Name = hostName || order.userName || 'User 1';
      let user2Name = 'User 2';
      let user1Snap: Awaited<ReturnType<typeof getDoc>> | null = null;
      let user2Snap: Awaited<ReturnType<typeof getDoc>> | null = null;
      try {
        user1Snap = await getDoc(doc(db, 'users', user1Id));
        if (user1Snap.exists()) {
          const d = user1Snap.data();
          const name =
            typeof d?.displayName === 'string' ? d.displayName : null;
          if (name) user1Name = name;
        }
        user2Snap = await getDoc(doc(db, 'users', user2Id));
        if (user2Snap.exists()) {
          const d = user2Snap.data();
          const name =
            typeof d?.displayName === 'string' ? d.displayName : null;
          if (name) user2Name = name;
        }
      } catch {
        // use defaults
      }
      // Tax Gift Every 3rd Order: increment both users' ordersCount and determine if this order gets tax gift
      const [taxGiftResult1, taxGiftResult2] = await Promise.all([
        checkTaxGift(user1Id),
        checkTaxGift(user2Id),
      ]);
      const currentUserId = auth.currentUser?.uid ?? '';
      const taxGiftAppliedForCurrentUser =
        currentUserId === user1Id
          ? taxGiftResult1.taxGiftEligible
          : taxGiftResult2.taxGiftEligible;

      await updateDoc(orderRef, { status: 'completed' });
      // Store per-user tax gift flags and a single taxGiftApplied for the order (true if either user got the gift)
      const completedData = {
        orderId,
        restaurantName: order.restaurantName ?? 'Not specified',
        mealType: order.mealType ?? 'N/A',
        totalPrice: order.totalPrice ?? 0,
        sharePrice: order.sharePrice ?? 0,
        user1Name,
        user2Name,
        taxGiftAppliedUser1: taxGiftResult1.taxGiftEligible,
        taxGiftAppliedUser2: taxGiftResult2.taxGiftEligible,
        taxGiftApplied:
          taxGiftResult1.taxGiftEligible || taxGiftResult2.taxGiftEligible,
        createdAt: serverTimestamp(),
        timezone: 'America/Toronto',
      };
      await addDoc(collection(db, 'completedOrders'), completedData);
      const expiry = Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000);
      const user1Data = user1Snap?.exists() ? user1Snap.data() : {};
      const user2Data = user2Snap?.exists() ? user2Snap.data() : {};
      const grantCredits1 = user1Data?.firstOrderCompleted !== true;
      const grantCredits2 = user2Data?.firstOrderCompleted !== true;
      await setDoc(
        doc(db, 'users', user1Id),
        grantCredits1
          ? { firstOrderCompleted: true, credits: 3, creditExpiresAt: expiry }
          : { firstOrderCompleted: true },
        { merge: true },
      );
      await setDoc(
        doc(db, 'users', user2Id),
        grantCredits2
          ? { firstOrderCompleted: true, credits: 3, creditExpiresAt: expiry }
          : { firstOrderCompleted: true },
        { merge: true },
      );
      const messagesSnap = await getDocs(
        collection(db, 'orders', orderId, 'messages'),
      );
      const deletePromises = messagesSnap.docs.map((m) =>
        deleteDoc(doc(db, 'orders', orderId, 'messages', m.id)),
      );
      await Promise.all(deletePromises);
      await deleteDoc(orderRef);
      const dateStr =
        order.createdAtMs != null ? formatTorontoDate(order.createdAtMs) : '—';
      const timeStr =
        order.createdAtMs != null
          ? formatTorontoTimeHHMM(order.createdAtMs)
          : '—';
      const body = `Order ID: ${orderId}\nRestaurant: ${completedData.restaurantName}\nMeal Type: ${completedData.mealType}\nTotal Price: $${completedData.totalPrice}\nShare Price: $${completedData.sharePrice}\nUser 1: ${user1Name}\nUser 2: ${user2Name}\nDate: ${dateStr}\nTime: ${timeStr}\nTimezone: America/Toronto`;
      const mailtoUrl = `mailto:support@halforder.app?subject=${encodeURIComponent('HalfOrder Completed Order')}&body=${encodeURIComponent(body)}`;
      try {
        const canOpen = await Linking.canOpenURL(mailtoUrl);
        if (canOpen) {
          await Linking.openURL(mailtoUrl);
        }
      } catch {
        // ignore
      }
      const numUsers = Math.max(1, order.participants?.length ?? 0);
      const totalForSplit = order.totalPrice ?? 0;
      const subtotalForSplit = order.subtotal ?? order.totalPrice ?? 0;
      const serviceFeeAmt =
        typeof order.serviceFee === 'number' ? order.serviceFee : 0;
      const foodShareVal =
        firstOrderCompleted === false
          ? subtotalForSplit / numUsers
          : totalForSplit / numUsers;
      const totalBeforeCreditsVal = foodShareVal + serviceFeeAmt;
      const effectiveCredits =
        creditExpiresAt != null && Date.now() > creditExpiresAt ? 0 : credits;
      const youPayAmount = Math.max(
        0,
        totalBeforeCreditsVal - effectiveCredits,
      );
      const amountSaved = totalForSplit - youPayAmount;
      const successParams = `totalPrice=${totalForSplit}&saved=${amountSaved.toFixed(2)}&restaurant=${encodeURIComponent(order.restaurantName ?? 'Order')}&taxGiftApplied=${taxGiftAppliedForCurrentUser ? '1' : '0'}`;
      router.replace(
        `/order/success?${successParams}` as Parameters<
          typeof router.replace
        >[0],
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to complete order';
      Alert.alert('Error', msg);
    } finally {
      setCompleting(false);
    }
  };

  const confirmOrderShared = async () => {
    if (!order || order.status !== 'matched' || completing) return;
    setCompleting(true);
    try {
      await doCompleteOrder();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed';
      Alert.alert('Error', msg);
    } finally {
      setCompleting(false);
    }
  };

  const handleRatingSuccess = async () => {
    const ratedTarget = ratingToUserId;
    setShowRatingModal(false);
    setRatingToUserId(null);
    setPendingRatingUserIds((prev) => {
      const next = ratedTarget ? prev.filter((id) => id !== ratedTarget) : prev;
      setCompletedOrderAlreadyRated(next.length === 0);
      return next;
    });
  };

  const handleNotShared = async () => {
    if (!order || order.status !== 'matched' || completing) return;
    setCompleting(true);
    try {
      await updateDoc(doc(db, 'orders', orderId), {
        status: 'cancelled',
        reason: 'Users reported order not shared',
      });
      Alert.alert('Reported', 'Order marked as not shared.');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to update';
      Alert.alert('Error', msg);
    } finally {
      setCompleting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: c.background,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <ActivityIndicator size="large" />
      </SafeAreaView>
    );
  }

  if (!order) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: c.background,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <Text style={{ color: c.textMuted }}>Order not found</Text>
      </SafeAreaView>
    );
  }

  const createdAtDateLabel =
    order.createdAtMs != null ? formatTorontoDate(order.createdAtMs) : '—';
  const createdAtTimeLabel =
    order.createdAtMs != null ? formatTorontoTimeHHMM(order.createdAtMs) : '—';
  const totalLabel =
    order.totalPrice != null ? `$${order.totalPrice.toFixed(2)}` : '—';
  const sharePriceLabel =
    order.sharePrice != null ? `$${order.sharePrice.toFixed(2)}` : '—';
  const participantsCount = order.participants?.length ?? 0;
  const numUsers = Math.max(1, participantsCount);
  const subtotalForSplit = order.subtotal ?? order.totalPrice ?? 0;
  const totalForSplit = order.totalPrice ?? 0;
  const serviceFeeAmount =
    typeof order.serviceFee === 'number' ? order.serviceFee : 0;
  const foodShare =
    firstOrderCompleted === false
      ? subtotalForSplit / numUsers
      : totalForSplit / numUsers;
  // Tax Gift Every 3rd Order: this order qualifies if (ordersCount + 1) % 3 === 0
  const qualifiesForTaxGift = ((ordersCount ?? 0) + 1) % 3 === 0;
  const taxGiftRemaining = ordersCount % 3 === 0 ? 3 : 3 - (ordersCount % 3);

  const totalBeforeCredits = foodShare + serviceFeeAmount;
  const effectiveCredits =
    creditExpiresAt != null && Date.now() > creditExpiresAt ? 0 : credits;
  let youPayAmount = Math.max(0, totalBeforeCredits - effectiveCredits);
  let creditApplied = totalBeforeCredits - youPayAmount;
  if (qualifiesForTaxGift && order.status === 'matched') {
    const foodShareNoTax = (order.subtotal ?? order.totalPrice ?? 0) / numUsers;
    youPayAmount = Math.max(
      0,
      foodShareNoTax + serviceFeeAmount - effectiveCredits,
    );
    creditApplied = effectiveCredits;
  }
  const youPayLabel = `$${youPayAmount.toFixed(2)}`;
  const hostLabel = hostName || order?.userName || 'Host';
  const hostUserId = order?.hostId || order?.userId || null;
  const maxPeople = order.maxPeople ?? 2;
  const isReady = participantsCount >= maxPeople;
  const statusForBadge = order.status.toLowerCase();
  const statusBadgeStyle =
    statusForBadge === 'closed'
      ? styles.statusBadgeClosed
      : isReady || statusForBadge === 'full' || statusForBadge === 'open'
        ? styles.statusBadgeReady
        : styles.statusBadgeWaiting;
  const statusBadgeText =
    statusForBadge === 'closed'
      ? '🔴 Closed'
      : isReady
        ? '🟢 Order is ready'
        : '🟡 Waiting for people to join';
  const orderLat = order.location?.latitude ?? order.restaurantLat ?? null;
  const orderLng = order.location?.longitude ?? order.restaurantLng ?? null;
  const hasLocationCoords =
    typeof orderLat === 'number' && typeof orderLng === 'number';
  const uidForExpiry = auth.currentUser?.uid ?? '';
  const joinedMsForDisplay =
    order && uidForExpiry
      ? getJoinedAtMsForUser(order.joinedAtMap, uidForExpiry)
      : null;
  const joinRemainingForDisplay =
    joinedMsForDisplay != null
      ? ORDER_JOIN_WINDOW_MS - (Date.now() - joinedMsForDisplay)
      : null;

  const isExpired =
    order.status.toLowerCase() === 'expired' ||
    (joinedMsForDisplay != null &&
      (remainingMs ?? joinRemainingForDisplay ?? 0) <= 0) ||
    (order.expiresAtMs != null &&
      joinedMsForDisplay == null &&
      (remainingMs ?? order.expiresAtMs - Date.now()) <= 0);

  let expiryLabel: string | null = null;
  let orderExpiresInLabel: string | null = null;
  if (!isExpired) {
    if (joinedMsForDisplay != null) {
      const ms = remainingMs ?? joinRemainingForDisplay ?? 0;
      if (ms > 0) {
        orderExpiresInLabel = formatOrderCountdown(ms);
        expiryLabel = orderExpiresInLabel;
      }
    } else if (order.expiresAtMs) {
      const ms = remainingMs ?? order.expiresAtMs - Date.now();
      if (ms > 0) {
        const totalSeconds = Math.max(0, Math.floor(ms / 1000));
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        const mmss = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        expiryLabel = `Expires in ${mmss}`;
        orderExpiresInLabel = mmss;
      }
    }
  }
  const urgentMs =
    joinedMsForDisplay != null
      ? (remainingMs ?? joinRemainingForDisplay ?? 0)
      : order.expiresAtMs != null
        ? (remainingMs ?? order.expiresAtMs - Date.now())
        : null;
  const isExpiryUrgent =
    urgentMs != null && !isExpired && urgentMs < 5 * 60 * 1000;
  const timerMessageUnderCardJoin =
    orderExpiresInLabel != null
      ? `Time left: ${orderExpiresInLabel}`
      : null;
  const timerMessageUnderCard = isReady
    ? null
    : isExpired
      ? 'This order has expired.'
      : timerMessageUnderCardJoin;
  const handleCancelOrder = async () => {
    if (!orderId || !showCancel || cancellingOrder) return;
    Alert.alert(
      'Cancel Order',
      'Are you sure you want to cancel this order?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes',
          style: 'destructive',
          onPress: async () => {
            try {
              setCancellingOrder(true);
              await updateDoc(doc(db, 'orders', orderId), {
                status: 'cancelled',
              });
              router.back();
            } catch (e) {
              console.error('Cancel error:', e);
            } finally {
              setCancellingOrder(false);
            }
          },
        },
      ],
    );
  };

  const handleJoinFromLink = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      router.push(
        `/(auth)/login?redirectTo=${encodeURIComponent(`/order/${orderId}`)}` as never,
      );
      return;
    }
    if (await isUserBanned(uid)) {
      Alert.alert(
        'Access denied',
        'Your account has been restricted. You cannot join orders.',
      );
      return;
    }
    if (isExpired) {
      Alert.alert('Order expired', 'This order expired.');
      return;
    }
    const memberIds = order?.participants ?? [];
    const maxPeople = order?.maxPeople ?? 2;
    if (memberIds.length >= maxPeople) {
      Alert.alert(
        'Order full',
        'This order already has the maximum number of participants.',
      );
      return;
    }
    if (memberIds.includes(uid)) {
      return;
    }
    setJoiningAsGuest(true);
    try {
      const displayName =
        auth.currentUser?.displayName ||
        auth.currentUser?.email?.split('@')[0] ||
        'User';
      await joinOrderWithParticipantRecord(
        db,
        orderId,
        uid,
        {
          status: 'matched',
          user2Id: uid,
          user2Name: displayName,
        },
      );
      // Order chat is stored under `orders/{orderId}/messages` (no `chats` doc).
      const { createAlert } = await import('@/services/alerts');
      await createAlert('order_matched', 'Order matched');
      const { incrementGrowthMatches } =
        await import('@/services/growthMetrics');
      await incrementGrowthMatches();
      const messagesRef = collection(db, 'orders', orderId, 'messages');
      await addDoc(messagesRef, {
        senderId: uid,
        senderName: displayName,
        text: 'You joined this shared order',
        createdAt: serverTimestamp(),
        type: 'system',
      });
      // Analytics: user joined an order
      await trackOrderJoined(uid, orderId);
      router.push(`/order/${orderId}` as never);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to join');
    } finally {
      setJoiningAsGuest(false);
    }
  };

  const handleReportOtherUser = () => {
    const uid = auth.currentUser?.uid;
    if (!otherParticipantId || !uid || !orderId) return;
    const reasons = ['Spam', 'Inappropriate behavior', 'Scam', 'Other'] as const;
    Alert.alert('Report user', 'Select a reason', [
      ...reasons.map((reason) => ({
        text: reason,
        onPress: () => {
          void (async () => {
            try {
              await submitUserReport({
                reporterId: uid,
                reportedUserId: otherParticipantId,
                orderId,
                reason,
              });
              Alert.alert('Report submitted');
            } catch (e) {
              Alert.alert(
                'Error',
                e instanceof Error ? e.message : 'Could not submit report.',
              );
            }
          })();
        },
      })),
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleBlockOtherUser = () => {
    const uid = auth.currentUser?.uid;
    if (!otherParticipantId || !uid || !orderId) return;
    Alert.alert(
      'Block user',
      'You will not see each other in join lists and messaging may be limited. You can also report severe issues to HalfOrder.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await blockUser(uid, otherParticipantId);
                Alert.alert('Blocked', 'This user has been blocked.');
                setIsBlocked(true);
              } catch (e) {
                Alert.alert(
                  'Error',
                  e instanceof Error ? e.message : 'Could not block user.',
                );
              }
            })();
          },
        },
      ],
    );
  };

  const handleReportAndBlock = () => {
    const uid = auth.currentUser?.uid;
    if (!otherParticipantId || !uid || !orderId) return;
    Alert.alert(
      'Report and block',
      'Submit a report and block this user. This action cannot be undone from the app.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Report and block',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await reportAndBlock(uid, otherParticipantId, orderId);
                Alert.alert(
                  'Done',
                  'We received your report and blocked this user.',
                );
                setIsBlocked(true);
              } catch (e) {
                Alert.alert(
                  'Error',
                  e instanceof Error ? e.message : 'Something went wrong.',
                );
              }
            })();
          },
        },
      ],
    );
  };

  if (!allowed) {
    return (
      <JoinOrderScreen
        orderId={orderId}
        restaurantName={order?.restaurantName ?? 'This order'}
        onJoin={handleJoinFromLink}
        joining={joiningAsGuest}
        expired={isExpired}
      />
    );
  }

  const orderTitle = hostLabel || order.restaurantName || 'Order';

  return (
    <SafeAreaView
      style={[styles.safeArea, Platform.OS === 'web' && styles.safeAreaWeb]}
      edges={['bottom']}
    >
      <View style={Platform.OS === 'web' ? styles.cardWrapperWeb : styles.cardWrapperNative}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 16,
            paddingBottom: 120,
          }}
          showsVerticalScrollIndicator={false}
        >
          {/* Top section: logo, order title, meal type, map */}
          <View style={{ paddingBottom: 16, alignItems: 'center' }}>
            <AppLogo size={72} marginTop={0} />
          </View>
          <Text
            style={{
              fontSize: 22,
              fontWeight: '700',
              color: c.text,
              marginBottom: 8,
              textAlign: 'center',
            }}
          >
            {orderTitle}
          </Text>
          <Text
            style={{
              fontSize: 16,
              color: c.textSlateDark,
              marginBottom: 12,
              textAlign: 'center',
            }}
          >
            Meal Type: {order.mealType ?? '—'}
          </Text>
          {hasLocationCoords && orderLat != null && orderLng != null ? (
            Platform.OS === 'web' ? (
              <iframe
                width="100%"
                height="200"
                style={{ border: 0, borderRadius: 12 }}
                loading="lazy"
                src={`https://www.google.com/maps?q=${orderLat},${orderLng}&z=15&output=embed`}
              />
            ) : (
              <SafeMap
                style={{ height: 200, borderRadius: 12, marginBottom: 16 }}
                initialRegion={{
                  latitude: orderLat,
                  longitude: orderLng,
                  latitudeDelta: 0.01,
                  longitudeDelta: 0.01,
                }}
              >
                <Marker
                  coordinate={{ latitude: orderLat, longitude: orderLng }}
                />
              </SafeMap>
            )
          ) : null}

          {/* Order details card */}
          <View style={styles.orderMetaCard}>
            {hostUserId ? (
              <TouchableOpacity
                onPress={() =>
                  router.push(
                    {
                      pathname: '/user/[id]',
                      params: { id: hostUserId },
                    } as never,
                  )
                }
                activeOpacity={0.8}
              >
                <Text style={[styles.orderMetaText, styles.hostLinkText]}>
                  Host: {hostLabel}
                </Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.orderMetaText}>Host: {hostLabel}</Text>
            )}
            {otherTrustScore && otherTrustScore.count > 0 ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <TrustScoreLabel
                  average={otherTrustScore.average}
                  count={otherTrustScore.count}
                  tierLabel={otherTrustScore.label}
                  compact
                />
              </View>
            ) : null}
            <Text style={styles.orderMetaSubtext}>
              Meal Type: {order.mealType ?? '—'}
            </Text>
            <Text style={styles.orderMetaSubtext}>Total: {totalLabel}</Text>
            <Text style={styles.orderMetaSubtext}>
              Share Price: {sharePriceLabel}
            </Text>
            <Text style={styles.orderMetaSubtext}>
              Food share: ${foodShare.toFixed(2)}
            </Text>
            <Text style={styles.orderMetaSubtext}>
              Service fee: ${serviceFeeAmount.toFixed(2)}
            </Text>
            <Text style={[styles.orderMetaSubtext, styles.totalToPay]}>
              Total to pay: {youPayLabel}
            </Text>
            {creditApplied > 0 ? (
              <Text style={styles.creditAppliedText}>
                Credit applied: -${creditApplied.toFixed(2)}
              </Text>
            ) : null}
            {firstOrderCompleted === false &&
            (order.subtotal != null || order.tax != null) ? (
              <Text style={styles.taxBenefitText}>
                HalfOrder pays the tax on your first order.
              </Text>
            ) : null}
            {order.status === 'matched' && qualifiesForTaxGift ? (
              <View style={styles.taxGiftBanner}>
                <Text style={styles.taxGiftBannerTitle}>🎉 Congratulations</Text>
                <Text style={styles.taxGiftBannerText}>
                  HalfOrder paid your tax on this order.
                </Text>
              </View>
            ) : null}
            {order.status === 'matched' && !qualifiesForTaxGift ? (
              <View style={styles.taxGiftProgressBox}>
                <Text style={styles.taxGiftProgressText}>
                  {taxGiftRemaining === 1
                    ? 'Only 1 more order to get your tax paid by HalfOrder 🎁'
                    : `Only ${taxGiftRemaining} more orders to get your tax paid by HalfOrder 🎁`}
                </Text>
              </View>
            ) : null}
            {order.status === 'matched' && qualifiesForTaxGift ? (
              <Text style={styles.taxGiftQualifiedText}>
                This order qualifies for a tax gift 🎁
              </Text>
            ) : null}
            <Text style={styles.orderMetaSubtext}>
              Created: {createdAtDateLabel} {createdAtTimeLabel}
            </Text>

            {/* Status indicator: green pill when ready with white text */}
            <View style={[styles.statusBadge, statusBadgeStyle]}>
              <Text
                style={[
                  styles.statusText,
                  isReady && styles.statusTextReady,
                ]}
              >
                {isReady ? 'Order is ready' : statusBadgeText}
              </Text>
            </View>

            {/* Participants */}
            <Text style={styles.participantsText}>
              {participantsCount} / {maxPeople} participants
            </Text>
            {participantsCount >= maxPeople ? (
              <Text style={styles.readyMessage}>Order is ready 🎉</Text>
            ) : null}
            {otherParticipantId && auth.currentUser?.uid ? (
              <View style={styles.safetyActions}>
                <Text style={styles.safetyLabel}>Safety</Text>
                <View style={styles.safetyRow}>
                  <TouchableOpacity
                    style={styles.safetyBtn}
                    onPress={handleReportOtherUser}
                  >
                    <Text style={styles.safetyBtnText}>Report</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.safetyBtn}
                    onPress={handleBlockOtherUser}
                  >
                    <Text style={styles.safetyBtnText}>Block</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.safetyBtn, styles.safetyBtnDanger]}
                    onPress={handleReportAndBlock}
                  >
                    <Text style={styles.safetyBtnTextDanger}>
                      Report & block
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}
          </View>

          {/* 30-minute expiration timer under the card (orange/red) */}
          {timerMessageUnderCard != null ? (
            <View style={styles.timerUnderCard}>
              <Text
                style={[
                  styles.timerUnderCardText,
                  isExpired && styles.timerUnderCardExpired,
                  isExpiryUrgent && !isExpired && styles.timerUnderCardUrgent,
                ]}
              >
                {timerMessageUnderCard}
              </Text>
            </View>
          ) : null}

          {/* Buttons: Chat (yellow), Call (gray), WhatsApp (green) */}
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              gap: 8,
              marginBottom: 12,
            }}
          >
            <TouchableOpacity
              onPress={handlePressChat}
              disabled={!canChat}
              style={{
                flex: 1,
                paddingVertical: 12,
                borderRadius: 10,
                backgroundColor: canChat ? c.primary : c.border,
                alignItems: 'center',
              }}
            >
              <Text
                style={{
                  color: canChat ? c.textOnPrimary : c.textMuted,
                  fontWeight: '600',
                }}
              >
                Chat
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handlePressCall}
              disabled={!canChat && !hostPhone}
              style={{
                flex: 1,
                paddingVertical: 12,
                borderRadius: 10,
                backgroundColor:
                  canChat || hostPhone ? c.textMuted : c.border,
                alignItems: 'center',
                flexDirection: 'row',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              <MaterialIcons
                name="call"
                size={18}
                color={
                  canChat || hostPhone ? c.textOnPrimary : c.text
                }
              />
              <Text
                style={{
                  color:
                    canChat || hostPhone ? c.textOnPrimary : c.text,
                  fontWeight: '600',
                }}
              >
                Call
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handlePressWhatsApp}
              disabled={!hasWhatsApp}
              style={{
                flex: 1,
                paddingVertical: 12,
                borderRadius: 10,
                backgroundColor: hasWhatsApp ? c.whatsapp : c.border,
                alignItems: 'center',
              }}
            >
              <Text
                style={{
                  color: hasWhatsApp ? c.textOnPrimary : c.text,
                  fontWeight: '600',
                }}
              >
                WhatsApp
              </Text>
            </TouchableOpacity>
          </View>

          {/* Large Invite via WhatsApp button (matches screenshot) */}
          <TouchableOpacity
            onPress={handleInviteViaWhatsApp}
            style={{
              marginBottom: 24,
              paddingVertical: 14,
              borderRadius: 10,
              backgroundColor: c.whatsapp,
              alignItems: 'center',
              width: '100%',
            }}
          >
            <Text
              style={{
                color: c.textOnPrimary,
                fontWeight: '600',
                fontSize: 16,
              }}
            >
              Invite via WhatsApp
            </Text>
          </TouchableOpacity>

        </ScrollView>

      {order.status === 'matched' ? (
        <View style={[styles.orderStatusSection, Platform.OS === 'web' && { marginHorizontal: 16 }]}>
          <Text style={styles.orderStatusTitle}>Order Status</Text>
          <View style={styles.orderStatusButtons}>
            <TouchableOpacity
              style={[
                styles.orderSharedButton,
                completing && styles.buttonDisabled,
              ]}
              onPress={confirmOrderShared}
              disabled={completing}
            >
              <Text style={styles.orderStatusButtonText}>Order Shared</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.notSharedButton,
                completing && styles.buttonDisabled,
              ]}
              onPress={handleNotShared}
              disabled={completing}
            >
              <Text style={styles.orderStatusButtonText}>Not Shared</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {order?.status === 'completed' &&
      completedOrderAlreadyRated === false &&
      pendingRatingUserIds.length > 0 ? (
        <View style={[styles.orderStatusSection, Platform.OS === 'web' && { marginHorizontal: 16 }]}>
          <Text style={styles.orderStatusTitle}>Rate other participants</Text>
          <TouchableOpacity
            style={styles.ratePartnerButton}
            onPress={() => {
              setRatingToUserId(pendingRatingUserIds[0]);
              setShowRatingModal(true);
            }}
          >
            <Text style={styles.ratePartnerButtonText}>⭐ Continue rating</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {isWaiting ? (
        <TouchableOpacity
          style={styles.waitingBanner}
          onPress={handleInvite}
          activeOpacity={0.8}
        >
          <Text style={styles.waitingBannerText}>
            Invite someone to split the order 🍔
          </Text>
        </TouchableOpacity>
      ) : null}
      {isBlocked ? (
        <View style={{ padding: 12, backgroundColor: c.dangerBackground }}>
          <Text
            style={{
              fontSize: 14,
              color: c.dangerText,
              textAlign: 'center',
            }}
          >
            You cannot send messages
          </Text>
        </View>
      ) : null}
      {isClosed ? (
        <View style={{ padding: 12, backgroundColor: c.dangerBackground }}>
          <Text
            style={{
              fontSize: 14,
              color: c.dangerText,
              textAlign: 'center',
            }}
          >
            Chat closed
          </Text>
        </View>
      ) : null}
      <View
        style={[
          {
            paddingHorizontal: 16,
            paddingVertical: 8,
            backgroundColor: c.chromeWash,
          },
          Platform.OS === 'web' && { alignSelf: 'center', width: '100%', maxWidth: 420 },
        ]}
      >
        <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'center' }}>
          For your safety do not share personal information or external links.
        </Text>
      </View>
      <KeyboardAvoidingView
        style={[{ flex: 1 }, Platform.OS === 'web' && { maxWidth: 420, alignSelf: 'center', width: '100%' }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {otherParticipantId && auth.currentUser?.uid && canChat ? (
          <View
            style={[
              styles.chatSafetyBar,
              Platform.OS === 'web' && { alignSelf: 'center', maxWidth: 420, width: '100%' },
            ]}
          >
            <TouchableOpacity
              style={styles.chatSafetyBtn}
              onPress={handleReportOtherUser}
              accessibilityRole="button"
              accessibilityLabel="Report this user"
            >
              <MaterialIcons name="flag" size={18} color={c.textSlate} />
              <Text style={styles.chatSafetyBtnText}>Report</Text>
            </TouchableOpacity>
            <View style={styles.chatSafetyDivider} />
            <TouchableOpacity
              style={styles.chatSafetyBtn}
              onPress={handleBlockOtherUser}
              accessibilityRole="button"
              accessibilityLabel="Block this user"
            >
              <MaterialIcons name="block" size={18} color={c.dangerText} />
              <Text style={styles.chatSafetyBtnTextDanger}>Block</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        <FlatList
          ref={flatListRef}
          key={`chat-${orderId}`}
          data={messages}
          extraData={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
          ListEmptyComponent={
            <Text
              style={{
                color: c.iconInactive,
                fontSize: 14,
                textAlign: 'center',
                marginTop: 24,
              }}
            >
              No messages yet. Say hi!
            </Text>
          }
          onContentSizeChange={() =>
            flatListRef.current?.scrollToEnd({ animated: true })
          }
          renderItem={({ item }) => {
            const msgDate = formatTorontoDate(item.createdAt);
            const msgTime = formatTorontoTimeHHMM(item.createdAt);
            if (item.type === 'system') {
              return (
                <View style={{ width: '100%' }}>
                  <View
                    style={{
                      alignSelf: 'center',
                      marginVertical: 8,
                      paddingHorizontal: 8,
                    }}
                  >
                    <Text style={{ fontSize: 13, color: c.textMuted }}>
                      {item.text}
                    </Text>
                    <Text
                      style={{
                        fontSize: 11,
                        color: c.textSecondary,
                        marginTop: 2,
                      }}
                    >
                      {msgDate} {msgTime}
                    </Text>
                  </View>
                </View>
              );
            }
            const isMine = item.senderId === auth.currentUser?.uid;
            const isLast = item.id === messages[messages.length - 1]?.id;
            const showSeen = isLast && item.seenBy.length > 0;
            return (
              <View style={{ width: '100%' }}>
                <View
                  style={{
                    alignSelf: isMine ? 'flex-end' : 'flex-start',
                    maxWidth: '75%',
                    paddingHorizontal: 8,
                    marginBottom: 8,
                  }}
                >
                  {item.userName ? (
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: '600',
                        color: c.text,
                        marginBottom: 2,
                      }}
                    >
                      {item.userName}
                    </Text>
                  ) : null}
                  <View
                    style={{
                      backgroundColor: isMine ? c.chatBubbleMine : c.surface,
                      paddingVertical: 8,
                      paddingHorizontal: 12,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: c.border,
                    }}
                  >
                    <Text style={{ color: c.text, fontSize: 14 }}>
                      {item.text}
                    </Text>
                    <Text
                      style={{
                        color: isMine ? c.textSlateDark : c.textMuted,
                        fontSize: 11,
                        marginTop: 2,
                      }}
                    >
                      {msgDate} {msgTime}
                    </Text>
                    {showSeen ? (
                      <Text
                        style={{
                          color: isMine ? c.textSlateDark : c.textMuted,
                          fontSize: 11,
                          marginTop: 2,
                          opacity: 0.9,
                        }}
                      >
                        Seen
                      </Text>
                    ) : null}
                  </View>
                </View>
              </View>
            );
          }}
        />

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderTopWidth: 1,
            borderTopColor: c.border,
            backgroundColor: c.background,
          }}
        >
          <TextInput
            value={text}
            onChangeText={setText}
            onFocus={() => setTyping(true)}
            onBlur={() => setTyping(false)}
            placeholder="Type a message..."
            placeholderTextColor={c.iconInactive}
            selectionColor={c.accentBlue}
            maxLength={200}
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: c.border,
              borderRadius: 24,
              paddingVertical: 10,
              paddingHorizontal: 16,
              fontSize: 15,
              color: c.textSlateDark,
            }}
            editable={!sending && !isClosed && !isBlocked && !isWaiting}
          />
          <TouchableOpacity
            onPress={handleSend}
            disabled={
              !text.trim() || sending || isClosed || isBlocked || isWaiting
            }
            style={{
              marginLeft: 8,
              backgroundColor:
                text.trim() && !sending && !isClosed && !isBlocked && !isWaiting
                  ? c.accentBlue
                  : c.borderStrong,
              paddingVertical: 10,
              paddingHorizontal: 20,
              borderRadius: 24,
            }}
          >
            <Text style={{ color: c.textOnPrimary, fontWeight: '600' }}>
              Send
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
      </View>

      <Modal
        visible={!!incomingCall}
        transparent
        animationType="fade"
        onRequestClose={() => handleDeclineCall()}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.incomingCallBox}>
            <Text style={styles.incomingCallTitle}>Incoming voice call</Text>
            <Text style={styles.incomingCallSub}>HalfOrder</Text>
            <View style={{ flexDirection: 'row', gap: 24, marginTop: 24 }}>
              <TouchableOpacity
                style={[styles.incomingCallBtn, { backgroundColor: c.danger }]}
                onPress={handleDeclineCall}
              >
                <MaterialIcons name="call-end" size={28} color={c.textOnPrimary} />
                <Text style={styles.incomingCallBtnText}>Decline</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.incomingCallBtn, { backgroundColor: c.success }]}
                onPress={handleAcceptCall}
              >
                <MaterialIcons name="call" size={28} color={c.textOnPrimary} />
                <Text style={styles.incomingCallBtnText}>Accept</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!activeCallId} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.incomingCallBox}>
            <MaterialIcons
              name="call"
              size={48}
              color={c.success}
              style={{ marginBottom: 16 }}
            />
            <Text style={styles.incomingCallTitle}>Voice call in progress</Text>
            <Text style={styles.incomingCallSub}>HalfOrder</Text>
            <TouchableOpacity
              style={[
                styles.incomingCallBtn,
                { backgroundColor: c.danger, marginTop: 24 },
              ]}
              onPress={handleEndCall}
              disabled={endingCall}
            >
              <MaterialIcons name="call-end" size={28} color={c.textOnPrimary} />
              <Text style={styles.incomingCallBtnText}>
                {endingCall ? 'Ending…' : 'End call'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <RateOrderPartnerModal
        visible={showRatingModal}
        orderId={orderId}
        fromUserId={auth.currentUser?.uid ?? null}
        toUserId={ratingToUserId}
        onSuccess={handleRatingSuccess}
        onDismiss={() => {
          setShowRatingModal(false);
          setRatingToUserId(null);
        }}
      />

      {showCancel ? (
        <View
          style={{
            position: 'absolute',
            bottom: 40,
            left: 20,
            right: 20,
          }}
        >
          <TouchableOpacity
            style={{
              backgroundColor: 'red',
              padding: 16,
              borderRadius: 12,
              alignItems: 'center',
              opacity: cancellingOrder ? 0.7 : 1,
            }}
            onPress={handleCancelOrder}
            disabled={cancellingOrder}
          >
            <Text style={{ color: 'white', fontWeight: 'bold' }}>
              {cancellingOrder ? 'Cancelling...' : 'Cancel Order'}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: c.background,
  },
  safeAreaWeb: {
    alignItems: 'center',
  },
  cardWrapperNative: {
    flex: 1,
    width: '100%',
  },
  cardWrapperWeb: {
    flex: 1,
    width: '100%',
    maxWidth: 420,
  },
  orderMetaCard: {
    marginVertical: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.radius.lg,
    marginBottom: theme.spacing.sm,
    backgroundColor: c.white,
    borderWidth: 1,
    borderColor: c.border,
    ...shadows.card,
  },
  orderMetaText: {
    fontSize: 14,
    color: c.text,
  },
  hostLinkText: {
    textDecorationLine: 'underline',
  },
  orderMetaSubtext: {
    fontSize: 13,
    color: c.textMuted,
    marginTop: 4,
  },
  totalToPay: {
    fontWeight: '700',
    color: c.text,
    marginTop: 6,
  },
  taxBenefitText: {
    fontSize: 12,
    color: c.success,
    marginTop: 6,
    fontWeight: '600',
  },
  creditAppliedText: {
    fontSize: 12,
    color: c.success,
    marginTop: 4,
    fontWeight: '600',
  },
  taxGiftBanner: {
    marginTop: 10,
    padding: 14,
    borderRadius: 12,
    backgroundColor: c.successBackground,
    borderWidth: 2,
    borderColor: c.primary,
  },
  taxGiftBannerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: c.successTextDark,
    textAlign: 'center',
  },
  taxGiftBannerText: {
    fontSize: 14,
    color: c.successTextDark,
    marginTop: 4,
    textAlign: 'center',
  },
  taxGiftProgressBox: {
    marginTop: 8,
    padding: 10,
    borderRadius: 8,
    backgroundColor: c.warningBackground,
  },
  taxGiftProgressText: {
    fontSize: 12,
    color: c.warningTextDark,
    textAlign: 'center',
  },
  taxGiftQualifiedText: {
    fontSize: 12,
    color: c.success,
    marginTop: 4,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: c.overlayScrim,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  incomingCallBox: {
    backgroundColor: c.white,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.xl,
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: c.border,
    ...shadows.card,
  },
  incomingCallTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: c.text,
  },
  incomingCallSub: {
    fontSize: 14,
    color: c.textMuted,
    marginTop: 8,
  },
  incomingCallBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  incomingCallBtnText: {
    fontSize: 12,
    color: c.textOnPrimary,
    marginTop: 4,
    fontWeight: '600',
  },
  statusBadge: {
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  statusBadgeWaiting: {
    backgroundColor: c.warningSoft,
  },
  statusBadgeReady: {
    backgroundColor: c.success,
  },
  statusBadgeClosed: {
    backgroundColor: c.dotInactive,
  },
  statusText: {
    fontWeight: '600',
    fontSize: 14,
    color: c.textSlateDark,
  },
  statusTextReady: {
    fontWeight: '600',
    fontSize: 14,
    color: c.textOnPrimary,
  },
  participantsText: {
    fontSize: 16,
    marginTop: 8,
    color: c.text,
  },
  waitingMessage: {
    fontSize: 14,
    marginTop: 4,
    color: c.textMuted,
  },
  readyMessage: {
    fontSize: 14,
    marginTop: 4,
    color: c.success,
    fontWeight: '600',
  },
  waitingBanner: {
    padding: 12,
    marginVertical: 10,
    marginHorizontal: 16,
    borderRadius: 12,
    backgroundColor: c.warningSoft,
  },
  waitingBannerText: {
    fontSize: 15,
    color: c.warningTextDark,
    textAlign: 'center',
    fontWeight: '500',
  },
  orderStatusSection: {
    marginHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.radius.lg,
    backgroundColor: c.white,
    borderWidth: 1,
    borderColor: c.border,
    ...shadows.card,
  },
  orderStatusTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: c.text,
    marginBottom: 12,
  },
  orderStatusButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  orderSharedButton: {
    flex: 1,
    backgroundColor: c.success,
    paddingVertical: 14,
    borderRadius: theme.radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: theme.spacing.touchMin,
  },
  notSharedButton: {
    flex: 1,
    backgroundColor: c.danger,
    paddingVertical: 14,
    borderRadius: theme.radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: theme.spacing.touchMin,
  },
  orderStatusButtonText: {
    color: c.textOnPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  ratePartnerButton: {
    backgroundColor: c.primary,
    paddingVertical: 14,
    borderRadius: theme.radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: theme.spacing.touchMin,
  },
  ratePartnerButtonText: {
    color: c.textOnPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  expiryText: {
    fontSize: 13,
    color: c.warning,
    marginTop: 6,
    fontWeight: '600',
  },
  timerUnderCard: {
    marginBottom: 16,
    alignItems: 'center',
  },
  timerUnderCardText: {
    fontSize: 16,
    fontWeight: '700',
    color: c.timerAccent,
  },
  timerUnderCardUrgent: {
    color: c.danger,
  },
  timerUnderCardExpired: {
    color: c.danger,
  },
  safetyActions: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: c.dotInactive,
  },
  cancelOrderButton: {
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: theme.radius.button,
    backgroundColor: c.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelOrderButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: c.textOnPrimary,
  },
  safetyLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: c.textMuted,
    marginBottom: 8,
  },
  safetyRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  safetyBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: c.surfaceMuted,
    borderWidth: 1,
    borderColor: c.border,
  },
  safetyBtnDanger: {
    backgroundColor: c.dangerBackground,
    borderColor: c.dangerBorder,
  },
  safetyBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: c.textSlateDark,
  },
  safetyBtnTextDanger: {
    fontSize: 13,
    fontWeight: '600',
    color: c.dangerText,
  },
  chatSafetyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: c.surfaceMuted,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  chatSafetyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  chatSafetyBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: c.textSlate,
  },
  chatSafetyBtnTextDanger: {
    fontSize: 14,
    fontWeight: '600',
    color: c.dangerText,
  },
  chatSafetyDivider: {
    width: 1,
    height: 22,
    backgroundColor: c.borderStrong,
  },
});
