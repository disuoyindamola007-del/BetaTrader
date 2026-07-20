import { get, set, ttlFor } from '../../lib/cache.js';
import { parseTdQuote, checkTdError } from '../../lib/twelveData.js';
import { isRateLimited, triggerRateLimitCooldown } from '../../lib/rateLimitState.js';

const TWELVE_DATA_BASE = 'https://api.twelvedata.com';

const SYMBOL_MAP = {
  'GOLD': 'XAU/USD',
  'SILVER': 'XAG/USD',
  'OIL': 'WTI/USD',
  'CRUDE': 'WTI/USD',
  'BRENT': 'BRENT/USD',
};

function mapSymbol(sym) {
  return SYMBOL_MAP[sym.toUpperCase()] || sym.toUpperCase();
}

export default async function handler(req, res) {
  const { symbol, interval = '1h', outputsize = '200', type = 'candles' } = req.query;

  if (!symbol) {
    return res.status(400).json({ error: 'Symbol required' });
  }

  const TWELVE_DATA_API_KEY = process.env.TWELVE_DATA_API_KEY;
  if (!TWELVE_DATA_API_KEY) {
    return res.status(500).json({ error: 'TWELVE_DATA_API_KEY not configured' });
  }

  const isBatch = symbol.includes(',');
  const symbols = symbol.split(',').map(s => s.trim().toUpperCase());
  const mappedSymbols = symbols.map(mapSymbol);
  const intervalMap = { '1m': '1min', '5m': '5min', '15m': '15min', '1h': '1h', '4h': '4h', '1d': '1day', '1w': '1week' };
  const tdInterval = intervalMap[interval] || '1h';

  try {
    if (isRateLimited()) {
      return res.status(429).json({ error: 'Rate limit cooldown active — retry shortly', rateLimited: true, retryAfter: 60 });
    }

    if (type === 'quote' || isBatch) {
      const symbolParam = mappedSymbols.join(',');
      const cacheKey = `td:quote:commodities:${symbols.sort().join(',')}`;
      const cached = await get(cacheKey, ttlFor('batch'));

      let data;
      if (cached) {
        data = cached;
      } else {
        const response = await fetch(
          `${TWELVE_DATA_BASE}/quote?symbol=${encodeURIComponent(symbolParam)}&apikey=${TWELVE_DATA_API_KEY}`
        );
        if (response.status === 429) {
          triggerRateLimitCooldown();
          const err = new Error('TwelveData rate limit reached');
          err.rateLimited = true;
          throw err;
        }
        if (!response.ok) throw new Error(`TwelveData quote fetch failed: ${response.status}`);
        data = await response.json();
        checkTdError(data);
        await set(cacheKey, data, ttlFor('batch'));
      }

      const parsed = parseTdQuote(data, mappedSymbols);
      const result = {};
      for (let i = 0; i < symbols.length; i++) {
        const mapped = mappedSymbols[i];
        if (parsed[mapped]) result[symbols[i]] = parsed[mapped];
      }
      res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
      return res.status(200).json(result);
    }

    const symbolParam = mappedSymbols[0];
    const cacheKey = `td:candles:commodities:${symbolParam.replace('/', '')}:${tdInterval}:${outputsize}`;
    const cached = await get(cacheKey, ttlFor('candles', interval));

    let data;
    if (cached) {
      data = cached;
    } else {
      const response = await fetch(
        `${TWELVE_DATA_BASE}/time_series?symbol=${encodeURIComponent(symbolParam)}&interval=${tdInterval}&outputsize=${outputsize}&apikey=${TWELVE_DATA_API_KEY}`
      );
      if (response.status === 429) {
        triggerRateLimitCooldown();
        const err = new Error('TwelveData rate limit reached');
        err.rateLimited = true;
        throw err;
      }
      if (!response.ok) throw new Error(`TwelveData candles fetch failed: ${response.status}`);
      data = await response.json();
      checkTdError(data);
      await set(cacheKey, data, ttlFor('candles', interval));
    }

    const candles = (data.values || []).reverse().map(d => ({
      time: Math.floor(new Date(d.datetime).getTime() / 1000),
      open: parseFloat(d.open),
      high: parseFloat(d.high),
      low: parseFloat(d.low),
      close: parseFloat(d.close),
      volume: parseFloat(d.volume),
    }));

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return res.status(200).json(candles);

  } catch (error) {
    console.error('Commodities proxy error:', error.message);
    const status = error.rateLimited ? 429 : 500;
    return res.status(status).json({
      error: error.message,
      rateLimited: error.rateLimited || false,
    });
  }
}
