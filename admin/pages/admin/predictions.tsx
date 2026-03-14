import AdminLayout from '@/components/AdminLayout';
import ProtectedRoute from '@/components/ProtectedRoute';
import { db } from '@/firebase/config';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { formatArea } from '@/lib/geoGrid';

type PredictionRow = {
  id: string;
  area: string;
  timeWindow: string;
  expectedOrders: number;
  confidence: number;
};

export default function PredictionsPage() {
  const [rows, setRows] = useState<PredictionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushResult, setPushResult] = useState<{
    sent: number;
    failed: number;
  } | null>(null);

  useEffect(() => {
    async function fetchPredictions() {
      try {
        const snap = await getDocs(
          query(collection(db, 'predictions'), orderBy('createdAt', 'desc')),
        );
        const list: PredictionRow[] = snap.docs.map((d) => {
          const data = d.data();
          const loc = data?.location;
          const lat = loc?.latitude ?? 0;
          const lng = loc?.longitude ?? 0;
          const hour = Number(data?.hour ?? 0);
          const dayName = (data?.dayName as string) ?? '';
          const hourStr = `${hour.toString().padStart(2, '0')}:00`;
          return {
            id: d.id,
            area: formatArea(lat, lng),
            timeWindow: `${dayName} ${hourStr}`,
            expectedOrders: Number(data?.expectedOrders ?? 0),
            confidence: Number(data?.confidence ?? 0),
          };
        });
        setRows(list);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    fetchPredictions();
  }, []);

  const handleSendPushToNearby = async () => {
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
      if (!res.ok) throw new Error(data.error || 'Failed to send');
      setPushResult({ sent: data.sent ?? 0, failed: data.failed ?? 0 });
    } catch (e) {
      setPushResult({ sent: 0, failed: 1 });
      console.error(e);
    } finally {
      setPushLoading(false);
    }
  };

  return (
    <ProtectedRoute>
      <AdminLayout title="Demand Forecast">
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={handleSendPushToNearby}
              disabled={pushLoading}
              className="px-4 py-2.5 rounded-lg font-medium bg-primary text-gray-900 hover:bg-primaryDark disabled:opacity-50 shadow-sm"
            >
              {pushLoading ? 'Sending...' : 'Send push to nearby users'}
            </button>
            {pushResult && (
              <span className="text-sm text-gray-600">
                Sent: {pushResult.sent}, Failed: {pushResult.failed}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500">
            Predictions are updated every 6 hours. Push message: &quot;Many
            people near you will be sharing food soon. Join HalfOrder.&quot;
          </p>
          {loading ? (
            <p className="text-gray-500">Loading predictions...</p>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Area
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Time window
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                        Expected orders
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                        Confidence
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {rows.map((r) => (
                      <tr key={r.id}>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {r.area}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {r.timeWindow}
                        </td>
                        <td className="px-4 py-3 text-sm text-right font-medium text-gray-900">
                          {r.expectedOrders}
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-gray-600">
                          {(r.confidence * 100).toFixed(0)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length === 0 && !loading && (
                <p className="px-4 py-8 text-center text-gray-500">
                  No predictions yet. Run the forecast job (cron every 6 hours).
                </p>
              )}
            </div>
          )}
        </div>
      </AdminLayout>
    </ProtectedRoute>
  );
}
