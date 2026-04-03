/** Nearby matching radius for growth / smart match (km). */
export const GROWTH_MATCH_RADIUS_KM = 2;

/** Max Firestore users scanned per `autoInvite` batch (cost guard). */
export const GROWTH_AUTO_INVITE_USER_SCAN_LIMIT = 120;

/** Firestore orders scan limit for matching engine. */
export const GROWTH_ORDER_SCAN_LIMIT = 64;

/** Expo push `data.type` for nearby food invite. */
export const GROWTH_NEARBY_FOOD_PUSH_TYPE = 'growth_nearby_food' as const;
