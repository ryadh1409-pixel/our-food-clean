/**
 * Backend AI (/chat) may return `{ reply }`, structured `{ food, category, searchQuery }`,
 * or raw OpenAI Responses JSON. Set EXPO_PUBLIC_AI_CHAT_URL e.g. http://192.168.1.10:3000/chat
 */

export type AiDecision = {
  intent?: string;
  message?: string;
  suggest_split?: boolean;
  reason?: string;
  /** Agent pick (intent recommend_order) */
  restaurant?: string;
  food?: string;
  estimated_price?: number;
};

function stripJsonFence(text: string): string {
  let t = text.trim();
  if (!t.startsWith('```')) return t;
  t = t.replace(/^```(?:json)?\s*/i, '');
  const end = t.lastIndexOf('```');
  if (end !== -1) t = t.slice(0, end);
  return t.trim();
}

function extractModelText(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;

  /** Server proxy may return `{ reply: string }` instead of raw OpenAI JSON */
  if (typeof d.reply === 'string' && d.reply.trim()) return d.reply;

  /** Structured extractor from food assistant proxy */
  if (
    'food' in d ||
    'category' in d ||
    'searchQuery' in d
  ) {
    const food = typeof d.food === 'string' ? d.food : '';
    const category = typeof d.category === 'string' ? d.category : 'unknown';
    const searchQuery =
      typeof d.searchQuery === 'string' ? d.searchQuery : '';
    return JSON.stringify({
      intent: 'recommend_order',
      food,
      reason: category,
      restaurant: '',
      estimated_price: 18.99,
      suggest_split: false,
      message: searchQuery || `${food} near me`.trim(),
    });
  }

  const out = d.output;
  if (Array.isArray(out) && out[0] && typeof out[0] === 'object') {
    const first = out[0] as Record<string, unknown>;
    const content = first.content;
    if (Array.isArray(content) && content[0] && typeof content[0] === 'object') {
      const block = content[0] as Record<string, unknown>;
      const text = block.text;
      if (typeof text === 'string') return text;
    }
  }

  if (typeof d.output_text === 'string') return d.output_text;

  const choices = d.choices;
  if (Array.isArray(choices) && choices[0] && typeof choices[0] === 'object') {
    const ch = choices[0] as Record<string, unknown>;
    const msg = ch.message as Record<string, unknown> | undefined;
    const content = msg?.content;
    if (typeof content === 'string') return content;
  }

  return null;
}

export function parseDecisionFromChatResponse(
  data: unknown,
): { decision: AiDecision; rawText: string | null } {
  const raw = extractModelText(data);
  if (!raw || !raw.trim()) {
    return { decision: { intent: 'fallback', message: 'No response from AI.' }, rawText: raw };
  }

  const trimmed = stripJsonFence(raw.trim());
  try {
    const parsed = JSON.parse(trimmed) as AiDecision;
    if (parsed && typeof parsed === 'object') {
      return { decision: parsed, rawText: raw };
    }
  } catch {
    // not JSON
  }

  return {
    decision: { intent: 'fallback', message: trimmed },
    rawText: raw,
  };
}

export async function sendMessageToAI(
  message: string,
  chatUrl: string,
): Promise<
  | { ok: true; data: unknown; decision: AiDecision; rawText: string | null }
  | { ok: false; error: string; status?: number }
> {
  const url = chatUrl.trim();
  if (!url) {
    return { ok: false, error: 'AI chat URL is not configured.' };
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });

    const data: unknown = await res.json().catch(() => ({}));

    if (!res.ok) {
      const errBody =
        data && typeof data === 'object'
          ? typeof (data as { reply?: unknown }).reply === 'string'
            ? String((data as { reply: string }).reply)
            : 'error' in data
              ? String((data as { error?: unknown }).error)
              : res.statusText
          : res.statusText;
      return {
        ok: false,
        error: errBody || `Request failed (${res.status})`,
        status: res.status,
      };
    }

    const { decision, rawText } = parseDecisionFromChatResponse(data);
    return { ok: true, data, decision, rawText };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Network error';
    return { ok: false, error: msg };
  }
}

export function getAiChatUrl(): string {
  return (process.env.EXPO_PUBLIC_AI_CHAT_URL ?? '').trim();
}
