// Direct test of Kraken candle fetch with same logic as main endpoint
export default async function handler(req, res) {
  const { symbol = 'BTC', interval = '1m', limit = '5' } = req.query;

  const KRAKEN_BASE = 'https://api.kraken.com/0/public';

  const KRAKEN_SYMBOL_MAP = {
    BTC: 'XXBTZUSD',
    ETH: 'XETHZUSD',
    SOL: 'SOLUSD',
    XRP: 'XXRPZUSD',
    ADA: 'ADAUSD',
    DOT: 'DOTUSD',
    LINK: 'LINKUSD',
    DOGE: 'XDGEUSD',
    AVAX: 'AVAXUSD',
  };

  const KRAKEN_INTERVAL_MAP = {
    '1m': 1,
    '5m': 5,
    '15m': 15,
  };

  const krakenPair = KRAKEN_SYMBOL_MAP[symbol.toUpperCase().replace('/', '')];
  const krakenInterval = KRAKEN_INTERVAL_MAP[interval];

  if (!krakenPair) {
    return res.status(400).json({ error: `Unsupported symbol: ${symbol}` });
  }
  if (!krakenInterval) {
    return res.status(400).json({ error: `Unsupported interval: ${interval}` });
  }

  const url = `${KRAKEN_BASE}/OHLC?pair=${encodeURIComponent(krakenPair)}&interval=${krakenInterval}`;

  try {
    console.log('Fetching:', url);
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    console.log('Status:', response.status);

    if (!response.ok) {
      return res.status(response.status).json({ error: `HTTP ${response.status}` });
    }

    const data = await response.json();

    if (data.error && data.error.length > 0) {
      return res.status(500).json({ error: data.error });
    }

    const result = data.result;
    const pairKey = Object.keys(result).find(k => k !== 'last');
    const candles = result[pairKey];

    const limited = candles.slice(-parseInt(limit));

    const formatted = limited.map(candle => ({
      time: Math.floor(candle[0]), // Kraken returns seconds
      open: parseFloat(candle[1]),
      high: parseFloat(candle[2]),
      low: parseFloat(candle[3]),
      close: parseFloat(candle[4]),
      volume: parseFloat(candle[6]),
    }));

    // Check time intervals
    const timeDiffs = [];
    for (let i = 1; i < formatted.length; i++) {
      timeDiffs.push(formatted[i].time - formatted[i-1].time);
    }

    return res.status(200).json({
      success: true,
      count: formatted.length,
      candles: formatted,
      timeDiffs: timeDiffs,
      expectedInterval: krakenInterval * 60,
      allCorrect: timeDiffs.every(d => d === krakenInterval * 60),
    });

  } catch (error) {
    return res.status(500).json({
      error: error.message,
      name: error.name,
      timeout: error.name === 'AbortError',
    });
  }
}
