// Test endpoint to check if Vercel can reach Binance API
export default async function handler(req, res) {
  const BINANCE_BASE = 'https://api.binance.com/api/v3';

  try {
    const url = `${BINANCE_BASE}/klines?symbol=BTCUSDT&interval=1m&limit=5`;
    console.log('Testing Binance connection:', url);

    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000)
    });

    console.log('Binance response status:', response.status);

    if (!response.ok) {
      return res.status(response.status).json({
        error: `HTTP ${response.status}`,
        status: response.status,
        statusText: response.statusText,
      });
    }

    const data = await response.json();

    return res.status(200).json({
      success: true,
      count: Array.isArray(data) ? data.length : 0,
      sample: Array.isArray(data) ? data.slice(0, 2) : data,
      timestamps: Array.isArray(data) ? data.map(d => ({
        time: d[0],
        diff: data[data.indexOf(d) + 1] ? data[data.indexOf(d) + 1][0] - d[0] : 0,
      })) : [],
    });

  } catch (error) {
    console.error('Binance test failed:', error.message);
    return res.status(500).json({
      error: error.message,
      name: error.name,
      timeout: error.name === 'AbortError',
    });
  }
}
