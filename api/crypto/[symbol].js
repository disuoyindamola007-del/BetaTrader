import { get, set, ttlFor } from '../../lib/cache.js';
import { isRateLimited, triggerRateLimitCooldown } from '../../lib/rateLimitState.js';

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';

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

function getId(symbol) {
  return SYMBOL_TO_ID[symbol.toUpperCase().replace('/', '')];
}

async function fetchCoinGecko(url) {
  if (isRateLimited()) {
    const err = new Error('Rate limit cooldown active');
    err.rateLimited = true;
    throw err;
  }

  const res = await fetch(url, { headers: { accept: 'application/json' } });

  if (res.status === 429) {
    triggerRateLimitCooldown();
    const err = new Error('CoinGecko rate limit reached');
    err.rateLimited = true;
    throw err;
  }

  if (!res.ok) {
    throw new Error(`CoinGecko fetch failed: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

function normalizeStats(id, coin) {
  const price = coin.usd;
  const changePct = coin.usd_24h_change ?? 0;
  const change = price * (changePct / 100);
  const volume = coin.usd_24h_vol ?? 0;

  // Approximate high/low from price ± change range (CoinGecko free tier doesn't give 24h high/low)
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

// ==================== HANDLER ====================

export default async function handler(req, res) {
  const { symbol, interval = '1d', limit = '200', type = 'candles' } = req.query;

  try {
    if (type === 'quote' || symbol === 'all' || (symbol && symbol.includes(','))) {
      // Batch quote: fetch all tracked coins at once
      const cacheKey = 'cg:batch:quote';
      const cached = get(cacheKey, ttlFor('batch'));

      let data;
      if (cached) {
        data = cached;
      } else {
        const url = `${COINGECKO_BASE}/simple/price?ids=${ALL_IDS}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true`;
        data = await fetchCoinGecko(url);
        set(cacheKey, data);
      }

      // If batch request, return all mapped symbols
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

      // Single quote
      const id = getId(symbol);
      if (!id) return res.status(400).json({ error: `Unknown crypto symbol: ${symbol}` });
      if (!data[id]) return res.status(404).json({ error: `No data for ${symbol}` });

      res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
      return res.status(200).json(normalizeStats(id, data[id]));
    }

    // Candles (OHLC)
    const id = getId(symbol);
    if (!id) return res.status(400).json({ error: `Unknown crypto symbol: ${symbol}` });

    const days = interval === '1m' || interval === '5m' || interval === '15m' || interval === '1h'
      ? '1'
      : interval === '4h'
      ? '7'
      : interval === '1d'
      ? '30'
      : '365';

    const cacheKey = `cg:ohlc:${id}:${days}`;
    const cached = get(cacheKey, ttlFor('candles', interval));

    let data;
    if (cached) {
      data = cached;
    } else {
      const url = `${COINGECKO_BASE}/coins/${id}/ohlc?vs_currency=usd&days=${days}`;
      data = await fetchCoinGecko(url);
      set(cacheKey, data);
    }

    // CoinGecko OHLC: [timestamp, open, high, low, close]
    const candles = data.map(([time, open, high, low, close]) => ({
      time: Math.floor(time / 1000),
      open,
      high,
      low,
      close,
      volume: 0, // CoinGecko free OHLC doesn't include volume
    }));

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return res.status(200).json(candles);

  } catch (error) {
    console.error('Crypto proxy error:', error.message);
    const status = error.rateLimited ? 429 : 500;
    return res.status(status).json({
      error: error.message,
      rateLimited: error.rateLimited || false,
    });
  }
}
