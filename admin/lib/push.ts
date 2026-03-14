import { db } from '@/firebase/config';
import { collection, getDocs } from 'firebase/firestore';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export async function sendPushToAllUsers(
  title: string,
  body: string,
): Promise<{ sent: number; failed: number }> {
  const snap = await getDocs(collection(db, 'users'));
  const tokens: string[] = [];
  snap.docs.forEach((d) => {
    const data = d.data();
    const token = data?.pushToken ?? data?.expoPushToken;
    if (typeof token === 'string' && token.length > 0) tokens.push(token);
  });
  if (tokens.length === 0) return { sent: 0, failed: 0 };
  const messages = tokens.map((to) => ({ to, title, body }));
  const response = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(messages),
  });
  const data = (await response.json()) as { data?: { status: string }[] };
  const results = Array.isArray(data?.data) ? data.data : [];
  const sent = results.filter((r) => r?.status === 'ok').length;
  return { sent, failed: results.length - sent };
}
