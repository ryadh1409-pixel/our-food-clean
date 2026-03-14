import AdminLayout from '@/components/AdminLayout';
import ProtectedRoute from '@/components/ProtectedRoute';
import { db } from '@/firebase/config';
import { collection, getDocs } from 'firebase/firestore';
import React, { useEffect, useMemo, useState } from 'react';

type ReferralDoc = {
  id: string;
  referrerId: string;
  newUserId: string;
  orderId: string | null;
  createdAt?: { toMillis?: () => number };
};

type UserDoc = {
  id: string;
  displayName?: string;
  email?: string;
};

export default function SocialGrowthPage() {
  const [referrals, setReferrals] = useState<ReferralDoc[]>([]);
  const [users, setUsers] = useState<UserDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [refSnap, usersSnap] = await Promise.all([
          getDocs(collection(db, 'referrals')),
          getDocs(collection(db, 'users')),
        ]);
        setReferrals(
          refSnap.docs.map((d) => ({
            id: d.id,
            referrerId: d.data()?.referrerId ?? '',
            newUserId: d.data()?.newUserId ?? '',
            orderId: d.data()?.orderId ?? null,
            createdAt: d.data()?.createdAt,
          })),
        );
        setUsers(
          usersSnap.docs.map((d) => ({
            id: d.id,
            displayName: d.data()?.displayName,
            email: d.data()?.email,
          })),
        );
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const { referralUsers, inviteClicks, ordersFromReferrals, topReferrers } =
    useMemo(() => {
      const referralUsers = referrals.length;
      const inviteClicks = referralUsers; // proxy: each referral came from an invite
      const ordersFromReferrals = referrals.filter(
        (r) => r.orderId != null && r.orderId !== '',
      ).length;
      const byReferrer: Record<string, number> = {};
      referrals.forEach((r) => {
        if (r.referrerId)
          byReferrer[r.referrerId] = (byReferrer[r.referrerId] ?? 0) + 1;
      });
      const userMap = new Map(users.map((u) => [u.id, u]));
      const topReferrers = Object.entries(byReferrer)
        .map(([referrerId, count]) => ({
          referrerId,
          name:
            userMap.get(referrerId)?.displayName ??
            userMap.get(referrerId)?.email ??
            referrerId.slice(0, 8) + '…',
          email: userMap.get(referrerId)?.email ?? '—',
          count,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 15);
      return { referralUsers, inviteClicks, ordersFromReferrals, topReferrers };
    }, [referrals, users]);

  if (loading) {
    return (
      <ProtectedRoute>
        <AdminLayout title="Social Growth">
          <p className="text-gray-500">Loading...</p>
        </AdminLayout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <AdminLayout title="Social Growth">
        <div className="space-y-6">
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">
              Social Spread Metrics
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Referral Users
                </p>
                <p className="mt-1 text-2xl font-bold text-gray-900">
                  {referralUsers}
                </p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Invite Clicks
                </p>
                <p className="mt-1 text-2xl font-bold text-gray-900">
                  {inviteClicks}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Signups from shared links
                </p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Orders from Referrals
                </p>
                <p className="mt-1 text-2xl font-bold text-gray-900">
                  {ordersFromReferrals}
                </p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Top Referrers
                </p>
                <p className="mt-1 text-2xl font-bold text-gray-900">
                  {topReferrers.length}
                </p>
              </div>
            </div>
          </section>

          <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <h2 className="text-lg font-semibold text-gray-900 p-4 border-b border-gray-200">
              Top Referrers
            </h2>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Referrer
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Email
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Referrals
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {topReferrers.map((r) => (
                    <tr key={r.referrerId}>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        {r.name}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {r.email}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-medium text-gray-900">
                        {r.count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {topReferrers.length === 0 && (
              <p className="px-4 py-6 text-center text-gray-500 text-sm">
                No referrers yet. Share links to grow.
              </p>
            )}
          </section>
        </div>
      </AdminLayout>
    </ProtectedRoute>
  );
}
