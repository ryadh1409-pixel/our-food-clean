import { isUserBanned } from '@/services/adminGuard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  arrayUnion,
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
import AppLogo from '../../components/AppLogo';
import SafeMap, { Marker } from '@/components/SafeMap';
import ShareOrderButton from '@/components/ShareOrderButton';
import { TrustScoreLabel } from '@/components/TrustScoreLabel';
import JoinOrderScreen from '@/screens/JoinOrderScreen';
import { useTrustScore } from '@/hooks/useTrustScore';
import { RateOrderPartnerModal } from '@/components/RateOrderPartnerModal';
import { hasRatedOrder } from '@/services/ratings';
import {
  formatTorontoDate,
  formatTorontoTime,
  formatTorontoTimeHHMM,
} from '@/lib/format-toronto-time';
import { generateInviteLink, generateOrderShareLink } from '@/lib/invite-link';
import { isMessageSafe, reportBlockedMessage } from '@/services/chatSecurity';
import { checkTaxGift } from '@/services/taxGift';
import { auth, db } from '@/services/firebase';
import { trackOrderJoined } from '@/services/analytics';
import { isBlockedByAny } from '@/services/report-block';
import { getOrCreateChat } from '@/services/chat';

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
  participantIds: string[];
  status: string;
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
  const [chatId, setChatId] = useState<string | null>(null);
  const [incomingCall, setIncomingCall] = useState<{
    callId: string;
    callerId: string;
  } | null>(null);
  const [outgoingCallId, setOutgoingCallId] = useState<string | null>(null);
  const [activeCallId, setActiveCallId] = useState<string | null>(null);
  const [endingCall, setEndingCall] = useState(false);
  const hasExpiredRef = useRef(false);
  const flatListRef = useRef<FlatList<Message>>(null);
  const lastMessageTimeRef = useRef<number>(0);
  const CHAT_THROTTLE_MS = 2000;

  const participantIds = order?.participantIds ?? [];
  const otherParticipantId =
    participantIds.length >= 2
      ? (participantIds.find((id) => id !== auth.currentUser?.uid) ?? null)
      : null;
  const otherTrustScore = useTrustScore(otherParticipantId);
  const isClosed = order?.status === 'closed';
  const isWaiting = participantIds.length === 1;
  const allowed = order?.allowed ?? false;
  const canChat = allowed && participantIds.length >= 2;
  const whatsappNum =
    order?.whatsappNumber?.replace(/\D/g, '') ||
    hostPhone?.replace(/\D/g, '') ||
    '';
  const hasWhatsApp = whatsappNum.length > 0;

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
        const ids: string[] = Array.isArray(d?.participantIds)
          ? d.participantIds
          : [];
        const uid = auth.currentUser?.uid ?? '';
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
          participantIds: ids,
          status: typeof d?.status === 'string' ? d.status : 'open',
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

  // Ensure chat exists when order has 2 participants
  useEffect(() => {
    if (!orderId || !canChat || participantIds.length < 2) {
      setChatId(null);
      return;
    }
    let cancelled = false;
    getOrCreateChat(orderId, participantIds)
      .then((id) => {
        if (!cancelled) setChatId(id);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [orderId, canChat, participantIds.join(',')]);

  // Real-time messages from top-level messages collection (chatId)
  useEffect(() => {
    if (!chatId?.trim()) {
      setMessages([]);
      return undefined;
    }
    let cancelled = false;
    const messagesRef = collection(db, 'messages');
    const q = query(
      messagesRef,
      where('chatId', '==', chatId),
      orderBy('createdAt', 'asc'),
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        if (cancelled) return;
        const list: Message[] = snap.docs.map((d) => {
          const d2 = d.data();
          const created = d2?.createdAt?.toMillis?.() ?? d2?.createdAt ?? 0;
          const userName =
            typeof d2?.userName === 'string' ? d2.userName : undefined;
          return {
            id: d.id,
            text: typeof d2?.text === 'string' ? d2.text : '',
            senderId: typeof d2?.senderId === 'string' ? d2.senderId : '',
            userName,
            createdAt: Number(created),
            seenBy: [],
            type: 'user',
          };
        });
        setMessages([...list]);
      },
      (err) => {
        if (!cancelled) console.warn('Messages listener error:', err);
      },
    );

    return () => {
      cancelled = true;
      unsub();
    };
  }, [chatId]);

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
    if (!uid || participantIds.length === 0) return;
    const others = participantIds.filter((u) => u !== uid);
    isBlockedByAny(uid, others).then(setIsBlocked);
  }, [participantIds.join(',')]);

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

  // Countdown timer for order expiration (30-minute window)
  useEffect(() => {
    if (!order?.expiresAtMs) {
      setRemainingMs(null);
      return;
    }
    const updateRemaining = () => {
      const now = Date.now();
      const remaining = order.expiresAtMs! - now;
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
    };
    updateRemaining();
    const id = setInterval(updateRemaining, 1000);
    return () => clearInterval(id);
  }, [order?.expiresAtMs, order?.status, orderId]);

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
      return;
    }
    let cancelled = false;
    hasRatedOrder(orderId, uid).then((already) => {
      if (!cancelled) setCompletedOrderAlreadyRated(already);
    });
    return () => {
      cancelled = true;
    };
  }, [order?.status, orderId, auth.currentUser?.uid]);

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

    if (!chatId) {
      Alert.alert('Error', 'Chat not ready. Please try again.');
      return;
    }
    setSending(true);
    try {
      const messagesRef = collection(db, 'messages');
      await addDoc(messagesRef, {
        chatId,
        senderId: uid,
        text: trimmed,
        userName,
        createdAt: serverTimestamp(),
      });
      const chatRef = doc(db, 'chats', chatId);
      await updateDoc(chatRef, {
        lastMessage: trimmed.slice(0, 100),
        updatedAt: serverTimestamp(),
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

  const handleInviteViaWhatsApp = async () => {
    const orderLink = generateInviteLink(orderId, auth.currentUser?.uid);
    const mealType = order?.mealType ?? 'Not specified';
    const sharePrice =
      order?.sharePrice != null ? order.sharePrice.toFixed(2) : '—';
    const message = `Hey! I'm using HalfOrder to share meals and save money.\nJoin my order here: ${orderLink}\n\nMeal: ${mealType}\nShare price: $${sharePrice}\n\nDownload HalfOrder and join!`;
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
      const ids = order.participantIds ?? [];
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
      const numUsers = Math.max(1, order.participantIds?.length ?? 0);
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
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const ids = order.participantIds ?? [];
    if (ids.length < 2) return;
    const otherId = ids.find((id) => id !== uid) ?? null;
    if (!otherId) return;
    setCompleting(true);
    try {
      const alreadyRated = await hasRatedOrder(orderId, uid);
      if (alreadyRated) {
        await doCompleteOrder();
        return;
      }
      setRatingToUserId(otherId);
      setShowRatingModal(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed';
      Alert.alert('Error', msg);
    } finally {
      setCompleting(false);
    }
  };

  const handleRatingSuccess = async () => {
    setShowRatingModal(false);
    setRatingToUserId(null);
    if (order?.status === 'matched') {
      await doCompleteOrder();
    } else {
      setCompletedOrderAlreadyRated(true);
    }
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
          backgroundColor: '#fff',
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
          backgroundColor: '#fff',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <Text style={{ color: '#64748b' }}>Order not found</Text>
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
  const participantsCount = order.participantIds?.length ?? 0;
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
  const isExpired =
    order.status.toLowerCase() === 'expired' ||
    (order.expiresAtMs != null &&
      (remainingMs ?? order.expiresAtMs - Date.now()) <= 0);

  let expiryLabel: string | null = null;
  if (order.expiresAtMs && !isExpired) {
    const ms = remainingMs ?? order.expiresAtMs - Date.now();
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    expiryLabel = `Expires in ${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

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
    const participantIds = order?.participantIds ?? [];
    const maxPeople = order?.maxPeople ?? 2;
    if (participantIds.length >= maxPeople) {
      Alert.alert(
        'Order full',
        'This order already has the maximum number of participants.',
      );
      return;
    }
    if (participantIds.includes(uid)) {
      return;
    }
    setJoiningAsGuest(true);
    try {
      const orderRef = doc(db, 'orders', orderId);
      const displayName =
        auth.currentUser?.displayName ||
        auth.currentUser?.email?.split('@')[0] ||
        'User';
      await updateDoc(orderRef, {
        status: 'matched',
        participantIds: arrayUnion(uid),
        user2Id: uid,
        user2Name: displayName,
      });
      const newParticipantIds = [...(order?.participantIds ?? []), uid].filter(
        Boolean,
      );
      if (newParticipantIds.length >= 2) {
        getOrCreateChat(orderId, newParticipantIds).catch(() => {});
      }
      const { createAlert } = await import('@/services/alerts');
      await createAlert('order_matched', 'Order matched');
      const { incrementGrowthMatches } =
        await import('@/services/growthMetrics');
      await incrementGrowthMatches();
      const messagesRef = collection(db, 'orders', orderId, 'messages');
      await addDoc(messagesRef, {
        userId: uid,
        userName: displayName,
        text: 'Joined the order',
        createdAt: serverTimestamp(),
        type: 'system',
      });
      // Analytics: user joined an order
      await trackOrderJoined(uid, orderId);
      router.push(`/match/${orderId}` as never);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to join');
    } finally {
      setJoiningAsGuest(false);
    }
  };

  if (!allowed) {
    return (
      <JoinOrderScreen
        orderId={orderId}
        restaurantName={order?.restaurantName ?? 'This order'}
        onJoin={handleJoinFromLink}
        joining={joiningAsGuest}
      />
    );
  }

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: '#fff' }}
      edges={['bottom']}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: 120,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ paddingBottom: 12, alignItems: 'center' }}>
          <AppLogo />
        </View>
        <Text
          style={{
            fontSize: 22,
            fontWeight: '700',
            color: '#000000',
            marginBottom: 8,
          }}
        >
          {order.restaurantName}
        </Text>
        {order.mealType ? (
          <Text style={{ fontSize: 14, color: '#666666', marginBottom: 4 }}>
            Meal Type: {order.mealType}
          </Text>
        ) : null}
        {order.restaurantLocation ? (
          <Text style={{ fontSize: 14, color: '#666666', marginBottom: 8 }}>
            {order.restaurantLocation}
          </Text>
        ) : null}
        {hasLocationCoords && orderLat != null && orderLng != null ? (
          Platform.OS === 'web' ? (
            <iframe
              width="100%"
              height="300"
              style={{ border: 0 }}
              loading="lazy"
              src={`https://www.google.com/maps?q=${orderLat},${orderLng}&z=15&output=embed`}
            />
          ) : (
            <SafeMap
              style={{ height: 200, borderRadius: 12 }}
              initialRegion={{
                latitude: orderLat,
                longitude: orderLng,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
              }}
            >
              <Marker coordinate={{ latitude: orderLat, longitude: orderLng }} />
            </SafeMap>
          )
        ) : null}

        <View style={styles.orderMetaCard}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            <Text style={styles.orderMetaText}>Host: {hostLabel}</Text>
            {otherTrustScore && otherTrustScore.count > 0 ? (
              <TrustScoreLabel
                average={otherTrustScore.average}
                count={otherTrustScore.count}
                showTrusted
                compact
              />
            ) : null}
          </View>
          {order.mealType ? (
            <Text style={styles.orderMetaSubtext}>
              Meal Type: {order.mealType}
            </Text>
          ) : null}
          {isExpired ? (
            <Text style={styles.expiryText}>This order expired</Text>
          ) : expiryLabel ? (
            <Text style={styles.expiryText}>⏱ {expiryLabel}</Text>
          ) : null}
          <Text style={styles.orderMetaSubtext}>Total: {totalLabel}</Text>
          {order.sharePrice != null ? (
            <Text style={styles.orderMetaSubtext}>
              Share Price: {sharePriceLabel}
            </Text>
          ) : null}
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

          <View style={[styles.statusBadge, statusBadgeStyle]}>
            <Text style={styles.statusText}>{statusBadgeText}</Text>
          </View>

          <Text style={styles.participantsText}>
            {participantsCount} / {maxPeople} people joined
          </Text>
          {participantsCount < maxPeople ? (
            <Text style={styles.waitingMessage}>
              Invite someone to split the order 🍔
            </Text>
          ) : (
            <Text style={styles.readyMessage}>Order is ready 🎉</Text>
          )}
        </View>

        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            marginBottom: 12,
          }}
        >
          <TouchableOpacity
            onPress={handlePressChat}
            disabled={!canChat}
            style={{
              flex: 1,
              marginRight: 6,
              paddingVertical: 10,
              borderRadius: 10,
              backgroundColor: canChat ? '#FFD700' : '#E5E5E5',
              alignItems: 'center',
            }}
          >
            <Text
              style={{ color: canChat ? '#000' : '#666', fontWeight: '600' }}
            >
              Chat
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handlePressCall}
            disabled={!canChat && !hostPhone}
            style={{
              flex: 1,
              marginHorizontal: 6,
              paddingVertical: 10,
              borderRadius: 10,
              backgroundColor: canChat || hostPhone ? '#16a34a' : '#E5E5E5',
              alignItems: 'center',
              flexDirection: 'row',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <MaterialIcons
              name="call"
              size={18}
              color={canChat || hostPhone ? '#fff' : '#000'}
            />
            <Text
              style={{
                color: canChat || hostPhone ? '#fff' : '#000',
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
              marginLeft: 6,
              paddingVertical: 10,
              borderRadius: 10,
              backgroundColor: hasWhatsApp ? '#25D366' : '#E5E5E5',
              alignItems: 'center',
            }}
          >
            <Text
              style={{
                color: hasWhatsApp ? '#fff' : '#000',
                fontWeight: '600',
              }}
            >
              WhatsApp
            </Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          onPress={handleInviteViaWhatsApp}
          style={{
            marginBottom: 12,
            paddingVertical: 10,
            borderRadius: 10,
            backgroundColor: '#25D366',
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '600' }}>
            Invite a friend on WhatsApp
          </Text>
        </TouchableOpacity>

        <View
          style={{
            marginTop: 8,
            paddingTop: 12,
            borderTopWidth: 1,
            borderTopColor: '#E5E5E5',
          }}
        >
          <ShareOrderButton
            orderId={orderId}
            restaurantName={order.restaurantName ?? 'this order'}
            variant="buttons"
          />
        </View>
      </ScrollView>

      {order.status === 'matched' ? (
        <View style={styles.orderStatusSection}>
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
      otherParticipantId ? (
        <View style={styles.orderStatusSection}>
          <Text style={styles.orderStatusTitle}>Rate your order partner</Text>
          <TouchableOpacity
            style={styles.ratePartnerButton}
            onPress={() => {
              setRatingToUserId(otherParticipantId);
              setShowRatingModal(true);
            }}
          >
            <Text style={styles.ratePartnerButtonText}>⭐ Rate partner</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {isWaiting ? (
        <View style={styles.waitingBanner}>
          <Text style={styles.waitingBannerText}>
            Invite someone to split the order 🍔
          </Text>
        </View>
      ) : null}
      {isBlocked ? (
        <View style={{ padding: 12, backgroundColor: '#fef2f2' }}>
          <Text style={{ fontSize: 14, color: '#b91c1c', textAlign: 'center' }}>
            You cannot send messages
          </Text>
        </View>
      ) : null}
      {isClosed ? (
        <View style={{ padding: 12, backgroundColor: '#fef2f2' }}>
          <Text style={{ fontSize: 14, color: '#b91c1c', textAlign: 'center' }}>
            Chat closed
          </Text>
        </View>
      ) : null}
      <View
        style={{
          paddingHorizontal: 16,
          paddingVertical: 8,
          backgroundColor: '#f8fafc',
        }}
      >
        <Text style={{ fontSize: 12, color: '#64748b', textAlign: 'center' }}>
          For your safety do not share personal information or external links.
        </Text>
      </View>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <FlatList
          ref={flatListRef}
          key={`chat-${chatId ?? orderId}`}
          data={messages}
          extraData={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
          ListEmptyComponent={
            <Text
              style={{
                color: '#94a3b8',
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
                    <Text style={{ fontSize: 13, color: '#666' }}>
                      {item.text}
                    </Text>
                    <Text style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
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
                        color: '#000',
                        marginBottom: 2,
                      }}
                    >
                      {item.userName}
                    </Text>
                  ) : null}
                  <View
                    style={{
                      backgroundColor: isMine ? '#FFD700' : '#F5F5F5',
                      paddingVertical: 8,
                      paddingHorizontal: 12,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: '#E5E5E5',
                    }}
                  >
                    <Text
                      style={{ color: isMine ? '#000' : '#000', fontSize: 14 }}
                    >
                      {item.text}
                    </Text>
                    <Text
                      style={{
                        color: isMine ? '#333' : '#666',
                        fontSize: 11,
                        marginTop: 2,
                      }}
                    >
                      {msgDate} {msgTime}
                    </Text>
                    {showSeen ? (
                      <Text
                        style={{
                          color: isMine ? '#333' : '#666',
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

        {(() => {
          const uid = auth.currentUser?.uid ?? '';
          const otherTyping = Object.entries(typingUids).some(
            ([u, v]) => u !== uid && v === true,
          );
          return otherTyping ? (
            <View
              style={{
                paddingHorizontal: 16,
                paddingVertical: 6,
                backgroundColor: '#f8fafc',
              }}
            >
              <Text style={{ fontSize: 13, color: '#64748b' }}>
                Someone is typing...
              </Text>
            </View>
          ) : null;
        })()}

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderTopWidth: 1,
            borderTopColor: '#e2e8f0',
            backgroundColor: '#fff',
          }}
        >
          <TextInput
            value={text}
            onChangeText={setText}
            onFocus={() => setTyping(true)}
            onBlur={() => setTyping(false)}
            placeholder="Type a message..."
            placeholderTextColor="#94a3b8"
            selectionColor="#2563eb"
            maxLength={200}
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: '#e2e8f0',
              borderRadius: 24,
              paddingVertical: 10,
              paddingHorizontal: 16,
              fontSize: 15,
              color: '#1e293b',
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
                  ? '#2563eb'
                  : '#cbd5e1',
              paddingVertical: 10,
              paddingHorizontal: 20,
              borderRadius: 24,
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '600' }}>Send</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

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
                style={[styles.incomingCallBtn, { backgroundColor: '#ef4444' }]}
                onPress={handleDeclineCall}
              >
                <MaterialIcons name="call-end" size={28} color="#fff" />
                <Text style={styles.incomingCallBtnText}>Decline</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.incomingCallBtn, { backgroundColor: '#22c55e' }]}
                onPress={handleAcceptCall}
              >
                <MaterialIcons name="call" size={28} color="#fff" />
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
              color="#22c55e"
              style={{ marginBottom: 16 }}
            />
            <Text style={styles.incomingCallTitle}>Voice call in progress</Text>
            <Text style={styles.incomingCallSub}>HalfOrder</Text>
            <TouchableOpacity
              style={[
                styles.incomingCallBtn,
                { backgroundColor: '#ef4444', marginTop: 24 },
              ]}
              onPress={handleEndCall}
              disabled={endingCall}
            >
              <MaterialIcons name="call-end" size={28} color="#fff" />
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  orderMetaCard: {
    marginVertical: 10,
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  orderMetaText: {
    fontSize: 14,
    color: '#000000',
  },
  orderMetaSubtext: {
    fontSize: 13,
    color: '#666666',
    marginTop: 4,
  },
  totalToPay: {
    fontWeight: '700',
    color: '#000000',
    marginTop: 6,
  },
  taxBenefitText: {
    fontSize: 12,
    color: '#16a34a',
    marginTop: 6,
    fontWeight: '600',
  },
  creditAppliedText: {
    fontSize: 12,
    color: '#16a34a',
    marginTop: 4,
    fontWeight: '600',
  },
  taxGiftBanner: {
    marginTop: 10,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#D4EDDA',
    borderWidth: 2,
    borderColor: '#FFD700',
  },
  taxGiftBannerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#155724',
    textAlign: 'center',
  },
  taxGiftBannerText: {
    fontSize: 14,
    color: '#155724',
    marginTop: 4,
    textAlign: 'center',
  },
  taxGiftProgressBox: {
    marginTop: 8,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#FFF8E7',
  },
  taxGiftProgressText: {
    fontSize: 12,
    color: '#856404',
    textAlign: 'center',
  },
  taxGiftQualifiedText: {
    fontSize: 12,
    color: '#16a34a',
    marginTop: 4,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  incomingCallBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 32,
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
  },
  incomingCallTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  incomingCallSub: {
    fontSize: 14,
    color: '#64748b',
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
    color: '#fff',
    marginTop: 4,
    fontWeight: '600',
  },
  statusBadge: {
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  statusBadgeWaiting: {
    backgroundColor: '#FEF3C7', // waiting / orange
  },
  statusBadgeReady: {
    backgroundColor: '#DCFCE7', // matched / green
  },
  statusBadgeClosed: {
    backgroundColor: '#E5E7EB', // neutral grey
  },
  statusText: {
    fontWeight: '600',
    fontSize: 14,
    color: '#1e293b',
  },
  participantsText: {
    fontSize: 16,
    marginTop: 8,
    color: '#0f172a',
  },
  waitingMessage: {
    fontSize: 14,
    marginTop: 4,
    color: '#64748b',
  },
  readyMessage: {
    fontSize: 14,
    marginTop: 4,
    color: '#16a34a',
    fontWeight: '600',
  },
  waitingBanner: {
    padding: 12,
    marginVertical: 10,
    marginHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#fef3c7',
  },
  waitingBannerText: {
    fontSize: 15,
    color: '#92400e',
    textAlign: 'center',
    fontWeight: '500',
  },
  orderStatusSection: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  orderStatusTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000000',
    marginBottom: 12,
  },
  orderStatusButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  orderSharedButton: {
    flex: 1,
    backgroundColor: '#22c55e',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  notSharedButton: {
    flex: 1,
    backgroundColor: '#ef4444',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  orderStatusButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  ratePartnerButton: {
    backgroundColor: '#FFD700',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  ratePartnerButtonText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  expiryText: {
    fontSize: 13,
    color: '#F59E0B',
    marginTop: 6,
    fontWeight: '600',
  },
});
