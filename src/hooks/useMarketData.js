import { useState, useEffect, useRef, useCallback } from 'react';
import {
  fetchQuote,
  fetchCandles,
  fetchBatchQuotes,
  fetchCryptoBatch,
  peekQuote,
  getRefreshInterval,
  isTabActive,
  onTabVisibility,
  getCategory,
} from '../services/marketDataService.js';

// ==================== useQuote ====================
// Stale-while-revalidate strategy:
// 1. On mount: immediately display cached quote if available (instant loading)
// 2. Check if cached quote is still within TTL (fresh)
// 3. If fresh: no network request — data is good
// 4. If stale/expired: display cached value immediately, fetch fresh quote
//    in background, then update UI automatically when it arrives
// 5. Auto-refresh on interval when tab is active

export function useQuote(symbol, enabled = true) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isStale, setIsStale] = useState(false);
  const intervalRef = useRef(null);
  const currentSymbolRef = useRef(symbol);

  const load = useCallback(async (isBackground = false) => {
    if (!symbol || !enabled) return;

    const callSymbol = symbol;
    currentSymbolRef.current = callSymbol;

    const { cached, isFresh } = await peekQuote(callSymbol);

    if (cached) {
      setData(cached);
      setIsStale(false);
    }

    if (!cached || !isFresh) {
      if (!isBackground) setIsLoading(true);
      try {
        const quote = await fetchQuote(callSymbol);
        if (currentSymbolRef.current !== callSymbol) return;
        setData(quote);
        setError(null);
        setIsStale(false);
      } catch (err) {
        if (currentSymbolRef.current !== callSymbol) return;
        setError(err.message);
        if (err.rateLimited || err.isCooldown) setIsStale(true);
      } finally {
        if (currentSymbolRef.current === callSymbol && !isBackground) {
          setIsLoading(false);
        }
      }
    }
  }, [symbol, enabled]);

  useEffect(() => {
    if (!symbol || !enabled) return;

    load(false);

    const category = getCategory(symbol);
    const intervalMs = getRefreshInterval(category);

    intervalRef.current = setInterval(() => {
      if (isTabActive()) load(true);
    }, intervalMs);

    return () => clearInterval(intervalRef.current);
  }, [symbol, enabled, load]);

  const refetch = useCallback(() => load(false), [load]);

  return { data, error, isLoading, isStale, refetch };
}

export function useCandles(symbol, interval, options = {}) {
  const { enabled = true, limit = 200 } = options;
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const intervalRef = useRef(null);

  const load = useCallback(async (isBackground = false) => {
    if (!symbol || !enabled) return;
    if (!isBackground) setIsLoading(true);

    try {
      const candles = await fetchCandles(symbol, interval, limit);
      setData(candles);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      if (!isBackground) setIsLoading(false);
    }
  }, [symbol, interval, limit, enabled]);

  useEffect(() => {
    if (!symbol || !enabled) return;
    load(false);

    const intervalMs = getRefreshInterval('stocks');
    intervalRef.current = setInterval(() => {
      if (isTabActive()) load(true);
    }, intervalMs);

    return () => clearInterval(intervalRef.current);
  }, [symbol, interval, limit, enabled, load]);

  const refetch = useCallback(() => load(false), [load]);

  return { data, error, isLoading, refetch };
}

export function useBatchQuotes(symbols, enabled = true) {
  const [data, setData] = useState({});
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isStale, setIsStale] = useState(false);
  const intervalRef = useRef(null);

  const load = useCallback(async (isBackground = false) => {
    if (!symbols?.length || !enabled) return;
    if (!isBackground) setIsLoading(true);

    const byCategory = {};
    for (const sym of symbols) {
      const cat = getCategory(sym);
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(sym);
    }

    try {
      const { data: result, errors, stale } = await fetchBatchQuotes(byCategory);
      setData(result);
      setError(errors.length > 0 ? errors[0].message : null);
      setIsStale(stale);
    } catch (err) {
      setError(err.message);
    } finally {
      if (!isBackground) setIsLoading(false);
    }
  }, [symbols, enabled]);

  useEffect(() => {
    if (!symbols?.length || !enabled) return;
    load(false);

    intervalRef.current = setInterval(() => {
      if (isTabActive()) load(true);
    }, 60_000);

    return () => clearInterval(intervalRef.current);
  }, [symbols, enabled, load]);

  return { data, error, isLoading, isStale };
}

// ==================== useCryptoBatch ====================

export function useCryptoBatch(enabled = true) {
  const [data, setData] = useState({});
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isStale, setIsStale] = useState(false);
  const intervalRef = useRef(null);

  const load = useCallback(async (isBackground = false) => {
    if (!enabled) return;
    if (!isBackground) setIsLoading(true);

    try {
      const result = await fetchCryptoBatch();
      if (result.error) {
        setError(result.error);
        setIsStale(result.stale);
      } else {
        setData(result.data);
        setError(null);
        setIsStale(result.stale);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      if (!isBackground) setIsLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    load(false);

    intervalRef.current = setInterval(() => {
      if (isTabActive()) load(true);
    }, 60_000);

    return () => clearInterval(intervalRef.current);
  }, [enabled, load]);

  return { data, error, isLoading, isStale };
}
