import { get, set } from '../../lib/cache.js';

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
    if (cached) return res.status(200).json({ news: cached, cached: true });

    const response = await fetch(`${FINNHUB_BASE}/news?category=general&token=${apiKey}`);
    if (response.status === 429) return res.status(429).json({ error: 'News is temporarily rate limited', rateLimited: true });
    if (!response.ok) throw new Error(`Finnhub news failed: ${response.status}`);

    const data = await response.json();
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
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=1800');
    return res.status(200).json({ news, cached: false });
  } catch (error) {
    console.error('News proxy error:', error.message);
    return res.status(502).json({ error: 'News is temporarily unavailable' });
  }
}
