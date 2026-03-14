import AdminLayout from '@/components/AdminLayout';
import ProtectedRoute from '@/components/ProtectedRoute';
import { db } from '@/firebase/config';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';

type AlertRow = {
  id: string;
  type: string;
  message: string;
  time: string;
};

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'alerts'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: AlertRow[] = snap.docs.map((d) => {
          const data = d.data();
          const created = data?.createdAt?.toMillis?.() ?? data?.createdAt ?? 0;
          return {
            id: d.id,
            type: (data?.type as string) ?? '—',
            message: (data?.message as string) ?? '—',
            time:
              created > 0
                ? new Date(created).toLocaleString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : '—',
          };
        });
        setAlerts(list);
        setLoading(false);
      },
      (err) => {
        console.error(err);
        setLoading(false);
      },
    );
    return () => unsub();
  }, []);

  return (
    <ProtectedRoute>
      <AdminLayout title="Alerts">
        {loading ? (
          <p className="text-gray-500">Loading alerts...</p>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Type
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Message
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Time
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {alerts.map((a) => (
                    <tr key={a.id}>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        {a.type}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {a.message}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {a.time}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {alerts.length === 0 && !loading && (
              <p className="px-4 py-8 text-center text-gray-500">
                No alerts yet.
              </p>
            )}
          </div>
        )}
      </AdminLayout>
    </ProtectedRoute>
  );
}
