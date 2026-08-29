import { get, set } from '../../lib/cache.js';
import { isCircuitOpen, recordSuccess, recordFailure } from '../../lib/circuitBreaker.js';
import { fetchJsonWithTimeout } from '../../lib/fetchWithTimeout.js';
import { logCacheHit, logCacheMiss } from '../../lib/structuredLogger.js';

const FINNHUB_BASE = 'https://finnhub.io/api/v1';
const NEWS_TTL_MS = 5 * 60_000;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'News is not configured' });

  const cacheKey = 'news:general';
  try {
    const cached = await get(cacheKey, NEWS_TTL_MS);
    if (cached) {
      logCacheHit({ provider: 'finnhub', key: cacheKey, ttlMs: NEWS_TTL_MS, valueSize: JSON.stringify(cached).length });
      return res.status(200).json({ news: cached, cached: true });
    }
    logCacheMiss({ provider: 'finnhub', key: cacheKey });

    if (isCircuitOpen('finnhub')) {
      return res.status(503).json({ error: 'News provider temporarily unavailable', circuitOpen: true });
    }

    const url = `${FINNHUB_BASE}/news?category=general&token=${apiKey}`;
    let data;
    try {
      data = await fetchJsonWithTimeout(url, {}, { provider: 'finnhub' });
    } catch (error) {
      if (error.timeout) {
        recordFailure('finnhub');
        return res.status(408).json({ error: 'News request timed out' });
      }
      throw error;
    }

    const news = (Array.isArray(data) ? data : [])
      .filter(item => item?.headline && item?.url)
      .map(item => ({
        id: item.id,
        headline: item.headline,
        source: item.source || 'Finnhub',
        summary: item.summary || '',
        url: item.url,
        image: item.image || '',
        related: String(item.related || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 5),
        datetime: item.datetime,
      }))
      .slice(0, 30);

    await set(cacheKey, news, NEWS_TTL_MS);
    recordSuccess('finnhub');
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=1800');
    return res.status(200).json({ news, cached: false });
  } catch (error) {
    console.error('News proxy error:', error.message);
    if (!error.message?.includes('timed out')) {
      recordFailure('finnhub');
    }
    const status = error.message?.includes('429') ? 429 : 502;
    return res.status(status).json({ error: 'News is temporarily unavailable' });
  }
}
