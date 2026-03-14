import AdminLayout from '@/components/AdminLayout';
import ProtectedRoute from '@/components/ProtectedRoute';
import { db } from '@/firebase/config';
import { formatArea } from '@/lib/geoGrid';
import { countOrdersAndMatchesInRadius } from '@/lib/campaignStats';
import {
  collection,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const TWENTY_FOUR_H_MS = 24 * 60 * 60 * 1000;
const CAMPAIGN_DURATION_MS = 2 * 60 * 60 * 1000;

type RawOrder = {
  id: string;
  hostId?: string;
  creatorId?: string;
  userId?: string;
  participantIds?: string[];
  joinedUsers?: string[];
  latitude?: number;
  longitude?: number;
  location?: { latitude?: number; longitude?: number };
  createdAt?: { toMillis: () => number };
};

type RawUser = {
  id: string;
  createdAt?: { toDate: () => Date };
};

type AlertDoc = {
  id: string;
  type: string;
  message: string;
  createdAt: number;
};

type PredictionDoc = {
  id: string;
  location?: { latitude?: number; longitude?: number };
  hour?: number;
  dayName?: string;
  expectedOrders?: number;
  confidence?: number;
};

type CampaignDoc = {
  id: string;
  name: string;
  location?: { latitude: number; longitude: number };
  startTime?: { toMillis: () => number };
  endTime?: { toMillis: () => number };
  usersReached?: number;
  ordersCreated?: number;
  matchesCreated?: number;
};

function getOrderCreatedAt(o: RawOrder): number {
  const c = o.createdAt;
  return c && typeof c.toMillis === 'function' ? c.toMillis() : 0;
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

export default function FounderPage() {
  const [users, setUsers] = useState<RawUser[]>([]);
  const [orders, setOrders] = useState<RawOrder[]>([]);
  const [alerts, setAlerts] = useState<AlertDoc[]>([]);
  const [predictions, setPredictions] = useState<PredictionDoc[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignDoc[]>([]);
  const [hotspotAlerts, setHotspotAlerts] = useState<
    { latitude: number; longitude: number }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushResult, setPushResult] = useState<{
    sent: number;
    failed: number;
  } | null>(null);

  const now = Date.now();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayStartMs = todayStart.getTime();
  const twentyFourHAgo = now - TWENTY_FOUR_H_MS;

  const fetchStatic = useCallback(async () => {
    try {
      const [usersSnap, ordersSnap, predSnap, campSnap, hotspotSnap] =
        await Promise.all([
          getDocs(collection(db, 'users')),
          getDocs(collection(db, 'orders')),
          getDocs(
            query(collection(db, 'predictions'), orderBy('createdAt', 'desc')),
          ),
          getDocs(collection(db, 'campaigns')),
          getDocs(
            query(collection(db, 'alerts'), where('type', '==', 'hotspot')),
          ),
        ]);
      setUsers(
        usersSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as RawUser),
      );
      setOrders(
        ordersSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as RawOrder),
      );
      setPredictions(
        predSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as PredictionDoc),
      );
      setCampaigns(
        campSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as CampaignDoc),
      );
      const hotspots = hotspotSnap.docs
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
      setHotspotAlerts(hotspots);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatic();
  }, [fetchStatic]);

  useEffect(() => {
    const q = query(collection(db, 'alerts'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: AlertDoc[] = snap.docs.map((d) => {
          const data = d.data();
          const created = data?.createdAt?.toMillis?.() ?? 0;
          return {
            id: d.id,
            type: (data?.type as string) ?? '—',
            message: (data?.message as string) ?? '—',
            createdAt: created,
          };
        });
        setAlerts(list);
      },
      (err) => console.error(err),
    );
    return () => unsub();
  }, []);

  const metrics = useMemo(() => {
    const totalUsers = users.length;
    const newUsers24h = users.filter((u) => {
      const d = (u.createdAt as { toDate?: () => Date })?.toDate?.();
      return d ? d.getTime() >= twentyFourHAgo : false;
    }).length;

    const ordersWithTime = orders
      .map((o) => ({ order: o, createdAt: getOrderCreatedAt(o) }))
      .filter((x) => x.createdAt > 0);
    const ordersToday = ordersWithTime.filter(
      (x) => x.createdAt >= todayStartMs,
    ).length;
    const matchedOrders = ordersWithTime.filter(
      ({ order }) => getOrderParticipantIds(order).length >= 2,
    ).length;
    const totalOrders = ordersWithTime.length;
    const matchRate = totalOrders > 0 ? (matchedOrders / totalOrders) * 100 : 0;

    return {
      totalUsers,
      newUsers24h,
      ordersToday,
      matchedOrders,
      matchRate,
      totalOrders,
    };
  }, [users, orders, twentyFourHAgo, todayStartMs]);

  const heatmapData = useMemo(() => {
    const points = orders
      .map((o) => getOrderLatLng(o))
      .filter((p): p is { lat: number; lng: number } => p != null);
    if (points.length === 0)
      return {
        heatGrid: [] as number[][],
        maxHeat: 1,
        bounds: null,
        gridSize: 12,
      };
    const lats = points.map((p) => p.lat);
    const lngs = points.map((p) => p.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const gridSize = 12;
    const heatGrid: number[][] = Array(gridSize)
      .fill(0)
      .map(() => Array(gridSize).fill(0));
    points.forEach(({ lat, lng }) => {
      const gi = Math.min(
        gridSize - 1,
        Math.max(
          0,
          Math.floor(((lat - minLat) / (maxLat - minLat || 1)) * gridSize),
        ),
      );
      const gj = Math.min(
        gridSize - 1,
        Math.max(
          0,
          Math.floor(((lng - minLng) / (maxLng - minLng || 1)) * gridSize),
        ),
      );
      heatGrid[gi][gj] += 1;
    });
    const maxHeat = Math.max(...heatGrid.flat(), 1);
    return {
      heatGrid,
      maxHeat,
      bounds: { minLat, maxLat, minLng, maxLng },
      gridSize,
    };
  }, [orders]);

  const campaignRows = useMemo(() => {
    return campaigns.map((c) => {
      const loc = c.location || { latitude: 0, longitude: 0 };
      const startMs =
        c.startTime && typeof c.startTime.toMillis === 'function'
          ? c.startTime.toMillis()
          : 0;
      const endMs = startMs + CAMPAIGN_DURATION_MS;
      const ordersForStats = orders.map((o) => ({
        id: o.id,
        createdAtMs: getOrderCreatedAt(o),
        latitude: o.latitude,
        longitude: o.longitude,
        location: o.location,
        status: (o as RawOrder & { status?: string }).status,
        participantIds: o.participantIds,
        joinedUsers: o.joinedUsers,
      }));
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
        usersReached,
        ordersCreated,
        matchesCreated,
        conversionRate: conversion,
      };
    });
  }, [campaigns, orders]);

  const predictionRows = useMemo(() => {
    return predictions.map((p) => {
      const loc = p.location;
      const lat = loc?.latitude ?? 0;
      const lng = loc?.longitude ?? 0;
      const hour = Number(p.hour ?? 0);
      const hourStr = `${hour.toString().padStart(2, '0')}:00`;
      return {
        id: p.id,
        location: formatArea(lat, lng),
        timeWindow: `${(p.dayName as string) ?? ''} ${hourStr}`,
        expectedOrders: Number(p.expectedOrders ?? 0),
      };
    });
  }, [predictions]);

  const liveFeed = useMemo(() => {
    return alerts.slice(0, 20).map((a) => ({
      ...a,
      timeStr: a.createdAt
        ? new Date(a.createdAt).toLocaleTimeString(undefined, {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })
        : '—',
      label:
        a.type === 'new_order'
          ? 'New Order'
          : a.type === 'order_matched'
            ? 'Match Completed'
            : a.type === 'new_user'
              ? 'New User'
              : a.type,
    }));
  }, [alerts]);

  const handleSendPushNearby = async () => {
    setPushResult(null);
    setPushLoading(true);
    try {
      const res = await fetch('/api/sendNotification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'HalfOrder',
          body: 'Many people near you will be sharing food soon. Join HalfOrder.',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setPushResult({ sent: data.sent ?? 0, failed: data.failed ?? 0 });
    } catch (e) {
      setPushResult({ sent: 0, failed: 1 });
    } finally {
      setPushLoading(false);
    }
  };

  const getAlertHighlight = (type: string) => {
    if (type === 'high_activity')
      return 'bg-red-100 border-red-300 text-red-800';
    if (type === 'hotspot')
      return 'bg-amber-100 border-amber-300 text-amber-800';
    if (type === 'order_matched' || type === 'new_order' || type === 'new_user')
      return 'bg-green-50 border-green-200';
    return 'bg-gray-50 border-gray-200';
  };

  if (loading) {
    return (
      <ProtectedRoute>
        <AdminLayout title="Founder Control Center">
          <p className="text-gray-500">Loading...</p>
        </AdminLayout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <AdminLayout title="Founder Control Center">
        <div className="space-y-6">
          {/* 1. Top Metrics Cards */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">
              Top Metrics
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Total Users
                </p>
                <p className="mt-1 text-2xl font-bold text-gray-900">
                  {metrics.totalUsers}
                </p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  New Users (24h)
                </p>
                <p className="mt-1 text-2xl font-bold text-gray-900">
                  {metrics.newUsers24h}
                </p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Orders Today
                </p>
                <p className="mt-1 text-2xl font-bold text-gray-900">
                  {metrics.ordersToday}
                </p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Matched Orders
                </p>
                <p className="mt-1 text-2xl font-bold text-gray-900">
                  {metrics.matchedOrders}
                </p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Match Rate
                </p>
                <p className="mt-1 text-2xl font-bold text-gray-900">
                  {metrics.matchRate.toFixed(1)}%
                </p>
              </div>
            </div>
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 2. Live Activity Feed */}
            <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <h2 className="text-lg font-semibold text-gray-900 p-4 border-b border-gray-200">
                Live Activity Feed
              </h2>
              <div className="max-h-64 overflow-y-auto divide-y divide-gray-100">
                {liveFeed.length === 0 ? (
                  <p className="p-4 text-gray-500 text-sm">No events yet.</p>
                ) : (
                  liveFeed.map((e) => (
                    <div
                      key={e.id}
                      className="px-4 py-2.5 flex items-center justify-between gap-2"
                    >
                      <span className="text-sm font-medium text-gray-900">
                        {e.label}
                      </span>
                      <span className="text-xs text-gray-500 shrink-0">
                        {e.timeStr}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </section>

            {/* 6. Alerts */}
            <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <h2 className="text-lg font-semibold text-gray-900 p-4 border-b border-gray-200">
                Alerts
              </h2>
              <div className="max-h-64 overflow-y-auto divide-y divide-gray-100">
                {alerts.length === 0 ? (
                  <p className="p-4 text-gray-500 text-sm">No alerts.</p>
                ) : (
                  alerts.slice(0, 15).map((a) => (
                    <div
                      key={a.id}
                      className={`px-4 py-2.5 border-l-4 ${getAlertHighlight(a.type)}`}
                    >
                      <p className="text-sm font-medium text-gray-900">
                        {a.type.replace(/_/g, ' ')}
                      </p>
                      <p className="text-xs text-gray-600 mt-0.5">
                        {a.message}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {a.createdAt
                          ? new Date(a.createdAt).toLocaleString()
                          : '—'}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>

          {/* 3. Heatmap Map */}
          {heatmapData.heatGrid.length > 0 && heatmapData.bounds && (
            <section className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900 mb-3">
                Order Locations Heatmap
              </h2>
              <p className="text-xs text-gray-500 mb-3">
                Density by location. Red = hotspot alert.
              </p>
              <div
                className="inline-grid gap-0.5"
                style={{
                  gridTemplateColumns: `repeat(${heatmapData.gridSize}, minmax(0, 1fr))`,
                }}
              >
                {(() => {
                  const { minLat, maxLat, minLng, maxLng } = heatmapData.bounds;
                  const gs = heatmapData.gridSize;
                  const hotspotCells = new Set<string>();
                  hotspotAlerts.forEach(({ latitude: lat, longitude: lng }) => {
                    const rangeLat = maxLat - minLat || 1;
                    const rangeLng = maxLng - minLng || 1;
                    const gi = Math.min(
                      gs - 1,
                      Math.max(0, Math.floor(((lat - minLat) / rangeLat) * gs)),
                    );
                    const gj = Math.min(
                      gs - 1,
                      Math.max(0, Math.floor(((lng - minLng) / rangeLng) * gs)),
                    );
                    hotspotCells.add(`${gi}-${gj}`);
                  });
                  return heatmapData.heatGrid.flatMap((row, i) =>
                    row.map((cell, j) => {
                      const isHotspot = hotspotCells.has(`${i}-${j}`);
                      return (
                        <div
                          key={`${i}-${j}`}
                          className={`w-5 h-5 rounded-sm ${isHotspot ? 'ring-2 ring-red-500 ring-offset-0' : ''}`}
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
                                  : 0.3 + (cell / heatmapData.maxHeat) * 0.7
                                : 0.5,
                          }}
                          title={
                            isHotspot
                              ? 'Hotspot'
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
            </section>
          )}

          {/* 4. Predictions */}
          <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-gray-900">
                Predictions
              </h2>
              <button
                type="button"
                onClick={handleSendPushNearby}
                disabled={pushLoading}
                className="px-4 py-2 rounded-lg font-medium bg-primary text-gray-900 hover:bg-primaryDark disabled:opacity-50 shadow-sm text-sm"
              >
                {pushLoading ? 'Sending...' : 'Send push to nearby users'}
              </button>
            </div>
            {pushResult && (
              <p className="px-4 py-2 text-sm text-gray-600">
                Sent: {pushResult.sent}, Failed: {pushResult.failed}
              </p>
            )}
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Location
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Time window
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Expected orders
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {predictionRows.map((r) => (
                    <tr key={r.id}>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {r.location}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {r.timeWindow}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-medium">
                        {r.expectedOrders}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {predictionRows.length === 0 && (
              <p className="px-4 py-6 text-center text-gray-500 text-sm">
                No predictions. Forecast runs every 6 hours.
              </p>
            )}
          </section>

          {/* 5. Campaign Performance */}
          <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <h2 className="text-lg font-semibold text-gray-900 p-4 border-b border-gray-200">
              Campaign Performance
            </h2>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Campaign
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Users reached
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Orders
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Matches
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Conversion rate
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {campaignRows.map((r) => (
                    <tr key={r.id}>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        {r.name}
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-gray-600">
                        {r.usersReached}
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-gray-600">
                        {r.ordersCreated}
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-gray-600">
                        {r.matchesCreated}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-medium text-gray-900">
                        {r.conversionRate.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {campaignRows.length === 0 && (
              <p className="px-4 py-6 text-center text-gray-500 text-sm">
                No campaigns yet.
              </p>
            )}
          </section>
        </div>
      </AdminLayout>
    </ProtectedRoute>
  );
}
