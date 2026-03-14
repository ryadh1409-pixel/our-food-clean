import AdminLayout from '@/components/AdminLayout';
import ProtectedRoute from '@/components/ProtectedRoute';
import { db } from '@/firebase/config';
import { doc, getDoc, getDocs, collection } from 'firebase/firestore';
import Link from 'next/link';
import { useRouter } from 'next/router';
import React, { useEffect, useState } from 'react';

type OrderRow = {
  id: string;
  restaurant: string;
  price: number | null;
  date: string;
  createdAtMs: number;
  status: string;
};

export default function UserDetailPage() {
  const router = useRouter();
  const id = router.query.id as string | undefined;
  const [userName, setUserName] = useState<string>('');
  const [userEmail, setUserEmail] = useState<string>('');
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    async function fetchUserAndOrders() {
      try {
        const [userSnap, ordersSnap] = await Promise.all([
          getDoc(doc(db, 'users', id)),
          getDocs(collection(db, 'orders')),
        ]);
        const userData = userSnap.exists() ? userSnap.data() : {};
        setUserName(userData?.displayName ?? userData?.name ?? '—');
        setUserEmail(userData?.email ?? '—');

        const list: OrderRow[] = [];
        ordersSnap.docs.forEach((d) => {
          const data = d.data();
          const participantIds =
            data?.participantIds ?? data?.joinedUsers ?? [];
          const hostId = data?.hostId ?? data?.creatorId ?? data?.userId;
          const isParticipant =
            hostId === id ||
            (Array.isArray(participantIds) && participantIds.includes(id));
          if (!isParticipant) return;

          const created = data?.createdAt?.toMillis?.() ?? data?.createdAt ?? 0;
          const price =
            typeof data?.totalPrice === 'number'
              ? data.totalPrice
              : data?.price;
          list.push({
            id: d.id,
            restaurant: data?.restaurantName ?? data?.restaurant ?? '—',
            price: typeof price === 'number' ? price : null,
            date: created
              ? new Date(created).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : '—',
            createdAtMs: typeof created === 'number' ? created : 0,
            status: data?.status ?? '—',
          });
        });
        list.sort((a, b) => b.createdAtMs - a.createdAtMs);
        setOrders(list);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    fetchUserAndOrders();
  }, [id]);

  if (!id) {
    return (
      <ProtectedRoute>
        <AdminLayout title="User">
          <p className="text-gray-500">Invalid user.</p>
        </AdminLayout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <AdminLayout title="User detail">
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <Link
              href="/admin/users"
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              ← Back to Users
            </Link>
          </div>
          {loading ? (
            <p className="text-gray-500">Loading...</p>
          ) : (
            <>
              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm max-w-md">
                <p className="text-sm text-gray-500">Name</p>
                <p className="text-lg font-medium text-gray-900">{userName}</p>
                <p className="text-sm text-gray-500 mt-2">Email</p>
                <p className="text-lg text-gray-900">{userEmail}</p>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-3">
                  Order history
                </h2>
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                            Restaurant
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                            Price
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                            Date
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                            Status
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {orders.map((o) => (
                          <tr key={o.id}>
                            <td className="px-4 py-3 text-sm text-gray-900">
                              {o.restaurant}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600">
                              {o.price != null ? `$${o.price.toFixed(2)}` : '—'}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600">
                              {o.date}
                            </td>
                            <td className="px-4 py-3">
                              <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                                {o.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {orders.length === 0 && (
                    <p className="px-4 py-8 text-center text-gray-500">
                      No orders yet.
                    </p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </AdminLayout>
    </ProtectedRoute>
  );
}
