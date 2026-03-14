import { getTrustScore, type TrustScore } from '@/services/ratings';
import { useEffect, useState } from 'react';

export function useTrustScore(userId: string | null): TrustScore | null {
  const [score, setScore] = useState<TrustScore | null>(null);

  useEffect(() => {
    if (!userId) {
      setScore(null);
      return;
    }
    let cancelled = false;
    getTrustScore(userId).then((s) => {
      if (!cancelled) setScore(s);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return score;
}
