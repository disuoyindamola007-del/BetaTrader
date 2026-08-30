import { get, set, ttlFor } from '../../lib/cache.js';
import { validateMarketQuery } from '../../lib/validateMarketQuery.js';
import { parseTdQuote, checkTdError } from '../../lib/twelveData.js';
import { isRateLimited, triggerRateLimitCooldown } from '../../lib/rateLimitState.js';
import { isCircuitOpen, recordSuccess, recordFailure } from '../../lib/circuitBreaker.js';
import { fetchJsonWithTimeout } from '../../lib/fetchWithTimeout.js';
import { logCacheHit, logCacheMiss } from '../../lib/structuredLogger.js';
import { reserveTwelveDataCredits, twelveDataBudgetError } from '../../lib/twelveDataCredits.js';

const FINNHUB_BASE = 'https://finnhub.io/api/v1';
const TWELVE_DATA_BASE = 'https://api.twelvedata.com';

const INDEX_PROXY_MAP = { SPX: 'SPY', NDX: 'QQQ', DJI: 'DIA' };

function mapProviderSymbol(symbol) {
  return INDEX_PROXY_MAP[symbol] || symbol;
}

const finnhubResolutionMap = {
  '1m': '1', '5m': '5', '15m': '15', '1h': '60', '1d': 'D', '1w': 'W',
};

const twelveDataIntervalMap = {
  '1m': '1min', '5m': '5min', '15m': '15min', '1h': '1h', '4h': '4h', '1d': '1day', '1w': '1week'
};

async function fetchFinnhub(url) {
  if (isRateLimited('finnhub')) {
    const err = new Error('Rate limit cooldown active');
    err.rateLimited = true;
    throw err;
  }
  if (isCircuitOpen('finnhub')) {
    const err = new Error('Finnhub circuit breaker open');
    err.circuitOpen = true;
    throw err;
  }

  try {
    const data = await fetchJsonWithTimeout(url, {}, { provider: 'finnhub' });
    const contentType = data?.headers?.get?.('content-type') || '';
    // fetchJsonWithTimeout already parses JSON; just validate
    recordSuccess('finnhub');
    return data;
  } catch (error) {
    if (error.timeout) {
      recordFailure('finnhub');
      throw new Error('Finnhub request timed out');
    }
    if (error.circuitOpen) throw error;
    if (error.message?.includes('429')) {
      triggerRateLimitCooldown('finnhub');
      const err = new Error('Finnhub rate limit reached');
      err.rateLimited = true;
      throw err;
    }
    recordFailure('finnhub');
    throw error;
  }
}

function normalizeFinnhubQuote(data) {
  if (data.c == null || data.c === 0) return null;
  return {
    price: parseFloat(data.c),
    change: parseFloat(data.d || 0),
    changePct: parseFloat(data.dp || 0),
    high24h: parseFloat(data.h || 0),
    low24h: parseFloat(data.l || 0),
    volume: 0,
    quoteVolume: 0,
  };
}

function normalizeFinnhubCandles(data) {
  if (data.s !== 'ok' || !data.c || !data.c.length) return null;
  const candles = [];
  for (let i = 0; i < data.c.length; i++) {
    candles.push({
      time: data.t[i],
      open: parseFloat(data.o[i]),
      high: parseFloat(data.h[i]),
      low: parseFloat(data.l[i]),
      close: parseFloat(data.c[i]),
      volume: parseFloat(data.v[i] || 0),
    });
  }
  return candles;
}

async function fetchTwelveDataQuote(symbolParam, apiKey) {
  const cacheKey = `td:quote:stocks:${symbolParam}`;
  const cached = await get(cacheKey, ttlFor('batch'));
  if (cached) {
    logCacheHit({ provider: 'twelvedata', key: cacheKey, ttlMs: ttlFor('batch'), valueSize: JSON.stringify(cached).length });
    return cached;
  }
  logCacheMiss({ provider: 'twelvedata', key: cacheKey });

  if (isCircuitOpen('twelvedata')) {
    const err = new Error('TwelveData circuit breaker open');
    err.circuitOpen = true;
    throw err;
  }

  const reservation = await reserveTwelveDataCredits(symbolParam.split(',').length, `stocks-quote-fallback:${symbolParam}`);
  if (!reservation.allowed) throw twelveDataBudgetError(symbolParam.split(',').length, reservation.used);
  const url = `${TWELVE_DATA_BASE}/quote?symbol=${encodeURIComponent(symbolParam)}&apikey=${apiKey}`;
  let data;
  try {
    data = await fetchJsonWithTimeout(url, {}, { provider: 'twelvedata' });
  } catch (error) {
    if (error.timeout) {
      recordFailure('twelvedata');
      throw new Error('TwelveData quote request timed out');
    }
    throw error;
  }
  checkTdError(data);
  recordSuccess('twelvedata');
  await set(cacheKey, data, ttlFor('batch'));
  return data;
}

async function fetchTwelveDataCandles(symbol, interval, outputsize, apiKey) {
  const tdInterval = twelveDataIntervalMap[interval] || '1day';
  const cacheKey = `td:candles:stocks:${symbol.replace('/', '')}:${tdInterval}:${outputsize}`;
  const cached = await get(cacheKey, ttlFor('candles', interval));
  if (cached) {
    logCacheHit({ provider: 'twelvedata', key: cacheKey, ttlMs: ttlFor('candles', interval), valueSize: JSON.stringify(cached).length });
    return cached;
  }
  logCacheMiss({ provider: 'twelvedata', key: cacheKey });

  if (isCircuitOpen('twelvedata')) {
    const err = new Error('TwelveData circuit breaker open');
    err.circuitOpen = true;
    throw err;
  }

  const reservation = await reserveTwelveDataCredits(1, `stocks-candles-fallback:${symbol}`);
  if (!reservation.allowed) throw twelveDataBudgetError(1, reservation.used);
  const url = `${TWELVE_DATA_BASE}/time_series?symbol=${encodeURIComponent(symbol)}&interval=${tdInterval}&outputsize=${outputsize}&apikey=${apiKey}`;
  let data;
  try {
    data = await fetchJsonWithTimeout(url, {}, { provider: 'twelvedata' });
  } catch (error) {
    if (error.timeout) {
      recordFailure('twelvedata');
      throw new Error('TwelveData candles request timed out');
    }
    throw error;
  }
  checkTdError(data);
  recordSuccess('twelvedata');
  await set(cacheKey, data, ttlFor('candles', interval));
  return data;
}

function normalizeTwelveDataCandles(data) {
  return (data.values || []).reverse().map(d => ({
    time: Math.floor(new Date(d.datetime).getTime() / 1000),
    open: parseFloat(d.open),
    high: parseFloat(d.high),
    low: parseFloat(d.low),
    close: parseFloat(d.close),
    volume: parseFloat(d.volume),
  }));
}

async function fetchAlphaVantageQuote(symbol, apiKey) {
  const cacheKey = `av:quote:${symbol}`;
  const cached = await get(cacheKey, ttlFor('quote'));
  if (cached) {
    logCacheHit({ provider: 'alphavantage', key: cacheKey, ttlMs: ttlFor('quote'), valueSize: JSON.stringify(cached).length });
    return cached;
  }
  logCacheMiss({ provider: 'alphavantage', key: cacheKey });

  if (isCircuitOpen('alphavantage')) {
    const err = new Error('Alpha Vantage circuit breaker open');
    err.circuitOpen = true;
    throw err;
  }

  const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${apiKey}`;
  let data;
  try {
    data = await fetchJsonWithTimeout(url, {}, { provider: 'alphavantage' });
  } catch (error) {
    if (error.timeout) {
      recordFailure('alphavantage');
      throw new Error('Alpha Vantage quote request timed out');
    }
    throw error;
  }
  recordSuccess('alphavantage');
  await set(cacheKey, data, ttlFor('quote'));
  return data;
}

async function fetchAlphaVantageCandles(symbol, interval, apiKey) {
  const avInterval = interval === '1d' ? 'TIME_SERIES_DAILY' : 'TIME_SERIES_INTRADAY';
  const avIntervalParam = interval === '1d' ? '' : `&interval=${interval}`;
  const cacheKey = `av:candles:${symbol}:${interval}`;
  const cached = await get(cacheKey, ttlFor('candles', interval));
  if (cached) {
    logCacheHit({ provider: 'alphavantage', key: cacheKey, ttlMs: ttlFor('candles', interval), valueSize: JSON.stringify(cached).length });
    return cached;
  }
  logCacheMiss({ provider: 'alphavantage', key: cacheKey });

  if (isCircuitOpen('alphavantage')) {
    const err = new Error('Alpha Vantage circuit breaker open');
    err.circuitOpen = true;
    throw err;
  }

  const url = `https://www.alphavantage.co/query?function=${avInterval}${avIntervalParam}&symbol=${symbol}&apikey=${apiKey}&outputsize=full`;
  let data;
  try {
    data = await fetchJsonWithTimeout(url, {}, { provider: 'alphavantage' });
  } catch (error) {
    if (error.timeout) {
      recordFailure('alphavantage');
      throw new Error('Alpha Vantage candles request timed out');
    }
    throw error;
  }
  recordSuccess('alphavantage');
  await set(cacheKey, data, ttlFor('candles', interval));
  return data;
}

function normalizeAlphaVantageCandles(data, interval) {
  const timeSeries = data['Time Series (Daily)'] || data[`Time Series (${interval})`];
  if (!timeSeries) return null;
  return Object.entries(timeSeries).reverse().map(([date, values]) => ({
    time: Math.floor(new Date(date).getTime() / 1000),
    open: parseFloat(values['1. open']),
    high: parseFloat(values['2. high']),
    low: parseFloat(values['3. low']),
    close: parseFloat(values['4. close']),
    volume: parseFloat(values['5. volume']),
  }));
}

export default async function handler(req, res) {
  const { symbol, interval = '1d', outputsize = '200', type = 'candles' } = req.query;
  const validation = validateMarketQuery({ symbol, interval, type, size: outputsize });
  if (validation.error) return res.status(400).json({ error: validation.error });

  const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
  const TWELVE_DATA_API_KEY = process.env.TWELVE_DATA_API_KEY;
  const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY;

  const isBatch = symbol.includes(',');
  const requestedSymbols = symbol.split(',').map(s => s.trim().toUpperCase());
  // Normalize index aliases once, before any provider lookup or cache access.
  // Responses are translated back to the requested aliases below so the
  // frontend API contract remains unchanged.
  const symbols = requestedSymbols.map(mapProviderSymbol);
  requestedSymbols.forEach((requestedSymbol, index) => {
    if (requestedSymbol !== symbols[index]) {
      console.info(`[Stocks] normalized ${requestedSymbol} -> ${symbols[index]} before provider lookup`);
    }
  });

  try {
    if (type === 'quote' || isBatch) {
      const result = {};
      const fallbackSymbols = [];

      if (FINNHUB_API_KEY && !isRateLimited('finnhub') && !isCircuitOpen('finnhub')) {
        let finnhubRateLimited = false;
        for (const sym of symbols) {
          if (finnhubRateLimited) { fallbackSymbols.push(sym); continue; }

          const providerSym = mapProviderSymbol(sym);
          const cacheKey = `fh:quote:${providerSym}`;
          const cached = await get(cacheKey, ttlFor('quote'));

          if (cached) {
            logCacheHit({ provider: 'finnhub', key: cacheKey, ttlMs: ttlFor('quote'), valueSize: JSON.stringify(cached).length });
            result[sym] = cached;
            continue;
          }
          logCacheMiss({ provider: 'finnhub', key: cacheKey });

          let quote = null;
          try {
            const url = `${FINNHUB_BASE}/quote?symbol=${encodeURIComponent(providerSym)}&token=${FINNHUB_API_KEY}`;
            const data = await fetchFinnhub(url);
            quote = normalizeFinnhubQuote(data);
            if (quote) {
              await set(cacheKey, quote, ttlFor('quote'));
            }
          } catch (err) {
            if (err.rateLimited) {
              console.error(`Finnhub rate-limited mid-batch — falling back remaining symbols to TwelveData/Alpha Vantage`);
              finnhubRateLimited = true;
              fallbackSymbols.push(sym);
              continue;
            }
            if (err.circuitOpen) {
              fallbackSymbols.push(sym);
              continue;
            }
            console.error(`Finnhub quote failed for ${sym}:`, err.message);
          }
          if (quote) {
            result[sym] = quote;
            await set(`quote:stocks:${sym}`, quote, ttlFor('quote'));
          }
          else fallbackSymbols.push(sym);
        }
      } else {
        fallbackSymbols.push(...symbols);
      }

      if (fallbackSymbols.length > 0 && TWELVE_DATA_API_KEY && !isRateLimited('twelvedata') && !isCircuitOpen('twelvedata')) {
        try {
          const providerSymbols = fallbackSymbols.map(mapProviderSymbol);
          const symbolParam = providerSymbols.join(',');
          const data = await fetchTwelveDataQuote(symbolParam, TWELVE_DATA_API_KEY);
          const parsed = parseTdQuote(data, providerSymbols);
          for (let i = 0; i < fallbackSymbols.length; i++) {
            const sym = fallbackSymbols[i];
            const quote = parsed[providerSymbols[i]];
            if (quote && !result[sym]) {
              result[sym] = quote;
              await set(`quote:stocks:${sym}`, quote, ttlFor('quote'));
            }
          }
        } catch (err) {
          if (!err.circuitOpen) {
            console.error('TwelveData fallback quote failed:', err.message);
          }
        }
      }

      const stillMissing = symbols.filter(s => !result[s]);
      if (stillMissing.length > 0 && ALPHA_VANTAGE_API_KEY && !isCircuitOpen('alphavantage')) {
        for (const sym of stillMissing) {
          const avSym = mapProviderSymbol(sym);
          try {
            const data = await fetchAlphaVantageQuote(avSym, ALPHA_VANTAGE_API_KEY);
            const q = data['Global Quote'];
            if (q) {
              const quote = {
                price: parseFloat(q['05. price']),
                change: parseFloat(q['09. change']),
                changePct: parseFloat(q['10. change percent']?.replace('%', '')),
                high24h: parseFloat(q['03. high']),
                low24h: parseFloat(q['04. low']),
                volume: parseFloat(q['06. volume']),
                quoteVolume: parseFloat(q['06. volume']) * parseFloat(q['05. price']),
              };
              result[sym] = quote;
              await set(`quote:stocks:${sym}`, quote, ttlFor('quote'));
            }
          } catch (err) {
            if (!err.circuitOpen) {
              console.error(`Alpha Vantage fallback quote failed for ${sym}:`, err.message);
            }
          }
        }
      }

      if (Object.keys(result).length === 0) {
        return res.status(503).json({ error: 'No data available for requested symbols' });
      }
      const responseResult = {};
      for (let i = 0; i < requestedSymbols.length; i++) {
        const quote = result[symbols[i]];
        if (quote) responseResult[requestedSymbols[i]] = quote;
      }
      res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
      return res.status(200).json(responseResult);
    }

    const targetSymbol = symbols[0];
    const providerSymbol = mapProviderSymbol(targetSymbol);

    // Finnhub free tier does not support candle data for stocks (returns 403).
    // Skip Finnhub entirely for candles and route straight to TwelveData → Alpha Vantage.
    // Finnhub is still used for quotes above.

    if (TWELVE_DATA_API_KEY && !isRateLimited('twelvedata') && !isCircuitOpen('twelvedata')) {
      try {
        const data = await fetchTwelveDataCandles(providerSymbol, interval, outputsize, TWELVE_DATA_API_KEY);
        const candles = normalizeTwelveDataCandles(data);
        if (candles && candles.length > 0) {
          res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
          return res.status(200).json(candles);
        }
      } catch (err) {
        if (!err.circuitOpen) {
          console.error('TwelveData candles fallback failed:', err.message);
        }
      }
    }

    if (ALPHA_VANTAGE_API_KEY && !isCircuitOpen('alphavantage')) {
      try {
        const data = await fetchAlphaVantageCandles(providerSymbol, interval, ALPHA_VANTAGE_API_KEY);
        const candles = normalizeAlphaVantageCandles(data, interval);
        if (candles && candles.length > 0) {
          res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600');
          return res.status(200).json(candles);
        }
      } catch (err) {
        if (!err.circuitOpen) {
          console.error('Alpha Vantage candles fallback failed:', err.message);
        }
      }
    }

    return res.status(503).json({ error: 'No candle data available' });

  } catch (error) {
    console.error('Stocks proxy error:', error.message);
    const status = error.rateLimited ? 429 : error.circuitOpen ? 503 : 500;
    return res.status(status).json({
      error: error.message,
      rateLimited: error.rateLimited || false,
      circuitOpen: error.circuitOpen || false,
    });
  }
}
