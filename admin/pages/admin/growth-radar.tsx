import AdminLayout from '@/components/AdminLayout';
import ProtectedRoute from '@/components/ProtectedRoute';
import { db } from '@/firebase/config';
import { getGridKey, getGridCenter, formatArea } from '@/lib/geoGrid';
import { collection, getDocs } from 'firebase/firestore';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * MS_PER_DAY;
const FOURTEEN_DAYS_MS = 14 * MS_PER_DAY;
const GROWTH_OPPORTUNITY_ORDER_THRESHOLD = 3;
const GROWTH_OPPORTUNITY_MATCH_RATE_MAX = 40;

type RawOrder = {
  id: string;
  hostId?: string;
  creatorId?: string;
  userId?: string;
  participantIds?: string[];
  joinedUsers?: string[];
  restaurantName?: string;
  restaurant?: string;
  latitude?: number;
  longitude?: number;
  location?: { latitude?: number; longitude?: number };
  createdAt?: { toMillis: () => number };
};

function getOrderCreatedAt(o: RawOrder): number {
  const c = o.createdAt;
  return c && typeof c.toMillis === 'function' ? c.toMillis() : 0;
}

function getOrderRestaurant(o: RawOrder): string {
  return (o.restaurantName ?? o.restaurant ?? '—').toString().trim() || '—';
}

function getOrderParticipantIds(o: RawOrder): string[] {
  const ids = (o.participantIds ?? o.joinedUsers ?? []) as string[];
  const host = (o.hostId ?? o.creatorId ?? o.userId) as string | undefined;
  if (host && !ids.includes(host)) return [host, ...ids];
  return [...ids];
}

function getOrderLatLng(o: RawOrder): { lat: number; lng: number } | null {
  const lat = o.latitude ?? o.location?.latitude;
  const lng = o.longitude ?? o.location?.longitude;
  if (typeof lat === 'number' && typeof lng === 'number') return { lat, lng };
  return null;
}

export default function GrowthRadarPage() {
  const [orders, setOrders] = useState<RawOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const snap = await getDocs(collection(db, 'orders'));
        setOrders(
          snap.docs.map((d) => ({ id: d.id, ...d.data() }) as RawOrder),
        );
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const now = Date.now();
  const last7Start = now - SEVEN_DAYS_MS;
  const prev7Start = now - FOURTEEN_DAYS_MS;

  const {
    topLocations,
    ordersByHour,
    topRestaurants,
    growthOpportunities,
    founderRecommendation,
  } = useMemo(() => {
    const ordersWithTime = orders
      .map((o) => ({ order: o, createdAt: getOrderCreatedAt(o) }))
      .filter((x) => x.createdAt > 0);

    // Top Locations: group by grid key, count orders, growth % (last 7d vs prev 7d)
    const locationLast7: Record<string, number> = {};
    const locationPrev7: Record<string, number> = {};
    const locationTotal: Record<string, number> = {};
    const locationMatched: Record<string, number> = {};

    ordersWithTime.forEach(({ order, createdAt }) => {
      const ll = getOrderLatLng(order);
      if (!ll) return;
      const key = getGridKey(ll.lat, ll.lng);
      locationTotal[key] = (locationTotal[key] ?? 0) + 1;
      const isMatched = getOrderParticipantIds(order).length >= 2;
      if (isMatched) locationMatched[key] = (locationMatched[key] ?? 0) + 1;
      if (createdAt >= last7Start)
        locationLast7[key] = (locationLast7[key] ?? 0) + 1;
      if (createdAt >= prev7Start && createdAt < last7Start)
        locationPrev7[key] = (locationPrev7[key] ?? 0) + 1;
    });

    const topLocations = Object.entries(locationTotal)
      .map(([key, total]) => {
        const center = getGridCenter(key);
        const last7 = locationLast7[key] ?? 0;
        const prev7 = locationPrev7[key] ?? 0;
        const growth =
          prev7 > 0 ? ((last7 - prev7) / prev7) * 100 : last7 > 0 ? 100 : 0;
        return {
          location: formatArea(center.latitude, center.longitude),
          orders: total,
          growthPercent: growth,
        };
      })
      .sort((a, b) => b.orders - a.orders)
      .slice(0, 15);

    // Peak hours
    const hourMap: Record<number, number> = {};
    for (let h = 0; h < 24; h++) hourMap[h] = 0;
    ordersWithTime.forEach(({ createdAt }) => {
      const h = new Date(createdAt).getHours();
      hourMap[h] = (hourMap[h] ?? 0) + 1;
    });
    const ordersByHour = Object.entries(hourMap).map(([hour, count]) => ({
      hour: `${hour}h`,
      count,
    }));

    // Top restaurants with match rate
    const restTotal: Record<string, number> = {};
    const restMatched: Record<string, number> = {};
    ordersWithTime.forEach(({ order }) => {
      const name = getOrderRestaurant(order);
      restTotal[name] = (restTotal[name] ?? 0) + 1;
      if (getOrderParticipantIds(order).length >= 2)
        restMatched[name] = (restMatched[name] ?? 0) + 1;
    });
    const topRestaurants = Object.entries(restTotal)
      .filter(([name]) => name !== '—')
      .map(([name, total]) => ({
        restaurant: name,
        orders: total,
        matchRate: total > 0 ? ((restMatched[name] ?? 0) / total) * 100 : 0,
      }))
      .sort((a, b) => b.orders - a.orders)
      .slice(0, 15);

    // Growth opportunities: location with orders > threshold AND match rate < 40%
    const opportunities: {
      location: string;
      orders: number;
      matchRate: number;
    }[] = [];
    Object.entries(locationTotal).forEach(([key]) => {
      const total = locationTotal[key];
      const matched = locationMatched[key] ?? 0;
      const matchRate = total > 0 ? (matched / total) * 100 : 0;
      if (
        total >= GROWTH_OPPORTUNITY_ORDER_THRESHOLD &&
        matchRate < GROWTH_OPPORTUNITY_MATCH_RATE_MAX
      ) {
        const center = getGridCenter(key);
        opportunities.push({
          location: formatArea(center.latitude, center.longitude),
          orders: total,
          matchRate,
        });
      }
    });
    const growthOpportunities = opportunities
      .sort((a, b) => b.orders - a.orders)
      .slice(0, 10);

    // Founder recommendation
    let founderRecommendation =
      'Review your top locations and peak hours to plan promotions.';
    if (topLocations.length > 0) {
      const top = topLocations[0];
      founderRecommendation = `Focus on ${top.location} today. High order activity (${top.orders} orders).`;
    }
    if (growthOpportunities.length > 0) {
      const opp = growthOpportunities[0];
      founderRecommendation = `Promote app in ${opp.location}. ${opp.orders} orders but match rate is ${opp.matchRate.toFixed(0)}% — good opportunity to grow matches.`;
    }

    return {
      topLocations,
      ordersByHour,
      topRestaurants,
      growthOpportunities,
      founderRecommendation,
    };
  }, [orders, last7Start, prev7Start]);

  if (loading) {
    return (
      <ProtectedRoute>
        <AdminLayout title="Growth Radar">
          <p className="text-gray-500">Loading...</p>
        </AdminLayout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <AdminLayout title="Growth Radar">
        <div className="space-y-6">
          {/* 5. Founder Recommendation (prominent) */}
          <section className="bg-primary/20 border border-primary/40 rounded-xl p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">
              Founder Recommendation
            </h2>
            <p className="text-lg text-gray-900">{founderRecommendation}</p>
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 1. Top Locations */}
            <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <h2 className="text-lg font-semibold text-gray-900 p-4 border-b border-gray-200">
                Top Locations
              </h2>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Location
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                        Orders
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                        Growth %
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {topLocations.map((row, i) => (
                      <tr key={i}>
                        <td className="px-4 py-3 text-sm text-gray-900 font-mono">
                          {row.location}
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-gray-600">
                          {row.orders}
                        </td>
                        <td
                          className={`px-4 py-3 text-sm text-right font-medium ${
                            row.growthPercent >= 0
                              ? 'text-green-600'
                              : 'text-red-600'
                          }`}
                        >
                          {row.growthPercent >= 0 ? '+' : ''}
                          {row.growthPercent.toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {topLocations.length === 0 && (
                <p className="px-4 py-6 text-center text-gray-500 text-sm">
                  No location data yet.
                </p>
              )}
            </section>

            {/* 2. Peak Hours */}
            <section className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Peak Hours
              </h2>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={ordersByHour}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                    <XAxis dataKey="hour" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar
                      dataKey="count"
                      fill="#E6BF00"
                      radius={[4, 4, 0, 0]}
                      name="Orders"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
          </div>

          {/* 3. Top Restaurants */}
          <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <h2 className="text-lg font-semibold text-gray-900 p-4 border-b border-gray-200">
              Top Restaurants
            </h2>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Restaurant
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Orders
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Match rate
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {topRestaurants.map((row, i) => (
                    <tr key={i}>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        {row.restaurant}
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-gray-600">
                        {row.orders}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-medium text-gray-900">
                        {row.matchRate.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {topRestaurants.length === 0 && (
              <p className="px-4 py-6 text-center text-gray-500 text-sm">
                No restaurant data yet.
              </p>
            )}
          </section>

          {/* 4. Growth Opportunities */}
          <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <h2 className="text-lg font-semibold text-gray-900 p-4 border-b border-gray-200">
              Growth Opportunities
            </h2>
            <p className="px-4 py-2 text-xs text-gray-500">
              Areas with orders ≥ {GROWTH_OPPORTUNITY_ORDER_THRESHOLD} and match
              rate &lt; 40%. Promote the app in these areas to increase matches.
            </p>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Location
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Orders
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Match rate
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Suggestion
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {growthOpportunities.map((row, i) => (
                    <tr key={i} className="bg-amber-50/50">
                      <td className="px-4 py-3 text-sm font-mono text-gray-900">
                        {row.location}
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-gray-600">
                        {row.orders}
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-amber-700 font-medium">
                        {row.matchRate.toFixed(1)}%
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-primary">
                        Promote app in this area
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {growthOpportunities.length === 0 && (
              <p className="px-4 py-6 text-center text-gray-500 text-sm">
                No growth opportunities detected. Threshold:{' '}
                {GROWTH_OPPORTUNITY_ORDER_THRESHOLD}+ orders and match rate &lt;{' '}
                {GROWTH_OPPORTUNITY_MATCH_RATE_MAX}%.
              </p>
            )}
          </section>
        </div>
      </AdminLayout>
    </ProtectedRoute>
  );
}
