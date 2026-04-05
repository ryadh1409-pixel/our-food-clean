/**
 * Coordination disclaimer — UI uses short (cards) vs longer (order detail).
 * Alerts / chat use COORDINATION_DISCLAIMER.
 */

/** One line under list / swipe / join cards */
export const COORDINATION_CARD_DISCLAIMER =
  'Coordination only. Users arrange independently.';

/** Order detail screen (`app/order/[id]`) */
export const COORDINATION_ORDER_DETAIL_DISCLAIMER =
  'HalfOrder is a coordination platform that connects users to share food orders. Users are responsible for their interactions and arrangements.';

export const COORDINATION_DISCLAIMER =
  'HalfOrder is used for coordination only. Any arrangements are made independently between users.';

/** @deprecated Use COORDINATION_DISCLAIMER; kept for existing imports */
export const PAYMENT_DISCLAIMER_ORDER_DETAILS = COORDINATION_DISCLAIMER;

/** System line in order chat when a pair is formed */
export const PAYMENT_DISCLAIMER_CHAT_MATCHED = COORDINATION_DISCLAIMER;

export const PAYMENT_MATCH_ALERT_TITLE = "You're matched!";

export const PAYMENT_MATCH_ALERT_MESSAGE = COORDINATION_DISCLAIMER;
