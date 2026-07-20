export default async function handler(req, res) {
  const { symbol, interval = '1h', limit = '200', type = 'klines' } = req.query;

  if (!symbol) {
    return res.status(400).json({ error: 'Symbol required' });
  }

  const BINANCE_BASE = 'https://api.binance.com/api/v3';
  const binanceSymbol = symbol.toUpperCase().replace('/', '') + 'USDT';

  try {
    if (type === '24h') {
      const response = await fetch(`${BINANCE_BASE}/ticker/24hr?symbol=${binanceSymbol}`);
      if (!response.ok) throw new Error('Binance 24h fetch failed');
      const data = await response.json();
      return res.status(200).json({
        price: parseFloat(data.lastPrice),
        change: parseFloat(data.priceChange),
        changePct: parseFloat(data.priceChangePercent),
        high24h: parseFloat(data.highPrice),
        low24h: parseFloat(data.lowPrice),
        volume: parseFloat(data.volume),
        quoteVolume: parseFloat(data.quoteVolume),
      });
    }

    const intervalMap = { '1m': '1m', '5m': '5m', '15m': '15m', '1h': '1h', '4h': '4h', '1d': '1d', '1w': '1w', '1M': '1M' };
    const binanceInterval = intervalMap[interval] || '1h';

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

    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
    return res.status(200).json(candles);

  } catch (error) {
    console.error('Crypto proxy error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}
