import AdminLayout from '@/components/AdminLayout';
import ProtectedRoute from '@/components/ProtectedRoute';
import { db } from '@/firebase/config';
import { collection, getDocs, query, where } from 'firebase/firestore';
import Link from 'next/link';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

type RawOrder = {
  id: string;
  userId?: string;
  hostId?: string;
  creatorId?: string;
  participantIds?: string[];
  joinedUsers?: string[];
  restaurantName?: string;
  restaurant?: string;
  totalPrice?: number;
  price?: number;
  status?: string;
  latitude?: number;
  longitude?: number;
  location?: { latitude?: number; longitude?: number };
  createdAt?: { toMillis: () => number };
};

type RawUser = {
  id: string;
  displayName?: string;
  name?: string;
  email?: string;
  createdAt?: { toDate: () => Date };
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const NOW = Date.now();
const TODAY_START = new Date();
TODAY_START.setHours(0, 0, 0, 0);
const TODAY_START_MS = TODAY_START.getTime();
const SEVEN_DAYS_AGO = NOW - 7 * MS_PER_DAY;
const FOURTEEN_DAYS_AGO = NOW - 14 * MS_PER_DAY;

function getOrderCreatedAt(order: RawOrder): number {
  const created = order.createdAt;
  if (created && typeof created.toMillis === 'function')
    return created.toMillis();
  return 0;
}

function getOrderRestaurant(order: RawOrder): string {
  return (order.restaurantName || order.restaurant || '—').trim() || '—';
}

function getOrderPrice(order: RawOrder): number | null {
  const p = order.totalPrice ?? order.price;
  return typeof p === 'number' ? p : null;
}

function getOrderParticipantIds(order: RawOrder): string[] {
  const ids = order.participantIds ?? order.joinedUsers ?? [];
  const host = order.hostId ?? order.creatorId ?? order.userId;
  if (host && !ids.includes(host)) return [host, ...ids];
  return Array.isArray(ids) ? [...ids] : [];
}

function getOrderLatLng(order: RawOrder): { lat: number; lng: number } | null {
  const lat = order.latitude ?? order.location?.latitude;
  const lng = order.longitude ?? order.location?.longitude;
  if (typeof lat === 'number' && typeof lng === 'number') return { lat, lng };
  return null;
}

const CHART_COLORS = ['#FFD700', '#E6BF00', '#B8860B', '#8B6914', '#6B5B00'];

export default function AnalyticsPage() {
  const [users, setUsers] = useState<RawUser[]>([]);
  const [orders, setOrders] = useState<RawOrder[]>([]);
  const [hotspotAlerts, setHotspotAlerts] = useState<
    { latitude: number; longitude: number }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const [usersSnap, ordersSnap, alertsSnap] = await Promise.all([
          getDocs(collection(db, 'users')),
          getDocs(collection(db, 'orders')),
          getDocs(
            query(collection(db, 'alerts'), where('type', '==', 'hotspot')),
          ),
        ]);
        const userList: RawUser[] = usersSnap.docs.map(
          (d) => ({ id: d.id, ...d.data() }) as RawUser,
        );
        const orderList: RawOrder[] = ordersSnap.docs.map(
          (d) => ({ id: d.id, ...d.data() }) as RawOrder,
        );
        const hotspots: { latitude: number; longitude: number }[] =
          alertsSnap.docs
            .map((d) => d.data().location)
            .filter(
              (loc) =>
                loc &&
                typeof loc.latitude === 'number' &&
                typeof loc.longitude === 'number',
            ) as {
            latitude: number;
            longitude: number;
          }[];
        setUsers(userList);
        setOrders(orderList);
        setHotspotAlerts(hotspots);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const metrics = useMemo(() => {
    const totalUsers = users.length;
    const ordersWithTime = orders
      .map((o) => ({ order: o, createdAt: getOrderCreatedAt(o) }))
      .filter((x) => x.createdAt > 0);
    const totalOrders = ordersWithTime.length;
    const ordersToday = ordersWithTime.filter(
      (x) => x.createdAt >= TODAY_START_MS,
    ).length;
    const activeUserIds = new Set<string>();
    const activeUserIdsPrevWeek = new Set<string>();
    const userOrderCount: Record<
      string,
      { created: number; joined: number; lastActive: number }
    > = {};
    const restaurantData: Record<string, { total: number; sumPrice: number }> =
      {};
    let matchedOrders = 0;
    let totalOrderValue = 0;

    ordersWithTime.forEach(({ order, createdAt }) => {
      if (createdAt >= SEVEN_DAYS_AGO)
        getOrderParticipantIds(order).forEach((uid) => activeUserIds.add(uid));
      if (createdAt >= FOURTEEN_DAYS_AGO && createdAt < SEVEN_DAYS_AGO) {
        getOrderParticipantIds(order).forEach((uid) =>
          activeUserIdsPrevWeek.add(uid),
        );
      }
      const ids = getOrderParticipantIds(order);
      if (ids.length >= 2) matchedOrders += 1;
      ids.forEach((uid) => {
        if (!userOrderCount[uid])
          userOrderCount[uid] = { created: 0, joined: 0, lastActive: 0 };
        const isHost =
          (order.hostId ?? order.creatorId ?? order.userId) === uid;
        if (isHost) userOrderCount[uid].created += 1;
        else userOrderCount[uid].joined += 1;
        userOrderCount[uid].lastActive = Math.max(
          userOrderCount[uid].lastActive,
          createdAt,
        );
      });
      const rest = getOrderRestaurant(order);
      if (!restaurantData[rest])
        restaurantData[rest] = { total: 0, sumPrice: 0 };
      restaurantData[rest].total += 1;
      const price = getOrderPrice(order);
      if (price != null) {
        restaurantData[rest].sumPrice += price;
        totalOrderValue += price;
      }
    });

    const activeUsers7d = activeUserIds.size;
    const retained = [...activeUserIdsPrevWeek].filter((uid) =>
      activeUserIds.has(uid),
    ).length;
    const retentionRate =
      activeUserIdsPrevWeek.size > 0
        ? (retained / activeUserIdsPrevWeek.size) * 100
        : 0;

    const thisWeekOrders = ordersWithTime.filter(
      (x) => x.createdAt >= SEVEN_DAYS_AGO,
    ).length;
    const lastWeekOrders = ordersWithTime.filter(
      (x) => x.createdAt >= FOURTEEN_DAYS_AGO && x.createdAt < SEVEN_DAYS_AGO,
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
    const cacEstimate = totalUsers > 0 ? 0 : 0;

    const dayMap: Record<string, number> = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date(NOW - i * MS_PER_DAY);
      dayMap[d.toISOString().slice(0, 10)] = 0;
    }
    ordersWithTime.forEach(({ createdAt }) => {
      const key = new Date(createdAt).toISOString().slice(0, 10);
      if (dayMap[key] !== undefined) dayMap[key] += 1;
    });
    const ordersPerDay = Object.entries(dayMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, count]) => ({ day: day.slice(5), count }));

    const hourMap: Record<number, number> = {};
    for (let h = 0; h < 24; h++) hourMap[h] = 0;
    ordersWithTime.forEach(({ createdAt }) => {
      const h = new Date(createdAt).getHours();
      hourMap[h] = (hourMap[h] || 0) + 1;
    });
    const ordersByHour = Object.entries(hourMap).map(([hour, count]) => ({
      hour: `${hour}h`,
      count,
    }));

    const userCreatedDay: Record<string, number> = {};
    users.forEach((u) => {
      const d = (u.createdAt as { toDate?: () => Date })?.toDate?.();
      if (d) {
        const key = d.toISOString().slice(0, 10);
        userCreatedDay[key] = (userCreatedDay[key] || 0) + 1;
      }
    });
    const newUsersPerDay = Object.entries(dayMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day]) => ({ day: day.slice(5), count: userCreatedDay[day] || 0 }));

    const matchByDay: Record<string, { total: number; matched: number }> = {};
    Object.keys(dayMap).forEach((k) => {
      matchByDay[k] = { total: 0, matched: 0 };
    });
    ordersWithTime.forEach(({ order, createdAt }) => {
      const key = new Date(createdAt).toISOString().slice(0, 10);
      if (matchByDay[key]) {
        matchByDay[key].total += 1;
        if (getOrderParticipantIds(order).length >= 2)
          matchByDay[key].matched += 1;
      }
    });
    const matchRateTrend = Object.entries(matchByDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, v]) => ({
        day: day.slice(5),
        rate: v.total > 0 ? (v.matched / v.total) * 100 : 0,
      }));

    const userById = new Map(users.map((u) => [u.id, u]));
    const powerUsers = Object.entries(userOrderCount)
      .map(([uid, stats]) => {
        const u = userById.get(uid);
        return {
          id: uid,
          name: u?.displayName ?? u?.name ?? '—',
          email: u?.email ?? '—',
          totalOrders: stats.created + stats.joined,
          joinedOrders: stats.joined,
          lastActive: stats.lastActive,
        };
      })
      .filter((p) => p.totalOrders > 0)
      .sort((a, b) => b.totalOrders - a.totalOrders)
      .slice(0, 20);

    const restaurants = Object.entries(restaurantData)
      .filter(([name]) => name !== '—')
      .map(([name, data]) => ({
        name,
        total: data.total,
        avgPrice: data.total > 0 ? data.sumPrice / data.total : 0,
      }))
      .sort((a, b) => b.total - a.total);

    const ordersList = ordersWithTime
      .map(({ order, createdAt }) => {
        const ids = getOrderParticipantIds(order);
        const hostId = order.hostId ?? order.creatorId ?? order.userId;
        const host = hostId ? userById.get(hostId) : null;
        return {
          id: (order as RawOrder & { id: string }).id,
          user: host
            ? (host.displayName ?? host.name ?? hostId)
            : (hostId ?? '—'),
          restaurant: getOrderRestaurant(order),
          price: getOrderPrice(order),
          createdAt,
          participants: ids.length,
          status: order.status ?? '—',
        };
      })
      .sort((a, b) => b.createdAt - a.createdAt);

    const heatmapPoints = orders
      .map((o) => getOrderLatLng(o))
      .filter((p): p is { lat: number; lng: number } => p != null);
    const lats = heatmapPoints.map((p) => p.lat);
    const lngs = heatmapPoints.map((p) => p.lng);
    const minLat = lats.length ? Math.min(...lats) : 0;
    const maxLat = lats.length ? Math.max(...lats) : 1;
    const minLng = lngs.length ? Math.min(...lngs) : 0;
    const maxLng = lngs.length ? Math.max(...lngs) : 1;
    const gridSize = 12;
    const heatGrid: number[][] = Array(gridSize)
      .fill(0)
      .map(() => Array(gridSize).fill(0));
    heatmapPoints.forEach(({ lat, lng }) => {
      const gi = Math.min(
        gridSize - 1,
        Math.floor(((lat - minLat) / (maxLat - minLat || 1)) * gridSize),
      );
      const gj = Math.min(
        gridSize - 1,
        Math.floor(((lng - minLng) / (maxLng - minLng || 1)) * gridSize),
      );
      heatGrid[gi][gj] += 1;
    });
    const maxHeat = Math.max(...heatGrid.flat(), 1);

    return {
      totalUsers,
      activeUsers7d,
      totalOrders,
      ordersToday,
      avgOrdersPerUser,
      matchRate,
      weeklyGrowthPercent,
      retentionRate,
      ordersPerDay,
      ordersByHour,
      newUsersPerDay,
      matchRateTrend,
      powerUsers,
      restaurants,
      ordersList,
      heatGrid,
      maxHeat,
      hasHeatmap: heatmapPoints.length > 0,
      heatmapBounds: { minLat, maxLat, minLng, maxLng },
      gridSize: 12,
      avgOrderValue,
      avgSavingsPerUser,
      cacEstimate,
      matchSuccessRate: matchRate,
    };
  }, [users, orders]);

  const handleExportReport = async () => {
    setExportMessage(null);
    setExporting(true);
    try {
      const res = await fetch('/api/exportInvestorReport', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setExportMessage({
          type: 'error',
          text: data.error || 'Export failed',
        });
        return;
      }
      setExportMessage({
        type: 'success',
        text: 'Investor report sent successfully.',
      });
    } catch (e) {
      setExportMessage({
        type: 'error',
        text: e instanceof Error ? e.message : 'Export failed',
      });
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <ProtectedRoute>
        <AdminLayout title="Analytics">
          <p className="text-gray-500">Loading analytics...</p>
        </AdminLayout>
      </ProtectedRoute>
    );
  }

  const topCards = [
    { label: 'Total Users', value: metrics.totalUsers },
    { label: 'Active Users (last 7 days)', value: metrics.activeUsers7d },
    { label: 'Total Orders', value: metrics.totalOrders },
    { label: 'Orders Today', value: metrics.ordersToday },
    { label: 'Match Rate', value: `${metrics.matchRate.toFixed(1)}%` },
    {
      label: 'Avg Orders per User',
      value: metrics.avgOrdersPerUser.toFixed(1),
    },
    {
      label: 'Weekly Growth %',
      value: `${metrics.weeklyGrowthPercent.toFixed(1)}%`,
    },
    { label: 'Retention Rate', value: `${metrics.retentionRate.toFixed(1)}%` },
  ];

  return (
    <ProtectedRoute>
      <AdminLayout title="Startup Analytics & Investor Dashboard">
        <div className="space-y-8">
          {/* Section 7 - Export */}
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={handleExportReport}
              disabled={exporting}
              className="px-4 py-2.5 rounded-lg font-medium bg-primary text-gray-900 hover:bg-primaryDark disabled:opacity-50 shadow-sm"
            >
              {exporting ? 'Exporting...' : 'Export Investor Report (PDF)'}
            </button>
            {exportMessage && (
              <p
                className={`text-sm font-medium ${
                  exportMessage.type === 'success'
                    ? 'text-green-700'
                    : 'text-red-700'
                }`}
              >
                {exportMessage.text}
              </p>
            )}
          </div>

          {/* Section 1 - Top metrics cards */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Key Metrics
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 xl:grid-cols-8 gap-3">
              {topCards.map((c) => (
                <div
                  key={c.label}
                  className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm"
                >
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide truncate">
                    {c.label}
                  </p>
                  <p className="mt-1 text-xl font-bold text-gray-900 truncate">
                    {c.value}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Section 2 - Charts */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Charts</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-gray-800 mb-3">
                  Orders Last 30 Days
                </h3>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={metrics.ordersPerDay}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                      <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Line
                        type="monotone"
                        dataKey="count"
                        stroke="#E6BF00"
                        strokeWidth={2}
                        dot={{ r: 2 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-gray-800 mb-3">
                  Orders by Hour (Peak Time)
                </h3>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={metrics.ordersByHour}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                      <XAxis dataKey="hour" tick={{ fontSize: 9 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                        {metrics.ordersByHour.map((_, i) => (
                          <Cell
                            key={i}
                            fill={CHART_COLORS[i % CHART_COLORS.length]}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-gray-800 mb-3">
                  New Users Per Day
                </h3>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={metrics.newUsersPerDay}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                      <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Bar
                        dataKey="count"
                        fill="#B8860B"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-gray-800 mb-3">
                  Match Rate Trend
                </h3>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={metrics.matchRateTrend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                      <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} unit="%" />
                      <Tooltip
                        formatter={(v: number) => [
                          `${v.toFixed(1)}%`,
                          'Match rate',
                        ]}
                      />
                      <Line
                        type="monotone"
                        dataKey="rate"
                        stroke="#8B6914"
                        strokeWidth={2}
                        dot={{ r: 2 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </section>

          {/* Section 6 - Startup metrics */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Startup Metrics
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <p className="text-xs text-gray-500">CAC estimate</p>
                <p className="text-lg font-bold text-gray-900">
                  ${metrics.cacEstimate.toFixed(2)}
                </p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <p className="text-xs text-gray-500">Orders per user</p>
                <p className="text-lg font-bold text-gray-900">
                  {metrics.avgOrdersPerUser.toFixed(1)}
                </p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <p className="text-xs text-gray-500">User retention (7d)</p>
                <p className="text-lg font-bold text-gray-900">
                  {metrics.retentionRate.toFixed(1)}%
                </p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <p className="text-xs text-gray-500">Match success rate</p>
                <p className="text-lg font-bold text-gray-900">
                  {metrics.matchSuccessRate.toFixed(1)}%
                </p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <p className="text-xs text-gray-500">Avg order value</p>
                <p className="text-lg font-bold text-gray-900">
                  ${metrics.avgOrderValue.toFixed(2)}
                </p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <p className="text-xs text-gray-500">Avg savings per user</p>
                <p className="text-lg font-bold text-gray-900">
                  ${metrics.avgSavingsPerUser.toFixed(2)}
                </p>
              </div>
            </div>
          </section>

          {/* Section 5 - Heatmap */}
          {metrics.hasHeatmap && (
            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Order Density Heatmap
              </h2>
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm overflow-hidden">
                <p className="text-xs text-gray-500 mb-2">
                  Activity by location (grid). Red border = hotspot alert.
                </p>
                <div
                  className="inline-grid gap-0.5"
                  style={{
                    gridTemplateColumns: `repeat(${metrics.gridSize}, minmax(0, 1fr))`,
                  }}
                >
                  {(() => {
                    const { minLat, maxLat, minLng, maxLng } =
                      metrics.heatmapBounds;
                    const gs = metrics.gridSize;
                    const hotspotCells = new Set<string>();
                    hotspotAlerts.forEach(
                      ({ latitude: lat, longitude: lng }) => {
                        const rangeLat = maxLat - minLat || 1;
                        const rangeLng = maxLng - minLng || 1;
                        const gi = Math.min(
                          gs - 1,
                          Math.max(
                            0,
                            Math.floor(((lat - minLat) / rangeLat) * gs),
                          ),
                        );
                        const gj = Math.min(
                          gs - 1,
                          Math.max(
                            0,
                            Math.floor(((lng - minLng) / rangeLng) * gs),
                          ),
                        );
                        hotspotCells.add(`${gi}-${gj}`);
                      },
                    );
                    return metrics.heatGrid.flatMap((row, i) =>
                      row.map((cell, j) => {
                        const isHotspot = hotspotCells.has(`${i}-${j}`);
                        return (
                          <div
                            key={`${i}-${j}`}
                            className={`w-5 h-5 rounded-sm transition-opacity ${isHotspot ? 'ring-2 ring-red-500 ring-offset-0' : ''}`}
                            style={{
                              backgroundColor: isHotspot
                                ? '#ef4444'
                                : cell > 0
                                  ? '#E6BF00'
                                  : '#f3f4f6',
                              opacity:
                                cell > 0 || isHotspot
                                  ? isHotspot
                                    ? 0.9
                                    : 0.3 + (cell / metrics.maxHeat) * 0.7
                                  : 0.5,
                            }}
                            title={
                              isHotspot
                                ? 'Hotspot detected here'
                                : cell > 0
                                  ? `${cell} order(s)`
                                  : ''
                            }
                          />
                        );
                      }),
                    );
                  })()}
                </div>
              </div>
            </section>
          )}

          {/* Section 3 - Tables */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">
                Power Users
              </h2>
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden overflow-x-auto max-h-80">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Name
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Email
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                        Orders
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                        Joined
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Last active
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {metrics.powerUsers.map((p) => (
                      <tr key={p.id}>
                        <td className="px-3 py-2 text-sm">
                          <Link
                            href={`/admin/users/${p.id}`}
                            className="text-primary hover:underline font-medium"
                          >
                            {p.name}
                          </Link>
                        </td>
                        <td className="px-3 py-2 text-sm text-gray-600 truncate max-w-[120px]">
                          {p.email}
                        </td>
                        <td className="px-3 py-2 text-sm text-right">
                          {p.totalOrders}
                        </td>
                        <td className="px-3 py-2 text-sm text-right">
                          {p.joinedOrders}
                        </td>
                        <td className="px-3 py-2 text-sm text-gray-600">
                          {p.lastActive
                            ? new Date(p.lastActive).toLocaleDateString(
                                undefined,
                                {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric',
                                },
                              )
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {metrics.powerUsers.length === 0 && (
                  <p className="px-4 py-6 text-center text-gray-500 text-sm">
                    No data yet.
                  </p>
                )}
              </div>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">
                Top Restaurants
              </h2>
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden overflow-x-auto max-h-80">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Restaurant
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                        Orders
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                        Avg price
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {metrics.restaurants.map((r) => (
                      <tr key={r.name}>
                        <td className="px-3 py-2 text-sm text-gray-900">
                          {r.name}
                        </td>
                        <td className="px-3 py-2 text-sm text-right">
                          {r.total}
                        </td>
                        <td className="px-3 py-2 text-sm text-right">
                          ${r.avgPrice.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {metrics.restaurants.length === 0 && (
                  <p className="px-4 py-6 text-center text-gray-500 text-sm">
                    No data yet.
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* Section 4 - Orders table */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Orders</h2>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      User
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Restaurant
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                      Price
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Created
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                      Participants
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {metrics.ordersList.slice(0, 100).map((o) => (
                    <tr key={o.id}>
                      <td className="px-3 py-2 text-sm text-gray-900">
                        {o.user}
                      </td>
                      <td className="px-3 py-2 text-sm text-gray-600">
                        {o.restaurant}
                      </td>
                      <td className="px-3 py-2 text-sm text-right">
                        {o.price != null ? `$${o.price.toFixed(2)}` : '—'}
                      </td>
                      <td className="px-3 py-2 text-sm text-gray-600">
                        {new Date(o.createdAt).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="px-3 py-2 text-sm text-right">
                        {o.participants}
                      </td>
                      <td className="px-3 py-2">
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                          {o.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {metrics.ordersList.length === 0 && (
                <p className="px-4 py-8 text-center text-gray-500">
                  No orders yet.
                </p>
              )}
              {metrics.ordersList.length > 100 && (
                <p className="px-4 py-2 text-center text-xs text-gray-500">
                  Showing first 100 orders.
                </p>
              )}
            </div>
          </section>
        </div>
      </AdminLayout>
    </ProtectedRoute>
  );
}
