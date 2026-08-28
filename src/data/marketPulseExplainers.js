export const marketPulseExplainers = {
  'Fear & Greed': {
    title: 'Fear & Greed Index',
    definition: 'A 0–100 snapshot of crypto-market mood, built from signals such as momentum, volatility and demand. Lower readings point to fear, while higher readings point to greed.',
    read: (value, signal) => `The current reading is ${value} (${signal}). Treat it as a sentiment gauge rather than a direction forecast: extreme mood can persist, and it does not guarantee a reversal.`,
  },
  'BTC Dom': {
    title: 'Bitcoin Dominance',
    definition: 'Bitcoin dominance is Bitcoin’s share of the total cryptocurrency market value. It helps show whether capital is concentrating in Bitcoin or spreading into smaller crypto assets.',
    read: (value, signal) => `The current reading is ${value}, classified here as ${signal.toLowerCase()}. A rising share often means Bitcoin is leading, while a falling share can suggest relatively stronger interest in altcoins.`,
  },
  'Crypto 24H': {
    title: 'Crypto Market — 24 Hours',
    definition: 'This measures the percentage change in the total value of the cryptocurrency market over the past 24 hours. It gives a broader view than watching Bitcoin alone.',
    read: (value, signal) => `The market is currently ${signal.toLowerCase()} at ${value} over 24 hours. Positive values indicate broad market value increased; negative values indicate it declined, though individual tokens may move differently.`,
  },
  'S&P 500 ETF': {
    title: 'S&P 500 ETF',
    definition: 'This tracks the daily percentage move of SPY, an exchange-traded fund used as a live proxy for the S&P 500 and large US companies.',
    read: (value, signal) => `SPY is currently ${signal.toLowerCase()} at ${value}. A positive move suggests broad large-cap US equities are gaining in the current session; a negative move suggests they are losing ground.`,
  },
  'Nasdaq ETF': {
    title: 'Nasdaq ETF',
    definition: 'This tracks the daily percentage move of QQQ, an exchange-traded fund used as a live proxy for the Nasdaq-100 and its technology-heavy group of large companies.',
    read: (value, signal) => `QQQ is currently ${signal.toLowerCase()} at ${value}. Its move is often useful for reading technology and growth-stock appetite, but it does not represent every Nasdaq-listed company.`,
  },
  'Gold ETF': {
    title: 'Gold ETF',
    definition: 'This shows the current price of GLD, an exchange-traded fund backed by gold and used here as a liquid market proxy for the metal. It is not the spot gold price per ounce.',
    read: (value, signal) => `GLD is currently ${value} and classified as ${signal.toLowerCase()} from its latest daily move. Rising prices can accompany defensive demand or changing rate and dollar expectations, but the cause depends on the wider market context.`,
  },
};
