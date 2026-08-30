// MarketDataService — single entry point for ALL market data.
// No component should call fetch() directly. Everything flows through here.
//
// Features:
// - Request deduplication: same in-flight promise shared across callers
// - Smart refresh: per-category intervals, pauses when tab hidden
// - Rate-limit cooldown: PER-CATEGORY — a 429 on one category (e.g.
//   commodities/TwelveData) no longer blocks other categories
//   (e.g. crypto/CoinGecko). Fixes the "one API dies, everything dies" bug.
// - Stale fallback: keeps showing last good data on error
// - Unified batch/single quote caching: batch quotes are stored per-symbol too
// - Temporary diagnostics: track request counts for optimization verification

import { get, set, ttlFor } from '../lib/cache.js';
import { isRateLimited, triggerRateLimitCooldown, getCooldownSeconds } from '../lib/rateLimitState.js';

const API_BASE = '';
const FOREX_BATCH_TTL_MS = 5 * 60_000;

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

export function getCategory(symbol, categoryHint = null) {
  const hint = categoryHint?.toLowerCase();
  if (hint === 'crypto' || hint === 'forex' || hint === 'stocks' || hint === 'commodities') return hint;
  if (hint === 'indices' || hint === 'metals') return hint === 'indices' ? 'stocks' : 'commodities';
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

// ==================== MARKET HOURS AWARENESS ====================
// Prevents wasting API credits on markets that are closed (weekends, holidays).
// Crypto trades 24/7 and is always exempt from these checks.

// US Eastern Time helpers
function getETDate() {
  const now = new Date();
  // Convert to ET (UTC-5 or UTC-4 during DST)
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const etOffset = -5 * 3600000; // Standard EST
  return new Date(utc + etOffset);
}

function isWeekend(date) {
  const day = date.getDay();
  return day === 0 || day === 6; // Sunday = 0, Saturday = 6
}

function isUSMarketHoliday(date) {
  // Simplified major US market holidays (fixed dates)
  // Note: This doesn't handle moving holidays like Thanksgiving exactly
  const month = date.getMonth(); // 0-indexed
  const day = date.getDate();
  const holidays = [
    // New Year's Day (Jan 1)
    { m: 0, d: 1 },
    // MLK Day (3rd Monday of January) — approximate
    { m: 0, d: 15, type: 'approx' },
    // Presidents' Day (3rd Monday of February) — approximate
    { m: 1, d: 15, type: 'approx' },
    // Good Friday — not tracked (complex, varies yearly)
    // Memorial Day (last Monday of May) — approximate
    { m: 4, d: 25, type: 'approx' },
    // Juneteenth (June 19)
    { m: 5, d: 19 },
    // Independence Day (July 4)
    { m: 6, d: 4 },
    // Labor Day (1st Monday of September) — approximate
    { m: 8, d: 1, type: 'approx' },
    // Thanksgiving (4th Thursday of November) — approximate
    { m: 10, d: 24, type: 'approx' },
    // Christmas (December 25)
    { m: 11, d: 25 },
  ];

  return holidays.some(h => h.m === month && Math.abs(h.d - day) <= 1);
}

/**
 * Check if a market category is currently open for trading.
 * - Crypto: Always open (24/7)
 * - Forex: Sunday 5pm ET to Friday 5pm ET (24h during weekdays)
 * - Stocks (US): Monday-Friday 9:30am-4:00pm ET, closed weekends & holidays
 * - Commodities: Similar to forex (Sunday 5pm ET to Friday 5pm ET)
 */
export function isMarketOpen(category) {
  // Crypto never closes
  if (category === 'crypto') return true;

  const etNow = getETDate();
  const day = etNow.getDay();
  const hour = etNow.getHours();
  const minute = etNow.getMinutes();
  const timeInMinutes = hour * 60 + minute;

  // Weekend check (Saturday = 6, Sunday = 0)
  const isWeekendDay = day === 0 || day === 6;

  // US market holidays
  if (isUSMarketHoliday(etNow) && category !== 'forex' && category !== 'commodities') {
    return false;
  }

  if (category === 'stocks') {
    // US Stock market: Mon-Fri 9:30am-4:00pm ET
    if (isWeekendDay) return false;
    const marketOpen = 9 * 60 + 30; // 9:30am
    const marketClose = 16 * 60;     // 4:00pm
    return timeInMinutes >= marketOpen && timeInMinutes < marketClose;
  }

  if (category === 'forex' || category === 'commodities') {
    // Forex/Commodities: Sunday 5pm ET to Friday 5pm ET
    // Sunday = 0, so we need: (day === 0 && hour >= 17) || (day >= 1 && day <= 4) || (day === 5 && hour < 17)
    if (day === 0) return hour >= 17; // Sunday: open after 5pm ET
    if (day >= 1 && day <= 4) return true; // Mon-Thu: open 24h
    if (day === 5) return hour < 17; // Friday: close at 5pm ET
    return false;
  }

  // Default: assume open (safe fallback)
  return true;
}

/**
 * Get milliseconds until the market next opens.
 * Used to set aggressive cache TTL during market closures.
 */
export function getTimeUntilMarketOpen(category) {
  if (isMarketOpen(category)) return 0;

  const etNow = getETDate();
  const day = etNow.getDay();
  const hour = etNow.getHours();
  const minute = etNow.getMinutes();
  const second = etNow.getSeconds();

  // Calculate ms until a specific ET time on a specific day
  function msUntil(dayOffset, targetHour, targetMinute) {
    const target = new Date(etNow);
    target.setDate(target.getDate() + dayOffset);
    target.setHours(targetHour, targetMinute, 0, 0);
    return target.getTime() - etNow.getTime();
  }

  if (category === 'stocks') {
    // Next trading day 9:30am ET
    if (day === 5) return msUntil(2, 9, 30); // Saturday → Monday
    if (day === 6) return msUntil(1, 9, 30); // Sunday → Monday
    // Weekday but after hours
    return msUntil(1, 9, 30); // Tomorrow 9:30am
  }

  if (category === 'forex' || category === 'commodities') {
    // Forex opens Sunday 5pm ET
    if (day === 6) return msUntil(1, 17, 0); // Saturday → Sunday 5pm
    if (day === 5) return msUntil(2, 17, 0); // Friday (after 5pm) → Sunday 5pm
    return msUntil(7 - day + 0, 17, 0); // Next Sunday 5pm
  }

  return 3600000; // Default: 1 hour
}

// ==================== REFRESH INTERVALS ====================

const REFRESH_INTERVALS = {
  crypto: 60_000,
  forex: 60_000,
  stocks: 60_000,
  commodities: 60_000,
};

/**
 * Get the appropriate refresh interval for a category.
 * Returns Infinity when the market is closed to prevent polling.
 * Returns normal interval when market is open.
 */
export function getRefreshInterval(category) {
  // Crypto always refreshes
  if (category === 'crypto') return REFRESH_INTERVALS.crypto;

  // Skip polling when market is closed
  if (!isMarketOpen(category)) return Infinity;

  return REFRESH_INTERVALS[category] || 60_000;
}

/**
 * Get cache TTL for quotes, extended when market is closed.
 * Normal TTL: 5 minutes
 * Closed market TTL: until market reopens (capped at 48 hours)
 */
export function getQuoteTTL(category) {
  const normalTTL = 5 * 60_000; // 5 minutes

  if (category === 'crypto' || isMarketOpen(category)) {
    return normalTTL;
  }

  // Market is closed — cache until it reopens (max 48 hours)
  const timeUntilOpen = getTimeUntilMarketOpen(category);
  return Math.min(timeUntilOpen + 5 * 60_000, 48 * 60 * 60_000);
}

// ==================== FETCH CORE ====================
// `category` is now REQUIRED and drives a per-category cooldown key, so a
// 429 from TwelveData (forex/commodities/stocks) can never block CoinGecko
// (crypto), and vice versa.

async function fetchJson(url, category, endpointLabel = 'unknown') {
  if (isRateLimited(category)) {
    const err = new Error(`Rate limit cooldown — retry in ${getCooldownSeconds(category)}s`);
    err.rateLimited = true;
    err.isCooldown = true;
    throw err;
  }

  diagRequest(endpointLabel);
  const res = await fetch(url);

  if (res.status === 429) {
    triggerRateLimitCooldown(category);
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

function getQuoteCacheKey(symbol, categoryHint = null) {
  const category = getCategory(symbol, categoryHint);
  return `quote:${category}:${symbol}`;
}

async function setUnifiedQuoteCache(symbol, quoteData, categoryHint = null) {
  const key = getQuoteCacheKey(symbol, categoryHint);
  const ttl = getQuoteTTL(getCategory(symbol, categoryHint));
  await set(key, quoteData, ttl);
}

async function getUnifiedQuoteCache(symbol, categoryHint = null) {
  const key = getQuoteCacheKey(symbol, categoryHint);
  const ttl = getQuoteTTL(getCategory(symbol, categoryHint));
  const cached = await get(key, ttl);
  if (cached) diagCacheHit();
  else diagCacheMiss();
  return cached;
}

// Peek at quote without triggering diagnostics — used by hooks for SWR check
export async function peekQuote(symbol, providerSymbol = null, categoryHint = null) {
  const key = getQuoteCacheKey(providerSymbol || symbol, categoryHint);
  const ttl = getQuoteTTL(getCategory(symbol, categoryHint));
  const cached = await get(key, ttl);
  const isFresh = (await get(key, 0)) !== null;
  return { cached, isFresh };
}

// ==================== QUOTES ====================

export async function fetchQuote(symbol, providerSymbol = null, categoryHint = null) {
  const cacheSymbol = providerSymbol || symbol;
  const cached = await getUnifiedQuoteCache(cacheSymbol, categoryHint);
  if (cached) return cached;

  const category = getCategory(symbol, categoryHint);
  const route = getRoute(category);
  const providerParam = category === 'crypto' && providerSymbol ? `&providerId=${encodeURIComponent(providerSymbol)}` : '';

  const data = await dedupe(getQuoteCacheKey(cacheSymbol, categoryHint), () =>
    fetchJson(`${API_BASE}${route}/${encodeURIComponent(symbol)}?type=quote${providerParam}`, category, 'quote')
  );

  const quote = data[symbol] || data[symbol.replace('/', '')] || data;
  await setUnifiedQuoteCache(cacheSymbol, quote, categoryHint);
  return quote;
}

export async function fetchBatchQuotes(symbolsByCategory) {
  const results = {};
  const errors = [];

  for (const [category, symbols] of Object.entries(symbolsByCategory)) {
    if (!symbols?.length) continue;

    const batchCacheKey = `batch:${category}:${symbols.sort().join(',')}`;
    const batchTtl = category === 'forex' ? FOREX_BATCH_TTL_MS : ttlFor('batch');
    const batchCached = await get(batchCacheKey, batchTtl);

    if (batchCached) {
      for (const sym of symbols) {
        const perSym = batchCached[sym] || batchCached[sym.replace('/', '')];
        if (perSym) {
          await setUnifiedQuoteCache(sym, perSym);
          results[sym] = perSym;
        }
      }
      diagCacheHit();
      continue;
    }

    try {
      const route = getRoute(category);
      const data = await dedupe(batchCacheKey, () =>
        fetchJson(`${API_BASE}${route}/${encodeURIComponent(symbols.join(','))}?type=quote`, category, 'batch')
      );

      for (const sym of symbols) {
        const perSym = data[sym] || data[sym.replace('/', '')];
        if (perSym) {
          await setUnifiedQuoteCache(sym, perSym);
          results[sym] = perSym;
        }
      }
      await set(batchCacheKey, data, batchTtl);
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

export async function fetchCandles(symbol, interval = '1h', limit = 200, providerSymbol = null, categoryHint = null) {
  const category = getCategory(symbol, categoryHint);
  const cacheSymbol = providerSymbol || symbol;
  const cacheKey = `candles:${category}:${cacheSymbol}:${interval}:${limit}`;

  const cached = await get(cacheKey, ttlFor('candles', interval));
  if (cached) {
    diagCacheHit();
    return cached;
  }
  diagCacheMiss();

  const route = getRoute(category);
  const providerParam = category === 'crypto' && providerSymbol ? `&providerId=${encodeURIComponent(providerSymbol)}` : '';
  const data = await dedupe(cacheKey, () =>
    fetchJson(`${API_BASE}${route}/${encodeURIComponent(symbol)}?interval=${interval}&limit=${limit}&type=candles${providerParam}`, category, `candles:${interval}`)
  );

  await set(cacheKey, data, ttlFor('candles', interval));
  return data;
}

// ==================== CRYPTO BATCH (all tracked) ====================

export async function fetchCryptoBatch() {
  const cacheKey = 'crypto:batch:all';

  const cached = await get(cacheKey, ttlFor('batch'));
  if (cached) {
    diagCacheHit();
    return { data: cached, stale: false };
  }
  diagCacheMiss();

  try {
    const data = await dedupe(cacheKey, () =>
      fetchJson(`${API_BASE}/api/crypto/all?type=quote`, 'crypto', 'crypto-batch')
    );
    for (const [sym, quote] of Object.entries(data)) {
      if (quote && quote.price != null) {
        await setUnifiedQuoteCache(sym, quote);
      }
    }
    await set(cacheKey, data, ttlFor('batch'));
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
  if (!data || data.length < period + 1) {
    return (data || []).map(() => 50);
  }

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
