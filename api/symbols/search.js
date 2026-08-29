const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';
const FINNHUB_BASE = 'https://finnhub.io/api/v1';
const TWELVE_DATA_BASE = 'https://api.twelvedata.com';
const MAX_QUERY_LENGTH = 40;
const MAX_RESULTS = 20;
const PER_PROVIDER_LIMIT = 12;
const STOCK_TYPES = ['stock', 'equity', 'etf', 'fund', 'adr', 'reit', 'common'];
const COMMODITY_HINTS = ['commodity', 'metal', 'energy', 'future', 'futures'];
const UNSUPPORTED_COMMODITY_SYMBOLS = new Set(['OIL', 'CRUDE', 'SILVER', 'XAG/USD', 'WTI/USD']);

function normalizeQuery(value) {
  return typeof value === 'string' ? value.trim().slice(0, MAX_QUERY_LENGTH) : '';
}

function cleanSymbol(value) {
  return String(value || '').trim().toUpperCase();
}

function uniqueResult(results) {
  const seen = new Set();
  return results
    .filter(item => item?.symbol && item?.providerSymbol)
    .filter(item => {
      const key = `${item.category}:${item.symbol}:${item.providerSymbol}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_RESULTS);
}

function normalizeTwelveDataCategory(item) {
  const symbol = cleanSymbol(item?.symbol);
  const type = String(item?.instrument_type || item?.type || '').toLowerCase();

  if (type.includes('forex') || type.includes('currency') || /^[A-Z]{3}\/[A-Z]{3}$/.test(symbol)) {
    return 'forex';
  }

  if (COMMODITY_HINTS.some(hint => type.includes(hint)) || /^(XAU|XAG|WTI|BRENT)(\/|$)/.test(symbol)) {
    return 'commodities';
  }

  return 'stocks';
}

function isSupportedSearchResult(result) {
  if (!result?.symbol || !result?.providerSymbol) return false;
  if (result.category === 'stocks' && result.symbol.includes(':')) return false;
  if (result.category === 'commodities' && UNSUPPORTED_COMMODITY_SYMBOLS.has(result.symbol)) return false;
  return true;
}

async function providerJson(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    if (!response.ok) throw new Error(`Provider search failed: ${response.status}`);
    return response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') throw new Error('Provider search timed out');
    throw error;
  }
}

async function searchCoinGecko(query) {
  const headers = { accept: 'application/json' };
  const key = process.env.COINGECKO_API_KEY || process.env.COINGECKO_DEMO_API_KEY;
  if (key) headers['x-cg-demo-api-key'] = key;
  const data = await providerJson(`${COINGECKO_BASE}/search?query=${encodeURIComponent(query)}`, { headers });
  return (data.coins || [])
    .slice(0, PER_PROVIDER_LIMIT)
    .map(coin => ({
      symbol: cleanSymbol(coin.symbol),
      name: String(coin.name || coin.symbol || '').trim(),
      category: 'crypto',
      providerSymbol: String(coin.id || '').trim(),
      source: 'coingecko',
    }))
    .filter(isSupportedSearchResult);
}

async function searchFinnhub(query, apiKey) {
  const data = await providerJson(`${FINNHUB_BASE}/search?q=${encodeURIComponent(query)}&token=${apiKey}`);
  return (data.result || [])
    .map(item => {
      const symbol = cleanSymbol(item.symbol || item.displaySymbol);
      const type = String(item.type || '').toLowerCase();
      if (type && !STOCK_TYPES.some(allowed => type.includes(allowed))) return null;
      return {
        symbol,
        name: String(item.description || item.displaySymbol || symbol).trim(),
        category: 'stocks',
        providerSymbol: symbol,
        source: 'finnhub',
      };
    })
    .filter(isSupportedSearchResult)
    .slice(0, PER_PROVIDER_LIMIT);
}

async function searchTwelveData(query, apiKey) {
  const data = await providerJson(`${TWELVE_DATA_BASE}/symbol_search?symbol=${encodeURIComponent(query)}&apikey=${apiKey}`);
  return (Array.isArray(data.data) ? data.data : [])
    .map(item => {
      const symbol = cleanSymbol(item.symbol);
      return {
        symbol,
        name: String(item.instrument_name || item.name || symbol).trim(),
        category: normalizeTwelveDataCategory(item),
        providerSymbol: symbol,
        source: 'twelvedata',
      };
    })
    .filter(isSupportedSearchResult)
    .slice(0, PER_PROVIDER_LIMIT);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const query = normalizeQuery(req.query.q);
  if (!query) return res.status(200).json({ results: [] });

  const searches = [searchCoinGecko(query)];
  if (process.env.FINNHUB_API_KEY) searches.push(searchFinnhub(query, process.env.FINNHUB_API_KEY));
  if (process.env.TWELVE_DATA_API_KEY) searches.push(searchTwelveData(query, process.env.TWELVE_DATA_API_KEY));

  try {
    const settled = await Promise.allSettled(searches);
    for (const item of settled) {
      if (item.status === 'rejected') console.error('Symbol provider search failed:', item.reason?.message || item.reason);
    }
    const results = uniqueResult(settled.flatMap(item => item.status === 'fulfilled' ? item.value : []));
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600');
    return res.status(200).json({ results });
  } catch (error) {
    console.error('Symbol search error:', error.message);
    return res.status(502).json({ error: 'Symbol search is temporarily unavailable' });
  }
}
