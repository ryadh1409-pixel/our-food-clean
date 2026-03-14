import { db } from '@/firebase/config';
import { collection, getDocs } from 'firebase/firestore';

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
  totalPrice?: number;
  price?: number;
  status?: string;
  latitude?: number;
  longitude?: number;
  location?: { latitude?: number; longitude?: number };
};

type RawUser = Record<string, unknown> & {
  displayName?: string;
  name?: string;
  email?: string;
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

function getOrderPrice(order: RawOrder): number | null {
  const p = order.totalPrice ?? order.price;
  return typeof p === 'number' ? p : null;
}

function getOrderParticipantIds(order: RawOrder): string[] {
  const ids = (order.participantIds ?? order.joinedUsers ?? []) as string[];
  const host = (order.hostId ?? order.creatorId ?? order.userId) as
    | string
    | undefined;
  if (host && !ids.includes(host)) return [host, ...ids];
  return Array.isArray(ids) ? [...ids] : [];
}

function getOrderLatLng(order: RawOrder): { lat: number; lng: number } | null {
  const lat = order.latitude ?? order.location?.latitude;
  const lng = order.longitude ?? order.location?.longitude;
  if (typeof lat === 'number' && typeof lng === 'number') return { lat, lng };
  return null;
}

export type InvestorReportMetrics = {
  totalUsers: number;
  activeUsers7d: number;
  totalOrders: number;
  ordersToday: number;
  avgOrdersPerUser: number;
  matchRate: number;
  weeklyGrowthPercent: number;
  retentionRate: number;
  topRestaurants: { name: string; total: number; avgPrice: number }[];
  powerUsers: {
    name: string;
    email: string;
    totalOrders: number;
    joinedOrders: number;
  }[];
  ordersLast30Days: number;
  peakHours: { hour: number; count: number }[];
  ordersByDaySummary: { day: string; count: number }[];
  avgOrderValue: number;
  avgSavingsPerUser: number;
};

export async function computeInvestorMetrics(): Promise<InvestorReportMetrics> {
  const now = Date.now();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayStartMs = todayStart.getTime();
  const sevenDaysAgo = now - 7 * MS_PER_DAY;
  const fourteenDaysAgo = now - 14 * MS_PER_DAY;
  const weekAgo = now - 7 * MS_PER_DAY;

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
  const ordersWithTime = orders
    .map((o) => ({ order: o, createdAt: getOrderCreatedAt(o) }))
    .filter((x) => x.createdAt > 0);
  const totalOrders = ordersWithTime.length;
  const ordersToday = ordersWithTime.filter(
    (x) => x.createdAt >= todayStartMs,
  ).length;
  const activeUserIds = new Set<string>();
  const activeUserIdsPreviousWeek = new Set<string>();
  const userOrderCount: Record<string, { total: number; joined: number }> = {};
  const restaurantData: Record<string, { total: number; sumPrice: number }> =
    {};
  let matchedOrders = 0;
  let totalOrderValue = 0;

  ordersWithTime.forEach(({ order, createdAt }) => {
    if (createdAt >= sevenDaysAgo)
      getOrderParticipantIds(order).forEach((uid) => activeUserIds.add(uid));
    if (createdAt >= fourteenDaysAgo && createdAt < sevenDaysAgo) {
      getOrderParticipantIds(order).forEach((uid) =>
        activeUserIdsPreviousWeek.add(uid),
      );
    }
    const ids = getOrderParticipantIds(order);
    if (ids.length > 1) matchedOrders += 1;
    ids.forEach((uid) => {
      if (!userOrderCount[uid]) userOrderCount[uid] = { total: 0, joined: 0 };
      userOrderCount[uid].total += 1;
      const isHost = (order.hostId ?? order.creatorId ?? order.userId) === uid;
      if (!isHost) userOrderCount[uid].joined += 1;
    });
    const rest = getOrderRestaurant(order);
    if (!restaurantData[rest]) restaurantData[rest] = { total: 0, sumPrice: 0 };
    restaurantData[rest].total += 1;
    const price = getOrderPrice(order);
    if (price != null) {
      restaurantData[rest].sumPrice += price;
      totalOrderValue += price;
    }
  });

  const activeUsers7d = activeUserIds.size;
  const activePreviousWeek = activeUserIdsPreviousWeek.size;
  const retained = [...activeUserIdsPreviousWeek].filter((uid) =>
    activeUserIds.has(uid),
  ).length;
  const retentionRate =
    activePreviousWeek > 0 ? (retained / activePreviousWeek) * 100 : 0;

  const thisWeekOrders = ordersWithTime.filter(
    (x) => x.createdAt >= weekAgo,
  ).length;
  const lastWeekOrders = ordersWithTime.filter(
    (x) => x.createdAt >= now - 14 * MS_PER_DAY && x.createdAt < weekAgo,
  ).length;
  const weeklyGrowthPercent =
    lastWeekOrders > 0
      ? ((thisWeekOrders - lastWeekOrders) / lastWeekOrders) * 100
      : 0;

  const avgOrdersPerUser = totalUsers > 0 ? totalOrders / totalUsers : 0;
  const matchRate = totalOrders > 0 ? (matchedOrders / totalOrders) * 100 : 0;
  const avgOrderValue = totalOrders > 0 ? totalOrderValue / totalOrders : 0;
  const avgSavingsPerUser =
    totalUsers > 0 && totalOrders > 0 ? totalOrderValue / 2 / totalUsers : 0;

  const dayMap: Record<string, number> = {};
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now - i * MS_PER_DAY);
    dayMap[d.toISOString().slice(0, 10)] = 0;
  }
  ordersWithTime.forEach(({ createdAt }) => {
    const key = new Date(createdAt).toISOString().slice(0, 10);
    if (dayMap[key] !== undefined) dayMap[key] += 1;
  });
  const ordersByDaySummary = Object.entries(dayMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, count]) => ({ day, count }));
  const ordersLast30Days = ordersByDaySummary.reduce((s, x) => s + x.count, 0);

  const hourMap: Record<number, number> = {};
  for (let h = 0; h < 24; h++) hourMap[h] = 0;
  ordersWithTime.forEach(({ createdAt }) => {
    hourMap[new Date(createdAt).getHours()] =
      (hourMap[new Date(createdAt).getHours()] || 0) + 1;
  });
  const peakHours = Object.entries(hourMap)
    .map(([hour, count]) => ({ hour: Number(hour), count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const userById = new Map(users.map((u) => [u.id, u]));
  const powerUsers = Object.entries(userOrderCount)
    .map(([uid, stats]) => {
      const u = userById.get(uid);
      return {
        name: (u?.displayName ?? u?.name ?? '—') as string,
        email: (u?.email ?? '—') as string,
        totalOrders: stats.total,
        joinedOrders: stats.joined,
      };
    })
    .filter((p) => p.totalOrders > 0)
    .sort((a, b) => b.totalOrders - a.totalOrders)
    .slice(0, 20);

  const topRestaurants = Object.entries(restaurantData)
    .filter(([name]) => name !== '—')
    .map(([name, data]) => ({
      name,
      total: data.total,
      avgPrice: data.total > 0 ? data.sumPrice / data.total : 0,
    }))
    .sort((a, b) => b.total - a.total);

  return {
    totalUsers,
    activeUsers7d,
    totalOrders,
    ordersToday,
    avgOrdersPerUser,
    matchRate,
    weeklyGrowthPercent,
    retentionRate,
    topRestaurants,
    powerUsers,
    ordersLast30Days,
    peakHours,
    ordersByDaySummary,
    avgOrderValue,
    avgSavingsPerUser,
  };
}
