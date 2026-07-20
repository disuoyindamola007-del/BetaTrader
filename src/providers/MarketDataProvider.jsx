// MarketDataProvider — lightweight React context.
//
// The heavy lifting is in MarketDataService (singleton, no React needed).
// This provider is optional — hooks work without it. It only provides:
// - Global stats tracking (for debugging)
// - Future: theme/settings that affect data fetching
//
// Wrap your app if you want stats. Skip it if you don't.

import { createContext, useContext, useState, useCallback } from 'react';

const MarketDataContext = createContext(null);

export function MarketDataProvider({ children }) {
  const [stats, setStats] = useState({ requests: 0, cacheHits: 0, errors: 0 });

  const recordRequest = useCallback(() => {
    setStats(s => ({ ...s, requests: s.requests + 1 }));
  }, []);

  const recordCacheHit = useCallback(() => {
    setStats(s => ({ ...s, cacheHits: s.cacheHits + 1 }));
  }, []);

  const recordError = useCallback(() => {
    setStats(s => ({ ...s, errors: s.errors + 1 }));
  }, []);

  return (
    <MarketDataContext.Provider value={{ stats, recordRequest, recordCacheHit, recordError }}>
      {children}
    </MarketDataContext.Provider>
  );
}

export function useMarketDataContext() {
  return useContext(MarketDataContext);
}
