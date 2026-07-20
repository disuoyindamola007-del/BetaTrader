// Frontend API client — calls Vercel serverless proxies
// Batching for MarketsScreen, individual for AssetDetail

const API_BASE = '';

// Browser-side cache (session only — per user)
const cache = new Map();
const CACHE_TTL = {
  batch: 30_000,
  quote: 30_000,
  candles_1m_5m: 30_000,
  candles_15m_1h: 60_000,
  candles_4h_1d: 300_000,
  candles_1w: 600_000,
};

function getCacheKey(...parts) {
  return parts.join(':');
}

function getCached(key, ttl) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > ttl) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key, data) {
  cache.set(key, { data, ts: Date.now() });
}

function getCandleTtl(interval) {
  if (interval === '1m' || interval === '5m') return CACHE_TTL.candles_1m_5m;
  if (interval === '15m' || interval === '1h') return CACHE_TTL.candles_15m_1h;
  if (interval === '4h' || interval === '1d') return CACHE_TTL.candles_4h_1d;
  return CACHE_TTL.candles_1w;
}

// ==================== CATEGORY DETECTION ====================

export function getCategory(symbol) {
  const s = symbol.toUpperCase().replace('/', '');
  if (['BTC', 'ETH', 'SOL', 'XRP', 'BNB', 'ADA', 'DOT', 'LINK', 'DOGE', 'AVAX'].includes(s)) return 'crypto';
  if (['EURUSD', 'USDJPY', 'GBPUSD', 'AUDUSD', 'USDCAD', 'USDCHF', 'GBPJPY', 'EURJPY'].includes(s)) return 'forex';
  if (['GOLD', 'SILVER', 'OIL', 'CRUDE', 'BRENT'].includes(s)) return 'commodities';
  if (['SPX', 'NDX', 'DJI'].includes(s)) return 'stocks';
  return 'stocks';
}

function getRoute(category) {
  return `/api/${category}`;
}

// ==================== BATCH FETCH (for MarketsScreen) ====================

export async function fetchBatchQuotes(symbolsByCategory) {
  const results = {};
  const errors = [];

  for (const [category, symbols] of Object.entries(symbolsByCategory)) {
    if (!symbols.length) continue;

    const cacheKey = getCacheKey('batch', category, symbols.sort().join(','));
    const cached = getCached(cacheKey, CACHE_TTL.batch);
    if (cached) {
      Object.assign(results, cached);
      continue;
    }

    try {
      const symbolParam = symbols.join(',');
      const route = getRoute(category);
      const response = await fetch(`${API_BASE}${route}/${encodeURIComponent(symbolParam)}?type=quote`);

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        if (errData.rateLimited) {
          errors.push({ category, rateLimited: true, message: errData.error });
        }
        continue;
      }

      const data = await response.json();
      Object.assign(results, data);
      setCache(cacheKey, data);
    } catch (err) {
      console.error(`Batch fetch error for ${category}:`, err.message);
    }
  }

  return { data: results, errors };
}

// ==================== INDIVIDUAL FETCH (for AssetDetail) ====================

export async function fetchQuote(symbol) {
  const category = getCategory(symbol);
  const cacheKey = getCacheKey('quote', category, symbol);
  const cached = getCached(cacheKey, CACHE_TTL.quote);
  if (cached) return cached;

  const route = getRoute(category);
  const response = await fetch(`${API_BASE}${route}/${encodeURIComponent(symbol)}?type=quote`);

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    const err = new Error(errData.error || `Failed to fetch quote for ${symbol}`);
    err.rateLimited = errData.rateLimited || false;
    throw err;
  }

  const data = await response.json();
  // Batch response returns { [symbol]: {...} }, single returns the object directly
  const quote = data[symbol] || data[symbol.replace('/', '')] || data;
  setCache(cacheKey, quote);
  return quote;
}

export async function fetchCandles(symbol, interval = '1h', limit = 200) {
  const category = getCategory(symbol);
  const cacheKey = getCacheKey('candles', category, symbol, interval, limit);
  const cached = getCached(cacheKey, getCandleTtl(interval));
  if (cached) return cached;

  const route = getRoute(category);
  const response = await fetch(
    `${API_BASE}${route}/${encodeURIComponent(symbol)}?interval=${interval}&limit=${limit}&type=candles`
  );

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    const err = new Error(errData.error || `Failed to fetch candles for ${symbol}`);
    err.rateLimited = errData.rateLimited || false;
    throw err;
  }

  const data = await response.json();
  if (data.error) {
    const err = new Error(data.error);
    err.rateLimited = data.rateLimited || false;
    throw err;
  }

  setCache(cacheKey, data);
  return data;
}

// ==================== BINANCE ALL TICKERS (kept for crypto list) ====================

export async function fetchBinanceAllTickers() {
  const cacheKey = 'binance:all';
  const cached = getCached(cacheKey, CACHE_TTL.batch);
  if (cached) return cached;

  try {
    const response = await fetch('https://api.binance.com/api/v3/ticker/24hr');
    if (!response.ok) throw new Error('Binance API error');
    const data = await response.json();

    const usdtPairs = data.filter(t => t.symbol.endsWith('USDT'));
    const formatted = {};
    usdtPairs.forEach(t => {
      const sym = t.symbol.replace('USDT', '');
      formatted[sym] = {
        price: parseFloat(t.lastPrice),
        change: parseFloat(t.priceChange),
        changePct: parseFloat(t.priceChangePercent),
        high24h: parseFloat(t.highPrice),
        low24h: parseFloat(t.lowPrice),
        volume: parseFloat(t.volume),
        quoteVolume: parseFloat(t.quoteVolume),
      };
    });

    setCache(cacheKey, formatted);
    return formatted;
  } catch (error) {
    console.error('Binance fetch error:', error);
    return null;
  }
}

// ==================== TECHNICAL INDICATORS ====================

export function calcEMA(data, period) {
  const k = 2 / (period + 1);
  let ema = data[0].close;
  const result = [];
  for (let i = 0; i < data.length; i++) {
    if (i === 0) { result.push(ema); continue; }
    ema = data[i].close * k + ema * (1 - k);
    result.push(ema);
  }
  return result;
}

export function calcRSI(data, period = 14) {
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const change = data[i].close - data[i - 1].close;
    if (change > 0) gains += change; else losses -= change;
  }
  let avgGain = gains / period, avgLoss = losses / period;
  const rsi = [50];
  for (let i = period + 1; i < data.length; i++) {
    const change = data[i].close - data[i - 1].close;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsi.push(100 - (100 / (1 + rs)));
  }
  return rsi;
}

export function calcBollinger(data, period = 20, mult = 2) {
  const upper = [], lower = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) { upper.push(data[i].close); lower.push(data[i].close); continue; }
    const slice = data.slice(i - period + 1, i + 1);
    const mean = slice.reduce((a, b) => a + b.close, 0) / period;
    const variance = slice.reduce((a, b) => a + Math.pow(b.close - mean, 2), 0) / period;
    const std = Math.sqrt(variance);
    upper.push(mean + mult * std);
    lower.push(mean - mult * std);
  }
  return { upper, lower };
}

export function isCrypto(symbol) {
  return getCategory(symbol) === 'crypto';
}
