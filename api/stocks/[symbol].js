export default async function handler(req, res) {
  const { symbol, interval = '1d', outputsize = '200', type = 'candles' } = req.query;

  if (!symbol) {
    return res.status(400).json({ error: 'Symbol required' });
  }

  const TWELVE_DATA_API_KEY = process.env.TWELVE_DATA_API_KEY;
  const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY;

  const cleanSymbol = symbol.toUpperCase();
  const intervalMap = { '1m': '1min', '5m': '5min', '15m': '15min', '1h': '1h', '4h': '4h', '1d': '1day', '1w': '1week' };
  const tdInterval = intervalMap[interval] || '1day';

  try {
    if (TWELVE_DATA_API_KEY) {
      if (type === 'quote') {
        const response = await fetch(
          `https://api.twelvedata.com/quote?symbol=${cleanSymbol}&apikey=${TWELVE_DATA_API_KEY}`
        );
        if (response.ok) {
          const data = await response.json();
          if (data.status !== 'error') {
            return res.status(200).json({
              price: parseFloat(data.close || data.price),
              change: parseFloat(data.change),
              changePct: parseFloat(data.percent_change),
              high24h: parseFloat(data.high),
              low24h: parseFloat(data.low),
              volume: parseFloat(data.volume),
              quoteVolume: parseFloat(data.volume) * parseFloat(data.close),
            });
          }
        }
      } else {
        const response = await fetch(
          `https://api.twelvedata.com/time_series?symbol=${cleanSymbol}&interval=${tdInterval}&outputsize=${outputsize}&apikey=${TWELVE_DATA_API_KEY}`
        );
        if (response.ok) {
          const data = await response.json();
          if (data.status !== 'error' && data.values) {
            const candles = data.values.reverse().map(d => ({
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
        }
      }
    }

    if (ALPHA_VANTAGE_API_KEY) {
      if (type === 'quote') {
        const response = await fetch(
          `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${cleanSymbol}&apikey=${ALPHA_VANTAGE_API_KEY}`
        );
        const data = await response.json();
        const q = data['Global Quote'];
        if (q) {
          return res.status(200).json({
            price: parseFloat(q['05. price']),
            change: parseFloat(q['09. change']),
            changePct: parseFloat(q['10. change percent']?.replace('%', '')),
            high24h: parseFloat(q['03. high']),
            low24h: parseFloat(q['04. low']),
            volume: parseFloat(q['06. volume']),
            quoteVolume: parseFloat(q['06. volume']) * parseFloat(q['05. price']),
          });
        }
      } else {
        const avInterval = interval === '1d' ? 'TIME_SERIES_DAILY' : 'TIME_SERIES_INTRADAY';
        const avIntervalParam = interval === '1d' ? '' : `&interval=${interval}`;
        const response = await fetch(
          `https://www.alphavantage.co/query?function=${avInterval}${avIntervalParam}&symbol=${cleanSymbol}&apikey=${ALPHA_VANTAGE_API_KEY}&outputsize=full`
        );
        const data = await response.json();
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
    }

    return res.status(503).json({ error: 'No API keys configured for stocks/indices' });

  } catch (error) {
    console.error('Stocks proxy error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}
