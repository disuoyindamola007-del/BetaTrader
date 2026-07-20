// API Keys from environment variables (Vite exposes VITE_ prefixed vars)
const TWELVE_DATA_API_KEY = import.meta.env.VITE_TWELVEDATA_API_KEY || '';
const ALPHA_VANTAGE_API_KEY = import.meta.env.VITE_ALPHAVANTAGE_API_KEY || '';
const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY || '';

const BINANCE_BASE = 'https://api.binance.com/api/v3';

// ==================== BINANCE (FREE - NO KEY NEEDED) ====================

export async function fetchBinanceAllTickers() {
  try {
    const response = await fetch(`${BINANCE_BASE}/ticker/24hr`);
    if (!response.ok) throw new Error('Binance API error');
    const data = await response.json();

    const usdtPairs = data.filter(t => t.symbol.endsWith('USDT'));
    const formatted = {};

    usdtPairs.forEach(t => {
      const symbol = t.symbol.replace('USDT', '');
      formatted[symbol] = {
        price: parseFloat(t.lastPrice),
        change: parseFloat(t.priceChange),
        changePct: parseFloat(t.priceChangePercent),
        high24h: parseFloat(t.highPrice),
        low24h: parseFloat(t.lowPrice),
        volume: parseFloat(t.volume),
        quoteVolume: parseFloat(t.quoteVolume),
      };
    });

    return formatted;
  } catch (error) {
    console.error('Binance fetch error:', error);
    return null;
  }
}

export async function fetchBinancePrices(symbols) {
  const allData = await fetchBinanceAllTickers();
  if (!allData) return null;

  const results = {};
  symbols.forEach(symbol => {
    const cleanSymbol = symbol.replace('/', '');
    if (allData[cleanSymbol]) {
      results[symbol] = allData[cleanSymbol];
    }
  });
  return results;
}

// ==================== TWELVEDATA (NEEDS API KEY) ====================

export async function fetchTwelveDataBatch(symbols) {
  if (!TWELVE_DATA_API_KEY) return null;
  try {
    const symbolString = symbols.join(',');
    const response = await fetch(
      `https://api.twelvedata.com/price?symbol=${symbolString}&apikey=${TWELVE_DATA_API_KEY}`
    );
    return await response.json();
  } catch (error) {
    console.error('TwelveData batch error:', error);
    return null;
  }
}

// ==================== ALPHA VANTAGE (NEEDS API KEY) ====================

export async function fetchAlphaVantageData(symbol, function_type = 'TIME_SERIES_DAILY') {
  if (!ALPHA_VANTAGE_API_KEY) return null;
  try {
    const response = await fetch(
      `https://www.alphavantage.co/query?function=${function_type}&symbol=${symbol}&apikey=${ALPHA_VANTAGE_API_KEY}`
    );
    return await response.json();
  } catch (error) {
    console.error('AlphaVantage error:', error);
    return null;
  }
}

// ==================== GROQ AI (NEEDS API KEY) ====================

export async function fetchGroqAnalysis(prompt) {
  if (!GROQ_API_KEY) return null;
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama3-8b-8192',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 500,
      }),
    });
    const data = await response.json();
    return data.choices?.[0]?.message?.content || null;
  } catch (error) {
    console.error('Groq error:', error);
    return null;
  }
}

// ==================== COMBINED DATA FETCHER ====================

export async function fetchAllMarketData() {
  const cryptoData = await fetchBinanceAllTickers();
  let forexData = null;
  if (TWELVE_DATA_API_KEY) {
    forexData = await fetchTwelveDataBatch(['EUR/USD', 'USD/JPY', 'GBP/USD', 'AUD/USD', 'USD/CAD', 'USD/CHF', 'GBP/JPY', 'EUR/JPY']);
  }
  return { cryptoData, forexData };
}
