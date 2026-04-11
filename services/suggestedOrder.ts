import type { TimeContext, TimeOfDayPeriod } from '@/services/chatAssistantOrders';

/**
 * In-app template only — not a Firestore document, not other users’ activity.
 */
export type SuggestedMessageOrder = {
  id: string;
  title: string;
  isSuggested: true;
  priceSplit: string;
  /** Optional hint for create-flow prefill */
  mealCategory?: string;
};

const SUGGESTED_TITLE_BY_PERIOD: Record<TimeOfDayPeriod, string> = {
  morning: 'Breakfast & bakery (suggested) 🥐',
  lunch: 'Pizza or lunch (suggested) 🍕',
  evening: 'Dinner (suggested) 🍽️',
  late_night: 'Snack run (suggested) 🌙',
};

/**
 * Chat-only suggestion (never written to Firestore). `isSuggested: true` everywhere it appears.
 */
export function generateSuggestedOrder(ctx: TimeContext): SuggestedMessageOrder {
  const ts = Date.now();
  return {
    id: `suggested_${ts}`,
    title: SUGGESTED_TITLE_BY_PERIOD[ctx.period],
    isSuggested: true,
    priceSplit: '$8',
    mealCategory: ctx.emptyLabel,
  };
}

/** Shown when there are no real joinable orders to list. */
export const SUGGESTED_ORDER_BOT_COPY =
  'No open orders to list right now. Here’s a suggested order based on your preferences — start one and others can join when you publish it.';
