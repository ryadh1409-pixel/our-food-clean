import AdminLayout from '@/components/AdminLayout';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAlertsSummary } from '@/hooks/useAlertsSummary';
import { db } from '@/firebase/config';
import {
  collection,
  getCountFromServer,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import Link from 'next/link';
import React, { useEffect, useState } from 'react';

type Stats = {
  totalUsers: number;
  totalOrders: number;
  activeOrders: number;
  totalCampaigns: number;
  campaignUsersReached: number;
};

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const {
    total: alertCount,
    highActivityCount,
    loading: alertsLoading,
  } = useAlertsSummary();

  useEffect(() => {
    async function fetchStats() {
      try {
        const usersRef = collection(db, 'users');
        const ordersRef = collection(db, 'orders');
        const [usersSnap, ordersSnap, activeSnap, campaignsSnap] =
          await Promise.all([
            getCountFromServer(usersRef),
            getCountFromServer(ordersRef),
            getCountFromServer(
              query(
                ordersRef,
                where('status', 'in', ['active', 'waiting', 'matched']),
              ),
            ),
            getDocs(collection(db, 'campaigns')),
          ]);
        const campaignUsersReached = campaignsSnap.docs.reduce(
          (sum, d) => sum + (Number(d.data()?.usersReached) || 0),
          0,
        );
        setStats({
          totalUsers: usersSnap.data().count,
          totalOrders: ordersSnap.data().count,
          activeOrders: activeSnap.data().count,
          totalCampaigns: campaignsSnap.size,
          campaignUsersReached,
        });
      } catch (e) {
        console.error(e);
        setStats({
          totalUsers: 0,
          totalOrders: 0,
          activeOrders: 0,
          totalCampaigns: 0,
          campaignUsersReached: 0,
        });
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  return (
    <ProtectedRoute>
      <AdminLayout title="Dashboard">
        {loading ? (
          <p className="text-gray-500">Loading statistics...</p>
        ) : stats ? (
          <div className="space-y-6">
            {!alertsLoading && alertCount > 0 && (
              <Link
                href="/admin/alerts"
                className={`block rounded-xl border p-4 shadow-sm transition hover:opacity-90 ${
                  highActivityCount > 0
                    ? 'border-red-200 bg-red-50'
                    : 'border-amber-200 bg-amber-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span
                      className={`flex h-10 w-10 items-center justify-center rounded-full text-lg font-bold ${
                        highActivityCount > 0
                          ? 'bg-red-500 text-white'
                          : 'bg-amber-500 text-gray-900'
                      }`}
                    >
                      {alertCount > 99 ? '99+' : alertCount}
                    </span>
                    <div>
                      <p className="font-semibold text-gray-900">
                        {highActivityCount > 0
                          ? 'High activity alert'
                          : 'Alerts'}
                      </p>
                      <p className="text-sm text-gray-600">
                        {highActivityCount > 0
                          ? '100+ orders in the last 24 hours. View details.'
                          : `${alertCount} alert(s). View all.`}
                      </p>
                    </div>
                  </div>
                  <span className="text-sm font-medium text-gray-600">
                    View alerts →
                  </span>
                </div>
              </Link>
            )}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">
                  Total users
                </p>
                <p className="mt-2 text-3xl font-bold text-gray-900">
                  {stats.totalUsers}
                </p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">
                  Total orders
                </p>
                <p className="mt-2 text-3xl font-bold text-gray-900">
                  {stats.totalOrders}
                </p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">
                  Active orders
                </p>
                <p className="mt-2 text-3xl font-bold text-gray-900">
                  {stats.activeOrders}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Link
                href="/admin/campaigns"
                className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm hover:border-primary transition-colors"
              >
                <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">
                  Campaigns
                </p>
                <p className="mt-2 text-2xl font-bold text-gray-900">
                  {stats.totalCampaigns}
                </p>
                <p className="mt-1 text-sm text-gray-500">
                  Users reached: {stats.campaignUsersReached}
                </p>
                <p className="mt-2 text-sm text-primary font-medium">
                  View campaigns →
                </p>
              </Link>
            </div>
          </div>
        ) : (
          <p className="text-gray-500">Failed to load stats.</p>
        )}
      </AdminLayout>
    </ProtectedRoute>
  );
}
