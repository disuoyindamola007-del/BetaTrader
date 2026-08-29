// Shared cache backed by Supabase Postgres with in-memory fallback.
// Persists across ALL serverless instances (unlike the old in-memory Map),
// so one user's fetch benefits every concurrent user within the TTL window.
// If Supabase is unavailable, falls back to a module-level Map for the
// lifetime of this serverless instance.

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// In-memory fallback — scoped to this serverless instance only.
// Used when Supabase is down, credentials are missing, or the cache table
// doesn't exist yet. Not shared across instances, but better than nothing.
const memoryCache = new Map();
let supabaseHealthy = true;
let supabaseChecked = false;

async function supabaseGet(key) {
  try {
    const { data, error } = await supabase
      .from('cache')
      .select('value, expires_at')
      .eq('key', key)
      .maybeSingle();

    if (error) {
      supabaseHealthy = false;
      console.warn('[Cache] Supabase get() error:', error.message);
      return null;
    }
    if (!data) return null;
    if (new Date(data.expires_at).getTime() < Date.now()) {
      supabase.from('cache').delete().eq('key', key).then(() => {});
      return null;
    }
    supabaseHealthy = true;
    supabaseChecked = true;
    return data.value;
  } catch (err) {
    supabaseHealthy = false;
    console.warn('[Cache] Supabase get() threw:', err.message);
    return null;
  }
}

async function supabaseSet(key, data, ttlMs) {
  try {
    const expiresAt = new Date(Date.now() + ttlMs).toISOString();
    await supabase
      .from('cache')
      .upsert({ key, value: data, expires_at: expiresAt }, { onConflict: 'key' });
    supabaseHealthy = true;
  } catch (err) {
    supabaseHealthy = false;
    console.warn('[Cache] Supabase set() error:', err.message);
  }
}

export async function get(key, ttlMs = 30000) {
  // Try Supabase first if it appears healthy
  if (supabaseHealthy || !supabaseChecked) {
    const result = await supabaseGet(key);
    if (result !== null) return result;
  }

  // Supabase fallback — check memory cache
  const memEntry = memoryCache.get(key);
  if (memEntry && memEntry.expiresAt > Date.now()) {
    return memEntry.value;
  }
  memoryCache.delete(key);
  return null;
}

export async function set(key, data, ttlMs = 30000) {
  const expiresAt = Date.now() + ttlMs;

  // Always write to memory cache (fast, always available)
  memoryCache.set(key, { value: data, expiresAt });

  // Also try Supabase if it appears healthy
  if (supabaseHealthy || !supabaseChecked) {
    await supabaseSet(key, data, ttlMs);
  }
}

export async function del(key) {
  memoryCache.delete(key);
  try {
    await supabase.from('cache').delete().eq('key', key);
  } catch (err) {
    console.warn('[Cache] Supabase del() error:', err.message);
  }
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
