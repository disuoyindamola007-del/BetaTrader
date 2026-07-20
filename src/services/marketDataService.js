// MarketDataService — single entry point for ALL market data.
// No component should call fetch() directly. Everything flows through here.
//
// Features:
// - Request deduplication: same in-flight promise shared across callers
// - Smart refresh: per-category intervals, pauses when tab hidden
// - Rate-limit cooldown: one 429 pauses all requests for 60s
// - Stale fallback: keeps showing last good data on error

import { get, set, ttlFor } from '../lib/cache.js';
import { isRateLimited, triggerRateLimitCooldown, getCooldownSeconds } from '../lib/rateLimitState.js';

const API_BASE = '';

// In-flight request deduplication
const inFlight = new Map();

function dedupe(key, fn) {
  if (inFlight.has(key)) return inFlight.get(key);
  const promise = fn().finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}

// ==================== CATEGORY DETECTION ====================

const CRYPTO_SET = new Set(['BTC','ETH','SOL','XRP','BNB','ADA','DOT','LINK','DOGE','AVAX']);
const FOREX_SET = new Set(['EURUSD','USDJPY','GBPUSD','AUDUSD','USDCAD','USDCHF','GBPJPY','EURJPY']);
const COMMODITY_SET = new Set(['GOLD','SILVER','OIL','CRUDE','BRENT']);
const INDEX_SET = new Set(['SPX','NDX','DJI']);

export function getCategory(symbol) {
  const s = symbol.toUpperCase().replace('/', '');
  if (CRYPTO_SET.has(s)) return 'crypto';
  if (FOREX_SET.has(s)) return 'forex';
  if (COMMODITY_SET.has(s)) return 'commodities';
  if (INDEX_SET.has(s)) return 'stocks';
  return 'stocks';
}

export function isCrypto(symbol) {
  return getCategory(symbol) === 'crypto';
}

function getRoute(category) {
  return `/api/${category}`;
}

// ==================== REFRESH INTERVALS ====================

const REFRESH_INTERVALS = {
  crypto: 60_000,
  forex: 60_000,
  stocks: 60_000,
  commodities: 60_000,
};

export function getRefreshInterval(category) {
  return REFRESH_INTERVALS[category] || 60_000;
}

// ==================== FETCH CORE ====================

async function fetchJson(url) {
  if (isRateLimited()) {
    const err = new Error(`Rate limit cooldown — retry in ${getCooldownSeconds()}s`);
    err.rateLimited = true;
    err.isCooldown = true;
    throw err;
  }

  const res = await fetch(url);

  if (res.status === 429) {
    triggerRateLimitCooldown();
    const err = new Error('Rate limit reached (429)');
    err.rateLimited = true;
    throw err;
  }

  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }

  return res.json();
}

// ==================== QUOTES ====================

export async function fetchQuote(symbol) {
  const category = getCategory(symbol);
  const cacheKey = `quote:${category}:${symbol}`;

  const cached = get(cacheKey, ttlFor('quote'));
  if (cached) return cached;

  const route = getRoute(category);
  const data = await dedupe(cacheKey, () =>
    fetchJson(`${API_BASE}${route}/${encodeURIComponent(symbol)}?type=quote`)
  );

  const quote = data[symbol] || data[symbol.replace('/', '')] || data;
  set(cacheKey, quote, ttlFor('quote'));
  return quote;
}

export async function fetchBatchQuotes(symbolsByCategory) {
  const results = {};
  const errors = [];

  for (const [category, symbols] of Object.entries(symbolsByCategory)) {
    if (!symbols?.length) continue;

    const cacheKey = `batch:${category}:${symbols.sort().join(',')}`;
    const cached = get(cacheKey, ttlFor('batch'));
    if (cached) {
      Object.assign(results, cached);
      continue;
    }

    try {
      const route = getRoute(category);
      const data = await dedupe(cacheKey, () =>
        fetchJson(`${API_BASE}${route}/${encodeURIComponent(symbols.join(','))}?type=quote`)
      );
      Object.assign(results, data);
      set(cacheKey, data, ttlFor('batch'));
    } catch (err) {
      console.error(`[MarketDataService] Batch ${category} failed:`, err.message);
      if (err.rateLimited || err.isCooldown) {
        errors.push({ category, rateLimited: true, message: err.message });
      } else {
        errors.push({ category, message: err.message });
      }
    }
  }

  return { data: results, errors, stale: errors.some(e => e.rateLimited) };
}

// ==================== CANDLES ====================

export async function fetchCandles(symbol, interval = '1h', limit = 200) {
  const category = getCategory(symbol);
  const cacheKey = `candles:${category}:${symbol}:${interval}:${limit}`;

  const cached = get(cacheKey, ttlFor('candles', interval));
  if (cached) return cached;

  const route = getRoute(category);
  const data = await dedupe(cacheKey, () =>
    fetchJson(`${API_BASE}${route}/${encodeURIComponent(symbol)}?interval=${interval}&limit=${limit}&type=candles`)
  );

  set(cacheKey, data, ttlFor('candles', interval));
  return data;
}

// ==================== CRYPTO BATCH (all tracked) ====================

export async function fetchCryptoBatch() {
  const cacheKey = 'crypto:batch:all';

  const cached = get(cacheKey, ttlFor('batch'));
  if (cached) return { data: cached, stale: false };

  try {
    const data = await dedupe(cacheKey, () =>
      fetchJson(`${API_BASE}/api/crypto/all?type=quote`)
    );
    set(cacheKey, data, ttlFor('batch'));
    return { data, stale: false };
  } catch (err) {
    console.error('[MarketDataService] Crypto batch failed:', err.message);
    return { error: err.message, rateLimited: err.rateLimited || false, stale: true };
  }
}

// ==================== TAB VISIBILITY ====================

let tabVisible = true;
const visibilityCbs = new Set();

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    tabVisible = !document.hidden;
    visibilityCbs.forEach(cb => cb(tabVisible));
  });
}

export function isTabActive() {
  return tabVisible;
}

export function onTabVisibility(cb) {
  visibilityCbs.add(cb);
  return () => visibilityCbs.delete(cb);
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
