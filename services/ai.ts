/**
 * Assistant chat: intent detection, varied copy, swipe-order creation, de-duplication.
 */
import { autoInvite } from '@/services/autoInvite';
import { detectFoodIntent } from '@/services/chatAssistantOrders';
import type { TimeContext } from '@/services/chatAssistantOrders';
import { generateSuggestedOrder, SUGGESTED_ORDER_BOT_COPY } from '@/services/suggestedOrder';
import { db } from '@/services/firebase';
import {
  addDoc,
  collection,
  serverTimestamp,
} from 'firebase/firestore';

export type ChatIntent = 'food' | 'confirm' | 'reject' | 'hungry' | 'unknown';

export type FoodSuggestionKind = 'pizza' | 'burger' | 'general';

export type ChatState = {
  lastSuggestion: FoodSuggestionKind | null;
  awaitingConfirmation: boolean;
  templateSuggestedOnce: boolean;
  lastBotResponseText: string | null;
};

export const initialChatState: ChatState = {
  lastSuggestion: null,
  awaitingConfirmation: false,
  templateSuggestedOnce: false,
  lastBotResponseText: null,
};

export type AiOrderRef = {
  id: string;
  title: string;
  isSuggested?: boolean;
  priceSplit?: string;
  mealCategory?: string;
};

export type AiBotMessage = {
  text: string;
  action: 'join_order' | 'create_order' | 'none';
  orders?: AiOrderRef[];
};

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Keyword intent layered with broader food detection from chatAssistantOrders. */
export function detectIntent(message: string): ChatIntent {
  const text = message.trim().toLowerCase();
  if (!text) return 'unknown';

  if (text.includes('pizza') || text.includes('burger')) return 'food';
  if (
    /\byes\b/.test(text) ||
    text === 'ok' ||
    text.includes(' okay') ||
    /^ok$/.test(text) ||
    /\bsure\b/.test(text) ||
    /\byeah\b/.test(text) ||
    /\byep\b/.test(text) ||
    text.includes('👍') ||
    text.includes('sounds good')
  ) {
    return 'confirm';
  }
  if (
    /\bno\b/.test(text) ||
    text.includes('nope') ||
    text.includes('nah') ||
    /\bdon't\b/.test(text) ||
    /\bdo not\b/.test(text)
  ) {
    return 'reject';
  }
  if (text.includes('hungry')) return 'hungry';
  if (detectFoodIntent(message)) return 'food';
  return 'unknown';
}

export function foodKindFromText(message: string): FoodSuggestionKind | null {
  const t = message.toLowerCase();
  if (t.includes('pizza')) return 'pizza';
  if (t.includes('burger')) return 'burger';
  return null;
}

export function pickRandom<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

const PIZZA_PROMPTS = [
  'Want pizza? 🍕',
  'How about a slice or a whole pie? 🍕',
  "Pizza night — I'm in if you are 🍕",
] as const;

const BURGER_PROMPTS = [
  'How about a burger? 🍔',
  'Craving a smash burger? 🍔',
  'Burger run? 🍔',
] as const;

const GENERIC_FOOD_PROMPTS = [
  'Craving something? 😋',
  'What are you in the mood for?',
  'Want pizza or a burger — or something else?',
] as const;

const REJECT_ALTERNATIVE: Record<
  FoodSuggestionKind,
  readonly string[]
> = {
  pizza: [
    'No problem — how about a burger instead? 🍔',
    'All good — want to switch to a burger? 🍔',
  ],
  burger: [
    'Sure thing — pizza instead? 🍕',
    'Got it — want a pizza order? 🍕',
  ],
  general: [
    'Got it — want pizza 🍕 or a burger 🍔?',
    'No worries — tell me pizza, burger, or another craving.',
  ],
};

const PIZZA_PRESET = {
  foodName: 'Half-order wood-fired pizza 🍕',
  image:
    'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=1200&q=80',
  totalPrice: 28,
} as const;

const BURGER_PRESET = {
  foodName: 'Half-order smash burger 🍔',
  image:
    'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=1200&q=80',
  totalPrice: 26,
} as const;

const GENERAL_PRESET = {
  foodName: 'Shared meal (your pick)',
  image:
    'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=1200&q=80',
  totalPrice: 24,
} as const;

function presetForKind(kind: FoodSuggestionKind | null) {
  if (kind === 'pizza') return PIZZA_PRESET;
  if (kind === 'burger') return BURGER_PRESET;
  return GENERAL_PRESET;
}

function confirmLine(kind: FoodSuggestionKind | null): string {
  if (kind === 'pizza')
    return 'Great! I created a pizza order 🍕 — others can now join.';
  if (kind === 'burger')
    return 'Great! I created a burger order 🍔 — others can now join.';
  return 'Great! I created your order — others can now join.';
}

/**
 * Creates a swipe-style `orders` document (matches `isValidOrderCreate` rules).
 */
export async function createAssistantSwipeOrder(args: {
  uid: string;
  kind: FoodSuggestionKind | null;
}): Promise<string> {
  const p = presetForKind(args.kind);
  const uid = args.uid;
  const ref = await addDoc(collection(db, 'orders'), {
    foodName: p.foodName,
    image: p.image,
    pricePerPerson: Number((p.totalPrice / 2).toFixed(2)),
    totalPrice: Number(p.totalPrice.toFixed(2)),
    maxPeople: 2,
    usersAccepted: [],
    participants: [uid],
    joinedAtMap: { [uid]: serverTimestamp() },
    createdBy: uid,
    createdAt: serverTimestamp(),
  });
  void autoInvite({
    id: ref.id,
    foodName: p.foodName,
    creatorUid: uid,
    latitude: null,
    longitude: null,
  });
  return ref.id;
}

function shouldSkipDuplicate(
  nextText: string,
  lastBotResponseText: string | null,
): boolean {
  if (!lastBotResponseText) return false;
  return norm(nextText) === norm(lastBotResponseText);
}

function withState(
  base: ChatState,
  patch: Partial<ChatState>,
): ChatState {
  return { ...base, ...patch };
}

/**
 * Runs one user turn → next state + outgoing bot message(s) + optional navigation.
 */
export async function handleUserChatTurn(input: {
  text: string;
  state: ChatState;
  uid: string;
  nearbyJoinableCount: number;
  timeContext: TimeContext;
  /** You’re alone on a waiting half-order — assistant may nudge to invite. */
  awaitingPartnerAlone?: boolean;
}): Promise<{
  state: ChatState;
  messages: AiBotMessage[];
  navigateToOrderId?: string;
}> {
  const intent = detectIntent(input.text);
  let state = { ...input.state };
  const messages: AiBotMessage[] = [];

  const push = (m: AiBotMessage) => {
    if (shouldSkipDuplicate(m.text, state.lastBotResponseText)) return;
    state.lastBotResponseText = m.text.trim();
    messages.push(m);
  };

  const suggestTemplateOnce = () => {
    if (state.templateSuggestedOnce) return;
    const suggested = generateSuggestedOrder(input.timeContext);
    state = withState(state, { templateSuggestedOnce: true });
    push({
      text: SUGGESTED_ORDER_BOT_COPY,
      action: 'join_order',
      orders: [suggested],
    });
  };

  if (intent === 'confirm' && state.awaitingConfirmation) {
    const kind = state.lastSuggestion;
    const orderId = await createAssistantSwipeOrder({
      uid: input.uid,
      kind,
    });
    const line = confirmLine(kind);
    state.lastBotResponseText = line.trim();
    messages.push({ text: line, action: 'none' });
    const outState = withState(initialChatState, {
      templateSuggestedOnce: state.templateSuggestedOnce,
      lastBotResponseText: line.trim(),
    });
    return {
      state: outState,
      messages,
      navigateToOrderId: orderId,
    };
  }

  if (intent === 'confirm' && !state.awaitingConfirmation) {
    push({
      text: "Tell me what you're craving first (e.g. pizza or burger) — then say yes and I'll start the order.",
      action: 'none',
    });
    return { state, messages };
  }

  if (intent === 'reject') {
    const kind = state.lastSuggestion ?? 'general';
    state = withState(state, {
      awaitingConfirmation: false,
      lastSuggestion: null,
    });
    push({
      text: pickRandom(REJECT_ALTERNATIVE[kind]),
      action: 'none',
    });
    return { state, messages };
  }

  if (intent === 'food') {
    const kind = foodKindFromText(input.text) ?? 'general';
    state = withState(state, {
      lastSuggestion: kind,
      awaitingConfirmation: true,
    });
    const line =
      kind === 'pizza'
        ? pickRandom(PIZZA_PROMPTS)
        : kind === 'burger'
          ? pickRandom(BURGER_PROMPTS)
          : pickRandom(GENERIC_FOOD_PROMPTS);
    const confirmHint =
      kind === 'general'
        ? '\n\nReply yes when you want me to create it.'
        : '\n\nSay yes and I’ll create this order for you.';
    const joinHint =
      input.nearbyJoinableCount > 0
        ? '\n\nTip: Smart matches above may have live orders to join.'
        : '';
    push({
      text: `${line}${confirmHint}${joinHint}`,
      action: 'none',
    });
    return { state, messages };
  }

  if (intent === 'hungry') {
    if (input.nearbyJoinableCount === 0) {
      if (!state.templateSuggestedOnce) {
        suggestTemplateOnce();
      } else {
        push({
          text: `${pickRandom(GENERIC_FOOD_PROMPTS)} Tap “Create order” below to start one — others can join after you publish.`,
          action: 'create_order',
        });
      }
    } else {
      push({
        text: `${pickRandom(GENERIC_FOOD_PROMPTS)} There are open orders — check Smart matches above, or say pizza or burger.`,
        action: 'none',
      });
    }
    return { state, messages };
  }

  if (intent === 'unknown') {
    if (input.awaitingPartnerAlone) {
      push({
        text: 'Want to invite a friend and get a reward? 🎁 Use Invite on your order screen, or tell me what you’re craving.',
        action: 'none',
      });
      return { state, messages };
    }
    if (input.nearbyJoinableCount === 0 && !state.templateSuggestedOnce) {
      suggestTemplateOnce();
      return { state, messages };
    }
    push({
      text: 'Mention food or that you’re hungry — I’ll find joins nearby or help you start an order. Say yes after I suggest something to create it instantly.',
      action: 'none',
    });
    return { state, messages };
  }

  return { state, messages: [] };
}
