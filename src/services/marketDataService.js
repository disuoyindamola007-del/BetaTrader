// MarketDataService — single entry point for ALL market data.
// No component should call fetch() directly. Everything flows through here.
//
// Features:
// - Request deduplication: same in-flight promise shared across callers
// - Smart refresh: per-category intervals, pauses when tab hidden
// - Rate-limit cooldown: one 429 pauses all requests for 60s
// - Stale fallback: keeps showing last good data on error
// - Unified batch/single quote caching: batch quotes are stored per-symbol too
// - Temporary diagnostics: track request counts for optimization verification

import { get, set, ttlFor } from '../lib/cache.js';
import { isRateLimited, triggerRateLimitCooldown, getCooldownSeconds } from '../lib/rateLimitState.js';

const API_BASE = '';

// In-flight request deduplication
const inFlight = new Map();

function dedupe(key, fn) {
  if (inFlight.has(key)) {
    return inFlight.get(key);
  }
  const promise = fn().finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}

// ==================== TEMPORARY DIAGNOSTICS ====================
// These counters are for verification only. Remove after confirming optimizations.
const DIAGNOSTICS = {
  totalRequests: 0,
  cacheHits: 0,
  cacheMisses: 0,
  deduplicated: 0,
  byEndpoint: {},
};

function diagRequest(endpoint) {
  DIAGNOSTICS.totalRequests++;
  DIAGNOSTICS.byEndpoint[endpoint] = (DIAGNOSTICS.byEndpoint[endpoint] || 0) + 1;
}

function diagCacheHit() { DIAGNOSTICS.cacheHits++; }
function diagCacheMiss() { DIAGNOSTICS.cacheMisses++; }
function diagDedupe() { DIAGNOSTICS.deduplicated++; }

export function getDiagnostics() {
  const total = DIAGNOSTICS.totalRequests + DIAGNOSTICS.cacheHits + DIAGNOSTICS.deduplicated;
  return {
    ...DIAGNOSTICS,
    cacheHitPct: total > 0 ? ((DIAGNOSTICS.cacheHits / total) * 100).toFixed(1) : '0.0',
    cacheMissPct: total > 0 ? ((DIAGNOSTICS.cacheMisses / total) * 100).toFixed(1) : '0.0',
    dedupePct: total > 0 ? ((DIAGNOSTICS.deduplicated / total) * 100).toFixed(1) : '0.0',
  };
}

export function resetDiagnostics() {
  DIAGNOSTICS.totalRequests = 0;
  DIAGNOSTICS.cacheHits = 0;
  DIAGNOSTICS.cacheMisses = 0;
  DIAGNOSTICS.deduplicated = 0;
  DIAGNOSTICS.byEndpoint = {};
}

// ==================== CATEGORY DETECTION ====================

const CRYPTO_SET = new Set(['BTC','ETH','SOL','XRP','BNB','ADA','DOT','LINK','DOGE','AVAX']);
const FOREX_SET = new Set(['EURUSD','USDJPY','GBPUSD','AUDUSD','USDCAD','USDCHF','GBPJPY','EURJPY']);
const COMMODITY_SET = new Set(['GOLD','SILVER','OIL','CRUDE','BRENT']);
const INDEX_SET = new Set(['SPX','NDX','DJI']);

export function getCategory(symbol) {
  if (!symbol) return 'stocks';
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
// Aligned with cache TTL so data never expires before the next refresh

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

async function fetchJson(url, endpointLabel = 'unknown') {
  if (isRateLimited()) {
    const err = new Error(`Rate limit cooldown — retry in ${getCooldownSeconds()}s`);
    err.rateLimited = true;
    err.isCooldown = true;
    throw err;
  }

  diagRequest(endpointLabel);
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

// ==================== UNIFIED CACHE HELPERS ====================
// Batch and single quotes share the same per-symbol cache entries.
// This ensures AssetDetail reuses data fetched by MarketsScreen.

function getQuoteCacheKey(symbol) {
  const category = getCategory(symbol);
  return `quote:${category}:${symbol}`;
}

function setUnifiedQuoteCache(symbol, quoteData) {
  const key = getQuoteCacheKey(symbol);
  set(key, quoteData, ttlFor('quote'));
}

function getUnifiedQuoteCache(symbol) {
  const key = getQuoteCacheKey(symbol);
  const cached = get(key, ttlFor('quote'));
  if (cached) diagCacheHit();
  else diagCacheMiss();
  return cached;
}

// Peek at quote without triggering diagnostics — used by hooks for SWR check
export function peekQuote(symbol) {
  const key = getQuoteCacheKey(symbol);
  const cached = get(key, ttlFor('quote'));
  // Check if truly fresh by trying with 0 TTL — if get returns null, it expired
  const isFresh = get(key, 0) !== null;
  return { cached, isFresh };
}

// ==================== QUOTES ====================

export async function fetchQuote(symbol) {
  const cached = getUnifiedQuoteCache(symbol);
  if (cached) return cached;

  const category = getCategory(symbol);
  const route = getRoute(category);

  const data = await dedupe(getQuoteCacheKey(symbol), () =>
    fetchJson(`${API_BASE}${route}/${encodeURIComponent(symbol)}?type=quote`, 'quote')
  );

  const quote = data[symbol] || data[symbol.replace('/', '')] || data;
  setUnifiedQuoteCache(symbol, quote);
  return quote;
}

export async function fetchBatchQuotes(symbolsByCategory) {
  const results = {};
  const errors = [];

  for (const [category, symbols] of Object.entries(symbolsByCategory)) {
    if (!symbols?.length) continue;

    const batchCacheKey = `batch:${category}:${symbols.sort().join(',')}`;
    const batchCached = get(batchCacheKey, ttlFor('batch'));

    if (batchCached) {
      // Batch cache hit — also populate per-symbol cache so AssetDetail can reuse
      for (const sym of symbols) {
        const perSym = batchCached[sym] || batchCached[sym.replace('/', '')];
        if (perSym) {
          setUnifiedQuoteCache(sym, perSym);
          results[sym] = perSym;
        }
      }
      diagCacheHit();
      continue;
    }

    try {
      const route = getRoute(category);
      const data = await dedupe(batchCacheKey, () =>
        fetchJson(`${API_BASE}${route}/${encodeURIComponent(symbols.join(','))}?type=quote`, 'batch')
      );

      // Store per-symbol AND batch cache
      for (const sym of symbols) {
        const perSym = data[sym] || data[sym.replace('/', '')];
        if (perSym) {
          setUnifiedQuoteCache(sym, perSym);
          results[sym] = perSym;
        }
      }
      set(batchCacheKey, data, ttlFor('batch'));
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
  if (cached) {
    diagCacheHit();
    return cached;
  }
  diagCacheMiss();

  const route = getRoute(category);
  const data = await dedupe(cacheKey, () =>
    fetchJson(`${API_BASE}${route}/${encodeURIComponent(symbol)}?interval=${interval}&limit=${limit}&type=candles`, `candles:${interval}`)
  );

  set(cacheKey, data, ttlFor('candles', interval));
  return data;
}

// ==================== CRYPTO BATCH (all tracked) ====================

export async function fetchCryptoBatch() {
  const cacheKey = 'crypto:batch:all';

  const cached = get(cacheKey, ttlFor('batch'));
  if (cached) {
    diagCacheHit();
    return { data: cached, stale: false };
  }
  diagCacheMiss();

  try {
    const data = await dedupe(cacheKey, () =>
      fetchJson(`${API_BASE}/api/crypto/all?type=quote`, 'crypto-batch')
    );
    // Also populate per-symbol quote cache
    for (const [sym, quote] of Object.entries(data)) {
      if (quote && quote.price != null) {
        setUnifiedQuoteCache(sym, quote);
      }
    }
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
