import { get, set, ttlFor } from '../../lib/cache.js';
import { validateMarketQuery } from '../../lib/validateMarketQuery.js';
import { parseTdQuote, checkTdError } from '../../lib/twelveData.js';
import { isRateLimited, triggerRateLimitCooldown } from '../../lib/rateLimitState.js';
import { isCircuitOpen, recordSuccess, recordFailure } from '../../lib/circuitBreaker.js';
import { fetchJsonWithTimeout } from '../../lib/fetchWithTimeout.js';
import { logCacheHit, logCacheMiss } from '../../lib/structuredLogger.js';

const TWELVE_DATA_BASE = 'https://api.twelvedata.com';

// TwelveData free "Basic 8" plan: 8 credits/min, 800/day.
// /quote consumes 1 credit per symbol, so an 8-symbol batch uses all 8 credits.
// Cache for 2 minutes to ensure at most 1 batch request per 2-minute window
// (4 credits/min average, well within the 8/min limit).
const FOREX_QUOTE_TTL_MS = 120_000;
const FOREX_CANDLE_TTL_MS = 120_000;

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
  const cleanSymbols = symbols.map(s => s.replace('/', ''));
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
      const symbolParam = symbols.join(',');
      const cacheKey = `td:quote:${cleanSymbols.sort().join(',')}`;
      const cached = await get(cacheKey, FOREX_QUOTE_TTL_MS);

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
        await set(cacheKey, data, FOREX_QUOTE_TTL_MS);
      }

      const parsed = parseTdQuote(data, symbols);

      for (const sym of symbols) {
        const perSym = parsed[sym] || parsed[sym.replace('/', '')];
        if (perSym) {
          await set(`quote:forex:${sym}`, perSym, FOREX_QUOTE_TTL_MS);
        }
      }

      res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
      return res.status(200).json(parsed);
    }

    const symbolParam = symbols[0];
    const cacheKey = `td:candles:${symbolParam.replace('/', '')}:${tdInterval}:${outputsize}`;
    const cached = await get(cacheKey, FOREX_CANDLE_TTL_MS);

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
      await set(cacheKey, data, FOREX_CANDLE_TTL_MS);
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
    console.error('Forex proxy error:', error.message);
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
