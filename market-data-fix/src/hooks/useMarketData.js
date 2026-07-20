// useMarketData — single generic hook for all market data needs.
//
// Usage:
//   const { data, error, isLoading, isStale, refresh } = useMarketData({
//     type: 'quote',        // 'quote' | 'candles' | 'cryptoBatch'
//     symbol: 'BTC',        // single symbol (for quote/candles)
//     symbols: ['SPX','NDX'], // array of symbols (for batch quote)
//     interval: '1h',       // for candles
//     limit: 200,           // for candles
//     enabled: true,        // can pause fetching
//   });
//
// Features:
// - Auto-refresh at category-specific intervals
// - Pauses when browser tab is hidden
// - Stale data fallback on error
// - Request deduplication handled by MarketDataService

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  fetchQuote,
  fetchBatchQuotes,
  fetchCandles,
  fetchCryptoBatch,
  getCategory,
  getRefreshInterval,
  isTabActive,
  onTabVisibility,
} from '../services/marketDataService.js';

function useInterval(callback, delay, enabled) {
  const savedRef = useRef(callback);
  useEffect(() => { savedRef.current = callback; }, [callback]);
  useEffect(() => {
    if (!enabled || delay === null) return;
    const id = setInterval(() => savedRef.current(), delay);
    return () => clearInterval(id);
  }, [delay, enabled]);
}

export function useMarketData(options = {}) {
  const {
    type = 'quote',       // 'quote' | 'candles' | 'cryptoBatch' | 'batchQuotes'
    symbol,
    symbols,
    interval = '1h',
    limit = 200,
    enabled = true,
  } = options;

  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isStale, setIsStale] = useState(false);

  // Determine refresh interval from the symbol(s) requested
  const refreshDelay = useMemo(() => {
    if (!enabled) return null;
    if (type === 'cryptoBatch') return getRefreshInterval('crypto');
    if (type === 'batchQuotes' && symbols?.length) {
      const cats = new Set(symbols.map(getCategory));
      let min = Infinity;
      for (const c of cats) min = Math.min(min, getRefreshInterval(c));
      return min === Infinity ? 60_000 : min;
    }
    if (symbol) return getRefreshInterval(getCategory(symbol));
    return 60_000;
  }, [type, symbol, symbols, enabled]);

  const load = useCallback(async () => {
    if (!enabled) return;
    if (!isTabActive()) return;

    setIsLoading(true);
    setError(null);

    try {
      let result;

      switch (type) {
        case 'quote':
          result = await fetchQuote(symbol);
          setData(result);
          setIsStale(false);
          break;

        case 'batchQuotes':
          result = await fetchBatchQuotes(symbols);
          setData(result.data);
          setIsStale(result.stale || false);
          if (result.errors.length > 0 && Object.keys(result.data).length === 0) {
            setError(result.errors.map(e => e.message).join(', '));
          }
          break;

        case 'candles':
          result = await fetchCandles(symbol, interval, limit);
          setData(result);
          setIsStale(false);
          break;

        case 'cryptoBatch':
          result = await fetchCryptoBatch();
          if (result.error) {
            setError(result.error);
            setIsStale(true);
          } else {
            setData(result.data);
            setIsStale(result.stale || false);
          }
          break;

        default:
          throw new Error(`Unknown type: ${type}`);
      }
    } catch (err) {
      console.error('[useMarketData] Load error:', err);
      setError(err.message);
      setIsStale(err.rateLimited || err.isCooldown || false);
      // Keep existing data (stale fallback)
    } finally {
      setIsLoading(false);
    }
  }, [type, symbol, symbols, interval, limit, enabled]);

  // Initial load
  useEffect(() => {
    load();
  }, [load]);

  // Auto-refresh
  useInterval(load, refreshDelay, enabled);

  // Resume when tab becomes visible
  useEffect(() => {
    return onTabVisibility((visible) => {
      if (visible && enabled) load();
    });
  }, [load, enabled]);

  return { data, error, isLoading, isStale, refresh: load };
}

// Convenience: get quote for a single symbol
export function useQuote(symbol, enabled = true) {
  return useMarketData({ type: 'quote', symbol, enabled: !!symbol && enabled });
}

// Convenience: get candles for a single symbol
export function useCandles(symbol, interval = '1h', options = {}) {
  const { enabled = true, limit = 200 } = options;
  return useMarketData({ type: 'candles', symbol, interval, limit, enabled: !!symbol && enabled });
}

// Convenience: get all crypto quotes
export function useCryptoBatch(enabled = true) {
  return useMarketData({ type: 'cryptoBatch', enabled });
}

// Convenience: get batch quotes for multiple symbols
export function useBatchQuotes(symbols, enabled = true) {
  return useMarketData({ type: 'batchQuotes', symbols, enabled: !!symbols?.length && enabled });
}
