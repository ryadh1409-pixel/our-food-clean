/**
 * Action-based food assistant: detect cuisine + area, then Google Places (nearby).
 */
import {
  type ChatRestaurantPick,
  fetchTopCheapestNearbyForChat,
  getNearbyRestaurants,
  resolveLocationCoordsForFoodChat,
} from '@/services/googlePlaces';

const FOOD_ENTRIES: { match: RegExp; keyword: string }[] = [
  { match: /\bpizza\b/i, keyword: 'pizza' },
  { match: /\bburger(s)?\b/i, keyword: 'burger' },
  { match: /\bsushi\b/i, keyword: 'sushi' },
  { match: /\bramen\b/i, keyword: 'ramen' },
  { match: /\btaco(s)?\b/i, keyword: 'taco' },
  { match: /\bburrito\b/i, keyword: 'burrito' },
  { match: /\bthai\b/i, keyword: 'thai food' },
  { match: /\bindian\b/i, keyword: 'indian food' },
  { match: /\bchinese\b/i, keyword: 'chinese food' },
  { match: /\bkorean\b/i, keyword: 'korean food' },
  { match: /\bpho\b/i, keyword: 'pho' },
  { match: /\bwing(s)?\b/i, keyword: 'wings' },
  { match: /\bsteak\b/i, keyword: 'steakhouse' },
  { match: /\bhealthy\b|\bsalad\b/i, keyword: 'healthy restaurant' },
  { match: /\bbbq\b|\bbarbecue\b/i, keyword: 'bbq' },
  { match: /\bdim sum\b/i, keyword: 'dim sum' },
];

export type FoodPlaceAssistOutcome =
  | { kind: 'noop' }
  | { kind: 'need_location'; foodKeyword: string }
  | {
      kind: 'found';
      foodKeyword: string;
      locationLabel: string;
      picks: ChatRestaurantPick[];
      intro: string;
    };

/** Returns Places keyword (e.g. "pizza") or null */
export function detectFoodKeyword(text: string): string | null {
  const t = text.trim();
  if (!t) return null;
  for (const { match, keyword } of FOOD_ENTRIES) {
    if (match.test(t)) return keyword;
  }
  return null;
}

/** "pizza in North York" → "North York"; also "pizza North York" / "North York pizza". */
export function extractLocationFromMessage(text: string): string | null {
  const m = text.match(/\b(?:in|near|around|at)\s+([^.!?\n]{2,70})/i);
  if (m?.[1]) {
    const s = m[1].trim().replace(/\s+$/i, '');
    if (s.length >= 2) return s;
  }
  if (/\bnorth\s+york\b/i.test(text)) return 'North York';
  return null;
}

/** Merge “North York” reply after we asked for an area. */
export function buildFoodAssistUserMessage(
  raw: string,
  pending: { foodKeyword: string } | null,
): string {
  const trimmed = raw.trim();
  if (!trimmed) return raw;
  if (detectFoodKeyword(trimmed)) return raw;
  if (!pending) return raw;
  if (trimmed.length < 2) return raw;
  if (
    /^(thanks|thank you|thx|ok|okay|yes|no|nope|nah|cancel|skip|later|bye)\b/i.test(
      trimmed,
    )
  ) {
    return raw;
  }
  return `${pending.foodKeyword} in ${trimmed}`;
}

export function foodNeedLocationPrompt(foodKeyword: string): string {
  return `I can search restaurants for ${foodKeyword} — I just need an area.\n\nTry: “${foodKeyword} in North York”\n\nOr set your location in Profile and I’ll use “near you” automatically.`;
}

export function formatFoodAssistMessage(
  foodKeyword: string,
  locationLabel: string,
  picks: ChatRestaurantPick[],
): string {
  if (picks.length === 0) {
    return 'No real results from Google.';
  }
  const head = `Top ${picks.length} ${foodKeyword} near ${locationLabel}:\n`;
  const lines = picks.map((p, i) => {
    return `${i + 1}. ${p.name}\n   ★${p.rating.toFixed(1)}\n   ${p.address}`;
  });
  return head + '\n' + lines.join('\n\n');
}

/**
 * If food intent is present and we have either a text location (geocoded) or profile GPS,
 * fetches top cheap nearby restaurants. Otherwise asks for location.
 */
export async function runFoodPlaceAssist(
  message: string,
  profileCoords: { lat: number; lng: number } | null,
): Promise<FoodPlaceAssistOutcome> {
  const food = detectFoodKeyword(message);
  if (!food) return { kind: 'noop' };

  const explicit = extractLocationFromMessage(message);

  if (explicit) {
    const picks = await getNearbyRestaurants(food, explicit);
    if (picks.length === 0) {
      const coords = await resolveLocationCoordsForFoodChat(explicit);
      if (!coords) {
        return { kind: 'need_location', foodKeyword: food };
      }
    }
    const intro = formatFoodAssistMessage(food, explicit, picks);
    return {
      kind: 'found',
      foodKeyword: food,
      locationLabel: explicit,
      picks,
      intro,
    };
  }

  if (!profileCoords) {
    return { kind: 'need_location', foodKeyword: food };
  }

  const picks = await fetchTopCheapestNearbyForChat(
    profileCoords.lat,
    profileCoords.lng,
    food,
    3,
  );
  const intro = formatFoodAssistMessage(food, 'near you', picks);

  return {
    kind: 'found',
    foodKeyword: food,
    locationLabel: 'near you',
    picks,
    intro,
  };
}
