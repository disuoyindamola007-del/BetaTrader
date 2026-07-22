// Simple in-memory cache for the browser session.
// Scoped per-user automatically since it's client-side.

const store = new Map();

export function get(key, ttlMs = 30000) {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.data;
}

export function set(key, data, ttlMs = 30000) {
  store.set(key, { data, expiresAt: Date.now() + ttlMs });
}

export function del(key) {
  store.delete(key);
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
