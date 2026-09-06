import { scopedStorageKey } from './userStorageScope.js';
import { supabase } from '../lib/supabaseClient.js';
import { reportCloudSyncError } from './cloudSyncStatus.js';

const STORAGE_KEY = 'betatrader:journal:v1';
const PENDING_KEY = 'betatrader:journal:pending:v1';

function loadTrades() {
  try {
    const raw = localStorage.getItem(scopedStorageKey(STORAGE_KEY));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
function saveTrades(trades) {
  try { localStorage.setItem(scopedStorageKey(STORAGE_KEY), JSON.stringify(trades)); } catch { /* storage unavailable */ }
}
function loadPending() {
  try {
    const raw = localStorage.getItem(scopedStorageKey(PENDING_KEY));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
function savePending(ids) {
  try { localStorage.setItem(scopedStorageKey(PENDING_KEY), JSON.stringify(ids)); } catch { /* storage unavailable */ }
}
function markPending(id) { savePending([...new Set([...loadPending(), String(id)])]); }
function clearPending(id) { savePending(loadPending().filter(value => value !== String(id))); }

export function getTrades() { return loadTrades(); }

function row(trade, userId) {
  return {
    user_id: userId, asset: trade.asset, category: trade.category || trade.assetClass || null,
    provider: trade.provider || null,
    direction: trade.direction === 'buy' ? 'long' : trade.direction === 'sell' ? 'short' : trade.direction,
    status: trade.status || 'closed', entry: trade.entry ?? null, exit: trade.exit ?? null,
    stop_loss: trade.stopLoss ?? trade.stop_loss ?? null, take_profit: trade.takeProfit ?? trade.take_profit ?? null,
    quantity: trade.quantity ?? null, capital: trade.capital ?? null, leverage: trade.leverage ?? null,
    lot_type: trade.lotType ?? trade.lot_type ?? null, lot_size: trade.lotSize ?? trade.lot_size ?? null,
    result: trade.result || null, pl: trade.pl ?? null,
    traded_at: trade.tradedAt || trade.traded_at || trade.date || new Date().toISOString(),
    timeframe: trade.timeframe || null, emotion: trade.emotion || null, bias: trade.bias || null,
    strategy: trade.strategy || null, notes: trade.notes || null,
    client_id: String(trade.clientId || trade.client_id || trade.id || Date.now()),
  };
}
function sync(promise) { promise.catch(error => reportCloudSyncError('journalService', error)); }

export function createTrade(trade) {
  const newTrade = { id: Date.now(), date: new Date().toISOString().slice(0, 10), ...trade };
  const updated = [newTrade, ...loadTrades()];
  saveTrades(updated);
  markPending(newTrade.id);
  if (supabase) sync(supabase.auth.getUser().then(async ({ data, error: authError }) => {
    if (authError) throw authError;
    if (!data.user) throw new Error('No authenticated user available for journal sync.');
    // Use INSERT for the create path. A fresh client_id cannot conflict, and
    // returning the row makes schema/RLS failures observable before clearing
    // the local pending marker.
    const { error } = await supabase.from('journal_trades').insert(row(newTrade, data.user.id));
    if (error) throw error;
    clearPending(newTrade.id);
  }));
  return updated;
}

export function updateTrade(id, updates) {
  const updated = loadTrades().map(t => t.id === id ? { ...t, ...updates } : t);
  saveTrades(updated);
  markPending(id);
  if (supabase) sync(supabase.auth.getUser().then(async ({ data }) => {
    if (!data.user) return;
    const payload = row({ ...updated.find(t => t.id === id), ...updates }, data.user.id);
    // Update preserves the existing public API contract and test/mocking
    // behavior; the payload includes user_id for RLS-safe matching.
    const { error } = await supabase.from('journal_trades')
      .update(payload)
      .eq('user_id', data.user.id)
      .eq('client_id', String(id));
    if (error) throw error;
    clearPending(id);
  }));
  return updated;
}

export function deleteTrade(id) {
  const updated = loadTrades().filter(t => t.id !== id);
  saveTrades(updated);
  if (supabase) sync(supabase.auth.getUser().then(({ data }) => data.user && supabase.from('journal_trades').delete().eq('user_id', data.user.id).eq('client_id', String(id))));
  return updated;
}

export async function hydrateTrades() {
  if (!supabase) return loadTrades();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return loadTrades();
  const { data, error } = await supabase.from('journal_trades').select('*').eq('user_id', auth.user.id).order('traded_at', { ascending: false });
  if (error) throw error;
  const cloudTrades = (data || []).map(t => ({
    ...t, id: t.client_id || t.id, assetClass: t.category,
    direction: t.direction === 'long' ? 'buy' : t.direction === 'short' ? 'sell' : t.direction,
    stopLoss: t.stop_loss, takeProfit: t.take_profit, lotSize: t.lot_size,
    lotType: t.lot_type, clientId: t.client_id, date: t.traded_at,
  }));
  // Do not let an empty/stale local cache erase cloud data. Keep only local
  // records explicitly marked pending, then merge them with the cloud result.
  const cloudIds = new Set(cloudTrades.map(t => String(t.id)));
  const pending = new Set(loadPending());
  const unsynced = loadTrades().filter(t => pending.has(String(t.id)) && !cloudIds.has(String(t.id)));
  const trades = [...unsynced, ...cloudTrades];
  saveTrades(trades);
  return trades;
}
