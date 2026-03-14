import { db } from '@/firebase/config';
import {
  collection,
  getCountFromServer,
  query,
  where,
} from 'firebase/firestore';
import { useCallback, useEffect, useState } from 'react';

type AlertsSummary = {
  total: number;
  highActivityCount: number;
  loading: boolean;
};

export function useAlertsSummary(): AlertsSummary {
  const [total, setTotal] = useState(0);
  const [highActivityCount, setHighActivityCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchCounts = useCallback(async () => {
    try {
      const alertsRef = collection(db, 'alerts');
      const [totalSnap, highSnap] = await Promise.all([
        getCountFromServer(alertsRef),
        getCountFromServer(
          query(alertsRef, where('type', '==', 'high_activity')),
        ),
      ]);
      setTotal(totalSnap.data().count);
      setHighActivityCount(highSnap.data().count);
    } catch (e) {
      console.error('useAlertsSummary:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCounts();
    const interval = setInterval(fetchCounts, 60000);
    return () => clearInterval(interval);
  }, [fetchCounts]);

  return { total, highActivityCount, loading };
}
