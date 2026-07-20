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

// ==================== BINANCE KLINES (HISTORICAL CANDLES) ====================

const INTERVAL_MAP = {
  '1m': '1m', '5m': '5m', '15m': '15m', '1h': '1h',
  '4h': '4h', '1d': '1d', '1w': '1w', '1M': '1M',
};

export async function fetchBinanceKlines(symbol, interval = '1h', limit = 200) {
  try {
    const binanceSymbol = symbol.replace('/', '') + 'USDT';
    const binanceInterval = INTERVAL_MAP[interval] || '1h';
    const response = await fetch(
      `${BINANCE_BASE}/klines?symbol=${binanceSymbol}&interval=${binanceInterval}&limit=${limit}`
    );
    if (!response.ok) throw new Error('Klines fetch failed');
    const data = await response.json();

    return data.map(d => ({
      time: d[0] / 1000,
      open: parseFloat(d[1]),
      high: parseFloat(d[2]),
      low: parseFloat(d[3]),
      close: parseFloat(d[4]),
      volume: parseFloat(d[5]),
    }));
  } catch (error) {
    console.error('Klines fetch error:', error);
    return [];
  }
}

export async function fetchBinance24h(symbol) {
  try {
    const binanceSymbol = symbol.replace('/', '') + 'USDT';
    const response = await fetch(`${BINANCE_BASE}/ticker/24hr?symbol=${binanceSymbol}`);
    if (!response.ok) throw new Error('24h fetch failed');
    const data = await response.json();
    return {
      price: parseFloat(data.lastPrice),
      change: parseFloat(data.priceChange),
      changePct: parseFloat(data.priceChangePercent),
      high24h: parseFloat(data.highPrice),
      low24h: parseFloat(data.lowPrice),
      volume: parseFloat(data.volume),
      quoteVolume: parseFloat(data.quoteVolume),
    };
  } catch (error) {
    console.error('24h fetch error:', error);
    return null;
  }
}

// ==================== MOCK DATA GENERATOR (NON-CRYPTO) ====================

const MOCK_BASE_PRICES = {
  'EUR/USD': 1.09, 'USD/JPY': 157.5, 'GBP/USD': 1.27, 'AUD/USD': 0.66,
  'USD/CAD': 1.37, 'USD/CHF': 0.89, 'GBP/JPY': 201, 'EUR/JPY': 171.35,
  'GOLD': 2412.80, 'SILVER': 31.45, 'OIL': 82.35,
  'SPX': 5587.20, 'NDX': 20450.80, 'DJI': 41250.30,
};

// Realistic daily volumes by asset class (in base currency units)
const REALISTIC_VOLUMES = {
  'EUR/USD': { min: 800e9, max: 1200e9 },      // ~$1T daily
  'USD/JPY': { min: 600e9, max: 900e9 },
  'GBP/USD': { min: 300e9, max: 500e9 },
  'AUD/USD': { min: 100e9, max: 200e9 },
  'USD/CAD': { min: 150e9, max: 250e9 },
  'USD/CHF': { min: 100e9, max: 200e9 },
  'GBP/JPY': { min: 80e9, max: 150e9 },
  'EUR/JPY': { min: 100e9, max: 200e9 },
  'GOLD': { min: 15e9, max: 30e9 },              // Gold futures
  'SILVER': { min: 3e9, max: 8e9 },
  'OIL': { min: 20e9, max: 40e9 },               // WTI/Brent
  'SPX': { min: 80e9, max: 150e9 },              // S&P futures
  'NDX': { min: 40e9, max: 80e9 },
  'DJI': { min: 20e9, max: 40e9 },
};

function getRealisticVolume(symbol) {
  const vol = REALISTIC_VOLUMES[symbol];
  if (!vol) return Math.random() * 1e9;
  return vol.min + Math.random() * (vol.max - vol.min);
}

export function generateMockCandles(symbol, count = 200, interval = '1h') {
  const base = MOCK_BASE_PRICES[symbol] || 100;
  const volatility = symbol.includes('JPY') ? 0.003 : symbol.includes('EUR') || symbol.includes('GBP') ? 0.002 : 0.008;
  const intervalSeconds = { '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400, '1w': 604800 };
  const step = intervalSeconds[interval] || 3600;

  const candles = [];
  let price = base;
  const now = Math.floor(Date.now() / 1000);

  for (let i = count; i > 0; i--) {
    const change = (Math.random() - 0.5) * volatility;
    const open = price;
    const close = price * (1 + change);
    const high = Math.max(open, close) * (1 + Math.random() * volatility * 0.3);
    const low = Math.min(open, close) * (1 - Math.random() * volatility * 0.3);
    candles.push({
      time: now - i * step,
      open, high, low, close,
      volume: getRealisticVolume(symbol) / (86400 / step) * (0.5 + Math.random()),
    });
    price = close;
  }
  return candles;
}

export function generateMock24h(symbol) {
  const base = MOCK_BASE_PRICES[symbol] || 100;
  const change = (Math.random() - 0.5) * 0.015; // More realistic daily change
  return {
    price: base * (1 + change),
    change: base * change,
    changePct: change * 100,
    high24h: base * (1 + Math.abs(change) + Math.random() * 0.005),
    low24h: base * (1 - Math.abs(change) - Math.random() * 0.005),
    volume: getRealisticVolume(symbol),
    quoteVolume: getRealisticVolume(symbol) * base,
  };
}

// ==================== TECHNICAL INDICATORS ====================

export function calcEMA(data, period) {
  const k = 2 / (period + 1);
  let ema = data[0].close;
  const result = [];
  for (let i = 0; i < data.length; i++) {
    if (i === 0) { result.push(ema); continue; }
    ema = data[i].close * k + ema * (1 - k);
    result.push(ema);
  }
  return result;
}

export function calcRSI(data, period = 14) {
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const change = data[i].close - data[i - 1].close;
    if (change > 0) gains += change; else losses -= change;
  }
  let avgGain = gains / period, avgLoss = losses / period;
  const rsi = [50];
  for (let i = period + 1; i < data.length; i++) {
    const change = data[i].close - data[i - 1].close;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsi.push(100 - (100 / (1 + rs)));
  }
  return rsi;
}

export function calcBollinger(data, period = 20, mult = 2) {
  const upper = [], lower = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) { upper.push(data[i].close); lower.push(data[i].close); continue; }
    const slice = data.slice(i - period + 1, i + 1);
    const mean = slice.reduce((a, b) => a + b.close, 0) / period;
    const variance = slice.reduce((a, b) => a + Math.pow(b.close - mean, 2), 0) / period;
    const std = Math.sqrt(variance);
    upper.push(mean + mult * std);
    lower.push(mean - mult * std);
  }
  return { upper, lower };
}

export function isCrypto(symbol) {
  const s = symbol.replace('/', '');
  return ['BTC', 'ETH', 'SOL', 'XRP', 'BNB', 'ADA', 'DOT', 'LINK', 'DOGE', 'AVAX'].includes(s);
}

export function getBinanceSymbol(symbol) {
  return symbol.replace('/', '') + 'USDT';
}
