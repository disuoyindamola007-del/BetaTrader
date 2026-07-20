import { get, set, ttlFor } from '../../lib/cache.js';

const BINANCE_BASE = 'https://api.binance.com/api/v3';

export default async function handler(req, res) {
  const { symbol, interval = '1h', limit = '200', type = 'klines' } = req.query;

  if (!symbol) {
    return res.status(400).json({ error: 'Symbol required' });
  }

  const isBatch = symbol === 'all' || symbol.includes(',');

  try {
    if (type === '24h' || isBatch) {
      // Batch: fetch ALL Binance tickers (one call, ~2000 pairs)
      const cacheKey = 'binance:all:ticker';
      const cached = get(cacheKey, ttlFor('batch'));
      let allTickers;

      if (cached) {
        allTickers = cached;
      } else {
        const response = await fetch(`${BINANCE_BASE}/ticker/24hr`);
        if (!response.ok) throw new Error('Binance ticker fetch failed');
        const data = await response.json();
        allTickers = data.filter(t => t.symbol.endsWith('USDT'));
        set(cacheKey, allTickers);
      }

      if (isBatch) {
        const requested = symbol.split(',').map(s => s.toUpperCase().replace('/', '') + 'USDT');
        const result = {};
        for (const t of allTickers) {
          const baseSymbol = t.symbol.replace('USDT', '');
          if (requested.includes(t.symbol)) {
            result[baseSymbol] = {
              price: parseFloat(t.lastPrice),
              change: parseFloat(t.priceChange),
              changePct: parseFloat(t.priceChangePercent),
              high24h: parseFloat(t.highPrice),
              low24h: parseFloat(t.lowPrice),
              volume: parseFloat(t.volume),
              quoteVolume: parseFloat(t.quoteVolume),
            };
          }
        }
        res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
        return res.status(200).json(result);
      }

      // Single 24h
      const binanceSymbol = symbol.toUpperCase().replace('/', '') + 'USDT';
      const ticker = allTickers.find(t => t.symbol === binanceSymbol);
      if (!ticker) throw new Error(`Symbol ${symbol} not found on Binance`);

      return res.status(200).json({
        price: parseFloat(ticker.lastPrice),
        change: parseFloat(ticker.priceChange),
        changePct: parseFloat(ticker.priceChangePercent),
        high24h: parseFloat(ticker.highPrice),
        low24h: parseFloat(ticker.lowPrice),
        volume: parseFloat(ticker.volume),
        quoteVolume: parseFloat(ticker.quoteVolume),
      });
    }

    // Klines (candles) — individual only, with cache
    const binanceSymbol = symbol.toUpperCase().replace('/', '') + 'USDT';
    const intervalMap = { '1m': '1m', '5m': '5m', '15m': '15m', '1h': '1h', '4h': '4h', '1d': '1d', '1w': '1w', '1M': '1M' };
    const binanceInterval = intervalMap[interval] || '1h';
    const cacheKey = `binance:klines:${binanceSymbol}:${binanceInterval}:${limit}`;

    const cached = get(cacheKey, ttlFor('candles', interval));
    if (cached) {
      res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
      return res.status(200).json(cached);
    }

    const response = await fetch(
      `${BINANCE_BASE}/klines?symbol=${binanceSymbol}&interval=${binanceInterval}&limit=${limit}`
    );
    if (!response.ok) throw new Error('Binance klines fetch failed');
    const data = await response.json();

    const candles = data.map(d => ({
      time: d[0] / 1000,
      open: parseFloat(d[1]),
      high: parseFloat(d[2]),
      low: parseFloat(d[3]),
      close: parseFloat(d[4]),
      volume: parseFloat(d[5]),
    }));

    set(cacheKey, candles);
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
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
