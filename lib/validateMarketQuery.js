const ALLOWED_INTERVALS = new Set(['1m', '5m', '15m', '1h', '4h', '1d', '1w']);
const ALLOWED_TYPES = new Set(['quote', 'candles']);

export function validateMarketQuery({
  symbol,
  interval,
  type,
  size,
  sizeName = 'outputsize',
  maxSymbols = 20,
  maxSize = 500,
}) {
  if (typeof symbol !== 'string' || !symbol.trim()) {
    return { error: 'Symbol required' };
  }

  const symbols = symbol.split(',').map(value => value.trim()).filter(Boolean);
  if (symbols.length === 0 || symbols.length > maxSymbols) {
    return { error: `Request must contain between 1 and ${maxSymbols} symbols` };
  }

  if (!ALLOWED_INTERVALS.has(interval)) {
    return { error: `Unsupported interval: ${interval}` };
  }

  if (!ALLOWED_TYPES.has(type)) {
    return { error: `Unsupported request type: ${type}` };
  }

  const parsedSize = Number(size);
  if (!Number.isInteger(parsedSize) || parsedSize < 1 || parsedSize > maxSize) {
    return { error: `${sizeName} must be an integer between 1 and ${maxSize}` };
  }

  return { symbols, size: parsedSize };
}
