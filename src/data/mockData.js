export const mockAssets = [
  { symbol: 'EUR/USD', name: 'Euro / US Dollar', category: 'forex', price: 1.08542, change: 0.12, changePct: 0.11, bias: 'bullish', confidence: 72 },
  { symbol: 'USD/JPY', name: 'US Dollar / Japanese Yen', category: 'forex', price: 157.832, change: -0.45, changePct: -0.28, bias: 'bearish', confidence: 58 },
  { symbol: 'GBP/USD', name: 'British Pound / US Dollar', category: 'forex', price: 1.2741, change: 0.08, changePct: 0.06, bias: 'neutral', confidence: 45 },
  { symbol: 'AUD/USD', name: 'Australian Dollar / US Dollar', category: 'forex', price: 0.6732, change: -0.12, changePct: -0.18, bias: 'bearish', confidence: 62 },
  { symbol: 'USD/CAD', name: 'US Dollar / Canadian Dollar', category: 'forex', price: 1.3685, change: 0.05, changePct: 0.04, bias: 'neutral', confidence: 38 },
  { symbol: 'USD/CHF', name: 'US Dollar / Swiss Franc', category: 'forex', price: 0.8942, change: -0.08, changePct: -0.09, bias: 'neutral', confidence: 42 },
  { symbol: 'GBP/JPY', name: 'British Pound / Japanese Yen', category: 'forex', price: 201.05, change: 0.32, changePct: 0.16, bias: 'bullish', confidence: 65 },
  { symbol: 'EUR/JPY', name: 'Euro / Japanese Yen', category: 'forex', price: 171.35, change: -0.18, changePct: -0.10, bias: 'neutral', confidence: 50 },
  { symbol: 'BTC', name: 'Bitcoin', category: 'crypto', price: 67420.50, change: 1560.20, changePct: 2.37, bias: 'bullish', confidence: 78 },
  { symbol: 'ETH', name: 'Ethereum', category: 'crypto', price: 3520.15, change: -45.30, changePct: -1.27, bias: 'bearish', confidence: 55 },
  { symbol: 'SOL', name: 'Solana', category: 'crypto', price: 168.42, change: 12.80, changePct: 8.23, bias: 'bullish', confidence: 82 },
  { symbol: 'XRP', name: 'Ripple', category: 'crypto', price: 0.6234, change: 0.02, changePct: 3.31, bias: 'bullish', confidence: 60 },
  { symbol: 'GOLD', name: 'Gold', category: 'metals', price: 2412.80, change: -7.20, changePct: -0.30, bias: 'neutral', confidence: 48 },
  { symbol: 'SILVER', name: 'Silver', category: 'metals', price: 31.45, change: 0.25, changePct: 0.80, bias: 'bullish', confidence: 55 },
  { symbol: 'OIL', name: 'Crude Oil', category: 'commodities', price: 82.35, change: 1.20, changePct: 1.48, bias: 'bullish', confidence: 63 },
  { symbol: 'SPX', name: 'S&P 500', category: 'indices', price: 5587.20, change: 23.40, changePct: 0.42, bias: 'bullish', confidence: 70 },
  { symbol: 'NDX', name: 'NASDAQ 100', category: 'indices', price: 20450.80, change: 89.20, changePct: 0.44, bias: 'bullish', confidence: 68 },
  { symbol: 'DJI', name: 'Dow Jones', category: 'indices', price: 41250.30, change: -120.50, changePct: -0.29, bias: 'neutral', confidence: 52 },
];

export const marketPulse = [
  { label: 'Fear & Greed', value: '45', sublabel: 'Neutral', color: 'warning' },
  { label: 'BTC Dom', value: '57.2%', sublabel: 'High', color: 'emerald' },
  { label: 'DXY', value: '104.2', sublabel: 'Strong', color: 'emerald' },
  { label: 'VIX', value: '14.3', sublabel: 'Low', color: 'emerald' },
  { label: 'Gold', value: '$2,413', sublabel: 'Flat', color: 'neutral' },
  { label: 'Oil', value: '$82.4', sublabel: 'Rising', color: 'emerald' },
];

export const watchlist = ['EUR/USD', 'BTC', 'GOLD', 'SOL', 'SPX'];

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

export const newsItems = [
  {
    id: 1,
    headline: 'Fed signals potential rate cut in September meeting',
    source: 'Bloomberg',
    time: '2h ago',
    related: ['EUR/USD', 'DXY', 'GOLD'],
    summary: 'Federal Reserve officials hinted at a possible 25bp rate reduction, boosting risk assets and pressuring the dollar.',
  },
  {
    id: 2,
    headline: 'Bitcoin breaks above $67K as ETF inflows surge',
    source: 'CoinDesk',
    time: '4h ago',
    related: ['BTC', 'ETH', 'SOL'],
    summary: 'Spot Bitcoin ETFs saw $890M in net inflows this week, the highest since March.',
  },
  {
    id: 3,
    headline: 'Oil prices climb on Middle East supply concerns',
    source: 'Reuters',
    time: '5h ago',
    related: ['OIL', 'USD/CAD'],
    summary: 'Geopolitical tensions in the Strait of Hormuz raised supply disruption fears.',
  },
  {
    id: 4,
    headline: 'NFP data beats expectations, unemployment drops to 4.1%',
    source: 'ForexLive',
    time: '8h ago',
    related: ['EUR/USD', 'USD/JPY', 'DXY'],
    summary: 'Non-farm payrolls added 275K jobs vs 225K expected, but wage growth slowed.',
  },
];

export const economicEvents = [
  { time: '20:30', country: 'USD', event: 'Non-Farm Payrolls', impact: 'high', forecast: '225K', previous: '272K', actual: '275K' },
  { time: '22:00', country: 'USD', event: 'ISM Manufacturing PMI', impact: 'medium', forecast: '48.5', previous: '48.7', actual: null },
  { time: '08:30', country: 'EUR', event: 'ECB Interest Rate Decision', impact: 'high', forecast: '4.25%', previous: '4.25%', actual: null },
  { time: '14:00', country: 'GBP', event: 'BoE Governor Speech', impact: 'medium', forecast: '-', previous: '-', actual: null },
];

export const aiBriefing = {
  sentiment: 'Neutral-Bullish',
  confidence: 72,
  summary: 'Markets are showing cautious optimism after the Fed\'s dovish signals. Risk assets like crypto and equities are bid, while the dollar faces mild pressure. Key risk remains tomorrow\'s ISM data.',
  volatility: 'Moderate',
  keyLevels: {
    'EUR/USD': { support: '1.0820', resistance: '1.0900' },
    'BTC': { support: '65,200', resistance: '69,500' },
    'GOLD': { support: '2,380', resistance: '2,450' },
  },
};

export const assetDetails = {
  'EUR/USD': {
    price: 1.08542,
    change: 0.12,
    changePct: 0.11,
    high24: 1.0875,
    low24: 1.0821,
    volume: '89.2B',
    trend: 'CONSOLIDATING',
    rsi: 52,
    rsiSignal: 'Neutral',
    macd: { line: -0.0001, signal: -0.0000, hist: -0.0000 },
    bollinger: { lower: 1.1432, middle: 1.1439, upper: 1.1445 },
    support: 1.1407,
    resistance: 1.1482,
    technicalSignal: 'STAY OUT — Market consolidating or lack of trend alignment',
    signalType: 'neutral',
  },
};

export const backtestResults = {
  status: 'mixed',
  statusLabel: 'MIXED RESULTS',
  statusDesc: 'Win rate between 45-60% or inconsistent R:R. Trade with caution.',
  dataRange: '2008-08-08 → 2026-06-25',
  totalSetups: 250,
  winRate: 47.6,
  avgFavorable: 169.8,
  avgAdverse: -196.4,
  bestCase: 905,
  worstCase: -897,
  avgRR: '1:0.86',
  wins: 119,
  losses: 131,
};

export const journalTrades = [
  {
    id: 1,
    asset: 'EUR/USD',
    direction: 'buy',
    entry: 1.0820,
    exit: 1.0895,
    stopLoss: 1.0790,
    takeProfit: 1.0900,
    lotSize: 0.05,
    result: 'win',
    pips: 75,
    pl: 375,
    date: '2026-07-15',
    timeframe: '4H',
    emotion: 'calm',
    strategy: 'Breakout',
    notes: 'Clean breakout above resistance with volume confirmation.',
  },
  {
    id: 2,
    asset: 'BTC',
    direction: 'buy',
    entry: 65200,
    exit: 64800,
    stopLoss: 64500,
    takeProfit: 67000,
    lotSize: 0.01,
    result: 'loss',
    pips: -400,
    pl: -400,
    date: '2026-07-14',
    timeframe: '1D',
    emotion: 'anxious',
    strategy: 'Trend Following',
    notes: 'Entered too early before the actual breakout.',
  },
  {
    id: 3,
    asset: 'GOLD',
    direction: 'sell',
    entry: 2430,
    exit: 2410,
    stopLoss: 2445,
    takeProfit: 2400,
    lotSize: 0.02,
    result: 'win',
    pips: 200,
    pl: 400,
    date: '2026-07-12',
    timeframe: '1H',
    emotion: 'confident',
    strategy: 'Reversal',
    notes: 'Perfect rejection at the daily resistance zone.',
  },
];

export const alerts = [
  { id: 1, asset: 'EUR/USD', type: 'price', condition: 'above', value: '1.0900', status: 'active' },
  { id: 2, asset: 'BTC', type: 'price', condition: 'below', value: '65,000', status: 'active' },
  { id: 3, asset: 'GOLD', type: 'indicator', condition: 'RSI(14) above', value: '70', status: 'triggered' },
];
