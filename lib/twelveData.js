// TwelveData response parser — handles batch (object keyed by symbol) and single (flat object)

export function parseTdQuote(data, requestedSymbols) {
  // Batch: { AAPL: {...}, EUR/USD: {...} }
  // Single: { symbol: 'AAPL', close: '...', ... }
  const isBatch = data && typeof data === 'object' && !data.symbol && !data.close && !data.price;

  if (!isBatch) {
    // Single response
    const s = requestedSymbols[0];
    return { [s]: normalizeQuote(data) };
  }

  // Batch response
  const result = {};
  for (const sym of requestedSymbols) {
    const raw = data[sym];
    if (raw) result[sym] = normalizeQuote(raw);
  }
  return result;
}

function normalizeQuote(raw) {
  if (!raw) return null;
  return {
    price: parseFloat(raw.close || raw.price || 0),
    change: parseFloat(raw.change || 0),
    changePct: parseFloat(raw.percent_change || 0),
    high24h: parseFloat(raw.high || 0),
    low24h: parseFloat(raw.low || 0),
    volume: parseFloat(raw.volume || 0),
    quoteVolume: parseFloat(raw.volume || 0) * parseFloat(raw.close || raw.price || 0),
  };
}

export function checkTdError(data) {
  if (data?.status === 'error') {
    const msg = data.message || 'TwelveData API error';
    // Detect rate limit
    const isRateLimit = msg.toLowerCase().includes('limit') ||
                        msg.toLowerCase().includes('quota') ||
                        msg.toLowerCase().includes('credits') ||
                        msg.toLowerCase().includes('run out');
    const err = new Error(msg);
    err.rateLimited = isRateLimit;
    throw err;
  }
  if (data?.code) {
    const msg = data.message || `TwelveData error code ${data.code}`;
    const isRateLimit = data.code === 429 || msg.toLowerCase().includes('limit');
    const err = new Error(msg);
    err.rateLimited = isRateLimit;
    throw err;
  }
}
