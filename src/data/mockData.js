// Static catalog metadata used for display names, categories, and fallback prices when a live provider is unavailable.
// Live quotes, watchlist membership, journal trades, alerts, news, and market pulse data come from services/hooks.
export const mockAssets = [
  { symbol: 'EUR/USD', name: 'Euro / US Dollar', category: 'forex', price: 1.08542, change: 0.12, changePct: 0.11 },
  { symbol: 'USD/JPY', name: 'US Dollar / Japanese Yen', category: 'forex', price: 157.832, change: -0.45, changePct: -0.28 },
  { symbol: 'GBP/USD', name: 'British Pound / US Dollar', category: 'forex', price: 1.2741, change: 0.08, changePct: 0.06 },
  { symbol: 'AUD/USD', name: 'Australian Dollar / US Dollar', category: 'forex', price: 0.6732, change: -0.12, changePct: -0.18 },
  { symbol: 'USD/CAD', name: 'US Dollar / Canadian Dollar', category: 'forex', price: 1.3685, change: 0.05, changePct: 0.04 },
  { symbol: 'GBP/JPY', name: 'British Pound / Japanese Yen', category: 'forex', price: 201.05, change: 0.32, changePct: 0.16 },
  { symbol: 'EUR/JPY', name: 'Euro / Japanese Yen', category: 'forex', price: 171.35, change: -0.18, changePct: -0.10 },
  { symbol: 'BTC', name: 'Bitcoin', category: 'crypto', price: 67420.50, change: 1560.20, changePct: 2.37 },
  { symbol: 'ETH', name: 'Ethereum', category: 'crypto', price: 3520.15, change: -45.30, changePct: -1.27 },
  { symbol: 'SOL', name: 'Solana', category: 'crypto', price: 168.42, change: 12.80, changePct: 8.23 },
  { symbol: 'XRP', name: 'Ripple', category: 'crypto', price: 0.6234, change: 0.02, changePct: 3.31 },
  { symbol: 'GOLD', name: 'Gold', category: 'metals', price: 2412.80, change: -7.20, changePct: -0.30 },
  { symbol: 'SILVER', name: 'Silver', category: 'metals', price: 31.45, change: 0.25, changePct: 0.80 },
  { symbol: 'OIL', name: 'Crude Oil', category: 'commodities', price: 82.35, change: 1.20, changePct: 1.48 },
  { symbol: 'SPX', name: 'S&P 500', category: 'indices', price: 5587.20, change: 23.40, changePct: 0.42 },
  { symbol: 'NDX', name: 'NASDAQ 100', category: 'indices', price: 20450.80, change: 89.20, changePct: 0.44 },
  { symbol: 'DJI', name: 'Dow Jones', category: 'indices', price: 41250.30, change: -120.50, changePct: -0.29 },
];

// Fallback only: Home calculates trending from live crypto quotes whenever available.
export const trending = {
  gainers: [
    { symbol: 'SOL', changePct: 8.23 },
    { symbol: 'XRP', changePct: 3.31 },
    { symbol: 'BTC', changePct: 2.37 },
  ],
  losers: [
    { symbol: 'ETH', changePct: -1.27 },
    { symbol: 'AUD/USD', changePct: -0.18 },
    { symbol: 'EUR/JPY', changePct: -0.10 },
  ],
};
