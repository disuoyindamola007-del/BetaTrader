// Test Kraken's supported intervals
export default async function handler(req, res) {
  const KRAKEN_BASE = 'https://api.kraken.com/0/public';

  const intervals = [1, 5, 15, 30, 60, 240, 1440];
  const results = {};

  for (const interval of intervals) {
    try {
      const url = `${KRAKEN_BASE}/OHLC?pair=XXRPZUSD&interval=${interval}`;
      const response = await fetch(url, { signal: AbortSignal.timeout(10000) });

      if (!response.ok) {
        results[interval] = { error: `HTTP ${response.status}` };
        continue;
      }

      const data = await response.json();

      if (data.error && data.error.length > 0) {
        results[interval] = { error: data.error.join(', ') };
        continue;
      }

      const result = data.result;
      const pairKey = Object.keys(result).find(k => k !== 'last');
      const candles = result[pairKey];

      if (candles && candles.length > 1) {
        const actualInterval = candles[candles.length - 1][0] - candles[candles.length - 2][0];
        results[interval] = {
          supported: true,
          actualIntervalSec: actualInterval,
          actualIntervalMin: actualInterval / 60,
          candleCount: candles.length,
          lastClose: candles[candles.length - 1][4],
        };
      } else {
        results[interval] = { supported: false, error: 'No candles' };
      }
    } catch (error) {
      results[interval] = { error: error.message };
    }
  }

  return res.status(200).json({ intervals: results });
}
