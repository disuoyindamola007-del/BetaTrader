export default async function handler(req, res) {
  const { symbol, interval = '1h', outputsize = '200', type = 'candles' } = req.query;

  if (!symbol) {
    return res.status(400).json({ error: 'Symbol required' });
  }

  const TWELVE_DATA_API_KEY = process.env.TWELVE_DATA_API_KEY;
  if (!TWELVE_DATA_API_KEY) {
    return res.status(500).json({ error: 'TWELVE_DATA_API_KEY not configured' });
  }

  const symbolMap = {
    'GOLD': 'XAU/USD',
    'SILVER': 'XAG/USD',
    'OIL': 'WTI',
    'CRUDE': 'WTI',
    'BRENT': 'BRENT',
  };

  const cleanSymbol = symbolMap[symbol.toUpperCase()] || symbol.toUpperCase();
  const intervalMap = { '1m': '1min', '5m': '5min', '15m': '15min', '1h': '1h', '4h': '4h', '1d': '1day', '1w': '1week' };
  const tdInterval = intervalMap[interval] || '1h';

  try {
    if (type === 'quote') {
      const response = await fetch(
        `https://api.twelvedata.com/quote?symbol=${cleanSymbol}&apikey=${TWELVE_DATA_API_KEY}`
      );
      if (!response.ok) throw new Error('TwelveData quote fetch failed');
      const data = await response.json();

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

    const response = await fetch(
      `https://api.twelvedata.com/time_series?symbol=${cleanSymbol}&interval=${tdInterval}&outputsize=${outputsize}&apikey=${TWELVE_DATA_API_KEY}`
    );
    if (!response.ok) throw new Error('TwelveData candles fetch failed');
    const data = await response.json();

    if (data.status === 'error') {
      throw new Error(data.message || 'TwelveData API error');
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

  } catch (error) {
    console.error('Commodities proxy error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}
