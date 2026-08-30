import { get, set, ttlFor } from '../../lib/cache.js';
import { validateMarketQuery } from '../../lib/validateMarketQuery.js';
import { parseTdQuote, checkTdError } from '../../lib/twelveData.js';
import { isRateLimited, triggerRateLimitCooldown } from '../../lib/rateLimitState.js';
import { isCircuitOpen, recordSuccess, recordFailure } from '../../lib/circuitBreaker.js';
import { fetchJsonWithTimeout } from '../../lib/fetchWithTimeout.js';
import { logCacheHit, logCacheMiss } from '../../lib/structuredLogger.js';
import { reserveTwelveDataCredits, twelveDataBudgetError } from '../../lib/twelveDataCredits.js';

const TWELVE_DATA_BASE = 'https://api.twelvedata.com';

// TwelveData documents /quote at 1 API credit per symbol. The tracked
// eight-pair batch therefore consumes all 8 Basic-plan credits at once.
// Keep this expensive batch separate from the 2-minute single-quote TTL.
const FOREX_BATCH_TTL_MS = 5 * 60_000;
const FOREX_QUOTE_TTL_MS = 2 * 60_000;
const FOREX_CANDLE_TTL_MS = 2 * 60_000;
const FOREX_BATCH_COOLDOWN_MS = 60_000;
const FOREX_BATCH_COOLDOWN_KEY = 'td:cooldown:forex-batch';

async function activateBatchCooldown() {
  await set(
    FOREX_BATCH_COOLDOWN_KEY,
    { until: Date.now() + FOREX_BATCH_COOLDOWN_MS },
    FOREX_BATCH_COOLDOWN_MS
  );
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
  const cleanSymbols = symbols.map(s => s.replace('/', ''));
  const intervalMap = { '1m': '1min', '5m': '5min', '15m': '15min', '1h': '1h', '4h': '4h', '1d': '1day', '1w': '1week' };
  const tdInterval = intervalMap[interval] || '1h';

  try {
    if (isRateLimited('twelvedata')) {
      res.setHeader('Retry-After', '60');
      return res.status(429).json({ error: 'Rate limit cooldown active — retry shortly', rateLimited: true, retryAfter: 60 });
    }

    if (isCircuitOpen('twelvedata')) {
      return res.status(503).json({ error: 'TwelveData circuit breaker open — provider temporarily unavailable', circuitOpen: true });
    }

    if (type === 'quote' || isBatch) {
      const symbolParam = symbols.join(',');
      const cacheKey = `td:quote:${cleanSymbols.sort().join(',')}`;
      const quoteTtl = isBatch ? FOREX_BATCH_TTL_MS : FOREX_QUOTE_TTL_MS;
      const cached = await get(cacheKey, quoteTtl);

      if (cached) {
        logCacheHit({ provider: 'twelvedata', key: cacheKey, ttlMs: quoteTtl, valueSize: JSON.stringify(cached).length });
      } else {
        logCacheMiss({ provider: 'twelvedata', key: cacheKey });
      }

      let data;
      if (cached) {
        data = cached;
      } else {
        if (isBatch) {
          // Supabase-backed so a 429 seen by one Vercel instance prevents
          // back-to-back provider attempts from other instances for 60s.
          const batchCooldown = await get(FOREX_BATCH_COOLDOWN_KEY, FOREX_BATCH_COOLDOWN_MS);
          if (batchCooldown) {
            const retryAfter = Math.max(1, Math.ceil((batchCooldown.until - Date.now()) / 1000));
            res.setHeader('Retry-After', String(retryAfter));
            return res.status(429).json({ error: 'Forex batch cooldown active — retry shortly', rateLimited: true, retryAfter });
          }
        }

        const reservation = await reserveTwelveDataCredits(symbols.length, isBatch ? 'forex-batch-quote' : 'forex-quote');
        if (!reservation.allowed) throw twelveDataBudgetError(symbols.length, reservation.used);
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
          try {
            checkTdError(data);
          } catch (error) {
            if (error.rateLimited && isBatch) await activateBatchCooldown();
            throw error;
          }
        }
        recordSuccess('twelvedata');
        await set(cacheKey, data, quoteTtl);
      }

      const parsed = parseTdQuote(data, symbols);

      for (const sym of symbols) {
        const perSym = parsed[sym] || parsed[sym.replace('/', '')];
        if (perSym) {
          await set(`quote:forex:${sym}`, perSym, FOREX_QUOTE_TTL_MS);
        }
      }

      res.setHeader(
        'Cache-Control',
        isBatch ? 's-maxage=300, stale-while-revalidate=300' : 's-maxage=120, stale-while-revalidate=120'
      );
      return res.status(200).json(parsed);
    }

    const symbolParam = symbols[0];
    const cacheKey = `td:candles:${symbolParam.replace('/', '')}:${tdInterval}:${outputsize}`;
    const cached = await get(cacheKey, FOREX_CANDLE_TTL_MS);

    if (cached) {
      logCacheHit({ provider: 'twelvedata', key: cacheKey, ttlMs: FOREX_CANDLE_TTL_MS, valueSize: JSON.stringify(cached).length });
    } else {
      logCacheMiss({ provider: 'twelvedata', key: cacheKey });
    }

    let data;
    if (cached) {
      data = cached;
    } else {
      const reservation = await reserveTwelveDataCredits(1, 'forex-candles');
      if (!reservation.allowed) throw twelveDataBudgetError(1, reservation.used);
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
    if (error.rateLimited) res.setHeader('Retry-After', '60');
    return res.status(status).json({
      error: error.message,
      rateLimited: error.rateLimited || false,
      timeout: error.timeout || false,
      ...(error.rateLimited ? { retryAfter: 60 } : {}),
    });
  }
}
