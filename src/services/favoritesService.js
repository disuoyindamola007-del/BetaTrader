import { scopedStorageKey } from './userStorageScope.js';
import { supabase } from '../lib/supabaseClient.js';

const STORAGE_KEY = 'betatrader:favorites:v1';
function loadFavorites() { try { const raw = localStorage.getItem(scopedStorageKey(STORAGE_KEY)); const parsed = raw ? JSON.parse(raw) : []; return Array.isArray(parsed) ? parsed : []; } catch { return []; } }
function saveFavorites(symbols) { try { localStorage.setItem(scopedStorageKey(STORAGE_KEY), JSON.stringify(symbols)); } catch { /* storage unavailable */ } }
export function getFavorites() { return loadFavorites(); }
export function isFavorite(symbol) { return Boolean(symbol && loadFavorites().includes(symbol)); }
export function toggleFavorite(symbol) {
  if (!symbol) return loadFavorites();
  const current = loadFavorites(); const updated = current.includes(symbol) ? current.filter(s => s !== symbol) : [...current, symbol]; saveFavorites(updated);
  if (supabase) supabase.auth.getUser().then(({ data }) => { if (!data.user) return; if (updated.includes(symbol)) supabase.from('favorites').upsert({ user_id: data.user.id, symbol, metadata: {} }, { onConflict: 'user_id,symbol' }); else supabase.from('favorites').delete().eq('user_id', data.user.id).eq('symbol', symbol); }).catch(() => {});
  return updated;
}
export async function hydrateFavorites() {
  if (!supabase) return loadFavorites(); const { data: auth } = await supabase.auth.getUser(); if (!auth?.user) return loadFavorites();
  const { data, error } = await supabase.from('favorites').select('symbol').eq('user_id', auth.user.id); if (error) throw error;
  const symbols = (data || []).map(row => row.symbol); saveFavorites(symbols); return symbols;
}
