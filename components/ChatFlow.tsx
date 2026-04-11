/**
 * AI-guided ordering: backend decisions + Google Places (or mock) + forward-only UI.
 */
import { PizzaItem } from '@/components/PizzaItem';
import {
  RestaurantCard,
  restaurantCardKeyExtractor,
} from '@/components/RestaurantCard';
import { theme } from '@/constants/theme';
import {
  getAiChatUrl,
  sendMessageToAI as fetchAiDecision,
  type AiDecision,
} from '@/services/aiBackendDecision';
import {
  getNearbyRestaurantsWithCoords,
  matchPlaceRestaurantByName,
  PLACE_IMAGE_FALLBACK,
  type PlaceRestaurant,
} from '@/services/googlePlaces';
import { POPULAR_PIZZAS, type LatLng } from '@/services/api';
import { acceptGroupOrderNotice } from '@/services/groupOrderNotice';
import { auth, db } from '@/services/firebase';
import {
  groupDocFromSnapshot,
  leaveGroup,
  markGroupOrdered,
  smartMatch,
  type GroupDoc,
} from '@/services/groupMatching';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Image } from 'expo-image';
import * as Linking from 'expo-linking';
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import {
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  type ListRenderItemInfo,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

const c = theme.colors;

const INACTIVITY_MS = 5000;

const PIZZA_TYPES = [
  { id: 'pepperoni', label: 'Pepperoni' },
  { id: 'margherita', label: 'Margherita' },
  { id: 'veggie', label: 'Veggie' },
] as const;

const FALLBACK_LOC: LatLng = { lat: 43.6532, lng: -79.3832 };

const GROUP_WAIT_MS = 60_000;

export type ChatFlowLocation = {
  lat: number;
  lng: number;
  label?: string | null;
};

export type GuidedOrderContext = {
  location: LatLng;
  locationLabel: string;
  pizzaType: string;
  restaurant: PlaceRestaurant | null;
};

/** Core guided steps from product spec */
export type CoreFlowStep = 'chat' | 'pizzaType' | 'restaurants';

/** Core steps + location, loading, menu, checkout, WhatsApp */
export type FlowStep =
  | 'need_location'
  | CoreFlowStep
  | 'loading_rests'
  | 'recommended'
  | 'menu'
  | 'pick_action'
  | 'share_whatsapp'
  | 'order_cta';

export type RecommendedPick = {
  name: string;
  food: string;
  price: number;
  image: string;
};

type ThreadLine =
  | { id: string; kind: 'assistant'; text: string }
  | { id: string; kind: 'user'; text: string };

export type ChatFlowProps = {
  userLocation: ChatFlowLocation | null;
  onOrderNow: (ctx: GuidedOrderContext) => void;
};

export function ChatFlow({ userLocation, onOrderNow }: ChatFlowProps) {
  const [step, setStep] = useState<FlowStep>('need_location');
  const [savedLoc, setSavedLoc] = useState<LatLng | null>(null);
  const [locationLabel, setLocationLabel] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('');
  const [manualArea, setManualArea] = useState('');
  const [thread, setThread] = useState<ThreadLine[]>([]);
  const [pizzaType, setPizzaType] = useState<string | null>(null);
  const [restaurants, setRestaurants] = useState<PlaceRestaurant[]>([]);
  const [pickedRestaurant, setPickedRestaurant] =
    useState<PlaceRestaurant | null>(null);
  const [showSplit, setShowSplit] = useState(false);
  const [loadingRests, setLoadingRests] = useState(false);
  const [nudgeVisible, setNudgeVisible] = useState(false);
  const [aiInput, setAiInput] = useState('');
  const [aiSending, setAiSending] = useState(false);
  const [recommended, setRecommended] = useState<RecommendedPick | null>(null);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [groupLive, setGroupLive] = useState<GroupDoc | null>(null);
  const [groupTimedOut, setGroupTimedOut] = useState(false);

  const lastInteractRef = useRef(Date.now());
  const nudgeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const didStartFromProfileLoc = useRef(false);
  const groupWaitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const groupJoinStartedAtRef = useRef<number | null>(null);
  const groupWelcomePrevCountRef = useRef(-1);
  const groupAlmostFullPushedRef = useRef(false);
  const groupCoordinationReminderSentRef = useRef(false);
  const pendingGroupLocRef = useRef<{ lat: number; lng: number } | null>(null);
  const groupPulse = useRef(new Animated.Value(1)).current;

  const [groupJoinModalVisible, setGroupJoinModalVisible] = useState(false);
  const [groupJoining, setGroupJoining] = useState(false);

  const aiChatUrl = getAiChatUrl();

  const bumpInteraction = useCallback(() => {
    lastInteractRef.current = Date.now();
    setNudgeVisible(false);
  }, []);

  const pushAssistant = useCallback((text: string) => {
    setThread((prev) => [
      ...prev,
      { id: `${Date.now()}-a-${Math.random()}`, kind: 'assistant', text },
    ]);
  }, []);

  const pushUser = useCallback((text: string) => {
    setThread((prev) => [
      ...prev,
      { id: `${Date.now()}-u-${Math.random()}`, kind: 'user', text },
    ]);
  }, []);

  const addMessage = useCallback(
    (text: string) => {
      bumpInteraction();
      pushAssistant(text);
    },
    [bumpInteraction, pushAssistant],
  );

  const handleDecision = useCallback(
    (decision: AiDecision) => {
      if (decision.reason === 'price_high') {
        addMessage('This is a bit expensive 👀 want to split it?');
        setShowSplit(true);
      }
      if (decision.intent === 'order_food') {
        setStep('pizzaType');
        pushAssistant('Pick a pizza style below.');
      }
      if (decision.intent === 'ask_location') {
        addMessage('Where are you? 📍');
        setStep('need_location');
      }
      if (decision.suggest_split && decision.intent !== 'recommend_order') {
        setShowSplit(true);
      }
      if (decision.intent === 'fallback' && decision.message) {
        addMessage(decision.message);
      }
    },
    [addMessage, pushAssistant],
  );

  const applyRecommendOrder = useCallback(
    async (decision: AiDecision) => {
      const aiRest =
        typeof decision.restaurant === 'string' ? decision.restaurant.trim() : '';
      const food =
        typeof decision.food === 'string' && decision.food.trim()
          ? decision.food.trim()
          : 'Chef’s pick';
      const price =
        typeof decision.estimated_price === 'number' && !Number.isNaN(decision.estimated_price)
          ? decision.estimated_price
          : 18.99;

      const locText =
        selectedLocation.trim() ||
        locationLabel.trim() ||
        manualArea.trim() ||
        'Toronto';

      setShowSplit(false);
      setActiveGroupId(null);
      setGroupLive(null);
      setGroupTimedOut(false);
      pendingGroupLocRef.current = null;
      groupJoinStartedAtRef.current = null;
      if (groupWaitTimerRef.current) {
        clearTimeout(groupWaitTimerRef.current);
        groupWaitTimerRef.current = null;
      }
      setLoadingRests(true);
      setStep('loading_rests');

      try {
        const { restaurants: rows, coords } = await getNearbyRestaurantsWithCoords(
          locText,
          'pizza',
        );
        setRestaurants(rows);
        if (coords) setSavedLoc(coords);
        else setSavedLoc(FALLBACK_LOC);

        const matched =
          rows.length > 0 ? matchPlaceRestaurantByName(rows, aiRest) : null;
        const image = matched?.image ?? PLACE_IMAGE_FALLBACK;
        const displayName = matched?.name ?? (aiRest || 'Nearby spot');

        const placeForOrder: PlaceRestaurant = matched ?? {
          id: `ai-${Date.now()}`,
          name: displayName,
          rating: 4.2,
          image,
        };

        setPickedRestaurant(placeForOrder);
        setPizzaType(food);
        setRecommended({
          name: displayName,
          food,
          price,
          image,
        });

        if (decision.suggest_split) {
          addMessage('This is a bit pricey 👀 want to split it?');
          setShowSplit(true);
        }

        const locForMatch = coords
          ? { lat: coords.lat, lng: coords.lng }
          : FALLBACK_LOC;
        pendingGroupLocRef.current = locForMatch;

        setStep('recommended');
        setTimeout(() => {
          pushAssistant('Ready to order or want to share?');
        }, 450);
      } catch {
        pushAssistant('Couldn’t load a photo — try again.');
        setStep('chat');
      } finally {
        setLoadingRests(false);
      }
    },
    [
      addMessage,
      locationLabel,
      manualArea,
      pushAssistant,
      selectedLocation,
    ],
  );

  const sendMessageToAI = useCallback(
    async (message: string) => {
      const url = getAiChatUrl();
      if (!url?.trim()) return;
      const trimmed = message.trim();
      if (!trimmed) return;

      bumpInteraction();
      pushUser(trimmed);
      setAiInput('');
      setAiSending(true);
      try {
        const result = await fetchAiDecision(trimmed, url);
        if (!result.ok) {
          pushAssistant(`Assistant error: ${result.error}`);
          return;
        }
        if (result.decision.intent === 'recommend_order') {
          await applyRecommendOrder(result.decision);
          return;
        }
        handleDecision(result.decision);
      } finally {
        setAiSending(false);
      }
    },
    [applyRecommendOrder, bumpInteraction, handleDecision, pushAssistant, pushUser],
  );

  const startAfterLocation = useCallback(
    (loc: LatLng, label: string, areaText: string) => {
      bumpInteraction();
      setSavedLoc(loc);
      setLocationLabel(label);
      setSelectedLocation(areaText.trim() || label);
      pushAssistant(`Got it 📍 ${label}. Let’s get you some pizza 🍕`);
      if (aiChatUrl) {
        setStep('chat');
        pushAssistant('Tell me what you want — I’ll guide you to real spots nearby.');
      } else {
        setStep('pizzaType');
      }
    },
    [aiChatUrl, bumpInteraction, pushAssistant],
  );

  useLayoutEffect(() => {
    if (!userLocation?.lat || !userLocation?.lng) return;
    if (didStartFromProfileLoc.current) return;
    didStartFromProfileLoc.current = true;
    const label = userLocation.label?.trim() || 'Near you';
    const area = userLocation.label?.trim() || 'Near you';
    startAfterLocation(
      { lat: userLocation.lat, lng: userLocation.lng },
      label,
      area,
    );
  }, [userLocation, startAfterLocation]);

  useEffect(() => {
    nudgeTimerRef.current = setInterval(() => {
      if (step === 'need_location' || step === 'order_cta') return;
      const idle = Date.now() - lastInteractRef.current;
      if (idle >= INACTIVITY_MS) setNudgeVisible(true);
    }, 800);
    return () => {
      if (nudgeTimerRef.current) clearInterval(nudgeTimerRef.current);
    };
  }, [step]);

  useEffect(() => {
    if (!activeGroupId) {
      setGroupLive(null);
      return;
    }
    const ref = doc(db, 'groups', activeGroupId);
    const unsub = onSnapshot(ref, (snap) => {
      if (!snap.exists()) {
        setGroupLive(null);
        setActiveGroupId(null);
        const u = auth.currentUser?.uid;
        if (u) {
          void setDoc(doc(db, 'users', u), { groupId: null }, { merge: true });
        }
        return;
      }
      setGroupLive(
        groupDocFromSnapshot(snap.id, snap.data() as Record<string, unknown>),
      );
    });
    return () => unsub();
  }, [activeGroupId]);

  useEffect(() => {
    groupWelcomePrevCountRef.current = -1;
    groupAlmostFullPushedRef.current = false;
    groupCoordinationReminderSentRef.current = false;
  }, [activeGroupId]);

  useEffect(() => {
    if (step !== 'recommended' || !activeGroupId || !groupLive) return;
    const m = groupLive.members.length;
    const prev = groupWelcomePrevCountRef.current;
    if (m === prev) return;
    if (prev === -1) {
      if (m === 1) {
        pushAssistant('🍕 Starting a new group...');
      } else {
        pushAssistant('🔥 Fast group found — almost ready!');
      }
      groupWelcomePrevCountRef.current = m;
      return;
    }
    if (prev === 1 && m >= 2) {
      pushAssistant('🔥 Fast group found — almost ready!');
    }
    groupWelcomePrevCountRef.current = m;
  }, [step, activeGroupId, groupLive, pushAssistant]);

  useEffect(() => {
    if (step !== 'recommended' || !groupLive || !activeGroupId) return;
    if (groupLive.members.length < 2) return;
    if (groupCoordinationReminderSentRef.current) return;
    groupCoordinationReminderSentRef.current = true;
    pushAssistant(
      'Reminder: Please coordinate payment and pickup with your group.',
    );
  }, [step, activeGroupId, groupLive, pushAssistant]);

  useEffect(() => {
    if (step !== 'recommended' || !groupLive || !activeGroupId) return;
    const m = groupLive.members.length;
    if (m === 3 && !groupAlmostFullPushedRef.current) {
      groupAlmostFullPushedRef.current = true;
      pushAssistant('⚡ Almost full — don’t miss it!');
    }
    if (m !== 3) groupAlmostFullPushedRef.current = false;
  }, [step, activeGroupId, groupLive, pushAssistant]);

  useEffect(() => {
    if (step !== 'recommended' || !groupLive) return;
    if (
      groupLive.members.length >= 4 ||
      groupLive.status === 'full' ||
      groupTimedOut
    ) {
      groupPulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(groupPulse, {
          toValue: 0.72,
          duration: 850,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(groupPulse, {
          toValue: 1,
          duration: 850,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
      groupPulse.setValue(1);
    };
  }, [step, groupLive, groupTimedOut, groupPulse]);

  useEffect(() => {
    if (!activeGroupId || step !== 'recommended') return;
    if (groupLive && (groupLive.members.length >= 4 || groupLive.status === 'full')) {
      setGroupTimedOut(false);
      return;
    }
    const started = groupJoinStartedAtRef.current;
    if (started == null) return;
    const elapsed = Date.now() - started;
    const remaining = Math.max(0, GROUP_WAIT_MS - elapsed);
    const t = setTimeout(() => setGroupTimedOut(true), remaining);
    return () => clearTimeout(t);
  }, [activeGroupId, step, groupLive]);

  const handleManualLocation = () => {
    const label = manualArea.trim() || 'Your area';
    didStartFromProfileLoc.current = true;
    setSelectedLocation(manualArea.trim() || label);
    startAfterLocation(FALLBACK_LOC, label, manualArea.trim() || label);
  };

  const handlePickPizzaType = async (id: string, label: string) => {
    const locText =
      selectedLocation.trim() ||
      locationLabel.trim() ||
      manualArea.trim() ||
      'Toronto';
    bumpInteraction();
    setPizzaType(id);
    pushUser(label);
    setStep('loading_rests');
    setLoadingRests(true);
    setShowSplit(false);
    pushAssistant('Finding real spots near you with photos…');
    try {
      const { restaurants: rows, coords } = await getNearbyRestaurantsWithCoords(
        locText,
        'pizza',
      );
      setRestaurants(rows);
      if (coords) setSavedLoc(coords);
      if (rows.length === 0) {
        pushAssistant('No places found — try a different area in your profile or above.');
        setStep('pizzaType');
      } else {
        pushAssistant('Here’s what’s close — tap a restaurant.');
        setStep('restaurants');
      }
    } catch {
      pushAssistant('Couldn’t load restaurants — try again.');
      setStep('pizzaType');
    } finally {
      setLoadingRests(false);
    }
  };

  const handleSelectRestaurant = useCallback(
    (r: PlaceRestaurant) => {
      bumpInteraction();
      setPickedRestaurant(r);
      pushUser(r.name);
      pushAssistant('Nice choice 😎 Here’s what people love:');
      setStep('menu');
      setTimeout(() => {
        pushAssistant('What do you want to do?');
        setStep('pick_action');
      }, 400);
    },
    [bumpInteraction, pushAssistant, pushUser],
  );

  const handleOrderNow = () => {
    if (!savedLoc || !pizzaType || !pickedRestaurant) return;
    bumpInteraction();
    pushUser('Order now 🛒');
    pushAssistant('Opening checkout — you’re almost there.');
    setStep('order_cta');
    onOrderNow({
      location: savedLoc,
      locationLabel,
      pizzaType,
      restaurant: pickedRestaurant,
    });
  };

  const handleShareSplit = () => {
    bumpInteraction();
    pushUser('Share & split 🤝');
    pushAssistant(
      'Invite a friend via WhatsApp to complete your order faster ⚡',
    );
    setStep('share_whatsapp');
  };

  const openWhatsAppInvite = () => {
    bumpInteraction();
    const text = 'Join my order on HalfOrder';
    void Linking.openURL(
      `https://wa.me/?text=${encodeURIComponent(text)}`,
    );
    pushAssistant('Shared — finish with Order now 🛒 when you’re ready.');
  };

  const openSplitBannerWhatsApp = () => {
    bumpInteraction();
    void Linking.openURL('https://wa.me/?text=Join%20my%20order%20on%20HalfOrder');
  };

  const handleLeaveGroup = useCallback(async () => {
    const me = auth.currentUser?.uid;
    if (!me || !activeGroupId) return;
    bumpInteraction();
    try {
      await leaveGroup(me, activeGroupId);
    } catch {
      /* ignore */
    }
    setActiveGroupId(null);
    setGroupLive(null);
    setGroupTimedOut(false);
  }, [activeGroupId, bumpInteraction]);

  const handleGroupReadyOrder = () => {
    if (activeGroupId) {
      void markGroupOrdered(activeGroupId).catch(() => {});
    }
    handleOrderNow();
  };

  const handleTimeoutOrderAlone = async () => {
    const me = auth.currentUser?.uid;
    bumpInteraction();
    if (me && activeGroupId) {
      try {
        await leaveGroup(me, activeGroupId);
      } catch {
        /* ignore */
      }
    }
    setActiveGroupId(null);
    setGroupLive(null);
    setGroupTimedOut(false);
    handleOrderNow();
  };

  const handlePressJoinGroup = useCallback(() => {
    bumpInteraction();
    const uid = auth.currentUser?.uid;
    if (!uid) {
      pushAssistant('Sign in to join a group.');
      return;
    }
    if (!pendingGroupLocRef.current) {
      pushAssistant('Location isn’t ready — pick an area first.');
      return;
    }
    setGroupJoinModalVisible(true);
  }, [bumpInteraction, pushAssistant]);

  const handleConfirmGroupJoin = useCallback(async () => {
    const uid = auth.currentUser?.uid;
    const loc = pendingGroupLocRef.current;
    if (!uid || !loc) {
      setGroupJoinModalVisible(false);
      return;
    }
    setGroupJoining(true);
    try {
      await acceptGroupOrderNotice(uid);
      const gid = await smartMatch({
        id: uid,
        preferredFood: 'pizza',
        location: loc,
      });
      setActiveGroupId(gid);
      groupJoinStartedAtRef.current = Date.now();
      setGroupTimedOut(false);
      setGroupJoinModalVisible(false);
    } catch {
      pushAssistant(
        'Couldn’t join a group right now — try again or use Order now.',
      );
      setActiveGroupId(null);
    } finally {
      setGroupJoining(false);
    }
  }, [pushAssistant]);

  const suggestPopularPizza = () => {
    bumpInteraction();
    setNudgeVisible(false);
    pushAssistant(
      'Try a classic: Pepperoni — tap it above to see real restaurants.',
    );
    if (step === 'chat' || step === 'need_location') setStep('pizzaType');
  };

  const renderRestaurant = useCallback(
    ({ item }: ListRenderItemInfo<PlaceRestaurant>) => (
      <RestaurantCard item={item} onSelect={handleSelectRestaurant} />
    ),
    [handleSelectRestaurant],
  );

  const showJoinGroupCta =
    step === 'recommended' && recommended && !activeGroupId;

  return (
    <>
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <MaterialIcons name="restaurant" size={20} color="#6EE7B7" />
        <Text style={styles.headerTitle}>Guided order</Text>
      </View>

      <ScrollView
        style={styles.thread}
        contentContainerStyle={styles.threadContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      >
        {thread.map((line) => (
          <View
            key={line.id}
            style={[
              styles.bubbleRow,
              line.kind === 'user' ? styles.bubbleRowUser : styles.bubbleRowBot,
            ]}
          >
            <View
              style={[
                styles.bubble,
                line.kind === 'user' ? styles.bubbleUser : styles.bubbleBot,
              ]}
            >
              <Text
                style={
                  line.kind === 'user' ? styles.bubbleTextUser : styles.bubbleTextBot
                }
              >
                {line.text}
              </Text>
            </View>
          </View>
        ))}

        {step === 'need_location' && !userLocation ? (
          <View style={styles.panel}>
            <Text style={styles.panelText}>
              Add your area so we can search nearby — or enable profile location.
            </Text>
            <TextInput
              value={manualArea}
              onChangeText={setManualArea}
              placeholder="e.g. Downtown Toronto"
              placeholderTextColor="rgba(248,250,252,0.4)"
              style={styles.input}
              onFocus={bumpInteraction}
            />
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={handleManualLocation}
              activeOpacity={0.9}
            >
              <Text style={styles.primaryBtnText}>Use this area</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {aiChatUrl &&
        (step === 'chat' || step === 'pizzaType' || step === 'recommended') ? (
          <View style={styles.aiBar}>
            <TextInput
              value={aiInput}
              onChangeText={setAiInput}
              placeholder="Ask the assistant…"
              placeholderTextColor="rgba(248,250,252,0.4)"
              style={styles.aiInput}
              onSubmitEditing={() => void sendMessageToAI(aiInput)}
              editable={!aiSending}
            />
            <TouchableOpacity
              style={[styles.aiSend, aiSending && styles.aiSendDisabled]}
              onPress={() => void sendMessageToAI(aiInput)}
              disabled={aiSending || !aiInput.trim()}
            >
              <Text style={styles.aiSendText}>Send</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {step === 'pizzaType' && step !== 'need_location' ? (
          <View style={styles.chipWrap}>
            {PIZZA_TYPES.map((t) => (
              <TouchableOpacity
                key={t.id}
                style={styles.typeChip}
                onPress={() => void handlePickPizzaType(t.id, t.label)}
                activeOpacity={0.85}
                disabled={loadingRests}
              >
                <Text style={styles.typeChipText}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        {(step === 'loading_rests' || loadingRests) && step !== 'recommended' ? (
          <View style={styles.loaderRow}>
            <ActivityIndicator color="#6EE7B7" />
            <Text style={styles.loaderText}>
              {step === 'loading_rests' ? 'Finding your pick…' : 'Loading…'}
            </Text>
          </View>
        ) : null}

        {step === 'recommended' && recommended ? (
          <View style={styles.recommendedBlock}>
            <Text style={styles.recommendedLead}>I picked this for you 😎</Text>
            <View style={styles.recommendedCard}>
              <Image
                source={{ uri: recommended.image }}
                style={styles.recommendedImg}
                contentFit="cover"
                transition={200}
              />
              <View style={styles.recommendedCardBody}>
                <Text style={styles.recommendedRestName} numberOfLines={2}>
                  {recommended.name}
                </Text>
                <Text style={styles.recommendedFood} numberOfLines={2}>
                  {recommended.food}
                </Text>
                <Text style={styles.recommendedPrice}>
                  ${recommended.price.toFixed(2)}
                </Text>
              </View>
            </View>
            <View style={styles.recommendedActions}>
              {showJoinGroupCta ? (
                <TouchableOpacity
                  style={[styles.actionBtn, styles.actionJoinGroup]}
                  onPress={handlePressJoinGroup}
                  activeOpacity={0.9}
                >
                  <Text style={styles.actionJoinGroupText}>Join group</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionPrimary]}
                onPress={handleOrderNow}
                activeOpacity={0.9}
              >
                <Text style={styles.actionPrimaryText}>Order now 🛒</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionSecondary]}
                onPress={handleShareSplit}
                activeOpacity={0.9}
              >
                <Text style={styles.actionSecondaryText}>
                  Split with friend 🤝
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {step === 'recommended' && activeGroupId ? (
          <View style={styles.groupWrap}>
            <View style={styles.groupDisclaimerBanner}>
              <Text style={styles.groupDisclaimerText}>
                ⚠️ Payment happens outside the app. First arrival collects the
                order.
              </Text>
            </View>
            {!groupLive ? (
              <View style={styles.groupBuilding}>
                <ActivityIndicator color="#6EE7B7" size="small" />
                <Text style={styles.groupBuildingText}>
                  🍕 Building your group...
                </Text>
              </View>
            ) : groupLive.members.length >= 4 || groupLive.status === 'full' ? (
              <View style={styles.groupReadyCard}>
                <Text style={styles.groupReadyTitle}>Your group is ready 🎉</Text>
                <Text style={styles.groupReadySubtitle}>
                  Make sure someone is ready to pay and pick up the order.
                </Text>
                <Text style={styles.groupProgress}>
                  {groupLive.members.length}/4 people
                </Text>
                <View style={styles.groupRow}>
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.actionPrimary]}
                    onPress={handleGroupReadyOrder}
                    activeOpacity={0.9}
                  >
                    <Text style={styles.actionPrimaryText}>Order now 🛒</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.actionSecondary]}
                    onPress={() => void handleLeaveGroup()}
                    activeOpacity={0.9}
                  >
                    <Text style={styles.actionSecondaryText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : groupTimedOut ? (
              <View style={styles.groupTimeoutCard}>
                <Text style={styles.groupTimeoutTitle}>Not enough people yet</Text>
                <View style={styles.groupRow}>
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.actionPrimary]}
                    onPress={() => void handleTimeoutOrderAlone()}
                    activeOpacity={0.9}
                  >
                    <Text style={styles.actionPrimaryText}>Order alone 🛒</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.actionSecondary]}
                    onPress={openSplitBannerWhatsApp}
                    activeOpacity={0.9}
                  >
                    <Text style={styles.actionSecondaryText}>Invite friends</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <Animated.View
                style={[styles.groupLiveCard, { opacity: groupPulse }]}
              >
                <View style={styles.groupLiveHeaderRow}>
                  <ActivityIndicator color="#6EE7B7" size="small" />
                  <Text style={styles.groupLiveTitle}>
                    {groupLive.members.length >= 2
                      ? '🔥 Fast group found — almost ready!'
                      : '🍕 Starting a new group...'}
                  </Text>
                </View>
                <Text style={styles.groupProgress}>
                  {groupLive.members.length}/4 people joined
                </Text>
                <View style={styles.groupProgressTrack}>
                  <View
                    style={[
                      styles.groupProgressFill,
                      {
                        width: `${Math.min(100, (groupLive.members.length / 4) * 100)}%`,
                      },
                    ]}
                  />
                </View>
                {groupLive.members.length === 3 ? (
                  <View style={styles.groupAlmostFullBanner}>
                    <Text style={styles.groupAlmostFullText}>
                      ⚡ Almost full — don’t miss it!
                    </Text>
                  </View>
                ) : null}
              </Animated.View>
            )}
          </View>
        ) : null}

        {step === 'restaurants' && restaurants.length > 0 ? (
          <View style={styles.listSection}>
            <FlatList
              horizontal
              nestedScrollEnabled
              data={restaurants}
              keyExtractor={restaurantCardKeyExtractor}
              renderItem={renderRestaurant}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.hList}
            />
          </View>
        ) : null}

        {step === 'menu' ||
        step === 'pick_action' ||
        step === 'share_whatsapp' ||
        step === 'order_cta' ? (
          <View style={styles.menuBlock}>
            {POPULAR_PIZZAS.map((p) => (
              <PizzaItem key={p.id} item={p} />
            ))}
          </View>
        ) : null}

        {showSplit ? (
          <View style={styles.splitBanner}>
            <Text style={styles.splitBannerText}>
              Split this order with a friend ⚡
            </Text>
            <TouchableOpacity
              style={styles.splitWa}
              onPress={openSplitBannerWhatsApp}
              activeOpacity={0.9}
            >
              <FontAwesome name="whatsapp" size={18} color="#fff" />
              <Text style={styles.splitWaText}>Share via WhatsApp</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {step === 'pick_action' ? (
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.actionPrimary]}
              onPress={handleOrderNow}
              activeOpacity={0.9}
            >
              <Text style={styles.actionPrimaryText}>Order now 🛒</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.actionSecondary]}
              onPress={handleShareSplit}
              activeOpacity={0.9}
            >
              <Text style={styles.actionSecondaryText}>Share & split 🤝</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {step === 'share_whatsapp' ? (
          <View style={styles.shareActions}>
            <TouchableOpacity
              style={styles.waBtn}
              onPress={openWhatsAppInvite}
              activeOpacity={0.9}
            >
              <FontAwesome name="whatsapp" size={22} color="#fff" />
              <Text style={styles.waBtnText}>Share via WhatsApp</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.actionSecondary]}
              onPress={handleOrderNow}
              activeOpacity={0.9}
            >
              <Text style={styles.actionSecondaryText}>Order now 🛒</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {nudgeVisible &&
        step !== 'need_location' &&
        step !== 'order_cta' &&
        step !== 'recommended' &&
        !loadingRests ? (
          <TouchableOpacity
            style={styles.nudge}
            onPress={suggestPopularPizza}
            activeOpacity={0.9}
          >
            <Text style={styles.nudgeText}>
              Want me to pick a popular pizza for you? 🍕
            </Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
    </View>

    <Modal
      visible={groupJoinModalVisible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!groupJoining) setGroupJoinModalVisible(false);
      }}
    >
      <View style={styles.groupModalBackdrop}>
        <View style={styles.groupModalCard}>
          <Text style={styles.groupModalTitle}>Before you continue ⚠️</Text>
          <Text style={styles.groupModalBody}>
            • Payment is handled outside the app between users{'\n'}
            • The first person to arrive will collect the order{'\n'}
            • Please coordinate with your group
          </Text>
          <View style={styles.groupModalActions}>
            <TouchableOpacity
              style={[styles.groupModalBtn, styles.groupModalBtnPrimary]}
              onPress={() => void handleConfirmGroupJoin()}
              disabled={groupJoining}
              activeOpacity={0.9}
            >
              {groupJoining ? (
                <ActivityIndicator color="#0f172a" />
              ) : (
                <Text style={styles.groupModalBtnPrimaryText}>I agree ✅</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.groupModalBtn, styles.groupModalBtnSecondary]}
              onPress={() => !groupJoining && setGroupJoinModalVisible(false)}
              disabled={groupJoining}
              activeOpacity={0.9}
            >
              <Text style={styles.groupModalBtnSecondaryText}>Cancel ❌</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 12,
    marginBottom: 16,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: 'rgba(15,23,42,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.2)',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  headerTitle: {
    color: c.white,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  thread: { maxHeight: 520 },
  threadContent: { padding: 12, paddingBottom: 20 },
  bubbleRow: { marginBottom: 10, width: '100%' },
  bubbleRowBot: { alignItems: 'flex-start' },
  bubbleRowUser: { alignItems: 'flex-end' },
  bubble: {
    maxWidth: '92%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
  },
  bubbleBot: { backgroundColor: 'rgba(255,255,255,0.07)' },
  bubbleUser: {
    backgroundColor: 'rgba(110, 231, 183, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(110, 231, 183, 0.35)',
  },
  bubbleTextBot: {
    color: 'rgba(248,250,252,0.95)',
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '600',
  },
  bubbleTextUser: {
    color: '#ECFDF5',
    fontSize: 15,
    fontWeight: '700',
  },
  panel: { marginTop: 8, gap: 10 },
  panelText: {
    color: 'rgba(248,250,252,0.75)',
    fontSize: 14,
    lineHeight: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: c.white,
    fontSize: 15,
  },
  primaryBtn: {
    backgroundColor: '#6EE7B7',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#042f2e',
    fontSize: 16,
    fontWeight: '800',
  },
  aiBar: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 4,
  },
  aiInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: c.white,
    fontSize: 15,
  },
  aiSend: {
    backgroundColor: '#0EA5E9',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  aiSendDisabled: { opacity: 0.5 },
  aiSendText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  typeChip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  typeChipText: {
    color: c.white,
    fontSize: 14,
    fontWeight: '700',
  },
  loaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
  },
  loaderText: {
    color: 'rgba(248,250,252,0.7)',
    fontSize: 14,
    fontWeight: '600',
  },
  listSection: { marginTop: 8, marginHorizontal: -4 },
  hList: { paddingVertical: 4, paddingRight: 12 },
  menuBlock: { marginTop: 8 },
  actionRow: { gap: 10, marginTop: 12 },
  actionBtn: {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  actionPrimary: { backgroundColor: '#F97316' },
  actionPrimaryText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  actionSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(248,250,252,0.25)',
  },
  actionSecondaryText: {
    color: c.white,
    fontSize: 16,
    fontWeight: '700',
  },
  shareActions: { marginTop: 12, gap: 10 },
  waBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: '#25D366',
  },
  waBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  splitBanner: {
    marginTop: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(30, 27, 75, 0.55)',
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.35)',
    gap: 10,
  },
  splitBannerText: {
    color: '#E9D5FF',
    fontSize: 14,
    fontWeight: '700',
  },
  splitWa: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#25D366',
  },
  splitWaText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  nudge: {
    marginTop: 14,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(251, 191, 36, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.35)',
  },
  nudgeText: {
    color: '#FDE68A',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  recommendedBlock: {
    marginTop: 10,
    gap: 12,
  },
  recommendedLead: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '800',
  },
  recommendedCard: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(110, 231, 183, 0.25)',
  },
  recommendedImg: {
    width: '100%',
    height: 140,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  recommendedCardBody: {
    padding: 14,
    gap: 6,
  },
  recommendedRestName: {
    color: c.white,
    fontSize: 17,
    fontWeight: '800',
  },
  recommendedFood: {
    color: 'rgba(248,250,252,0.85)',
    fontSize: 15,
    fontWeight: '600',
  },
  recommendedPrice: {
    color: '#6EE7B7',
    fontSize: 20,
    fontWeight: '800',
    marginTop: 4,
  },
  recommendedActions: { gap: 10, marginTop: 4, width: '100%' },
  actionJoinGroup: {
    backgroundColor: 'rgba(110, 231, 183, 0.16)',
    borderWidth: 2,
    borderColor: 'rgba(110, 231, 183, 0.55)',
  },
  actionJoinGroupText: {
    color: '#A7F3D0',
    fontSize: 16,
    fontWeight: '800',
  },
  groupModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  groupModalCard: {
    borderRadius: 18,
    padding: 20,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.35)',
    gap: 14,
    maxWidth: 400,
    width: '100%',
    alignSelf: 'center',
  },
  groupModalTitle: {
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
  },
  groupModalBody: {
    color: 'rgba(248,250,252,0.88)',
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 22,
  },
  groupModalActions: { gap: 10, marginTop: 4 },
  groupModalBtn: {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  groupModalBtnPrimary: { backgroundColor: '#6EE7B7' },
  groupModalBtnPrimaryText: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '800',
  },
  groupModalBtnSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(248,250,252,0.28)',
  },
  groupModalBtnSecondaryText: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '700',
  },
  groupDisclaimerBanner: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(251, 191, 36, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.35)',
    marginBottom: 10,
  },
  groupDisclaimerText: {
    color: '#FDE68A',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    textAlign: 'center',
  },
  groupWrap: { marginTop: 14 },
  groupBuilding: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(110, 231, 183, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(110, 231, 183, 0.35)',
  },
  groupBuildingText: {
    color: '#A7F3D0',
    fontSize: 15,
    fontWeight: '800',
  },
  groupLiveCard: {
    padding: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(110, 231, 183, 0.28)',
    gap: 10,
  },
  groupLiveHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  groupLiveTitle: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '800',
    flex: 1,
  },
  groupAlmostFullBanner: {
    marginTop: 4,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(250, 204, 21, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(250, 204, 21, 0.45)',
  },
  groupAlmostFullText: {
    color: '#FDE68A',
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
  },
  groupProgress: {
    color: 'rgba(248,250,252,0.85)',
    fontSize: 16,
    fontWeight: '800',
  },
  groupProgressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  groupProgressFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: '#6EE7B7',
  },
  groupReadyCard: {
    padding: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(249, 115, 22, 0.15)',
    borderWidth: 2,
    borderColor: 'rgba(251, 146, 60, 0.9)',
    gap: 10,
    shadowColor: '#F97316',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
    elevation: 8,
  },
  groupReadyTitle: {
    color: '#FDBA74',
    fontSize: 18,
    fontWeight: '900',
  },
  groupReadySubtitle: {
    color: 'rgba(248,250,252,0.9)',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  groupTimeoutCard: {
    padding: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(251, 191, 36, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.4)',
    gap: 10,
  },
  groupTimeoutTitle: {
    color: '#FDE68A',
    fontSize: 16,
    fontWeight: '800',
  },
  groupRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
    marginTop: 4,
  },
});
