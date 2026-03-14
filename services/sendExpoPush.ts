const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const BATCH_SIZE = 100;

type SendResult = { sent: number; failed: number; error?: string };

/**
 * Send push notifications to Expo push tokens.
 * Batches requests (max 100 per request).
 */
export async function sendExpoPush(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<SendResult> {
  const valid = tokens.filter((t) => typeof t === 'string' && t.length > 0);
  if (valid.length === 0) return { sent: 0, failed: 0 };

  const messages = valid.map((to) => ({
    to,
    sound: 'default',
    title,
    body,
    ...(data && Object.keys(data).length > 0 ? { data } : {}),
  }));
  let sent = 0;
  let failed = 0;

  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const chunk = messages.slice(i, i + BATCH_SIZE);
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(chunk),
      });
      const data = (await res.json()) as { data?: { status?: string }[] };
      const results = Array.isArray(data?.data) ? data.data : [];
      results.forEach((r) => (r?.status === 'ok' ? sent++ : failed++));
    } catch (e) {
      failed += chunk.length;
      return {
        sent,
        failed,
        error: e instanceof Error ? e.message : 'Request failed',
      };
    }
  }
  return { sent, failed };
}
