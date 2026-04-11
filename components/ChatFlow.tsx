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
import { auth } from '@/services/firebase';
import {
  clearUserSplitMatching,
  findMatch,
  formatSplitDistance,
  pokePeerClearSplitMatch,
  setUserLookingToSplit,
  type SplitMatchCandidate,
} from '@/services/matching';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Image } from 'expo-image';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  FlatList,
  type ListRenderItemInfo,
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
  const router = useRouter();
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
  const [splitMatch, setSplitMatch] = useState<SplitMatchCandidate | null>(null);
  const [showNoMatchInvite, setShowNoMatchInvite] = useState(false);

  const lastInteractRef = useRef(Date.now());
  const nudgeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const didStartFromProfileLoc = useRef(false);

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
      setSplitMatch(null);
      setShowNoMatchInvite(false);
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
        const uid = auth.currentUser?.uid;
        if (uid) {
          try {
            await setUserLookingToSplit(uid, 'pizza', locForMatch);
            const peer = await findMatch({
              id: uid,
              preferredFood: 'pizza',
              location: locForMatch,
            });
            setSplitMatch(peer);
            setShowNoMatchInvite(!peer);
          } catch {
            setSplitMatch(null);
            setShowNoMatchInvite(true);
          }
        } else {
          setShowNoMatchInvite(true);
        }

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

  const handleJoinSplitMatch = useCallback(async () => {
    if (!splitMatch) return;
    const me = auth.currentUser?.uid;
    if (!me) return;
    bumpInteraction();
    try {
      await clearUserSplitMatching(me);
      await pokePeerClearSplitMatch(splitMatch.id, me);
    } catch {
      /* still proceed */
    }
    pushUser('Join now 🤝');
    setSplitMatch(null);
    router.push({ pathname: '/(tabs)/join' } as never);
  }, [bumpInteraction, pushUser, router, splitMatch]);

  const handleIgnoreSplitMatch = useCallback(() => {
    bumpInteraction();
    setSplitMatch(null);
  }, [bumpInteraction]);

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

  return (
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

        {step === 'recommended' && splitMatch ? (
          <View style={styles.hotMatchWrap}>
            <View style={styles.hotMatchCard}>
              <Text style={styles.hotMatchTitle}>
                🔥 Someone nearby wants to split!
              </Text>
              <Text style={styles.hotMatchName}>{splitMatch.name}</Text>
              <Text style={styles.hotMatchMeta}>
                {recommended?.food ?? splitMatch.preferredFood} ·{' '}
                {formatSplitDistance(splitMatch.distanceMeters)} away
              </Text>
              <View style={styles.hotMatchRow}>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.actionPrimary]}
                  onPress={() => void handleJoinSplitMatch()}
                  activeOpacity={0.9}
                >
                  <Text style={styles.actionPrimaryText}>Join now 🤝</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.actionSecondary]}
                  onPress={handleIgnoreSplitMatch}
                  activeOpacity={0.9}
                >
                  <Text style={styles.actionSecondaryText}>Ignore</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ) : null}

        {step === 'recommended' && !splitMatch && showNoMatchInvite ? (
          <View style={styles.noMatchWrap}>
            <Text style={styles.noMatchText}>Invite a friend via WhatsApp</Text>
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
  recommendedActions: { gap: 10, marginTop: 4 },
  hotMatchWrap: { marginTop: 14 },
  hotMatchCard: {
    borderRadius: 16,
    padding: 14,
    backgroundColor: 'rgba(249, 115, 22, 0.12)',
    borderWidth: 2,
    borderColor: 'rgba(251, 146, 60, 0.85)',
    gap: 8,
    shadowColor: '#F97316',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  hotMatchTitle: {
    color: '#FDBA74',
    fontSize: 16,
    fontWeight: '900',
  },
  hotMatchName: {
    color: '#F8FAFC',
    fontSize: 17,
    fontWeight: '800',
  },
  hotMatchMeta: {
    color: 'rgba(248,250,252,0.8)',
    fontSize: 14,
    fontWeight: '600',
  },
  hotMatchRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
    flexWrap: 'wrap',
  },
  noMatchWrap: {
    marginTop: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    gap: 10,
  },
  noMatchText: {
    color: 'rgba(248,250,252,0.85)',
    fontSize: 14,
    fontWeight: '700',
  },
});
