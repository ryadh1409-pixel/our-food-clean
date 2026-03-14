import { db } from '@/firebase/config';
import {
  addDoc,
  collection,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore';
import nodemailer from 'nodemailer';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

type RawOrder = Record<string, unknown> & {
  createdAt?: { toMillis?: () => number };
  participantIds?: string[];
  joinedUsers?: string[];
  hostId?: string;
  creatorId?: string;
  userId?: string;
  restaurantName?: string;
  restaurant?: string;
};

type RawUser = Record<string, unknown> & {
  createdAt?: { toDate?: () => Date };
};

function getOrderCreatedAt(order: RawOrder): number {
  const created = order.createdAt;
  if (created && typeof created.toMillis === 'function')
    return created.toMillis();
  return 0;
}

function getOrderRestaurant(order: RawOrder): string {
  const name = (order.restaurantName ?? order.restaurant ?? '—') as string;
  return String(name).trim() || '—';
}

function getOrderParticipantIds(order: RawOrder): string[] {
  const ids = (order.participantIds ?? order.joinedUsers ?? []) as string[];
  const host = (order.hostId ?? order.creatorId ?? order.userId) as
    | string
    | undefined;
  if (host && !ids.includes(host)) return [host, ...ids];
  return Array.isArray(ids) ? [...ids] : [];
}

function getUserCreatedAt(user: RawUser): number {
  const d = user.createdAt;
  if (d && typeof (d as { toDate?: () => Date }).toDate === 'function') {
    return (d as { toDate: () => Date }).toDate().getTime();
  }
  return 0;
}

export type FounderReportPayload = {
  date: string;
  users: {
    newLast24h: number;
    total: number;
    activeLast7d: number;
  };
  orders: {
    last24h: number;
    matched: number;
    matchRate: number;
    topRestaurant: string;
    peakTime: number;
  };
  weeklyGrowthPercent: number;
  avgOrdersPerUser: number;
};

export async function runFounderReport(): Promise<FounderReportPayload> {
  const now = Date.now();
  const last24h = now - MS_PER_DAY;
  const last7d = now - 7 * MS_PER_DAY;
  const last14d = now - 14 * MS_PER_DAY;

  const [usersSnap, ordersSnap] = await Promise.all([
    getDocs(collection(db, 'users')),
    getDocs(collection(db, 'orders')),
  ]);

  const users = usersSnap.docs.map(
    (d) => ({ id: d.id, ...d.data() }) as RawUser & { id: string },
  );
  const orders = ordersSnap.docs.map(
    (d) => ({ id: d.id, ...d.data() }) as RawOrder,
  );

  const totalUsers = users.length;
  const newUsersLast24h = users.filter(
    (u) => getUserCreatedAt(u) >= last24h,
  ).length;
  const activeUserIds7d = new Set<string>();

  const ordersWithTime = orders
    .map((o) => ({ order: o, createdAt: getOrderCreatedAt(o) }))
    .filter((x) => x.createdAt > 0);
  const ordersLast24h = ordersWithTime.filter(
    (x) => x.createdAt >= last24h,
  ).length;
  let matchedOrders = 0;
  const restaurantCount: Record<string, number> = {};
  const hourCount: Record<number, number> = {};
  for (let h = 0; h < 24; h++) hourCount[h] = 0;

  const getHourToronto = (ms: number) =>
    Number(
      new Date(ms).toLocaleString('en-CA', {
        timeZone: 'America/Toronto',
        hour: 'numeric',
        hour12: false,
      }),
    );

  ordersWithTime.forEach(({ order, createdAt }) => {
    if (createdAt >= last7d)
      getOrderParticipantIds(order).forEach((uid) => activeUserIds7d.add(uid));
    const ids = getOrderParticipantIds(order);
    if (ids.length > 1) matchedOrders += 1;
    const rest = getOrderRestaurant(order);
    restaurantCount[rest] = (restaurantCount[rest] || 0) + 1;
    hourCount[getHourToronto(createdAt)] += 1;
  });

  const activeLast7d = activeUserIds7d.size;
  const totalOrders = ordersWithTime.length;
  const matchRate = totalOrders > 0 ? (matchedOrders / totalOrders) * 100 : 0;
  const topRestaurant =
    Object.entries(restaurantCount)
      .filter(([n]) => n !== '—')
      .sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';
  const peakTime =
    Object.entries(hourCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;

  const newUsersThisWeek = users.filter(
    (u) => getUserCreatedAt(u) >= last7d,
  ).length;
  const newUsersLastWeek = users.filter(
    (u) => getUserCreatedAt(u) >= last14d && getUserCreatedAt(u) < last7d,
  ).length;
  const weeklyGrowthPercent =
    newUsersLastWeek > 0
      ? ((newUsersThisWeek - newUsersLastWeek) / newUsersLastWeek) * 100
      : 0;

  const avgOrdersPerUser = totalUsers > 0 ? totalOrders / totalUsers : 0;

  const dateStr = new Date().toLocaleDateString('en-CA', {
    timeZone: 'America/Toronto',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const payload: FounderReportPayload = {
    date: dateStr,
    users: {
      newLast24h: newUsersLast24h,
      total: totalUsers,
      activeLast7d: activeLast7d,
    },
    orders: {
      last24h: ordersLast24h,
      matched: matchedOrders,
      matchRate,
      topRestaurant,
      peakTime: Number(peakTime),
    },
    weeklyGrowthPercent,
    avgOrdersPerUser,
  };

  const messageText = [
    'HalfOrder Daily Founder Report',
    payload.date,
    '',
    '--- Users ---',
    `New users (last 24h): ${payload.users.newLast24h}`,
    `Total users: ${payload.users.total}`,
    `Active users (last 7 days): ${payload.users.activeLast7d}`,
    '',
    '--- Orders ---',
    `Orders (last 24h): ${payload.orders.last24h}`,
    `Matched orders: ${payload.orders.matched}`,
    `Match rate: ${payload.orders.matchRate.toFixed(1)}%`,
    `Top restaurant: ${payload.orders.topRestaurant}`,
    `Peak hour: ${payload.orders.peakTime}:00`,
    '',
    '--- Growth ---',
    `Weekly growth (users): ${payload.weeklyGrowthPercent.toFixed(1)}%`,
    `Avg orders per user: ${payload.avgOrdersPerUser.toFixed(1)}`,
  ].join('\n');

  const adminEmail = process.env.ADMIN_EMAIL;
  if (adminEmail) {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth:
        process.env.SMTP_USER && process.env.SMTP_PASS
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
    });
    await transporter.sendMail({
      from: process.env.SMTP_USER || adminEmail,
      to: adminEmail,
      subject: 'HalfOrder Founder Daily Report',
      text: messageText,
    });
  }

  await addDoc(collection(db, 'founderReports'), {
    date: dateStr,
    users: payload.users,
    orders: {
      last24h: payload.orders.last24h,
      matched: payload.orders.matched,
      matchRate: payload.orders.matchRate,
      topRestaurant: payload.orders.topRestaurant,
      peakTime: payload.orders.peakTime,
    },
    matchRate: payload.orders.matchRate,
    peakTime: payload.orders.peakTime,
    weeklyGrowthPercent: payload.weeklyGrowthPercent,
    avgOrdersPerUser: payload.avgOrdersPerUser,
    createdAt: serverTimestamp(),
  });

  return payload;
}
