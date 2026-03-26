import AdminLayout from '@/components/AdminLayout';
import ProtectedRoute from '@/components/ProtectedRoute';
import { db } from '@/firebase/config';
import { collection, getDocs } from 'firebase/firestore';
import { getGridKey, getGridCenter, formatArea } from '@/lib/geoGrid';
import React, { useEffect, useMemo, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

type RawOrder = {
  id: string;
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
  latitude?: number;
  longitude?: number;
  location?: { latitude?: number; longitude?: number };
};

type RawUser = {
  id: string;
  createdAt?: { toDate?: () => Date };
};

function getOrderCreatedAt(o: RawOrder): number {
  const c = o.createdAt;
  if (c && typeof (c as { toMillis?: () => number }).toMillis === 'function')
    return (c as { toMillis: () => number }).toMillis();
  return 0;
}

function getOrderParticipantIds(o: RawOrder): string[] {
  const ids = (o.participantIds ?? o.joinedUsers ?? []) as string[];
  const host = (o.hostId ?? o.creatorId ?? o.userId) as string | undefined;
  if (host && !ids.includes(host)) return [host, ...ids];
  return [...ids];
}

function getOrderPrice(o: RawOrder): number | null {
  const p = o.totalPrice ?? o.price;
  return typeof p === 'number' ? p : null;
}

function getOrderLatLng(o: RawOrder): { lat: number; lng: number } | null {
  const lat = o.latitude ?? o.location?.latitude;
  const lng = o.longitude ?? o.location?.longitude;
  if (typeof lat === 'number' && typeof lng === 'number') return { lat, lng };
  return null;
}

export default function InvestorPage() {
  const [users, setUsers] = useState<RawUser[]>([]);
  const [orders, setOrders] = useState<RawOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const [usersSnap, ordersSnap] = await Promise.all([
          getDocs(collection(db, 'users')),
          getDocs(collection(db, 'orders')),
        ]);
        setUsers(
          usersSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as RawUser),
        );
        setOrders(
          ordersSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as RawOrder),
        );
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const metrics = useMemo(() => {
    const now = Date.now();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayStartMs = todayStart.getTime();
    const sevenDaysAgo = now - 7 * MS_PER_DAY;
    const fourteenDaysAgo = now - 14 * MS_PER_DAY;

    const totalUsers = users.length;
    const newUsers7d = users.filter((u) => {
      const d = (u.createdAt as { toDate?: () => Date })?.toDate?.();
      return d ? d.getTime() >= sevenDaysAgo : false;
    }).length;
    const newUsersLastWeek = users.filter((u) => {
      const d = (u.createdAt as { toDate?: () => Date })?.toDate?.();
      return d
        ? d.getTime() >= fourteenDaysAgo && d.getTime() < sevenDaysAgo
        : false;
    }).length;
    const weeklyGrowthPercent =
      newUsersLastWeek > 0
        ? ((newUsers7d - newUsersLastWeek) / newUsersLastWeek) * 100
        : 0;

    const ordersWithTime = orders
      .map((o) => ({ order: o, createdAt: getOrderCreatedAt(o) }))
      .filter((x) => x.createdAt > 0);
    const totalOrders = ordersWithTime.length;
    const matchedOrders = ordersWithTime.filter(
      ({ order }) => getOrderParticipantIds(order).length >= 2,
    ).length;
    const matchRate = totalOrders > 0 ? (matchedOrders / totalOrders) * 100 : 0;

    const dauSet = new Set<string>();
    ordersWithTime.forEach(({ order, createdAt }) => {
      if (createdAt >= todayStartMs)
        getOrderParticipantIds(order).forEach((id) => dauSet.add(id));
    });
    const dailyActiveUsers = dauSet.size;

    const userOrderCount: Record<string, number> = {};
    ordersWithTime.forEach(({ order }) => {
      getOrderParticipantIds(order).forEach((uid) => {
        userOrderCount[uid] = (userOrderCount[uid] ?? 0) + 1;
      });
    });
    const usersWithOrders = Object.keys(userOrderCount).length;
    const repeatUsers = Object.values(userOrderCount).filter(
      (c) => c >= 2,
    ).length;
    const repeatUserPercent =
      usersWithOrders > 0 ? (repeatUsers / usersWithOrders) * 100 : 0;
    const avgOrdersPerUser = totalUsers > 0 ? totalOrders / totalUsers : 0;

    let totalOrderValue = 0;
    ordersWithTime.forEach(({ order }) => {
      const p = getOrderPrice(order);
      if (p != null) totalOrderValue += p;
    });
    const avgOrderValue = totalOrders > 0 ? totalOrderValue / totalOrders : 0;
    const avgSavingPerUser =
      totalUsers > 0 && totalOrders > 0 ? totalOrderValue / 2 / totalUsers : 0;
    const estimatedRevenue = totalOrders * 0;

    const locationCount: Record<string, number> = {};
    ordersWithTime.forEach(({ order }) => {
      const ll = getOrderLatLng(order);
      if (ll) {
        const key = getGridKey(ll.lat, ll.lng);
        locationCount[key] = (locationCount[key] ?? 0) + 1;
      }
    });
    const locationTable = Object.entries(locationCount)
      .map(([key, count]) => {
        const { latitude, longitude } = getGridCenter(key);
        return { location: formatArea(latitude, longitude), orders: count };
      })
      .sort((a, b) => b.orders - a.orders)
      .slice(0, 20);

    const dayMap: Record<string, number> = {};
    const userDayMap: Record<string, number> = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now - i * MS_PER_DAY);
      const k = d.toISOString().slice(0, 10);
      dayMap[k] = 0;
      userDayMap[k] = 0;
    }
    ordersWithTime.forEach(({ createdAt }) => {
      const k = new Date(createdAt).toISOString().slice(0, 10);
      if (dayMap[k] !== undefined) dayMap[k] += 1;
    });
    users.forEach((u) => {
      const d = (u.createdAt as { toDate?: () => Date })?.toDate?.();
      if (d) {
        const k = d.toISOString().slice(0, 10);
        if (userDayMap[k] !== undefined) userDayMap[k] += 1;
      }
    });
    const matchByDay: Record<string, { total: number; matched: number }> = {};
    Object.keys(dayMap).forEach((k) => {
      matchByDay[k] = { total: 0, matched: 0 };
    });
    ordersWithTime.forEach(({ order, createdAt }) => {
      const k = new Date(createdAt).toISOString().slice(0, 10);
      if (matchByDay[k]) {
        matchByDay[k].total += 1;
        if (getOrderParticipantIds(order).length >= 2)
          matchByDay[k].matched += 1;
      }
    });

    const usersGrowthData = Object.entries(userDayMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, count]) => ({ day: day.slice(5), users: count }));
    const ordersPerDayData = Object.entries(dayMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, count]) => ({ day: day.slice(5), orders: count }));
    const matchRateTrendData = Object.entries(matchByDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, v]) => ({
        day: day.slice(5),
        rate: v.total > 0 ? (v.matched / v.total) * 100 : 0,
      }));

    return {
      totalUsers,
      newUsers7d,
      weeklyGrowthPercent,
      totalOrders,
      matchedOrders,
      matchRate,
      dailyActiveUsers,
      avgOrdersPerUser,
      repeatUserPercent,
      avgOrderValue,
      avgSavingPerUser,
      estimatedRevenue,
      locationTable,
      usersGrowthData,
      ordersPerDayData,
      matchRateTrendData,
    };
  }, [users, orders]);

  const handleExportPdf = async () => {
    setExportMsg(null);
    setExporting(true);
    try {
      const res = await fetch('/api/exportInvestorReport', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setExportMsg(data?.error || 'Export failed');
        return;
      }
      setExportMsg('Report sent to your email successfully.');
    } catch (e) {
      setExportMsg(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <ProtectedRoute>
        <AdminLayout title="Investor Dashboard">
          <p className="text-gray-500">Loading...</p>
        </AdminLayout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <AdminLayout title="Investor Dashboard">
        <div className="space-y-8">
          <div className="flex justify-between items-center flex-wrap gap-4">
            <h2 className="text-xl font-bold text-gray-900">
              HalfOrder Investor Dashboard
            </h2>
            <button
              type="button"
              onClick={handleExportPdf}
              disabled={exporting}
              className="px-4 py-2.5 rounded-lg font-medium bg-primary text-gray-900 hover:bg-primaryDark disabled:opacity-50 shadow-sm"
            >
              {exporting ? 'Exporting...' : 'Export PDF'}
            </button>
          </div>
          {exportMsg && (
            <p
              className={`text-sm ${exportMsg.includes('success') ? 'text-green-700' : 'text-red-600'}`}
            >
              {exportMsg}
            </p>
          )}

          {/* 1. Growth Metrics */}
          <section>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Growth Metrics
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">
                  Total Users
                </p>
                <p className="mt-1 text-2xl font-bold text-gray-900">
                  {metrics.totalUsers}
                </p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">
                  New Users (7 days)
                </p>
                <p className="mt-1 text-2xl font-bold text-gray-900">
                  {metrics.newUsers7d}
                </p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">
                  Weekly Growth %
                </p>
                <p className="mt-1 text-2xl font-bold text-gray-900">
                  {metrics.weeklyGrowthPercent.toFixed(1)}%
                </p>
              </div>
            </div>
          </section>

          {/* 2. Marketplace Metrics */}
          <section>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Marketplace Metrics
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">
                  Total Orders
                </p>
                <p className="mt-1 text-2xl font-bold text-gray-900">
                  {metrics.totalOrders}
                </p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">
                  Matched Orders
                </p>
                <p className="mt-1 text-2xl font-bold text-gray-900">
                  {metrics.matchedOrders}
                </p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">
                  Match Rate %
                </p>
                <p className="mt-1 text-2xl font-bold text-gray-900">
                  {metrics.matchRate.toFixed(1)}%
                </p>
              </div>
            </div>
          </section>

          {/* 3. Engagement */}
          <section>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Engagement
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">
                  Daily Active Users
                </p>
                <p className="mt-1 text-2xl font-bold text-gray-900">
                  {metrics.dailyActiveUsers}
                </p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">
                  Avg Orders Per User
                </p>
                <p className="mt-1 text-2xl font-bold text-gray-900">
                  {metrics.avgOrdersPerUser.toFixed(1)}
                </p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">
                  Repeat User %
                </p>
                <p className="mt-1 text-2xl font-bold text-gray-900">
                  {metrics.repeatUserPercent.toFixed(1)}%
                </p>
              </div>
            </div>
          </section>

          {/* 4. Economics */}
          <section>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Economics
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">
                  Avg Order Value
                </p>
                <p className="mt-1 text-2xl font-bold text-gray-900">
                  ${metrics.avgOrderValue.toFixed(2)}
                </p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">
                  Avg Saving Per User
                </p>
                <p className="mt-1 text-2xl font-bold text-gray-900">
                  ${metrics.avgSavingPerUser.toFixed(2)}
                </p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">
                  Est. Revenue
                </p>
                <p className="mt-1 text-2xl font-bold text-gray-900">
                  ${metrics.estimatedRevenue.toFixed(2)}
                </p>
              </div>
            </div>
          </section>

          {/* 5. Location Insights */}
          <section>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Location Insights
            </h3>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Location
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Orders
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {metrics.locationTable.map((row) => (
                    <tr key={row.location}>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {row.location}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-medium">
                        {row.orders}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {metrics.locationTable.length === 0 && (
                <p className="px-4 py-6 text-center text-gray-500 text-sm">
                  No location data yet.
                </p>
              )}
            </div>
          </section>

          {/* 6. Charts */}
          <section className="grid grid-cols-1 lg:grid-cols-1 gap-6">
            <h3 className="text-lg font-semibold text-gray-900 col-span-full">
              Charts
            </h3>
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <p className="text-sm font-medium text-gray-700 mb-4">
                Users growth (last 30 days)
              </p>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={metrics.usersGrowthData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                    <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="users"
                      stroke="#E6BF00"
                      strokeWidth={2}
                      name="New users"
                      dot={{ r: 2 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <p className="text-sm font-medium text-gray-700 mb-4">
                Orders per day (last 30 days)
              </p>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={metrics.ordersPerDayData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                    <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="orders"
                      stroke="#22c55e"
                      strokeWidth={2}
                      name="Orders"
                      dot={{ r: 2 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <p className="text-sm font-medium text-gray-700 mb-4">
                Match rate trend (last 30 days)
              </p>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={metrics.matchRateTrendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                    <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} unit="%" />
                    <Tooltip
                      formatter={(v: number) => [
                        v.toFixed(1) + '%',
                        'Match rate',
                      ]}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="rate"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      name="Match rate %"
                      dot={{ r: 2 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>
        </div>
      </AdminLayout>
    </ProtectedRoute>
  );
}
