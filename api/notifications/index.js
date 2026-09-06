import { get, set } from '../../lib/cache.js';
import { isCircuitOpen, recordSuccess, recordFailure } from '../../lib/circuitBreaker.js';
import { fetchJsonWithTimeout } from '../../lib/fetchWithTimeout.js';
import { logCacheHit, logCacheMiss } from '../../lib/structuredLogger.js';

const FINNHUB_BASE = 'https://finnhub.io/api/v1';
const NEWS_TTL_MS = 5 * 60_000;

// Market-moving news categories
const ALERT_CATEGORIES = ['company', 'market', 'forex', 'crypto', 'commodities'];

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) {
    // Graceful fallback: return empty notifications instead of 500
    return res.status(200).json({ notifications: [], cached: false, provider: 'none' });
  }

  // This legacy provider fallback is only used when the client cannot query
  // Supabase. Keep its cache explicitly scoped rather than presenting a
  // globally shared notification result as user data.
  const cacheKey = `notifications:latest:${apiKey.slice(-8)}`;
  
  try {
    const cached = await get(cacheKey, NEWS_TTL_MS);
    if (cached) {
      logCacheHit({ provider: 'finnhub', key: cacheKey, ttlMs: NEWS_TTL_MS });
      return res.status(200).json({ notifications: cached, cached: true });
    }
    logCacheMiss({ provider: 'finnhub', key: cacheKey });

    if (isCircuitOpen('finnhub')) {
      return res.status(503).json({ error: 'News provider temporarily unavailable', circuitOpen: true });
    }

    // Fetch general market news
    const url = `${FINNHUB_BASE}/news?category=general&lang=en&token=${encodeURIComponent(apiKey)}`;
    const data = await fetchJsonWithTimeout(url, {}, { provider: 'finnhub' });
    recordSuccess('finnhub');

    // Transform into notification format
    const notifications = (data || []).slice(0, 10).map(item => ({
      id: item.id || `news-${Date.now()}-${Math.random()}`,
      type: 'news',
      title: item.headline || 'Market Update',
      message: item.summary || item.headline || 'New market news available',
      source: item.source || 'Finnhub',
      timestamp: item.datetime ? new Date(item.datetime * 1000).toISOString() : new Date().toISOString(),
      url: item.url || null,
      read: false,
      priority: item.related || item.headline ? 'normal' : 'low',
    }));

    await set(cacheKey, notifications, NEWS_TTL_MS);
    
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');
    return res.status(200).json({ notifications, cached: false });
  } catch (error) {
    recordFailure('finnhub');
    console.error('[Notifications] Error:', error.message);
    
    if (error.circuitOpen) {
      return res.status(503).json({ error: 'News provider temporarily unavailable', circuitOpen: true });
    }
    
    return res.status(500).json({ error: 'Failed to fetch notifications' });
  }
}
