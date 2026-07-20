import { get, set, ttlFor } from '../../lib/cache.js';
import { parseTdQuote, checkTdError } from '../../lib/twelveData.js';
import { isRateLimited, triggerRateLimitCooldown } from '../../lib/rateLimitState.js';

const FINNHUB_BASE = 'https://finnhub.io/api/v2';
const TWELVE_DATA_BASE = 'https://api.twelvedata.com';

// Alpha Vantage index mapping (AV needs ETF proxies for raw indices)
const alphaVantageIndexMap = { 'SPX': 'SPY', 'NDX': 'QQQ', 'DJI': 'DIA' };

// Finnhub resolution mapping — 4h has no native equivalent, falls back to TwelveData
const finnhubResolutionMap = {
  '1m': '1',
  '5m': '5',
  '15m': '15',
  '1h': '60',
  '1d': 'D',
  '1w': 'W',
};

const twelveDataIntervalMap = {
  '1m': '1min', '5m': '5min', '15m': '15min', '1h': '1h', '4h': '4h', '1d': '1day', '1w': '1week'
};

// ==================== FINNHUB HELPERS ====================

async function fetchFinnhub(url) {
  if (isRateLimited()) {
    const err = new Error('Rate limit cooldown active');
    err.rateLimited = true;
    throw err;
  }

  const res = await fetch(url);

  if (res.status === 429) {
    triggerRateLimitCooldown();
    const err = new Error('Finnhub rate limit reached');
    err.rateLimited = true;
    throw err;
  }

  if (!res.ok) {
    throw new Error(`Finnhub fetch failed: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

function normalizeFinnhubQuote(data) {
  // Finnhub quote: { c: current, d: change, dp: percent change, h: high, l: low, o: open, pc: previous close, t: timestamp }
  if (data.c == null || data.c === 0) return null;
  return {
    price: parseFloat(data.c),
    change: parseFloat(data.d || 0),
    changePct: parseFloat(data.dp || 0),
    high24h: parseFloat(data.h || 0),
    low24h: parseFloat(data.l || 0),
    volume: 0, // Finnhub quote endpoint doesn't include volume
    quoteVolume: 0,
  };
}

function normalizeFinnhubCandles(data) {
  // Finnhub candle: { c:[], h:[], l:[], o:[], t:[], v:[], s: "ok" | "no_data" }
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

// ==================== TWELVEDATA HELPERS (existing) ====================

async function fetchTwelveDataQuote(symbolParam, apiKey) {
  const cacheKey = `td:quote:stocks:${symbolParam}`;
  const cached = get(cacheKey, ttlFor('batch'));
  if (cached) return cached;

  const response = await fetch(
    `${TWELVE_DATA_BASE}/quote?symbol=${encodeURIComponent(symbolParam)}&apikey=${apiKey}`
  );
  if (response.status === 429) {
    triggerRateLimitCooldown();
    const err = new Error('TwelveData rate limit reached');
    err.rateLimited = true;
    throw err;
  }
  if (!response.ok) throw new Error(`TwelveData quote fetch failed: ${response.status}`);
  const data = await response.json();
  checkTdError(data);
  set(cacheKey, data);
  return data;
}

async function fetchTwelveDataCandles(symbol, interval, outputsize, apiKey) {
  const tdInterval = twelveDataIntervalMap[interval] || '1day';
  const cacheKey = `td:candles:stocks:${symbol.replace('/', '')}:${tdInterval}:${outputsize}`;
  const cached = get(cacheKey, ttlFor('candles', interval));
  if (cached) return cached;

  const response = await fetch(
    `${TWELVE_DATA_BASE}/time_series?symbol=${encodeURIComponent(symbol)}&interval=${tdInterval}&outputsize=${outputsize}&apikey=${apiKey}`
  );
  if (response.status === 429) {
    triggerRateLimitCooldown();
    const err = new Error('TwelveData rate limit reached');
    err.rateLimited = true;
    throw err;
  }
  if (!response.ok) throw new Error(`TwelveData candles fetch failed: ${response.status}`);
  const data = await response.json();
  checkTdError(data);
  set(cacheKey, data);
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

// ==================== ALPHA VANTAGE HELPERS (existing) ====================

async function fetchAlphaVantageQuote(symbol, apiKey) {
  const cacheKey = `av:quote:${symbol}`;
  const cached = get(cacheKey, ttlFor('quote'));
  if (cached) return cached;

  const response = await fetch(
    `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${apiKey}`
  );
  if (!response.ok) throw new Error(`Alpha Vantage quote failed: ${response.status}`);
  const data = await response.json();
  set(cacheKey, data);
  return data;
}

async function fetchAlphaVantageCandles(symbol, interval, apiKey) {
  const avInterval = interval === '1d' ? 'TIME_SERIES_DAILY' : 'TIME_SERIES_INTRADAY';
  const avIntervalParam = interval === '1d' ? '' : `&interval=${interval}`;
  const cacheKey = `av:candles:${symbol}:${interval}`;
  const cached = get(cacheKey, ttlFor('candles', interval));
  if (cached) return cached;

  const response = await fetch(
    `https://www.alphavantage.co/query?function=${avInterval}${avIntervalParam}&symbol=${symbol}&apikey=${apiKey}&outputsize=full`
  );
  if (!response.ok) throw new Error(`Alpha Vantage candles failed: ${response.status}`);
  const data = await response.json();
  set(cacheKey, data);
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

// ==================== MAIN HANDLER ====================

export default async function handler(req, res) {
  const { symbol, interval = '1d', outputsize = '200', type = 'candles' } = req.query;

  if (!symbol) {
    return res.status(400).json({ error: 'Symbol required' });
  }

  const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
  const TWELVE_DATA_API_KEY = process.env.TWELVE_DATA_API_KEY;
  const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY;

  const isBatch = symbol.includes(',');
  const symbols = symbol.split(',').map(s => s.trim().toUpperCase());
  const avSymbols = symbols.map(s => alphaVantageIndexMap[s] || s);

  try {
    if (isRateLimited()) {
      return res.status(429).json({ error: 'Rate limit cooldown active — retry shortly', rateLimited: true, retryAfter: 60 });
    }

    // ==================== QUOTES ====================
    if (type === 'quote' || isBatch) {
      const result = {};
      const fallbackSymbols = []; // symbols Finnhub couldn't resolve

      // 1. Try Finnhub first (individual calls — no batch support on free tier)
      if (FINNHUB_API_KEY) {
        for (const sym of symbols) {
          const cacheKey = `fh:quote:${sym}`;
          const cached = get(cacheKey, ttlFor('quote'));
          let quote = null;

          if (cached) {
            quote = cached;
          } else {
            try {
              const data = await fetchFinnhub(`${FINNHUB_BASE}/quote?symbol=${sym}&token=${FINNHUB_API_KEY}`);
              quote = normalizeFinnhubQuote(data);
              if (quote) set(cacheKey, quote);
            } catch (err) {
              if (err.rateLimited) throw err; // propagate rate limits immediately
              console.error(`Finnhub quote failed for ${sym}:`, err.message);
            }
          }

          if (quote) {
            result[sym] = quote;
          } else {
            fallbackSymbols.push(sym);
          }
        }
      } else {
        fallbackSymbols.push(...symbols);
      }

      // 2. Fallback to TwelveData batch for any missing symbols
      if (fallbackSymbols.length > 0 && TWELVE_DATA_API_KEY) {
        try {
          const symbolParam = fallbackSymbols.join(',');
          const data = await fetchTwelveDataQuote(symbolParam, TWELVE_DATA_API_KEY);
          const parsed = parseTdQuote(data, fallbackSymbols);
          for (const sym of fallbackSymbols) {
            if (parsed[sym] && !result[sym]) {
              result[sym] = parsed[sym];
            }
          }
        } catch (err) {
          if (err.rateLimited) throw err;
          console.error('TwelveData fallback quote failed:', err.message);
        }
      }

      // 3. Last resort: Alpha Vantage individual (only for single-symbol requests, or loop for batch)
      const stillMissing = symbols.filter(s => !result[s]);
      if (stillMissing.length > 0 && ALPHA_VANTAGE_API_KEY) {
        for (const sym of stillMissing) {
          const avSym = alphaVantageIndexMap[sym] || sym;
          try {
            const data = await fetchAlphaVantageQuote(avSym, ALPHA_VANTAGE_API_KEY);
            const q = data['Global Quote'];
            if (q) {
              result[sym] = {
                price: parseFloat(q['05. price']),
                change: parseFloat(q['09. change']),
                changePct: parseFloat(q['10. change percent']?.replace('%', '')),
                high24h: parseFloat(q['03. high']),
                low24h: parseFloat(q['04. low']),
                volume: parseFloat(q['06. volume']),
                quoteVolume: parseFloat(q['06. volume']) * parseFloat(q['05. price']),
              };
            }
          } catch (err) {
            console.error(`Alpha Vantage fallback quote failed for ${sym}:`, err.message);
          }
        }
      }

      if (Object.keys(result).length === 0) {
        return res.status(503).json({ error: 'No data available for requested symbols' });
      }

      res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
      return res.status(200).json(result);
    }

    // ==================== CANDLES (single symbol only) ====================
    const targetSymbol = symbols[0];

    // 1. Try Finnhub first (skip if 4h — no native resolution)
    if (FINNHUB_API_KEY && interval !== '4h') {
      const resolution = finnhubResolutionMap[interval];
      if (resolution) {
        const cacheKey = `fh:candles:${targetSymbol}:${resolution}:${outputsize}`;
        const cached = get(cacheKey, ttlFor('candles', interval));
        let candles = null;

        if (cached) {
          candles = cached;
        } else {
          try {
            const now = Math.floor(Date.now() / 1000);
            // Go back far enough to get requested number of candles
            const lookbackDays = interval === '1m' ? 2 : interval === '5m' ? 5 : interval === '15m' ? 10 : interval === '1h' ? 30 : interval === '1d' ? 365 : 730;
            const from = now - (lookbackDays * 86400);
            const url = `${FINNHUB_BASE}/stock/candle?symbol=${targetSymbol}&resolution=${resolution}&from=${from}&to=${now}&token=${FINNHUB_API_KEY}`;
            const data = await fetchFinnhub(url);
            candles = normalizeFinnhubCandles(data);
            if (candles) {
              // Trim to requested outputsize
              if (candles.length > outputsize) {
                candles = candles.slice(candles.length - outputsize);
              }
              set(cacheKey, candles);
            }
          } catch (err) {
            if (err.rateLimited) throw err;
            console.error('Finnhub candles failed:', err.message);
          }
        }

        if (candles && candles.length > 0) {
          res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
          return res.status(200).json(candles);
        }
      }
    }

    // 2. Fallback to TwelveData (handles 4h natively, and all other intervals)
    if (TWELVE_DATA_API_KEY) {
      try {
        const data = await fetchTwelveDataCandles(targetSymbol, interval, outputsize, TWELVE_DATA_API_KEY);
        const candles = normalizeTwelveDataCandles(data);
        if (candles && candles.length > 0) {
          res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
          return res.status(200).json(candles);
        }
      } catch (err) {
        if (err.rateLimited) throw err;
        console.error('TwelveData candles fallback failed:', err.message);
      }
    }

    // 3. Last resort: Alpha Vantage
    if (ALPHA_VANTAGE_API_KEY) {
      try {
        const avSym = alphaVantageIndexMap[targetSymbol] || targetSymbol;
        const data = await fetchAlphaVantageCandles(avSym, interval, ALPHA_VANTAGE_API_KEY);
        const candles = normalizeAlphaVantageCandles(data, interval);
        if (candles && candles.length > 0) {
          res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600');
          return res.status(200).json(candles);
        }
      } catch (err) {
        console.error('Alpha Vantage candles fallback failed:', err.message);
      }
    }

    return res.status(503).json({ error: 'No candle data available' });

  } catch (error) {
    console.error('Stocks proxy error:', error.message);
    const status = error.rateLimited ? 429 : 500;
    return res.status(status).json({
      error: error.message,
      rateLimited: error.rateLimited || false,
    });
  }
      }
  
