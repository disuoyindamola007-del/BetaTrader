import { useCallback, useEffect, useState } from 'react';

const BRIEFING_CACHE_KEY = 'betatrader:briefing:v1';
const BRIEFING_CACHE_TTL_MS = 3 * 60 * 60_000; // 3 hours (middle of 2-4h window)

function getCachedBriefing() {
  try {
    const raw = localStorage.getItem(BRIEFING_CACHE_KEY);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (Date.now() > entry.expiresAt) {
      localStorage.removeItem(BRIEFING_CACHE_KEY);
      return null;
    }
    return entry.data;
  } catch {
    return null;
  }
}

function setCachedBriefing(data) {
  try {
    localStorage.setItem(BRIEFING_CACHE_KEY, JSON.stringify({
      data,
      expiresAt: Date.now() + BRIEFING_CACHE_TTL_MS,
    }));
  } catch {
    // localStorage unavailable or full — non-fatal, just skip caching
  }
}

async function requestOverview(type) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`/api/market-overview?type=${type}`, { signal: controller.signal });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `${type} unavailable`);
    return result;
  } finally {
    clearTimeout(timeout);
  }
}

export function useMarketOverview() {
  const [pulse, setPulse] = useState([]);
  const [pulseGeneratedAt, setPulseGeneratedAt] = useState(null);
  const [briefing, setBriefing] = useState(null);
  const [briefingGeneratedAt, setBriefingGeneratedAt] = useState(null);
  const [pulseLoading, setPulseLoading] = useState(true);
  const [briefingLoading, setBriefingLoading] = useState(true);
  const [pulseError, setPulseError] = useState(null);
  const [briefingError, setBriefingError] = useState(null);

  const loadPulse = useCallback(async () => {
    setPulseLoading(true);
    try {
      const result = await requestOverview('pulse');
      setPulse(Array.isArray(result.pulse) ? result.pulse : []);
      setPulseGeneratedAt(result.pulseGeneratedAt || null);
      setPulseError(null);
    } catch (err) {
      setPulseError(err.name === 'AbortError' ? 'Live Market Pulse took too long to load.' : err.message);
    } finally {
      setPulseLoading(false);
    }
  }, []);

  const loadBriefing = useCallback(async (forceRefresh = false) => {
    // Check client-side cache first (skip if force refresh via retry button)
    if (!forceRefresh) {
      const cached = getCachedBriefing();
      if (cached) {
        setBriefing(cached.briefing || null);
        setBriefingGeneratedAt(cached.generatedAt || null);
        setBriefingError(null);
        setBriefingLoading(false);
        return;
      }
    }

    setBriefingLoading(true);
    try {
      const result = await requestOverview('briefing');
      const briefingData = result.briefing || null;
      const generatedAt = result.briefingGeneratedAt || null;
      setBriefing(briefingData);
      setBriefingGeneratedAt(generatedAt);
      setBriefingError(null);
      // Cache the successful response client-side for next Home screen opens
      if (briefingData && generatedAt) {
        setCachedBriefing({ briefing: briefingData, generatedAt });
      }
    } catch (err) {
      setBriefingError(err.name === 'AbortError' ? 'Daily AI Briefing took too long to load.' : err.message);
    } finally {
      setBriefingLoading(false);
    }
  }, []);

  const reloadBriefing = useCallback(() => {
    loadBriefing(true);
  }, [loadBriefing]);

  useEffect(() => {
    loadPulse();
    loadBriefing(false);
  }, [loadPulse, loadBriefing]);

  return {
    pulse,
    pulseGeneratedAt,
    briefing,
    briefingGeneratedAt,
    pulseLoading,
    briefingLoading,
    pulseError,
    briefingError,
    reloadPulse: loadPulse,
    reloadBriefing,
  };
}
