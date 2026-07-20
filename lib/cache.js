// Shared server-side cache for Vercel serverless functions
// Persists across warm invocations of the same function instance

const cache = new Map();

export function get(key, ttlMs) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > ttlMs) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

export function set(key, data) {
  cache.set(key, { data, ts: Date.now() });
}

export function ttlFor(type, interval = '1h') {
  if (type === 'batch') return 30_000;
  if (type === 'quote') return 30_000;
  if (type === 'candles') {
    if (interval === '1m' || interval === '5m') return 30_000;
    if (interval === '15m' || interval === '1h') return 60_000;
    if (interval === '4h' || interval === '1d') return 300_000;
    return 600_000;
  }
  return 30_000;
}
