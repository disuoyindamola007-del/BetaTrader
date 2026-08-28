import { useCallback, useEffect, useState } from 'react';

export function useMarketOverview() {
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/market-overview');
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Market overview unavailable');
      setData(result);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  return { data, isLoading, error, reload: load };
}
