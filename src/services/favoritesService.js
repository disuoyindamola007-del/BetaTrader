import { scopedStorageKey } from './userStorageScope.js';
import { supabase } from '../lib/supabaseClient.js';
import { reportCloudSyncError } from './cloudSyncStatus.js';

const STORAGE_KEY = 'betatrader:favorites:v1';
const PENDING_KEY = 'betatrader:favorites:pending:v1';
function loadFavorites() { try { const raw = localStorage.getItem(scopedStorageKey(STORAGE_KEY)); const parsed = raw ? JSON.parse(raw) : []; return Array.isArray(parsed) ? parsed : []; } catch { return []; } }
function saveFavorites(symbols) { try { localStorage.setItem(scopedStorageKey(STORAGE_KEY), JSON.stringify(symbols)); } catch { /* storage unavailable */ } }
function loadPending() { try { const raw = localStorage.getItem(scopedStorageKey(PENDING_KEY)); const parsed = raw ? JSON.parse(raw) : []; return Array.isArray(parsed) ? parsed : []; } catch { return []; } }
function savePending(values) { try { localStorage.setItem(scopedStorageKey(PENDING_KEY), JSON.stringify(values)); } catch { /* storage unavailable */ } }
function setPending(symbol, pending) { const values = loadPending().filter(value => value !== symbol); savePending(pending ? [...values, symbol] : values); }
export function getFavorites() { return loadFavorites(); }
export function isFavorite(symbol) { return Boolean(symbol && loadFavorites().includes(symbol)); }
export function toggleFavorite(symbol) {
  if (!symbol) return loadFavorites();
  const normalized = symbol.toUpperCase().trim();
  const current = loadFavorites(); const updated = current.includes(normalized) ? current.filter(s => s !== normalized) : [...current, normalized]; saveFavorites(updated);
  if (supabase) {
    setPending(normalized, true);
    supabase.auth.getUser().then(async ({ data, error: authError }) => {
      if (authError) throw authError;
      if (!data.user) {
        setPending(normalized, false);
        return;
      }
      const query = updated.includes(normalized)
        ? supabase.from('favorites').upsert({ user_id: data.user.id, symbol: normalized, metadata: {} }, { onConflict: 'user_id,symbol' })
        : supabase.from('favorites').delete().eq('user_id', data.user.id).eq('symbol', normalized);
      const { error } = await query;
      if (error) throw error;
      setPending(normalized, false);
    }).catch(error => reportCloudSyncError('favoritesService', error));
  }
  return updated;
}
export async function hydrateFavorites() {
  if (!supabase) return loadFavorites(); const { data: auth } = await supabase.auth.getUser(); if (!auth?.user) return loadFavorites();
  const { data, error } = await supabase.from('favorites').select('symbol').eq('user_id', auth.user.id); if (error) throw error;
  const symbols = (data || []).map(row => row.symbol); saveFavorites(symbols); return symbols;
}
