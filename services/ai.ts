/**
 * HalfOrder product assistant: structured order builder + short guidance.
 * @see ORDER_BUILDER_SYSTEM_PROMPT in `aiOrderBuilder.ts`
 */
import { detectFoodIntent } from '@/services/chatAssistantOrders';
import type { TimeContext } from '@/services/chatAssistantOrders';
import { generateSuggestedOrder, SUGGESTED_ORDER_BOT_COPY } from '@/services/suggestedOrder';
import {
  initialAiSessionState,
  locationPromptForCategory,
  mealCategoryFromText,
  processOrderBuilderTurn,
  startOrderBuilderSession,
  type AiSessionState,
  type MealCategory,
  type UserLocationContext,
} from '@/services/aiOrderBuilder';

export { initialAiSessionState };

export type ChatIntent = 'food' | 'confirm' | 'reject' | 'hungry' | 'unknown';

/** @deprecated Use `AiSessionState` — kept for incremental refactors */
export type ChatState = AiSessionState;

export type FoodSuggestionKind = 'pizza' | 'burger' | 'general';

export type AssistantUserContext = {
  displayName: string;
  email?: string | null;
};

export const initialChatState: AiSessionState = initialAiSessionState();

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

export { ORDER_BUILDER_SYSTEM_PROMPT } from '@/services/aiOrderBuilder';
export { validateOrderForCreate, validateOrder } from '@/services/aiOrderBuilder';

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function assistantFirstName(ctx: AssistantUserContext | undefined): string {
  const raw = (ctx?.displayName ?? '').trim();
  if (!raw) return 'there';
  return raw.split(/\s+/)[0] ?? 'there';
}

/** First-open product intro (Chat tab). */
export function buildProductAssistantIntro(displayName: string): string {
  const name = assistantFirstName({ displayName });
  return `Hey ${name} 👋
I help you use HalfOrder.

You can:
• Join orders
• Split food
• Chat with others

Quick question:
What do you think so far?`;
}

type ProductAssistantIntent = 'help_app' | 'feedback' | 'none';

function detectProductAssistantIntent(message: string): ProductAssistantIntent {
  const t = message.trim().toLowerCase();
  if (!t) return 'none';
  if (
    /\bhow (does|do) (this|half|it|halforder)\b/.test(t) ||
    /\bwhat is halforder\b/.test(t) ||
    /\bhow to join\b/.test(t) ||
    /\bsplit (a |the )?(meal|food|order)\b/.test(t) ||
    /\bexplain\b/.test(t) ||
    /\bhow .* works\b/.test(t) ||
    t.includes('how does the app') ||
    t.includes('what can you do')
  ) {
    return 'help_app';
  }
  if (
    /\b(confus|confusing|improve|feedback|suggest|wish\b|hate\b|love\b|annoying|missing|frustrat|terrible|great app|bad ux)\b/.test(
      t,
    ) ||
    t.includes('what should') ||
    t.includes('not sure') ||
    t.includes('don’t understand') ||
    t.includes("don't understand")
  ) {
    return 'feedback';
  }
  return 'none';
}

export function detectIntent(message: string): ChatIntent {
  const text = message.trim().toLowerCase();
  if (!text) return 'unknown';

  if (
    text.includes('pizza') ||
    text.includes('burger') ||
    text.includes('healthy') ||
    text.includes('other meal') ||
    text.includes('🥗')
  ) {
    return 'food';
  }
  if (
    /\byes\b/.test(text) ||
    text === 'ok' ||
    text.includes(' okay') ||
    /^ok$/.test(text) ||
    /\bsure\b/.test(text) ||
    /\byeah\b/.test(text) ||
    /\byep\b/.test(text) ||
    text.includes('👍') ||
    text.includes('sounds good') ||
    text.includes('create it') ||
    text.includes('go ahead') ||
    text.includes('do it')
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

const GENERIC_FOOD_PROMPTS = [
  'Craving something? 😋',
  'What are you in the mood for?',
  'Say pizza, burger, healthy, or other meal.',
] as const;

function shouldSkipDuplicate(
  nextText: string,
  lastBotResponseText: string | null,
): boolean {
  if (!lastBotResponseText) return false;
  return norm(nextText) === norm(lastBotResponseText);
}

function withState(
  base: AiSessionState,
  patch: Partial<AiSessionState>,
): AiSessionState {
  return { ...base, ...patch };
}

function lateNightLocal(): boolean {
  const h = new Date().getHours();
  return h >= 22 || h < 5;
}

function productHelpLine(name: string): string {
  return `${name}, here’s the gist: browse or swipe an order, join or start one, then use order chat to coordinate. Say pizza, burger, healthy, or other meal to build an order step by step.`;
}

function productFeedbackLine(name: string): string {
  return `Thanks ${name} — that helps. What feels most confusing, and what should we improve next?`;
}

function productDefaultLine(
  name: string,
  nearbyJoinableCount: number,
): string {
  if (lateNightLocal()) {
    return `${name}, 🌙 Late night? Say pizza, burger, healthy, or other meal — I’ll walk you through it.`;
  }
  if (nearbyJoinableCount > 0) {
    return `${name}, check Smart matches above for live orders — or tell me what you’re craving.`;
  }
  return `${name}, say pizza, burger, healthy, or other meal to start the order builder. Anything confusing?`;
}

function isCoffeeOrDrinkOrder(text: string): boolean {
  const t = norm(text);
  return (
    /\bcoffee\b/.test(t) ||
    /\b(latte|cappuccino|espresso|matcha|bubble tea|boba|drink)\b/.test(t) ||
    t.includes('☕')
  );
}

function builderIntentForState(
  orderState: AiSessionState['orderState'],
  chatIntent: ChatIntent,
): 'confirm' | 'reject' | 'other' {
  if (orderState === 'confirm') {
    if (chatIntent === 'confirm') return 'confirm';
    if (chatIntent === 'reject') return 'reject';
    return 'other';
  }
  if (chatIntent === 'reject') return 'reject';
  return 'other';
}

/**
 * Runs one user turn → next state + outgoing bot message(s) + optional navigation.
 */
export async function handleUserChatTurn(input: {
  text: string;
  state: AiSessionState;
  uid: string;
  nearbyJoinableCount: number;
  timeContext: TimeContext;
  awaitingPartnerAlone?: boolean;
  assistantContext?: AssistantUserContext | null;
  /** Profile / GPS for the order builder */
  userLocation?: UserLocationContext | null;
}): Promise<{
  state: AiSessionState;
  messages: AiBotMessage[];
  navigateToOrderId?: string;
}> {
  const name = assistantFirstName(input.assistantContext ?? undefined);
  const productIntent = detectProductAssistantIntent(input.text);
  const intent = detectIntent(input.text);
  let session = { ...input.state, draft: { ...input.state.draft } };
  const messages: AiBotMessage[] = [];

  const push = (m: AiBotMessage) => {
    if (shouldSkipDuplicate(m.text, session.lastBotResponseText)) return;
    session.lastBotResponseText = m.text.trim();
    messages.push(m);
  };

  const suggestTemplateOnce = () => {
    if (session.templateSuggestedOnce) return;
    const suggested = generateSuggestedOrder(input.timeContext);
    session = withState(session, { templateSuggestedOnce: true });
    push({
      text: SUGGESTED_ORDER_BOT_COPY,
      action: 'join_order',
      orders: [suggested],
    });
  };

  if (isCoffeeOrDrinkOrder(input.text)) {
    push({
      text: `${name}, I don’t start drink-only orders here. Try pizza 🍕, burger 🍔, healthy 🥗, or another meal.`,
      action: 'none',
    });
    return { state: session, messages };
  }

  /** Structured order builder (multi-step) — always complete this turn here (no fall-through). */
  if (input.state.orderState !== 'idle') {
    const bIntent = builderIntentForState(input.state.orderState, intent);
    const built = await processOrderBuilderTurn({
      text: input.text,
      session,
      uid: input.uid,
      userLocation: input.userLocation ?? null,
      intent: bIntent,
    });
    session = built.session;
    for (const m of built.messages) {
      push(m);
    }
    return {
      state: session,
      messages,
      navigateToOrderId: built.navigateToOrderId,
    };
  }

  if (productIntent === 'help_app') {
    push({ text: productHelpLine(name), action: 'none' });
    return { state: session, messages };
  }

  if (productIntent === 'feedback') {
    push({ text: productFeedbackLine(name), action: 'none' });
    return { state: session, messages };
  }

  if (intent === 'food') {
    const cat = mealCategoryFromText(input.text);
    if (cat) {
      session = startOrderBuilderSession({
        mealCategory: cat as MealCategory,
        session,
      });
      push({
        text: locationPromptForCategory(cat as MealCategory),
        action: 'none',
      });
      return { state: session, messages };
    }
    push({
      text: `${name}, say pizza 🍕, burger 🍔, healthy 🥗, or “other meal” so I can line up the builder.`,
      action: 'none',
    });
    return { state: session, messages };
  }

  if (intent === 'confirm' && session.orderState === 'idle') {
    push({
      text: `${name}, tell me what you want first — pizza, burger, healthy, or other meal.`,
      action: 'none',
    });
    return { state: session, messages };
  }

  if (intent === 'reject') {
    push({
      text: `No problem — say pizza, burger, healthy, or other meal when you’re ready.`,
      action: 'none',
    });
    return { state: session, messages };
  }

  if (intent === 'hungry') {
    if (input.nearbyJoinableCount === 0) {
      if (!session.templateSuggestedOnce) {
        suggestTemplateOnce();
      } else {
        push({
          text: `${name}, ${pickRandom(GENERIC_FOOD_PROMPTS)} Tap “Create order” below to start — or say pizza, burger, healthy, or other meal.`,
          action: 'create_order',
        });
      }
    } else {
      push({
        text: `${name}, ${pickRandom(GENERIC_FOOD_PROMPTS)} There are open orders — check Smart matches, or say pizza, burger, healthy, or other meal.`,
        action: 'none',
      });
    }
    return { state: session, messages };
  }

  if (intent === 'unknown') {
    if (input.awaitingPartnerAlone) {
      push({
        text: `${name}, you’re waiting on your other half. Ping them on WhatsApp from the order screen, or say what you’d like to do next.`,
        action: 'none',
      });
      return { state: session, messages };
    }
    if (input.nearbyJoinableCount === 0 && !session.templateSuggestedOnce) {
      suggestTemplateOnce();
      return { state: session, messages };
    }
    push({
      text: productDefaultLine(name, input.nearbyJoinableCount),
      action: 'none',
    });
    return { state: session, messages };
  }

  return { state: session, messages: [] };
}
