const FINNHUB_BASE = 'https://finnhub.io/api/v1';
const MAX_QUERY_LENGTH = 40;
const MAX_RESULTS = 12;

function normalizeQuery(value) {
  return typeof value === 'string' ? value.trim().slice(0, MAX_QUERY_LENGTH) : '';
}

function normalizeResult(item) {
  const symbol = String(item?.symbol || '').trim().toUpperCase();
  if (!symbol || symbol.includes(':')) return null;

  const type = String(item.type || '').toLowerCase();
  if (type && !type.includes('stock') && !type.includes('equity') && !type.includes('etf') && !type.includes('fund')) {
    return null;
  }

  return {
    symbol,
    name: String(item.description || item.displaySymbol || symbol).trim(),
    category: 'stocks',
    source: 'finnhub',
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const query = normalizeQuery(req.query.q);
  if (query.length < 1) return res.status(200).json({ results: [] });

  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Stock search is not configured' });

  try {
    const response = await fetch(`${FINNHUB_BASE}/search?q=${encodeURIComponent(query)}&token=${apiKey}`);
    if (response.status === 429) return res.status(429).json({ error: 'Stock search is temporarily rate limited', rateLimited: true });
    if (!response.ok) throw new Error(`Finnhub search failed: ${response.status}`);

    const data = await response.json();
    const seen = new Set();
    const results = (Array.isArray(data.result) ? data.result : [])
      .map(normalizeResult)
      .filter(item => item && !seen.has(item.symbol) && seen.add(item.symbol))
      .slice(0, MAX_RESULTS);

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600');
    return res.status(200).json({ results });
  } catch (error) {
    console.error('Symbol search error:', error.message);
    return res.status(502).json({ error: 'Stock search is temporarily unavailable' });
  }
}
