import { get, set, ttlFor } from '../../lib/cache.js';
import { validateMarketQuery } from '../../lib/validateMarketQuery.js';
import { isRateLimited, triggerRateLimitCooldown } from '../../lib/rateLimitState.js';
import { isCircuitOpen, recordSuccess, recordFailure } from '../../lib/circuitBreaker.js';
import { fetchJsonWithTimeout } from '../../lib/fetchWithTimeout.js';
import { logCacheHit, logCacheMiss } from '../../lib/structuredLogger.js';

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';
const COINGECKO_API_KEY = process.env.COINGECKO_API_KEY || process.env.COINGECKO_DEMO_API_KEY || '';

// Binance public API for crypto candle data (no API key required)
// NOTE: Binance is confirmed BLOCKED on Vercel (HTTP 451) — kept as fallback code only
const BINANCE_BASE = 'https://api.binance.com/api/v3';

// Binance uses USDT pairs for most symbols
const BINANCE_SYMBOL_MAP = {
  BTC: 'BTCUSDT',
  ETH: 'ETHUSDT',
  SOL: 'SOLUSDT',
  XRP: 'XRPUSDT',
  BNB: 'BNBUSDT',
  ADA: 'ADAUSDT',
  DOT: 'DOTUSDT',
  LINK: 'LINKUSDT',
  DOGE: 'DOGEUSDT',
  AVAX: 'AVAXUSDT',
};

// Binance interval mapping (matches their API exactly)
const BINANCE_INTERVAL_MAP = {
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
};

// ==================== KRAKEN PUBLIC API ====================
// Kraken's OHLC endpoint provides real minute-level candles for crypto.
// No API key required. Rate limited at ~1 req/sec by IP.
// Unlike Binance, no known Vercel blocking reports.
const KRAKEN_BASE = 'https://api.kraken.com/0/public';

// Kraken uses XBT for Bitcoin, XDG for Dogecoin
const KRAKEN_SYMBOL_MAP = {
  BTC: 'XXBTZUSD',  // Kraken's pair identifier for BTC/USD
  ETH: 'XETHZUSD',  // ETH/USD
  SOL: 'SOLUSD',    // SOL/USD
  XRP: 'XXRPZUSD',  // XRP/USD
  ADA: 'ADAUSD',    // ADA/USD
  DOT: 'DOTUSD',    // DOT/USD
  LINK: 'LINKUSD',  // LINK/USD
  DOGE: 'XDGEUSD',  // Dogecoin (XDG on Kraken)
  AVAX: 'AVAXUSD',  // AVAX/USD
  // BNB not supported on Kraken
};

// Kraken interval mapping (in minutes)
const KRAKEN_INTERVAL_MAP = {
  '1m': 1,
  '5m': 5,
  '15m': 15,
};

// Kraken rate limit: ~1 request per second
const KRAKEN_RATE_LIMIT_MS = 1100; // 1.1s to be safe
let lastKrakenRequest = 0;

const SYMBOL_TO_ID = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  XRP: 'ripple',
  BNB: 'binancecoin',
  ADA: 'cardano',
  DOT: 'polkadot',
  LINK: 'chainlink',
  DOGE: 'dogecoin',
  AVAX: 'avalanche-2',
};

const ALL_IDS = Object.values(SYMBOL_TO_ID).join(',');

function getId(symbol, providerId) {
  if (providerId) return providerId;
  const normalized = symbol.toUpperCase().replace('/', '');
  return SYMBOL_TO_ID[normalized] || Object.values(SYMBOL_TO_ID).find(id => id === symbol.toLowerCase()) || null;
}

async function fetchCoinGecko(url) {
  if (isRateLimited('coingecko')) {
    const err = new Error('Rate limit cooldown active');
    err.rateLimited = true;
    throw err;
  }

  if (isCircuitOpen('coingecko')) {
    const err = new Error('CoinGecko circuit breaker open');
    err.circuitOpen = true;
    throw err;
  }

  const headers = { accept: 'application/json' };
  if (COINGECKO_API_KEY) headers['x-cg-demo-api-key'] = COINGECKO_API_KEY;

  try {
    const data = await fetchJsonWithTimeout(url, { headers }, { provider: 'coingecko' });
    recordSuccess('coingecko');
    return data;
  } catch (error) {
    if (error.timeout || error.circuitOpen) throw error;
    if (error.message?.includes('429')) {
      triggerRateLimitCooldown('coingecko');
      const err = new Error('CoinGecko rate limit reached');
      err.rateLimited = true;
      throw err;
    }
    recordFailure('coingecko');
    throw error;
  }
}

// ==================== BINANCE CANDLE FETCHING ====================
// Used ONLY for 1m, 5m, 15m intervals where CoinGecko doesn't provide real minute data.
// Falls back to CoinGecko if Binance is blocked/unavailable.

async function fetchBinanceCandles(symbol, interval, limit = 200) {
  const binanceSymbol = BINANCE_SYMBOL_MAP[symbol.toUpperCase().replace('/', '')];
  if (!binanceSymbol) {
    throw new Error(`Unsupported symbol for Binance: ${symbol}`);
  }

  const binanceInterval = BINANCE_INTERVAL_MAP[interval];
  if (!binanceInterval) {
    throw new Error(`Unsupported interval for Binance: ${interval}`);
  }

  // Check circuit breaker for Binance
  if (isCircuitOpen('binance')) {
    const err = new Error('Binance circuit breaker open — falling back to CoinGecko');
    err.circuitOpen = true;
    err.binanceBlocked = true;
    throw err;
  }

  const url = `${BINANCE_BASE}/klines?symbol=${binanceSymbol}&interval=${binanceInterval}&limit=${limit}`;

  try {
    const response = await fetchJsonWithTimeout(url, {}, { provider: 'binance' });

    // Binance returns array of arrays: [time, open, high, low, close, volume, ...]
    if (!Array.isArray(response)) {
      // Check for restriction errors
      if (response?.code === -1003 || response?.msg?.includes('restricted')) {
        recordFailure('binance');
        triggerRateLimitCooldown('binance');
        const err = new Error('Binance API restricted from this location');
        err.binanceBlocked = true;
        err.rateLimited = true;
        throw err;
      }
      throw new Error('Unexpected Binance response format');
    }

    recordSuccess('binance');
    return response.map(candle => ({
      time: Math.floor(candle[0] / 1000),
      open: parseFloat(candle[1]),
      high: parseFloat(candle[2]),
      low: parseFloat(candle[3]),
      close: parseFloat(candle[4]),
      volume: parseFloat(candle[5]),
    }));
  } catch (error) {
    if (error.timeout || error.circuitOpen) throw error;

    // Detect Binance restriction/block errors
    if (error.message?.includes('451') ||
        error.message?.includes('restricted') ||
        error.message?.includes('Service Unavailable') ||
        error.binanceBlocked) {
      recordFailure('binance');
      // Open circuit breaker so we don't keep trying
      triggerRateLimitCooldown('binance');
      const err = new Error('Binance API unavailable from this region');
      err.binanceBlocked = true;
      throw err;
    }

    if (error.message?.includes('429')) {
      triggerRateLimitCooldown('binance');
      const err = new Error('Binance rate limit reached');
      err.rateLimited = true;
      throw err;
    }

    recordFailure('binance');
    throw error;
  }
}

// ==================== KRAKEN CANDLE FETCHING ====================
// Used for 1m, 5m, 15m intervals where CoinGecko doesn't provide real minute data.
// Falls back to CoinGecko if Kraken fails.

async function fetchKrakenCandles(symbol, interval, limit = 200) {
  const krakenPair = KRAKEN_SYMBOL_MAP[symbol.toUpperCase().replace('/', '')];
  if (!krakenPair) {
    throw new Error(`Unsupported symbol for Kraken: ${symbol}. Supported: ${Object.keys(KRAKEN_SYMBOL_MAP).join(', ')}`);
  }

  const krakenInterval = KRAKEN_INTERVAL_MAP[interval];
  if (!krakenInterval) {
    throw new Error(`Unsupported interval for Kraken: ${interval}`);
  }

  // Check circuit breaker for Kraken
  if (isCircuitOpen('kraken')) {
    const err = new Error('Kraken circuit breaker open — falling back to CoinGecko');
    err.circuitOpen = true;
    err.krakenBlocked = true;
    throw err;
  }

  // Respect Kraken's ~1 req/sec rate limit
  const now = Date.now();
  const timeSinceLastRequest = now - lastKrakenRequest;
  if (timeSinceLastRequest < KRAKEN_RATE_LIMIT_MS) {
    const delay = KRAKEN_RATE_LIMIT_MS - timeSinceLastRequest;
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  lastKrakenRequest = Date.now();

  const url = `${KRAKEN_BASE}/OHLC?pair=${encodeURIComponent(krakenPair)}&interval=${krakenInterval}`;

  try {
    const response = await fetchJsonWithTimeout(url, {}, { provider: 'kraken' });
    lastKrakenRequest = Date.now();

    // Kraken returns: { error: [], result: { <pair>: [[time, open, high, low, close, vwap, volume, count], ...], last: <id> } }
    if (!response || response.error) {
      const errorMsg = Array.isArray(response?.error) ? response.error.join(', ') : 'Unknown Kraken error';
      recordFailure('kraken');
      throw new Error(`Kraken API error: ${errorMsg}`);
    }

    const result = response.result;
    const pairKey = Object.keys(result).find(k => k !== 'last');
    if (!pairKey || !Array.isArray(result[pairKey])) {
      recordFailure('kraken');
      throw new Error('Unexpected Kraken response structure');
    }

    const candles = result[pairKey];

    // Limit to requested count
    const limited = limit ? candles.slice(-limit) : candles;

    recordSuccess('kraken');
    return limited.map(candle => ({
      time: Math.floor(candle[0]), // Kraken returns timestamps in seconds (not ms)
      open: parseFloat(candle[1]),
      high: parseFloat(candle[2]),
      low: parseFloat(candle[3]),
      close: parseFloat(candle[4]),
      volume: parseFloat(candle[6]), // Volume is index 6 in Kraken's response
    }));
  } catch (error) {
    if (error.timeout || error.circuitOpen) throw error;

    // Detect Kraken blocking/restriction errors
    if (error.message?.includes('451') ||
        error.message?.includes('restricted') ||
        error.message?.includes('Service Unavailable') ||
        error.krakenBlocked) {
      recordFailure('kraken');
      triggerRateLimitCooldown('kraken');
      const err = new Error('Kraken API unavailable from this region');
      err.krakenBlocked = true;
      throw err;
    }

    if (error.message?.includes('429') || error.message?.includes('rate limit')) {
      triggerRateLimitCooldown('kraken');
      const err = new Error('Kraken rate limit reached');
      err.rateLimited = true;
      throw err;
    }

    recordFailure('kraken');
    throw error;
  }
}

function normalizeStats(id, coin) {
  const price = coin.usd;
  const changePct = coin.usd_24h_change ?? 0;
  const change = price * (changePct / 100);
  const volume = coin.usd_24hr_vol ?? 0;

  const high24h = price * (1 + Math.abs(changePct) / 100);
  const low24h = price * (1 - Math.abs(changePct) / 100);

  return {
    price,
    change,
    changePct,
    high24h,
    low24h,
    volume,
    quoteVolume: volume,
  };
}

export default async function handler(req, res) {
  const { symbol, interval = '1d', limit = '200', type = 'candles', providerId } = req.query;

  const validation = validateMarketQuery({ symbol, interval, type, size: limit, sizeName: 'limit' });
  if (validation.error) return res.status(400).json({ error: validation.error });

  try {
    if (type === 'quote' || symbol === 'all' || symbol.includes(',')) {
      const requestedId = providerId ? getId(symbol, providerId) : null;
      const cacheKey = requestedId ? `cg:quote:${requestedId}` : 'cg:batch:quote';
      const cached = await get(cacheKey, ttlFor(requestedId ? 'quote' : 'batch'));

      if (cached) {
        logCacheHit({ provider: 'coingecko', key: cacheKey, ttlMs: ttlFor(requestedId ? 'quote' : 'batch'), valueSize: JSON.stringify(cached).length });
      } else {
        logCacheMiss({ provider: 'coingecko', key: cacheKey });
      }

      let data;
      if (cached) {
        data = cached;
      } else {
        const ids = requestedId || ALL_IDS;
        const url = `${COINGECKO_BASE}/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true`;
        data = await fetchCoinGecko(url);
        await set(cacheKey, data, ttlFor(requestedId ? 'quote' : 'batch'));
      }

      if (symbol === 'all' || (symbol && symbol.includes(','))) {
        const requested = symbol === 'all'
          ? Object.keys(SYMBOL_TO_ID)
          : symbol.split(',').map(s => s.trim().toUpperCase().replace('/', ''));

        const result = {};
        for (const sym of requested) {
          const id = getId(sym);
          if (id && data[id]) {
            result[sym] = normalizeStats(id, data[id]);
          }
        }

        res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
        return res.status(200).json(result);
      }

      const id = getId(symbol, providerId);
      if (!id) return res.status(400).json({ error: `Unknown crypto symbol: ${symbol}` });
      if (!data[id]) return res.status(404).json({ error: `No data for ${symbol}` });

      res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
      return res.status(200).json(normalizeStats(id, data[id]));
    }

    const id = getId(symbol, providerId);
    if (!id) return res.status(400).json({ error: `Unknown crypto symbol: ${symbol}` });

    // For 1m, 5m, 15m intervals, try Kraken first for real minute-level data
    const isShortInterval = interval === '1m' || interval === '5m' || interval === '15m';

    // Debug: return interval info
    if (req.query.debug === '1') {
      return res.status(200).json({
        interval,
        isShortInterval,
        symbol,
        query: req.query,
      });
    }

    if (isShortInterval) {
      const krakenCacheKey = `kraken:${symbol.toUpperCase().replace('/', '')}:${interval}:${limit}`;
      const krakenCached = await get(krakenCacheKey, ttlFor('candles', interval));

      if (krakenCached) {
        logCacheHit({ provider: 'kraken', key: krakenCacheKey, ttlMs: ttlFor('candles', interval), valueSize: JSON.stringify(krakenCached).length });
        res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
        return res.status(200).json(krakenCached);
      }

      logCacheMiss({ provider: 'kraken', key: krakenCacheKey });

      try {
        const krakenCandles = await fetchKrakenCandles(symbol, interval, parseInt(limit) || 200);
        console.log(`Kraken success for ${symbol}/${interval}: ${krakenCandles.length} candles, first time: ${krakenCandles[0]?.time}, last time: ${krakenCandles[krakenCandles.length-1]?.time}`);
        await set(krakenCacheKey, krakenCandles, ttlFor('candles', interval));
        logCacheHit({ provider: 'kraken', key: krakenCacheKey, ttlMs: ttlFor('candles', interval), valueSize: JSON.stringify(krakenCandles).length });
        res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
        return res.status(200).json(krakenCandles);
      } catch (krakenError) {
        // Kraken failed (blocked, rate limited, etc.) — fall back to CoinGecko
        console.error(`Kraken candle fetch FAILED for ${symbol}/${interval}:`, krakenError.message);
        // Return error details for debugging (will be removed after testing)
        if (req.query.debug === '1') {
          return res.status(500).json({
            error: 'Kraken failed',
            details: krakenError.message,
            name: krakenError.name,
            timeout: krakenError.timeout,
            krakenBlocked: krakenError.krakenBlocked,
            circuitOpen: krakenError.circuitOpen,
          });
        }
        // Continue to CoinGecko fallback below
      }
    }

    // CoinGecko fallback (used for all intervals when Binance fails, and for 1h+)
    const days = interval === '1h'
      ? '1'
      : interval === '4h'
      ? '7'
      : interval === '1d'
      ? '30'
      : '365';

    const cacheKey = `cg:ohlc:${id}:${days}`;
    const cached = await get(cacheKey, ttlFor('candles', interval));

    if (cached) {
      logCacheHit({ provider: 'coingecko', key: cacheKey, ttlMs: ttlFor('candles', interval), valueSize: JSON.stringify(cached).length });
    } else {
      logCacheMiss({ provider: 'coingecko', key: cacheKey });
    }

    let data;
    if (cached) {
      data = cached;
    } else {
      const url = `${COINGECKO_BASE}/coins/${id}/ohlc?vs_currency=usd&days=${days}`;
      data = await fetchCoinGecko(url);
      await set(cacheKey, data, ttlFor('candles', interval));
    }

    if (!Array.isArray(data)) {
      console.error('Unexpected CoinGecko OHLC response shape:', JSON.stringify(data).slice(0, 200));
      return res.status(503).json({ error: 'Unexpected response from CoinGecko' });
    }

    const candles = data.map(([time, open, high, low, close]) => ({
      time: Math.floor(time / 1000),
      open,
      high,
      low,
      close,
      volume: 0,
    }));

    // Note: For 1m/5m/15m, if Binance succeeded we already returned above.
    // If we reach here, it means Binance failed and we're returning CoinGecko's hourly data.
    // The frontend should ideally indicate this, but for now we return the data as-is.
    if (isShortInterval) {
      console.warn(`Returning CoinGecko hourly data for ${symbol}/${interval} (Binance unavailable). Data is hourly, not minute-level.`);
    }

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return res.status(200).json(candles);

  } catch (error) {
    console.error('Crypto proxy error:', error.message);
    const status = error.rateLimited ? 429 : error.circuitOpen ? 503 : 500;
    return res.status(status).json({
      error: error.message,
      rateLimited: error.rateLimited || false,
      circuitOpen: error.circuitOpen || false,
    });
  }
}
