import { get, set, ttlFor } from '../../lib/cache.js';
import { validateMarketQuery } from '../../lib/validateMarketQuery.js';
import { parseTdQuote, checkTdError } from '../../lib/twelveData.js';
import { isRateLimited, triggerRateLimitCooldown } from '../../lib/rateLimitState.js';
import { isCircuitOpen, recordSuccess, recordFailure } from '../../lib/circuitBreaker.js';
import { fetchJsonWithTimeout } from '../../lib/fetchWithTimeout.js';
import { logCacheHit, logCacheMiss } from '../../lib/structuredLogger.js';

const TWELVE_DATA_BASE = 'https://api.twelvedata.com';

const UNSUPPORTED_SYMBOLS = {
  OIL: 'Oil data is unavailable from TwelveData on the current plan.',
  CRUDE: 'Oil data is unavailable from TwelveData on the current plan.',
  SILVER: 'Silver data is unavailable from TwelveData on the current plan.',
};

const SYMBOL_MAP = {
  'GOLD': 'XAU/USD',
  'BRENT': 'BRENT/USD',
};

function mapSymbol(sym) {
  return SYMBOL_MAP[sym.toUpperCase()] || sym.toUpperCase();
}

export default async function handler(req, res) {
  const { symbol, interval = '1h', outputsize = '200', type = 'candles' } = req.query;

  const validation = validateMarketQuery({ symbol, interval, type, size: outputsize });
  if (validation.error) return res.status(400).json({ error: validation.error });

  const TWELVE_DATA_API_KEY = process.env.TWELVE_DATA_API_KEY;
  if (!TWELVE_DATA_API_KEY) {
    return res.status(500).json({ error: 'TWELVE_DATA_API_KEY not configured' });
  }

  const isBatch = symbol.includes(',');
  const symbols = symbol.split(',').map(s => s.trim().toUpperCase());
  const unsupported = symbols.filter(s => UNSUPPORTED_SYMBOLS[s]);
  if (unsupported.length > 0) {
    return res.status(422).json({
      error: unsupported.length === 1
        ? UNSUPPORTED_SYMBOLS[unsupported[0]]
        : `${unsupported.join(', ')} are unavailable from TwelveData on the current plan.`,
      unsupported: true,
      symbols: unsupported,
    });
  }

  const mappedSymbols = symbols.map(mapSymbol);
  const intervalMap = { '1m': '1min', '5m': '5min', '15m': '15min', '1h': '1h', '4h': '4h', '1d': '1day', '1w': '1week' };
  const tdInterval = intervalMap[interval] || '1h';

  try {
    if (isRateLimited('twelvedata')) {
      return res.status(429).json({ error: 'Rate limit cooldown active — retry shortly', rateLimited: true, retryAfter: 60 });
    }

    if (isCircuitOpen('twelvedata')) {
      return res.status(503).json({ error: 'TwelveData circuit breaker open — provider temporarily unavailable', circuitOpen: true });
    }

    if (type === 'quote' || isBatch) {
      const symbolParam = mappedSymbols.join(',');
      const cacheKey = `td:quote:commodities:${symbols.sort().join(',')}`;
      const cached = await get(cacheKey, ttlFor('batch'));

      if (cached) {
        logCacheHit({ provider: 'twelvedata', key: cacheKey, ttlMs: ttlFor('batch'), valueSize: JSON.stringify(cached).length });
      } else {
        logCacheMiss({ provider: 'twelvedata', key: cacheKey });
      }

      let data;
      if (cached) {
        data = cached;
      } else {
        const url = `${TWELVE_DATA_BASE}/quote?symbol=${encodeURIComponent(symbolParam)}&apikey=${TWELVE_DATA_API_KEY}`;
        try {
          data = await fetchJsonWithTimeout(url, {}, { provider: 'twelvedata' });
        } catch (error) {
          if (error.timeout) {
            recordFailure('twelvedata');
            throw new Error('TwelveData quote request timed out');
          }
          throw error;
        }
        if (data?.status === 'error') {
          checkTdError(data);
        }
        recordSuccess('twelvedata');
        await set(cacheKey, data, ttlFor('batch'));
      }

      const parsed = parseTdQuote(data, mappedSymbols);
      const result = {};

      for (let i = 0; i < symbols.length; i++) {
        const mapped = mappedSymbols[i];
        if (parsed[mapped]) {
          result[symbols[i]] = parsed[mapped];
          await set(`quote:commodities:${symbols[i]}`, parsed[mapped], ttlFor('quote'));
        }
      }

      res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
      return res.status(200).json(result);
    }

    const symbolParam = mappedSymbols[0];
    const cacheKey = `td:candles:commodities:${symbolParam.replace('/', '')}:${tdInterval}:${outputsize}`;
    const cached = await get(cacheKey, ttlFor('candles', interval));

    if (cached) {
      logCacheHit({ provider: 'twelvedata', key: cacheKey, ttlMs: ttlFor('candles', interval), valueSize: JSON.stringify(cached).length });
    } else {
      logCacheMiss({ provider: 'twelvedata', key: cacheKey });
    }

    let data;
    if (cached) {
      data = cached;
    } else {
      const url = `${TWELVE_DATA_BASE}/time_series?symbol=${encodeURIComponent(symbolParam)}&interval=${tdInterval}&outputsize=${outputsize}&apikey=${TWELVE_DATA_API_KEY}`;
      try {
        data = await fetchJsonWithTimeout(url, {}, { provider: 'twelvedata' });
      } catch (error) {
        if (error.timeout) {
          recordFailure('twelvedata');
          throw new Error('TwelveData candles request timed out');
        }
        throw error;
      }
      if (data?.status === 'error') {
        checkTdError(data);
      }
      recordSuccess('twelvedata');
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
    if (error.rateLimited || error.message?.includes('rate limit')) {
      triggerRateLimitCooldown('twelvedata');
    } else if (!error.timeout) {
      recordFailure('twelvedata');
    }
    const status = error.rateLimited ? 429 : error.timeout ? 408 : 500;
    return res.status(status).json({
      error: error.message,
      rateLimited: error.rateLimited || false,
      timeout: error.timeout || false,
    });
  }
}
