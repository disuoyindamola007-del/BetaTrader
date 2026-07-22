// Shared cache backed by Supabase Postgres.
// Persists across ALL serverless instances (unlike the old in-memory Map),
// so one user's fetch benefits every concurrent user within the TTL window.

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function get(key, ttlMs = 30000) {
  const { data, error } = await supabase
    .from('cache')
    .select('value, expires_at')
    .eq('key', key)
    .maybeSingle();

  if (error || !data) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) {
    supabase.from('cache').delete().eq('key', key).then(() => {});
    return null;
  }
  return data.value;
}

export async function set(key, data, ttlMs = 30000) {
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  await supabase
    .from('cache')
    .upsert({ key, value: data, expires_at: expiresAt }, { onConflict: 'key' });
}

export async function del(key) {
  await supabase.from('cache').delete().eq('key', key);
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
