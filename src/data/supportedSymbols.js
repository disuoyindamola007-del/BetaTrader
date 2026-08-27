// Searchable symbols supported by BetaTrader's market-data routes.
// Stock discovery is handled server-side through Finnhub; these are the
// non-stock instruments that can be identified without a provider search call.
export const supportedSymbols = [
  { symbol: 'BTC', name: 'Bitcoin', category: 'crypto' },
  { symbol: 'ETH', name: 'Ethereum', category: 'crypto' },
  { symbol: 'SOL', name: 'Solana', category: 'crypto' },
  { symbol: 'XRP', name: 'XRP', category: 'crypto' },
  { symbol: 'BNB', name: 'BNB', category: 'crypto' },
  { symbol: 'ADA', name: 'Cardano', category: 'crypto' },
  { symbol: 'DOGE', name: 'Dogecoin', category: 'crypto' },
  { symbol: 'LINK', name: 'Chainlink', category: 'crypto' },
  { symbol: 'EUR/USD', name: 'Euro / US Dollar', category: 'forex' },
  { symbol: 'GBP/USD', name: 'British Pound / US Dollar', category: 'forex' },
  { symbol: 'USD/JPY', name: 'US Dollar / Japanese Yen', category: 'forex' },
  { symbol: 'AUD/USD', name: 'Australian Dollar / US Dollar', category: 'forex' },
  { symbol: 'USD/CAD', name: 'US Dollar / Canadian Dollar', category: 'forex' },
  { symbol: 'USD/CHF', name: 'US Dollar / Swiss Franc', category: 'forex' },
  { symbol: 'GBP/JPY', name: 'British Pound / Japanese Yen', category: 'forex' },
  { symbol: 'EUR/JPY', name: 'Euro / Japanese Yen', category: 'forex' },
  { symbol: 'SPX', name: 'S&P 500', category: 'indices' },
  { symbol: 'NDX', name: 'NASDAQ 100', category: 'indices' },
  { symbol: 'DJI', name: 'Dow Jones', category: 'indices' },
  { symbol: 'GOLD', name: 'Gold', category: 'metals' },
];

export function assetFromSearchResult(result) {
  return { ...result, bias: 'neutral', confidence: 50 };
}
