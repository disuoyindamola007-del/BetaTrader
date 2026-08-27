import { useEffect, useMemo, useState } from 'react';
import { supportedSymbols } from '../data/supportedSymbols.js';

const DEBOUNCE_MS = 300;

function searchLocal(query) {
  const normalized = query.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!normalized) return [];
  const compact = normalized.replace('/', '');

  return supportedSymbols
    .filter(item => item.symbol.toLowerCase().replace('/', '').includes(compact) || item.name.toLowerCase().includes(normalized))
    .slice(0, 8);
}

export function useSymbolSearch(query) {
  const localResults = useMemo(() => searchLocal(query), [query]);
  const [remoteResults, setRemoteResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setRemoteResults([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/symbols/search?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Search failed');
        setRemoteResults(Array.isArray(data.results) ? data.results : []);
      } catch (err) {
        if (err.name !== 'AbortError') {
          setRemoteResults([]);
          setError(err.message);
        }
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const results = useMemo(() => {
    const seen = new Set();
    return [...localResults, ...remoteResults]
      .filter(item => !seen.has(item.symbol) && seen.add(item.symbol))
      .slice(0, 12);
  }, [localResults, remoteResults]);

  return { results, isLoading, error };
}
