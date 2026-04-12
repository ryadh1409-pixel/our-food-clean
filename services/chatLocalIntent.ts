import { detectFoodKeyword } from '@/services/chatFoodAssist';

export type LocalAssistantPrimaryIntent =
  | 'join'
  | 'food'
  | 'location_help'
  | 'general';

/**
 * Routes local assistant (no backend AI URL): join vs food vs location hints.
 */
export function detectLocalAssistantIntent(text: string): {
  primary: LocalAssistantPrimaryIntent;
} {
  const t = text.trim().toLowerCase();
  if (!t) return { primary: 'general' };

  const join =
    /\b(join (an? |the )?order|find (an? )?order|open orders|split (this|with|the|a)?|looking to split|group order|match me|anyone (splitting|ordering))\b/.test(
      t,
    ) ||
    (/\bjoin\b/.test(t) && /\border\b/.test(t)) ||
    /\bsplit (it|half|the bill)\b/.test(t);

  if (join) return { primary: 'join' };

  if (detectFoodKeyword(text)) return { primary: 'food' };

  if (detectLocationHelpIntent(text)) return { primary: 'location_help' };

  return { primary: 'general' };
}

export function detectLocationHelpIntent(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t || detectFoodKeyword(text)) return false;

  if (
    /\b(set|update|change)\s+(my\s+)?(home\s+)?(location|address)\b/.test(t)
  )
    return true;
  if (/\bwhere (do|can) i (set|add|update)\b/.test(t) && /\b(location|address)\b/.test(t))
    return true;
  if (/\b(how|where)\b.*\b(location|gps|address)\b/.test(t)) return true;
  if (/\bprofile\b/.test(t) && /\b(location|address|map)\b/.test(t))
    return true;

  return false;
}
