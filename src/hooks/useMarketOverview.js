import { useCallback, useEffect, useState } from 'react';

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

  const loadBriefing = useCallback(async () => {
    setBriefingLoading(true);
    try {
      const result = await requestOverview('briefing');
      setBriefing(result.briefing || null);
      setBriefingGeneratedAt(result.briefingGeneratedAt || null);
      setBriefingError(null);
    } catch (err) {
      setBriefingError(err.name === 'AbortError' ? 'Daily AI Briefing took too long to load.' : err.message);
    } finally {
      setBriefingLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPulse();
    loadBriefing();
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
    reloadBriefing: loadBriefing,
  };
}
