/**
 * Structured multi-step AI order builder — never creates an order until confirmation.
 */
import { autoInvite } from '@/services/autoInvite';
import { db } from '@/services/firebase';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';

export const ORDER_BUILDER_SYSTEM_PROMPT = `You are an order builder assistant.
You must collect all required order details step by step before creating an order.
Never create an order immediately.
Ask for missing information.
Keep responses short and clear.
Suggest nearby restaurants.
Never suggest coffee or drinks.`;

export type OrderState =
  | 'idle'
  | 'awaiting_location'
  | 'awaiting_restaurant'
  | 'awaiting_type'
  | 'awaiting_size'
  | 'confirm'
  | 'created';

export type MealCategory = 'pizza' | 'burger' | 'healthy' | 'other';

export type OrderBuilderDraft = {
  mealCategory: MealCategory | null;
  location: { lat: number; lng: number } | null;
  locationLabel: string | null;
  restaurant: string | null;
  distanceKm: number | null;
  foodType: string | null;
  size: 'small' | 'medium' | 'large' | null;
  totalPrice: number | null;
};

export type AiSessionState = {
  orderState: OrderState;
  draft: OrderBuilderDraft;
  templateSuggestedOnce: boolean;
  lastBotResponseText: string | null;
};

export const initialAiSessionState = (): AiSessionState => ({
  orderState: 'idle',
  draft: {
    mealCategory: null,
    location: null,
    locationLabel: null,
    restaurant: null,
    distanceKm: null,
    foodType: null,
    size: null,
    totalPrice: null,
  },
  templateSuggestedOnce: false,
  lastBotResponseText: null,
});

export type UserLocationContext = {
  lat: number | null;
  lng: number | null;
  /** Human label e.g. city from profile */
  label?: string | null;
};

export function validateOrderForCreate(order: {
  restaurant: string | null | undefined;
  foodType: string | null | undefined;
  size: string | null | undefined;
  totalPrice: number | null | undefined;
  location: { lat: number; lng: number } | null | undefined;
}): boolean {
  if (!order.restaurant?.trim()) return false;
  if (!order.foodType?.trim()) return false;
  if (!order.size?.trim()) return false;
  if (order.totalPrice == null || !Number.isFinite(order.totalPrice) || order.totalPrice <= 0)
    return false;
  if (
    !order.location ||
    !Number.isFinite(order.location.lat) ||
    !Number.isFinite(order.location.lng)
  )
    return false;
  return true;
}

/** Alias for strict pre-create checks (Guideline / QA). */
export const validateOrder = validateOrderForCreate;

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function shouldSkipDuplicate(
  nextText: string,
  lastBotResponseText: string | null,
): boolean {
  if (!lastBotResponseText) return false;
  return norm(nextText) === norm(lastBotResponseText);
}

const DEFAULT_FALLBACK_LOC = { lat: 43.6532, lng: -79.3832 };

type MockRestaurant = { name: string; distanceKm: number };

function mockNearbyRestaurants(
  category: MealCategory,
  lat: number,
  lng: number,
): MockRestaurant[] {
  void lat;
  void lng;
  if (category === 'pizza') {
    return [
      { name: 'Pizza Pizza', distanceKm: 0.8 },
      { name: "Domino's", distanceKm: 1.2 },
      { name: 'Pizzeria Libretto', distanceKm: 1.6 },
    ];
  }
  if (category === 'burger') {
    return [
      { name: 'Burger Shack', distanceKm: 0.6 },
      { name: 'Five Guys', distanceKm: 1.1 },
      { name: 'Local Smash', distanceKm: 1.4 },
    ];
  }
  if (category === 'healthy') {
    return [
      { name: 'Freshii', distanceKm: 0.7 },
      { name: 'Sweetgreen', distanceKm: 1.0 },
      { name: 'Protein Bar', distanceKm: 1.3 },
    ];
  }
  return [
    { name: 'Neighborhood Kitchen', distanceKm: 0.9 },
    { name: 'City Eats', distanceKm: 1.3 },
    { name: 'Market Plates', distanceKm: 1.7 },
  ];
}

export function mealCategoryFromText(text: string): MealCategory | null {
  const t = norm(text);
  if (t.includes('pizza') || t.includes('🍕')) return 'pizza';
  if (t.includes('burger') || t.includes('🍔')) return 'burger';
  if (
    t.includes('healthy') ||
    t.includes('🥗') ||
    t.includes('salad') ||
    t.includes('bowl')
  )
    return 'healthy';
  if (
    t.includes('other meal') ||
    t.includes('🍽') ||
    /\bother\b/.test(t)
  ) {
    return 'other';
  }
  return null;
}

function parseRestaurantChoice(
  text: string,
  options: MockRestaurant[],
): MockRestaurant | null {
  const t = text.trim();
  const n = /^([1-3])$/.exec(t);
  if (n) {
    const i = Number(n[1]) - 1;
    return options[i] ?? null;
  }
  const low = norm(t);
  for (const o of options) {
    if (low.includes(norm(o.name).slice(0, 6)) || norm(o.name).includes(low)) {
      return o;
    }
  }
  return null;
}

function typeOptionsForCategory(c: MealCategory): string[] {
  if (c === 'pizza') return ['Pepperoni', 'Cheese', 'Veggie'];
  if (c === 'burger') return ['Classic', 'Smash', 'Veggie burger'];
  if (c === 'healthy') return ['Grain bowl', 'Salad', 'Wrap'];
  return ['Chef pick', 'Combo', 'Light'];
}

function parseTypeChoice(text: string, options: string[]): string | null {
  const low = norm(text);
  for (const o of options) {
    const on = norm(o);
    if (low.includes(on) || on.split(' ').every((w) => w.length > 2 && low.includes(w))) {
      return o;
    }
  }
  if (low.includes('pepperoni')) return 'Pepperoni';
  if (low.includes('cheese') && !low.includes('burger')) return 'Cheese';
  if (low.includes('veggie')) {
    return options.find((o) => o.toLowerCase().includes('veggie')) ?? null;
  }
  if (low.includes('classic')) return 'Classic';
  if (low.includes('smash')) return 'Smash';
  if (low.includes('bowl')) return 'Grain bowl';
  if (low.includes('salad')) return 'Salad';
  if (low.includes('wrap')) return 'Wrap';
  return null;
}

function parseSize(text: string): 'small' | 'medium' | 'large' | null {
  const low = norm(text);
  if (/\bs\b/.test(low) || low.includes('small')) return 'small';
  if (/\bm\b/.test(low) || low.includes('medium')) return 'medium';
  if (/\bl\b/.test(low) || low.includes('large')) return 'large';
  return null;
}

function priceFor(category: MealCategory, size: 'small' | 'medium' | 'large'): number {
  const table: Record<MealCategory, Record<'small' | 'medium' | 'large', number>> = {
    pizza: { small: 16, medium: 22, large: 28 },
    burger: { small: 15, medium: 20, large: 26 },
    healthy: { small: 14, medium: 19, large: 24 },
    other: { small: 14, medium: 18, large: 24 },
  };
  return table[category][size];
}

function categoryEmoji(c: MealCategory): string {
  if (c === 'pizza') return '🍕';
  if (c === 'burger') return '🍔';
  if (c === 'healthy') return '🥗';
  return '🍽️';
}

function sizeLabel(s: 'small' | 'medium' | 'large'): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function buildSummary(d: OrderBuilderDraft): string {
  const cat = d.mealCategory ?? 'other';
  const em = categoryEmoji(cat);
  const dist = d.distanceKm != null ? `${d.distanceKm.toFixed(1)} km` : '—';
  const per = d.totalPrice != null ? (d.totalPrice / 2).toFixed(2) : '—';
  return (
    `Summary:\n` +
    `${em} ${d.foodType ?? 'Meal'} (${sizeLabel(d.size ?? 'medium')})\n` +
    `📍 ${d.restaurant ?? '—'} — ${dist}\n` +
    `💰 Total: $${d.totalPrice ?? '—'} → $${per} per person\n` +
    `Create this order?`
  );
}

async function persistOrder(args: {
  uid: string;
  draft: OrderBuilderDraft;
}): Promise<string> {
  const d = args.draft;
  const cat = d.mealCategory ?? 'other';
  const total = d.totalPrice ?? 0;
  const per = Number((total / 2).toFixed(2));
  const foodName = `${categoryEmoji(cat)} ${d.foodType ?? 'Meal'} (${sizeLabel(d.size ?? 'medium')})`;
  const image =
    cat === 'pizza'
      ? 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=1200&q=80'
      : cat === 'burger'
        ? 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=1200&q=80'
        : 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=1200&q=80';

  const lat = d.location!.lat;
  const lng = d.location!.lng;
  const restaurant = d.restaurant ?? 'Restaurant';
  const spots = 2;
  const joined = 1;
  const nowMs = Date.now();
  const expiresAtMs = nowMs + 60 * 60 * 1000;

  const ref = await addDoc(collection(db, 'orders'), {
    foodName,
    image,
    pricePerPerson: per,
    totalPrice: total,
    maxPeople: spots,
    usersAccepted: [],
    participants: [args.uid],
    joinedAtMap: { [args.uid]: serverTimestamp() },
    createdBy: args.uid,
    createdAt: serverTimestamp(),
    status: 'open',
    restaurant,
    restaurantName: restaurant,
    foodType: d.foodType ?? '',
    size: sizeLabel(d.size ?? 'medium'),
    mealType: `${d.foodType ?? 'Meal'} · ${sizeLabel(d.size ?? 'medium')}`,
    location: { latitude: lat, longitude: lng },
    distanceKm: d.distanceKm ?? 0,
    spots,
    joined,
    expiresAt: expiresAtMs,
  });

  void autoInvite({
    id: ref.id,
    foodName,
    creatorUid: args.uid,
    latitude: lat,
    longitude: lng,
  });
  return ref.id;
}

/** Same shape as `AiBotMessage` in `services/ai` (avoid circular imports). */
export type BuilderBotMessage = {
  text: string;
  action: 'join_order' | 'create_order' | 'none';
  orders?: {
    id: string;
    title: string;
    isSuggested?: boolean;
    priceSplit?: string;
    mealCategory?: string;
  }[];
};

export async function processOrderBuilderTurn(input: {
  text: string;
  session: AiSessionState;
  uid: string;
  userLocation: UserLocationContext | null;
  intent: 'confirm' | 'reject' | 'other';
}): Promise<{
  session: AiSessionState;
  messages: BuilderBotMessage[];
  navigateToOrderId?: string;
}> {
  const { text, uid, userLocation } = input;
  let intent = input.intent;
  let session = { ...input.session, draft: { ...input.session.draft } };
  const messages: BuilderBotMessage[] = [];

  const push = (m: BuilderBotMessage) => {
    if (shouldSkipDuplicate(m.text, session.lastBotResponseText)) return;
    session = {
      ...session,
      lastBotResponseText: m.text.trim(),
    };
    messages.push(m);
  };

  const resetToIdle = (): void => {
    session = {
      ...initialAiSessionState(),
      templateSuggestedOnce: session.templateSuggestedOnce,
    };
  };

  const st = session.orderState;

  /** Global cancel */
  if (
    st !== 'idle' &&
    (intent === 'reject' ||
      norm(text).includes('cancel') ||
      norm(text).includes('start over'))
  ) {
    resetToIdle();
    push({
      text: 'Okay — cancelled. Say pizza, burger, healthy, or other meal when you want to start again.',
      action: 'none',
    });
    return { session, messages };
  }

  if (st === 'idle') {
    return { session, messages: [] };
  }

  if (st === 'awaiting_location') {
    const cat = session.draft.mealCategory ?? 'other';
    let loc: { lat: number; lng: number };
    let label: string;

    if (userLocation?.lat != null && userLocation?.lng != null) {
      loc = { lat: userLocation.lat, lng: userLocation.lng };
      label = text.trim() || userLocation.label || 'Near you';
    } else {
      loc = DEFAULT_FALLBACK_LOC;
      label = text.trim() || 'Your area';
    }

    session.draft.location = loc;
    session.draft.locationLabel = label;
    const options = mockNearbyRestaurants(cat, loc.lat, loc.lng);
    session.orderState = 'awaiting_restaurant';

    const lines = options
      .map((o, i) => `${i + 1}. ${o.name} (${o.distanceKm.toFixed(1)} km)`)
      .join('\n');
    push({
      text:
        `Here are nearby ${cat === 'pizza' ? 'pizza' : cat === 'burger' ? 'burger' : cat === 'healthy' ? 'healthy' : ''} places:\n\n${lines}\n\nPick one (1–3 or name).`,
      action: 'none',
    });
    return { session, messages };
  }

  if (st === 'awaiting_restaurant') {
    const cat = session.draft.mealCategory ?? 'other';
    const loc = session.draft.location ?? DEFAULT_FALLBACK_LOC;
    const options = mockNearbyRestaurants(cat, loc.lat, loc.lng);
    const picked = parseRestaurantChoice(text, options);
    if (!picked) {
      push({
        text: 'Please pick 1, 2, or 3 — or type the restaurant name.',
        action: 'none',
      });
      return { session, messages };
    }
    session.draft.restaurant = picked.name;
    session.draft.distanceKm = picked.distanceKm;
    session.orderState = 'awaiting_type';
    const opts = typeOptionsForCategory(cat);
    const bullets = opts.map((o) => `• ${o}`).join('\n');
    push({
      text: `What type?\n\n${bullets}`,
      action: 'none',
    });
    return { session, messages };
  }

  if (st === 'awaiting_type') {
    const cat = session.draft.mealCategory ?? 'other';
    const opts = typeOptionsForCategory(cat);
    const picked = parseTypeChoice(text, opts);
    if (!picked) {
      push({
        text: `Choose one: ${opts.join(', ')}.`,
        action: 'none',
      });
      return { session, messages };
    }
    session.draft.foodType = picked;
    session.orderState = 'awaiting_size';
    push({
      text: 'What size?\n\n• Small\n• Medium\n• Large',
      action: 'none',
    });
    return { session, messages };
  }

  if (st === 'awaiting_size') {
    const cat = session.draft.mealCategory ?? 'other';
    const sz = parseSize(text);
    if (!sz) {
      push({
        text: 'Please choose Small, Medium, or Large.',
        action: 'none',
      });
      return { session, messages };
    }
    session.draft.size = sz;
    session.draft.totalPrice = priceFor(cat, sz);
    session.orderState = 'confirm';
    push({
      text: buildSummary(session.draft),
      action: 'none',
    });
    return { session, messages };
  }

  if (st === 'confirm') {
    if (intent === 'confirm') {
      const ok = validateOrderForCreate({
        restaurant: session.draft.restaurant,
        foodType: session.draft.foodType,
        size: session.draft.size,
        totalPrice: session.draft.totalPrice,
        location: session.draft.location,
      });
      if (!ok) {
        push({
          text: 'Something was incomplete. Let’s start again — say what you’re craving.',
          action: 'none',
        });
        resetToIdle();
        return { session, messages };
      }
      const orderId = await persistOrder({ uid, draft: session.draft });
      const cat = session.draft.mealCategory ?? 'other';
      push({
        text: `You’re set ${categoryEmoji(cat)} Order created — open it to coordinate pickup.`,
        action: 'none',
      });
      resetToIdle();
      return { session, messages, navigateToOrderId: orderId };
    }
    push({
      text: 'Say yes to create this order, or no to cancel.',
      action: 'none',
    });
    return { session, messages };
  }

  return { session, messages: [] };
}

export function startOrderBuilderSession(args: {
  mealCategory: MealCategory;
  session: AiSessionState;
}): AiSessionState {
  const session = { ...args.session };
  session.orderState = 'awaiting_location';
  session.draft = {
    ...initialAiSessionState().draft,
    mealCategory: args.mealCategory,
  };
  return session;
}

export function locationPromptForCategory(cat: MealCategory): string {
  const em = categoryEmoji(cat);
  return `Got it ${em} Where are you right now? I can use your location — reply “use my location” or tell me your area.`;
}
