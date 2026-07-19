// Read from env vars (Vite exposes these at build time)
const TWELVE_DATA_API_KEY = import.meta.env.VITE_TWELVEDATA_API_KEY || '';
const ALPHA_VANTAGE_API_KEY = import.meta.env.VITE_ALPHAVANTAGE_API_KEY || '';

const BINANCE_BASE = 'https://api.binance.com/api/v3';

export async function fetchBinancePrices(symbols) {
  try {
    const response = await fetch(`${BINANCE_BASE}/ticker/24hr`);
    const allData = await response.json();
    
    const results = {};
    symbols.forEach(symbol => {
      const binanceSymbol = symbol.replace('/', '').toUpperCase() + 'USDT';
      const data = allData.find(d => d.symbol === binanceSymbol);
      if (data) {
        results[symbol] = {
          price: parseFloat(data.lastPrice),
          change: parseFloat(data.priceChange),
          changePct: parseFloat(data.priceChangePercent),
          high24h: parseFloat(data.highPrice),
          low24h: parseFloat(data.lowPrice),
          volume: parseFloat(data.volume),
        };
      }
    });
    return results;
  } catch (error) {
    console.error('Binance error:', error);
    return null;
  }
}

export async function fetchTwelveDataBatch(symbols) {
  if (!TWELVE_DATA_API_KEY) {
    console.warn('TwelveData API key not configured');
    return null;
  }
  try {
    const symbolString = symbols.join(',');
    const response = await fetch(
      `https://api.twelvedata.com/price?symbol=${symbolString}&apikey=${TWELVE_DATA_API_KEY}`
    );
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('TwelveData error:', error);
    return null;
  }
}

export async function fetchAlphaVantageData(symbol, function_type = 'TIME_SERIES_DAILY') {
  if (!ALPHA_VANTAGE_API_KEY) {
    console.warn('AlphaVantage API key not configured');
    return null;
  }
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

