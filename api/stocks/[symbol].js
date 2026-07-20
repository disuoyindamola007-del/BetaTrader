import { get, set, ttlFor } from '../../lib/cache.js';
import { parseTdQuote, checkTdError } from '../../lib/twelveData.js';
import { isRateLimited, triggerRateLimitCooldown } from '../../lib/rateLimitState.js';

const TWELVE_DATA_BASE = 'https://api.twelvedata.com';

export default async function handler(req, res) {
  const { symbol, interval = '1d', outputsize = '200', type = 'candles' } = req.query;

  if (!symbol) {
    return res.status(400).json({ error: 'Symbol required' });
  }

  const TWELVE_DATA_API_KEY = process.env.TWELVE_DATA_API_KEY;
  const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY;

  const isBatch = symbol.includes(',');
  const symbols = symbol.split(',').map(s => s.trim().toUpperCase());
  const alphaVantageIndexMap = { 'SPX': 'SPY', 'NDX': 'QQQ', 'DJI': 'DIA' };
  const avSymbols = symbols.map(s => alphaVantageIndexMap[s] || s);
  const intervalMap = { '1m': '1min', '5m': '5min', '15m': '15min', '1h': '1h', '4h': '4h', '1d': '1day', '1w': '1week' };
  const tdInterval = intervalMap[interval] || '1day';

  try {
    if (isRateLimited()) {
      return res.status(429).json({ error: 'Rate limit cooldown active — retry shortly', rateLimited: true, retryAfter: 60 });
    }

    if (type === 'quote' || isBatch) {
      if (TWELVE_DATA_API_KEY) {
        const symbolParam = symbols.join(',');
        const cacheKey = `td:quote:stocks:${symbols.sort().join(',')}`;
        const cached = get(cacheKey, ttlFor('batch'));

        let data;
        if (cached) {
          data = cached;
        } else {
          const response = await fetch(
            `${TWELVE_DATA_BASE}/quote?symbol=${encodeURIComponent(symbolParam)}&apikey=${TWELVE_DATA_API_KEY}`
          );
          if (response.status === 429) {
            triggerRateLimitCooldown();
            const err = new Error('TwelveData rate limit reached');
            err.rateLimited = true;
            throw err;
          }
          if (response.ok) {
            data = await response.json();
            checkTdError(data);
            set(cacheKey, data);
          }
        }

        if (data) {
          const parsed = parseTdQuote(data, symbols);
          res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
          return res.status(200).json(parsed);
        }
      }

      if (ALPHA_VANTAGE_API_KEY && !isBatch) {
        const cacheKey = `av:quote:${symbols[0]}`;
        const cached = get(cacheKey, ttlFor('quote'));

        let data;
        if (cached) {
          data = cached;
        } else {
          const response = await fetch(
            `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${avSymbols[0]}&apikey=${ALPHA_VANTAGE_API_KEY}`
          );
          if (!response.ok) throw new Error(`Alpha Vantage quote failed: ${response.status}`);
          data = await response.json();
          set(cacheKey, data);
        }

        const q = data['Global Quote'];
        if (q) {
          return res.status(200).json({
            [symbols[0]]: {
              price: parseFloat(q['05. price']),
              change: parseFloat(q['09. change']),
              changePct: parseFloat(q['10. change percent']?.replace('%', '')),
              high24h: parseFloat(q['03. high']),
              low24h: parseFloat(q['04. low']),
              volume: parseFloat(q['06. volume']),
              quoteVolume: parseFloat(q['06. volume']) * parseFloat(q['05. price']),
            }
          });
        }
      }

      return res.status(503).json({ error: 'No API configured for stocks/indices' });
    }

    // Candles
    if (TWELVE_DATA_API_KEY) {
      const symbolParam = symbols[0];
      const cacheKey = `td:candles:stocks:${symbolParam}:${tdInterval}:${outputsize}`;
      const cached = get(cacheKey, ttlFor('candles', interval));

      let data;
      if (cached) {
        data = cached;
      } else {
        const response = await fetch(
          `${TWELVE_DATA_BASE}/time_series?symbol=${encodeURIComponent(symbolParam)}&interval=${tdInterval}&outputsize=${outputsize}&apikey=${TWELVE_DATA_API_KEY}`
        );
        if (response.status === 429) {
          triggerRateLimitCooldown();
          const err = new Error('TwelveData rate limit reached');
          err.rateLimited = true;
          throw err;
        }
        if (!response.ok) throw new Error(`TwelveData candles fetch failed: ${response.status}`);
        data = await response.json();
        checkTdError(data);
        set(cacheKey, data);
      }

      const candles = (data.values || []).reverse().map(d => ({
        time: Math.floor(new Date(d.datetime).getTime() / 1000),
        open: parseFloat(d.open),
        high: parseFloat(d.high),
        low: parseFloat(d.low),
        close: parseFloat(d.close),
        volume: parseFloat(d.volume),
      }));

      res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
      return res.status(200).json(candles);
    }

    if (ALPHA_VANTAGE_API_KEY) {
      const symbolParam = avSymbols[0];
      const avInterval = interval === '1d' ? 'TIME_SERIES_DAILY' : 'TIME_SERIES_INTRADAY';
      const avIntervalParam = interval === '1d' ? '' : `&interval=${interval}`;
      const cacheKey = `av:candles:${symbolParam}:${interval}`;
      const cached = get(cacheKey, ttlFor('candles', interval));

      let data;
      if (cached) {
        data = cached;
      } else {
        const response = await fetch(
          `https://www.alphavantage.co/query?function=${avInterval}${avIntervalParam}&symbol=${symbolParam}&apikey=${ALPHA_VANTAGE_API_KEY}&outputsize=full`
        );
        if (!response.ok) throw new Error(`Alpha Vantage candles failed: ${response.status}`);
        data = await response.json();
        set(cacheKey, data);
      }

      const timeSeries = data['Time Series (Daily)'] || data[`Time Series (${interval})`];
      if (timeSeries) {
        const candles = Object.entries(timeSeries).slice(0, outputsize).reverse().map(([date, values]) => ({
          time: Math.floor(new Date(date).getTime() / 1000),
          open: parseFloat(values['1. open']),
          high: parseFloat(values['2. high']),
          low: parseFloat(values['3. low']),
          close: parseFloat(values['4. close']),
          volume: parseFloat(values['5. volume']),
        }));

        res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600');
        return res.status(200).json(candles);
      }
    }

    return res.status(503).json({ error: 'No API configured for stocks/indices candles' });

  } catch (error) {
    console.error('Stocks proxy error:', error.message);
    const status = error.rateLimited ? 429 : 500;
    return res.status(status).json({
      error: error.message,
      rateLimited: error.rateLimited || false,
    });
  }
}
