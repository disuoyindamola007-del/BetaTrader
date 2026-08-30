// Test endpoint to check if Vercel can reach Kraken API
export default async function handler(req, res) {
  const KRAKEN_BASE = 'https://api.kraken.com/0/public';

  try {
    const url = `${KRAKEN_BASE}/OHLC?pair=XXBTZUSD&interval=1`;
    console.log('Testing Kraken connection:', url);

    const response = await fetch(url, {
      signal: AbortSignal.timeout(15000)
    });

    console.log('Kraken response status:', response.status);

    if (!response.ok) {
      return res.status(response.status).json({
        error: `HTTP ${response.status}`,
        status: response.status,
        statusText: response.statusText,
      });
    }

    const data = await response.json();
    console.log('Kraken response:', JSON.stringify(data).slice(0, 500));

    return res.status(200).json({
      success: true,
      status: response.status,
      data: data,
    });

  } catch (error) {
    console.error('Kraken test failed:', error.message);
    return res.status(500).json({
      error: error.message,
      name: error.name,
      timeout: error.name === 'AbortError',
    });
  }
}
