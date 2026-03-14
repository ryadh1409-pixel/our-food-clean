import AdminLayout from '@/components/AdminLayout';
import ProtectedRoute from '@/components/ProtectedRoute';
import { countOrdersAndMatchesInRadius } from '@/lib/campaignStats';
import { db } from '@/firebase/config';
import {
  addDoc,
  collection,
  getDocs,
  updateDoc,
  doc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const CAMPAIGN_RADIUS_M = 1000;
const CAMPAIGN_DURATION_MS = 2 * 60 * 60 * 1000;
const PROMO_PUSH_TITLE = 'HalfOrder';
const PROMO_PUSH_BODY =
  '🍔 Many people near you are sharing food right now. Open HalfOrder and split your meal.';

type CampaignDoc = {
  id: string;
  name: string;
  type: string;
  location: { latitude: number; longitude: number };
  radius: number;
  startTime: Timestamp | { toMillis: () => number };
  endTime?: Timestamp | { toMillis: () => number };
  status: string;
  pushSent: boolean;
  usersReached: number;
  ordersCreated: number;
  matchesCreated: number;
};

type OrderDoc = {
  id: string;
  createdAt?: { toMillis?: () => number };
  latitude?: number;
  longitude?: number;
  location?: { latitude?: number; longitude?: number };
  status?: string;
  participantIds?: string[];
  joinedUsers?: string[];
};

function getCreatedAtMs(d: {
  createdAt?: Timestamp | { toMillis?: () => number };
}): number {
  const c = d.createdAt;
  if (c && typeof (c as { toMillis?: () => number }).toMillis === 'function')
    return (c as { toMillis: () => number }).toMillis();
  return 0;
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<CampaignDoc[]>([]);
  const [orders, setOrders] = useState<OrderDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [launching, setLaunching] = useState(false);
  const [showLaunch, setShowLaunch] = useState(false);
  const [launchName, setLaunchName] = useState('Manual Promotion');
  const [launchLat, setLaunchLat] = useState('');
  const [launchLng, setLaunchLng] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const [campSnap, orderSnap] = await Promise.all([
        getDocs(collection(db, 'campaigns')),
        getDocs(collection(db, 'orders')),
      ]);
      setCampaigns(
        campSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as CampaignDoc),
      );
      setOrders(
        orderSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as OrderDoc),
      );
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const ordersForStats = useMemo(() => {
    return orders.map((o) => ({
      id: o.id,
      createdAtMs: getCreatedAtMs(o),
      latitude: o.latitude,
      longitude: o.longitude,
      location: o.location,
      status: o.status,
      participantIds: o.participantIds,
      joinedUsers: o.joinedUsers,
    }));
  }, [orders]);

  const rows = useMemo(() => {
    return campaigns.map((c) => {
      const startMs =
        c.startTime &&
        typeof (c.startTime as { toMillis?: () => number }).toMillis ===
          'function'
          ? (c.startTime as { toMillis: () => number }).toMillis()
          : 0;
      const endMs =
        c.endTime &&
        typeof (c.endTime as { toMillis?: () => number }).toMillis ===
          'function'
          ? (c.endTime as { toMillis: () => number }).toMillis()
          : startMs + CAMPAIGN_DURATION_MS;
      const loc = c.location || { latitude: 0, longitude: 0 };
      const { ordersCreated, matchesCreated } = countOrdersAndMatchesInRadius(
        ordersForStats,
        loc.latitude,
        loc.longitude,
        startMs,
        endMs,
      );
      const usersReached = c.usersReached ?? 0;
      const conversion =
        usersReached > 0 ? (ordersCreated / usersReached) * 100 : 0;
      return {
        id: c.id,
        name: c.name,
        location: `${loc.latitude.toFixed(4)}, ${loc.longitude.toFixed(4)}`,
        usersReached,
        ordersCreated,
        matchesCreated,
        conversionRate: conversion,
      };
    });
  }, [campaigns, ordersForStats]);

  const chartData = useMemo(
    () =>
      rows.map((r) => ({
        name: r.name.slice(0, 20),
        users: r.usersReached,
        orders: r.ordersCreated,
        matches: r.matchesCreated,
        conversion: r.conversionRate.toFixed(1),
      })),
    [rows],
  );

  const handleLaunchPromotion = async (e: React.FormEvent) => {
    e.preventDefault();
    setLaunching(true);
    try {
      const lat = parseFloat(launchLat) || 0;
      const lng = parseFloat(launchLng) || 0;
      const name = launchName.trim() || 'Manual Promotion';
      const now = Date.now();
      const campaignsRef = collection(db, 'campaigns');
      const ref = await addDoc(campaignsRef, {
        name,
        type: 'manual',
        location: { latitude: lat, longitude: lng },
        radius: CAMPAIGN_RADIUS_M,
        startTime: Timestamp.fromMillis(now),
        endTime: Timestamp.fromMillis(now + CAMPAIGN_DURATION_MS),
        status: 'active',
        pushSent: false,
        usersReached: 0,
        ordersCreated: 0,
        matchesCreated: 0,
        createdAt: serverTimestamp(),
      });
      const res = await fetch('/api/sendNotification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: PROMO_PUSH_TITLE,
          body: PROMO_PUSH_BODY,
        }),
      });
      const data = await res.json();
      const sent = data?.sent ?? 0;
      await updateDoc(doc(db, 'campaigns', ref.id), {
        pushSent: true,
        usersReached: sent,
      });
      setShowLaunch(false);
      setLaunchName('Manual Promotion');
      setLaunchLat('');
      setLaunchLng('');
      await fetchData();
    } catch (err) {
      console.error(err);
    } finally {
      setLaunching(false);
    }
  };

  return (
    <ProtectedRoute>
      <AdminLayout title="Campaigns">
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={() => setShowLaunch(true)}
              className="px-4 py-2.5 rounded-lg font-medium bg-primary text-gray-900 hover:bg-primaryDark shadow-sm"
            >
              Launch Promotion
            </button>
          </div>

          {showLaunch && (
            <form
              onSubmit={handleLaunchPromotion}
              className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm max-w-md space-y-3"
            >
              <h3 className="font-semibold text-gray-900">Launch promotion</h3>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Name</label>
                <input
                  type="text"
                  value={launchName}
                  onChange={(e) => setLaunchName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="e.g. Downtown Lunch"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  Latitude
                </label>
                <input
                  type="text"
                  value={launchLat}
                  onChange={(e) => setLaunchLat(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="e.g. 43.65"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  Longitude
                </label>
                <input
                  type="text"
                  value={launchLng}
                  onChange={(e) => setLaunchLng(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="e.g. -79.38"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={launching}
                  className="px-4 py-2 rounded-lg bg-primary text-gray-900 font-medium disabled:opacity-50"
                >
                  {launching ? 'Sending...' : 'Create & Send Push'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowLaunch(false)}
                  className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {loading ? (
            <p className="text-gray-500">Loading campaigns...</p>
          ) : (
            <>
              {chartData.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                  <h3 className="font-semibold text-gray-900 mb-4">
                    Performance overview
                  </h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={chartData}
                        margin={{ top: 8, right: 8, left: 8, bottom: 8 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip />
                        <Bar
                          dataKey="users"
                          fill="#E6BF00"
                          name="Users reached"
                        />
                        <Bar dataKey="orders" fill="#22c55e" name="Orders" />
                        <Bar dataKey="matches" fill="#3b82f6" name="Matches" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Campaign
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Location
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                        Users Reached
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                        Orders Created
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                        Matches
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                        Conversion Rate
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {rows.map((r) => (
                      <tr key={r.id}>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">
                          {r.name}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {r.location}
                        </td>
                        <td className="px-4 py-3 text-sm text-right">
                          {r.usersReached}
                        </td>
                        <td className="px-4 py-3 text-sm text-right">
                          {r.ordersCreated}
                        </td>
                        <td className="px-4 py-3 text-sm text-right">
                          {r.matchesCreated}
                        </td>
                        <td className="px-4 py-3 text-sm text-right">
                          {r.conversionRate.toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length === 0 && (
                  <p className="px-4 py-8 text-center text-gray-500">
                    No campaigns yet. Auto campaigns are created when a
                    predicted hotspot has ≥15 expected orders, or launch one
                    manually.
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </AdminLayout>
    </ProtectedRoute>
  );
}
