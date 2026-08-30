import { useCallback, useEffect, useState } from 'react';

export function useNews() {
  const [news, setNews] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [errorType, setErrorType] = useState(null); // 'rate_limited' | 'unavailable' | null

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/news');
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 429) {
          setErrorType('rate_limited');
          throw new Error('News is temporarily rate-limited. Please retry shortly.');
        }
        throw new Error(data.error || 'News unavailable');
      }
      setNews(Array.isArray(data.news) ? data.news : []);
      setError(null);
      setErrorType(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  return { news, isLoading, error, errorType, reload: load };
}
