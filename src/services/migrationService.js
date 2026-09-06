import { scopedStorageKey } from './userStorageScope.js';
import { supabase } from '../lib/supabaseClient.js';

const ITEMS = [
  ['favorites', 'betatrader:favorites:v1'],
  ['journal trades', 'betatrader:journal:v1'],
  ['alerts', 'betatrader:alerts:v1'],
];

function readArray(key) {
  try {
    const values = [localStorage.getItem(key), localStorage.getItem(`${key}:signed-out`)]
      .filter(Boolean).map(value => JSON.parse(value));
    return values.flatMap(value => Array.isArray(value) ? value : []);
  } catch { return []; }
}

export function getLocalMigrationData() {
  return ITEMS.reduce((result, [label, key]) => {
    const values = readArray(key);
    result[label] = { key, values, count: values.length };
    return result;
  }, {});
}

export function hasLocalMigrationData() {
  try {
    if (localStorage.getItem(`${scopedStorageKey('betatrader:migration')}:v1`)) return false;
  } catch { return false; }
  return Object.values(getLocalMigrationData()).some(item => item.count > 0);
}

function clientId(value) {
  return String(value?.clientId || value?.client_id || value?.id || `${value?.asset || value?.symbol || ''}:${value?.date || value?.createdAt || ''}`);
}

function journalRow(value) {
  return {
    asset: value.asset || value.symbol, category: value.category || null, provider: value.provider || null,
    direction: value.direction || 'long', status: value.status || 'closed', entry: value.entry ?? null,
    exit: value.exit ?? null, stop_loss: value.stopLoss ?? value.stop_loss ?? null,
    take_profit: value.takeProfit ?? value.take_profit ?? null, quantity: value.quantity ?? null,
    capital: value.capital ?? null, leverage: value.leverage ?? null, lot_type: value.lotType ?? value.lot_type ?? null,
    lot_size: value.lotSize ?? value.lot_size ?? null, result: value.result || null, pl: value.pl ?? null,
    traded_at: value.tradedAt || value.traded_at || value.date || null, timeframe: value.timeframe || null,
    emotion: value.emotion || null, bias: value.bias || null, strategy: value.strategy || null,
    notes: value.notes || null, client_id: clientId(value),
  };
}

function alertRow(value) {
  return {
    asset: String(value.asset || '').toUpperCase().trim(), category: value.category || null, provider: value.provider || null,
    condition: value.condition, threshold: value.threshold ?? value.value, type: 'price',
    status: value.status || 'active', triggered_at: value.triggeredAt || value.triggered_at || null,
    notification_state: value.notificationState || 'pending', client_id: clientId(value),
  };
}

export async function importLocalMigrationData(data = getLocalMigrationData()) {
  if (!supabase) throw new Error('Cloud sync is not configured.');
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) throw new Error('Your session expired. Please sign in again.');
  const favorites = data.favorites?.values || [];
  const trades = data['journal trades']?.values || [];
  const alerts = data.alerts?.values || [];
  if (favorites.length) {
    const rows = [...new Map(favorites.map(value => [String(value.symbol || value).toUpperCase(), { user_id: auth.user.id, symbol: String(value.symbol || value).toUpperCase(), category: value.category || null, provider: value.provider || null, metadata: value.metadata || {} }])).values()];
    const { error } = await supabase.from('favorites').upsert(rows, { onConflict: 'user_id,symbol' });
    if (error) throw error;
  }
  if (trades.length) {
    const { error } = await supabase.from('journal_trades').upsert(trades.map(value => ({ user_id: auth.user.id, ...journalRow(value) })), { onConflict: 'user_id,client_id', ignoreDuplicates: true });
    if (error) throw error;
  }
  if (alerts.length) {
    const { error } = await supabase.from('alerts').upsert(alerts.map(value => ({ user_id: auth.user.id, ...alertRow(value) })), { onConflict: 'user_id,client_id', ignoreDuplicates: true });
    if (error) throw error;
  }
  localStorage.setItem(`${scopedStorageKey('betatrader:migration')}:v1`, JSON.stringify({ completedAt: new Date().toISOString(), version: 1 }));
}

export function skipLocalMigration() {
  localStorage.setItem(`${scopedStorageKey('betatrader:migration')}:v1`, JSON.stringify({ skippedAt: new Date().toISOString(), version: 1 }));
}
