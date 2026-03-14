import AdminLayout from '@/components/AdminLayout';
import ProtectedRoute from '@/components/ProtectedRoute';
import { db } from '@/firebase/config';
import { collection, getDocs } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';

type OrderRow = {
  id: string;
  restaurant: string;
  price: number | null;
  owner: string;
  status: string;
  createdAtMs: number;
};

export default function OrdersPage() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchOrders() {
      try {
        const snap = await getDocs(collection(db, 'orders'));
        const list: OrderRow[] = [];
        snap.docs.forEach((d) => {
          const data = d.data();
          const created = data?.createdAt?.toMillis?.() ?? data?.createdAt ?? 0;
          list.push({
            id: d.id,
            restaurant: data?.restaurantName ?? '—',
            price:
              typeof data?.totalPrice === 'number' ? data.totalPrice : null,
            owner: data?.userName ?? data?.creatorId ?? '—',
            status: data?.status ?? '—',
            createdAtMs: created,
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
    fetchOrders();
  }, []);

  return (
    <ProtectedRoute>
      <AdminLayout title="Orders">
        {loading ? (
          <p className="text-gray-500">Loading orders...</p>
        ) : (
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
                      Owner
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
                        {o.owner}
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
        )}
      </AdminLayout>
    </ProtectedRoute>
  );
}
