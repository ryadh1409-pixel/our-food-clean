/**
 * Detects if the user is inside a campus zone (GPS).
 * When true, Campus Mode is active: use 150m match radius.
 */

import { isInsideCampus } from '@/services/campusMode';
import { getUserLocation } from '@/services/location';
import { useCallback, useEffect, useState } from 'react';

export type CampusDetection = {
  isCampusMode: boolean;
  campusName: string | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
};

export function useCampusDetection(): CampusDetection {
  const [isCampusMode, setIsCampusMode] = useState(false);
  const [campusName, setCampusName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const check = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const loc = await getUserLocation();
      const { isInside, campus } = isInsideCampus(loc.latitude, loc.longitude);
      setIsCampusMode(isInside);
      setCampusName(campus?.name ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Location unavailable');
      setIsCampusMode(false);
      setCampusName(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  return { isCampusMode, campusName, loading, error, refetch: check };
}
