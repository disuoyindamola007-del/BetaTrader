import { useCallback, useEffect, useState } from 'react';

export function useNews() {
  const [news, setNews] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/news');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'News unavailable');
      setNews(Array.isArray(data.news) ? data.news : []);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  return { news, isLoading, error, reload: load };
}
