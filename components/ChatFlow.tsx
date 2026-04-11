/**
 * Guided pizza ordering assistant — always advances with clear next actions.
 */
import { PizzaItem } from '@/components/PizzaItem';
import {
  RestaurantCard,
  restaurantCardKeyExtractor,
} from '@/components/RestaurantCard';
import { theme } from '@/constants/theme';
import {
  getNearbyRestaurants,
  POPULAR_PIZZAS,
  type LatLng,
  type NearbyRestaurant,
} from '@/services/api';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Linking from 'expo-linking';
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
  { id: 'pepperoni', label: 'Pepperoni 🍕' },
  { id: 'margherita', label: 'Margherita 🍕' },
  { id: 'veggie', label: 'Veggie 🥗' },
  { id: 'custom', label: 'Custom ✏️' },
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
  restaurant: NearbyRestaurant | null;
};

type Phase =
  | 'need_location'
  | 'pick_type'
  | 'loading_rests'
  | 'pick_restaurant'
  | 'show_menu'
  | 'pick_action'
  | 'share_whatsapp'
  | 'order_cta';

type ThreadLine =
  | { id: string; kind: 'assistant'; text: string }
  | { id: string; kind: 'user'; text: string };

export type ChatFlowProps = {
  userLocation: ChatFlowLocation | null;
  onOrderNow: (ctx: GuidedOrderContext) => void;
};

export function ChatFlow({ userLocation, onOrderNow }: ChatFlowProps) {
  const [phase, setPhase] = useState<Phase>('need_location');
  const [savedLoc, setSavedLoc] = useState<LatLng | null>(null);
  const [locationLabel, setLocationLabel] = useState('');
  const [manualArea, setManualArea] = useState('');
  const [thread, setThread] = useState<ThreadLine[]>([]);
  const [pizzaType, setPizzaType] = useState<string | null>(null);
  const [restaurants, setRestaurants] = useState<NearbyRestaurant[]>([]);
  const [pickedRestaurant, setPickedRestaurant] =
    useState<NearbyRestaurant | null>(null);
  const [nudgeVisible, setNudgeVisible] = useState(false);
  const [loadingRests, setLoadingRests] = useState(false);

  const lastInteractRef = useRef(Date.now());
  const nudgeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const didStartFromProfileLoc = useRef(false);

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

  const startAfterLocation = useCallback(
    (loc: LatLng, label: string) => {
      bumpInteraction();
      setSavedLoc(loc);
      setLocationLabel(label);
      pushAssistant(`Got it 📍 ${label}. Let’s get you some pizza 🍕`);
      setPhase('pick_type');
    },
    [bumpInteraction, pushAssistant],
  );

  useLayoutEffect(() => {
    if (!userLocation?.lat || !userLocation?.lng) return;
    if (didStartFromProfileLoc.current) return;
    didStartFromProfileLoc.current = true;
    const label = userLocation.label?.trim() || 'Near you';
    startAfterLocation(
      { lat: userLocation.lat, lng: userLocation.lng },
      label,
    );
  }, [userLocation, startAfterLocation]);

  useEffect(() => {
    nudgeTimerRef.current = setInterval(() => {
      if (phase === 'need_location' || phase === 'order_cta') return;
      const idle = Date.now() - lastInteractRef.current;
      if (idle >= INACTIVITY_MS) {
        setNudgeVisible(true);
      }
    }, 800);
    return () => {
      if (nudgeTimerRef.current) clearInterval(nudgeTimerRef.current);
    };
  }, [phase]);

  const handleManualLocation = () => {
    const label = manualArea.trim() || 'Your area';
    didStartFromProfileLoc.current = true;
    bumpInteraction();
    startAfterLocation(FALLBACK_LOC, label);
  };

  const handlePickPizzaType = async (id: string, label: string) => {
    if (!savedLoc) return;
    bumpInteraction();
    setPizzaType(id);
    pushUser(label);
    setPhase('loading_rests');
    setLoadingRests(true);
    pushAssistant('Searching the best pizza spots near you…');
    try {
      const rows = await getNearbyRestaurants(savedLoc, 'pizza');
      setRestaurants(rows);
      pushAssistant('Here’s what’s close — pick a place:');
      setPhase('pick_restaurant');
    } catch {
      pushAssistant('Couldn’t load restaurants — try again in a second.');
      setPhase('pick_type');
    } finally {
      setLoadingRests(false);
    }
  };

  const handleSelectRestaurant = useCallback((r: NearbyRestaurant) => {
    bumpInteraction();
    setPickedRestaurant(r);
    pushUser(r.name);
    pushAssistant('Nice choice 😎 Here’s what people love:');
    setPhase('show_menu');
    setTimeout(() => {
      pushAssistant('What do you want to do?');
      setPhase('pick_action');
    }, 400);
  }, [bumpInteraction, pushAssistant, pushUser]);

  const handleOrderNow = () => {
    if (!savedLoc || !pizzaType || !pickedRestaurant) return;
    bumpInteraction();
    pushUser('Order now 🛒');
    pushAssistant('Opening checkout — you’re almost there.');
    setPhase('order_cta');
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
    setPhase('share_whatsapp');
  };

  const openWhatsAppInvite = () => {
    bumpInteraction();
    const text = 'Join my order on HalfOrder';
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    void Linking.openURL(url);
  };

  const dismissNudge = () => {
    bumpInteraction();
    setNudgeVisible(false);
  };

  const suggestPopularPizza = () => {
    dismissNudge();
    pushAssistant('Here’s a crowd favorite: Classic Pepperoni — want to lock it in?');
  };

  const renderRestaurant = useCallback(
    ({ item }: ListRenderItemInfo<NearbyRestaurant>) => (
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

        {phase === 'need_location' && !userLocation ? (
          <View style={styles.panel}>
            <Text style={styles.panelText}>
              Add your area to start — or enable location on your profile.
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

        {phase === 'pick_type' && (
          <View style={styles.chipWrap}>
            {PIZZA_TYPES.map((t) => (
              <TouchableOpacity
                key={t.id}
                style={styles.typeChip}
                onPress={() => void handlePickPizzaType(t.id, t.label)}
                activeOpacity={0.85}
              >
                <Text style={styles.typeChipText}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {(phase === 'loading_rests' || loadingRests) && (
          <View style={styles.loaderRow}>
            <ActivityIndicator color="#6EE7B7" />
            <Text style={styles.loaderText}>Finding restaurants…</Text>
          </View>
        )}

        {phase === 'pick_restaurant' && restaurants.length > 0 ? (
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

        {phase === 'show_menu' ||
        phase === 'pick_action' ||
        phase === 'share_whatsapp' ||
        phase === 'order_cta' ? (
          <View style={styles.menuBlock}>
            {POPULAR_PIZZAS.map((p) => (
              <PizzaItem key={p.id} item={p} />
            ))}
          </View>
        ) : null}

        {phase === 'pick_action' ? (
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

        {phase === 'share_whatsapp' ? (
          <TouchableOpacity
            style={styles.waBtn}
            onPress={openWhatsAppInvite}
            activeOpacity={0.9}
          >
            <FontAwesome name="whatsapp" size={22} color="#fff" />
            <Text style={styles.waBtnText}>Share via WhatsApp</Text>
          </TouchableOpacity>
        ) : null}

        {nudgeVisible && phase !== 'need_location' && phase !== 'order_cta' ? (
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
  thread: {
    maxHeight: 520,
  },
  threadContent: {
    padding: 12,
    paddingBottom: 20,
  },
  bubbleRow: {
    marginBottom: 10,
    width: '100%',
  },
  bubbleRowBot: {
    alignItems: 'flex-start',
  },
  bubbleRowUser: {
    alignItems: 'flex-end',
  },
  bubble: {
    maxWidth: '92%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
  },
  bubbleBot: {
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
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
  panel: {
    marginTop: 8,
    gap: 10,
  },
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
  listSection: {
    marginTop: 8,
    marginHorizontal: -4,
  },
  hList: {
    paddingVertical: 4,
    paddingRight: 12,
  },
  menuBlock: {
    marginTop: 8,
  },
  actionRow: {
    gap: 10,
    marginTop: 12,
  },
  actionBtn: {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  actionPrimary: {
    backgroundColor: '#F97316',
  },
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
  waBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 12,
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: '#25D366',
  },
  waBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
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
});
