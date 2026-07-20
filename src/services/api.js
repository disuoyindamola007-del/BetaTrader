// All data now goes through Vercel serverless API routes (no direct API calls from browser)
// This fixes CORS, geo-blocking, and hides API keys

const API_BASE = ''; // Same origin - Vercel serves /api routes

// Simple in-memory cache (resets on deploy, but saves API calls within a session)
const cache = new Map();
const CACHE_TTL = {
  crypto: 30 * 1000,      // 30s for crypto
  forex: 60 * 1000,       // 1min for forex
  stocks: 5 * 60 * 1000,  // 5min for stocks
  commodities: 60 * 1000, // 1min for commodities
};

function getCacheKey(symbol, interval, type) {
  return `${symbol}:${interval}:${type}`;
}

function getCached(key, category) {
  const entry = cache.get(key);
  if (!entry) return null;
  const ttl = CACHE_TTL[category] || 30000;
  if (Date.now() - entry.timestamp > ttl) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
}

// ==================== ROUTE DISPATCHER ====================

function getRoute(symbol, category) {
  const clean = symbol.toUpperCase().replace('/', '');
  if (category === 'crypto') return `/api/crypto/${clean}`;
  if (category === 'forex') return `/api/forex/${clean}`;
  if (category === 'stocks' || category === 'indices') return `/api/stocks/${clean}`;
  if (category === 'metals' || category === 'commodities') return `/api/commodities/${clean}`;
  // Fallback: try to guess
  if (['BTC', 'ETH', 'SOL', 'XRP', 'BNB', 'ADA', 'DOT', 'LINK', 'DOGE', 'AVAX'].includes(clean)) {
    return `/api/crypto/${clean}`;
  }
  if (['EURUSD', 'USDJPY', 'GBPUSD', 'AUDUSD', 'USDCAD', 'USDCHF', 'GBPJPY', 'EURJPY'].includes(clean)) {
    return `/api/forex/${clean}`;
  }
  if (['GOLD', 'SILVER', 'OIL'].includes(clean)) {
    return `/api/commodities/${clean}`;
  }
  return `/api/stocks/${clean}`;
}

function getCategory(symbol) {
  const clean = symbol.toUpperCase().replace('/', '');
  if (['BTC', 'ETH', 'SOL', 'XRP', 'BNB', 'ADA', 'DOT', 'LINK', 'DOGE', 'AVAX'].includes(clean)) return 'crypto';
  if (['EURUSD', 'USDJPY', 'GBPUSD', 'AUDUSD', 'USDCAD', 'USDCHF', 'GBPJPY', 'EURJPY'].includes(clean)) return 'forex';
  if (['GOLD', 'SILVER', 'OIL'].includes(clean)) return 'commodities';
  if (['SPX', 'NDX', 'DJI'].includes(clean)) return 'stocks';
  return 'stocks';
}

// ==================== FETCH FUNCTIONS ====================

export async function fetchCandles(symbol, interval = '1h', limit = 200) {
  const category = getCategory(symbol);
  const cacheKey = getCacheKey(symbol, interval, 'candles');
  const cached = getCached(cacheKey, category);
  if (cached) return cached;

  const route = getRoute(symbol, category);
  const response = await fetch(`${API_BASE}${route}?interval=${interval}&limit=${limit}&type=candles`);
  if (!response.ok) throw new Error(`Failed to fetch candles for ${symbol}`);
  const data = await response.json();
  if (data.error) throw new Error(data.error);

  setCache(cacheKey, data);
  return data;
}

export async function fetchQuote(symbol) {
  const category = getCategory(symbol);
  const cacheKey = getCacheKey(symbol, 'quote', 'quote');
  const cached = getCached(cacheKey, category);
  if (cached) return cached;

  const route = getRoute(symbol, category);
  const response = await fetch(`${API_BASE}${route}?type=quote`);
  if (!response.ok) throw new Error(`Failed to fetch quote for ${symbol}`);
  const data = await response.json();
  if (data.error) throw new Error(data.error);

  setCache(cacheKey, data);
  return data;
}

export async function fetchBinanceAllTickers() {
  // This is still called from the browser for the markets grid / watchlist
  // We keep it as a direct Binance call since it's a single public endpoint with no key needed
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
  const s = symbol.replace('/', '').toUpperCase();
  return ['BTC', 'ETH', 'SOL', 'XRP', 'BNB', 'ADA', 'DOT', 'LINK', 'DOGE', 'AVAX'].includes(s);
}
