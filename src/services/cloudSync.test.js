import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---- Shared Supabase mock ----------------------------------------------
// Records every table operation so tests can assert cloud calls without a
// real backend. Each builder is thenable so `await supabase.from().x().eq()`
// resolves to a configurable result.
const ops = [];
let userId = 'user-123';
let selectResult = { data: [], error: null };

function makeBuilder(table, op) {
  const record = { table, op, filters: {}, payload: op.payload };
  ops.push(record);
  const builder = {
    eq(col, val) { record.filters[col] = val; return builder; },
    order() { return builder; },
    select() { return builder; },
    single() { return Promise.resolve(selectResult); },
    then(resolve, reject) {
      const result = op.type === 'select' ? selectResult : { data: null, error: null };
      return Promise.resolve(result).then(resolve, reject);
    },
  };
  return builder;
}

vi.mock('../lib/supabaseClient.js', () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: {
      getUser: () => Promise.resolve({ data: { user: userId ? { id: userId } : null } }),
    },
    from(table) {
      return {
        upsert: (payload, options) => makeBuilder(table, { type: 'upsert', payload, options }),
        insert: (payload) => makeBuilder(table, { type: 'insert', payload }),
        update: (payload) => makeBuilder(table, { type: 'update', payload }),
        delete: () => makeBuilder(table, { type: 'delete' }),
        select: () => makeBuilder(table, { type: 'select' }),
      };
    },
  },
}));

import { setStorageUser } from '../services/userStorageScope.js';
import * as favoritesService from '../services/favoritesService.js';
import * as journalService from '../services/journalService.js';
import * as alertsService from '../services/alertsService.js';

function flush() { return new Promise(resolve => setTimeout(resolve, 0)); }

beforeEach(() => {
  localStorage.clear();
  ops.length = 0;
  userId = 'user-123';
  selectResult = { data: [], error: null };
  setStorageUser(userId);
});

// ---- favoritesService ---------------------------------------------------
describe('favoritesService', () => {
  it('toggles a favorite locally and upserts to the cloud', async () => {
    const updated = favoritesService.toggleFavorite('BTC');
    expect(updated).toEqual(['BTC']);
    expect(favoritesService.isFavorite('BTC')).toBe(true);
    await flush();
    const upsert = ops.find(o => o.table === 'favorites' && o.op.type === 'upsert');
    expect(upsert).toBeTruthy();
    expect(upsert.op.payload).toMatchObject({ user_id: 'user-123', symbol: 'BTC' });
    expect(upsert.op.options).toMatchObject({ onConflict: 'user_id,symbol' });
  });

  it('removes a favorite locally and deletes from the cloud', async () => {
    favoritesService.toggleFavorite('ETH');
    ops.length = 0;
    const updated = favoritesService.toggleFavorite('ETH');
    expect(updated).toEqual([]);
    await flush();
    const del = ops.find(o => o.table === 'favorites' && o.op.type === 'delete');
    expect(del).toBeTruthy();
    expect(del.filters).toMatchObject({ user_id: 'user-123', symbol: 'ETH' });
  });

  it('hydrates favorites from the cloud and overwrites the local cache', async () => {
    localStorage.setItem('betatrader:favorites:v1:user:user-123', JSON.stringify(['STALE']));
    selectResult = { data: [{ symbol: 'AAPL' }, { symbol: 'TSLA' }], error: null };
    const symbols = await favoritesService.hydrateFavorites();
    expect(symbols).toEqual(['AAPL', 'TSLA']);
    expect(favoritesService.getFavorites()).toEqual(['AAPL', 'TSLA']);
  });

  it('does not touch the cloud when signed out', async () => {
    userId = null;
    setStorageUser(null);
    favoritesService.toggleFavorite('BTC');
    await flush();
    expect(ops.length).toBe(0);
  });
});

// ---- journalService -----------------------------------------------------
describe('journalService', () => {
  it('creates a trade locally and inserts a normalized row (buy -> long)', async () => {
    const updated = journalService.createTrade({ asset: 'BTC', direction: 'buy', status: 'closed', entry: 100, exit: 120, assetClass: 'crypto' });
    expect(updated).toHaveLength(1);
    await flush();
    const insert = ops.find(o => o.table === 'journal_trades' && o.op.type === 'insert');
    expect(insert).toBeTruthy();
    expect(insert.op.payload).toMatchObject({ user_id: 'user-123', asset: 'BTC', direction: 'long', category: 'crypto', status: 'closed' });
    expect(insert.op.payload.client_id).toBe(String(updated[0].id));
  });

  it('updates a trade and syncs the closed outcome to the cloud', async () => {
    const created = journalService.createTrade({ asset: 'ETH', direction: 'sell', status: 'open' });
    const id = created[0].id;
    ops.length = 0;
    const updated = journalService.updateTrade(id, { status: 'closed', exit: 90, result: 'win' });
    expect(updated[0]).toMatchObject({ status: 'closed', exit: 90, result: 'win' });
    await flush();
    const upd = ops.find(o => o.table === 'journal_trades' && o.op.type === 'update');
    expect(upd.op.payload).toMatchObject({ status: 'closed', exit: 90, result: 'win', direction: 'short' });
    expect(upd.filters).toMatchObject({ user_id: 'user-123', client_id: String(id) });
  });

  it('deletes a trade locally and in the cloud by client_id', async () => {
    const created = journalService.createTrade({ asset: 'ETH', direction: 'buy' });
    const id = created[0].id;
    ops.length = 0;
    const updated = journalService.deleteTrade(id);
    expect(updated).toHaveLength(0);
    await flush();
    const del = ops.find(o => o.table === 'journal_trades' && o.op.type === 'delete');
    expect(del.filters).toMatchObject({ user_id: 'user-123', client_id: String(id) });
  });

  it('hydrates trades and maps snake_case + long/short back to UI shape', async () => {
    selectResult = { data: [{ id: 'uuid-1', client_id: '555', asset: 'BTC', category: 'crypto', direction: 'short', status: 'closed', stop_loss: 5, take_profit: 15, lot_size: 2, lot_type: 'mini', traded_at: '2024-01-01T00:00:00Z' }], error: null };
    const trades = await journalService.hydrateTrades();
    expect(trades[0]).toMatchObject({ id: '555', assetClass: 'crypto', direction: 'sell', stopLoss: 5, takeProfit: 15, lotSize: 2, lotType: 'mini', clientId: '555' });
  });
});

// ---- alertsService ------------------------------------------------------
describe('alertsService', () => {
  it('creates an alert locally and upserts to the cloud', async () => {
    const updated = alertsService.createAlert({ asset: 'btc', condition: 'above', value: '50000' });
    expect(updated[0]).toMatchObject({ asset: 'BTC', condition: 'above', value: 50000, status: 'active' });
    await flush();
    const upsert = ops.find(o => o.table === 'alerts' && o.op.type === 'upsert');
    expect(upsert.op.payload).toMatchObject({ user_id: 'user-123', asset: 'BTC', condition: 'above', threshold: 50000, type: 'price', status: 'active' });
    expect(upsert.op.options).toMatchObject({ onConflict: 'user_id,client_id' });
  });

  it('deletes an alert locally and in the cloud by client_id', async () => {
    const created = alertsService.createAlert({ asset: 'ETH', condition: 'below', value: 1000 });
    const id = created[0].id;
    ops.length = 0;
    const updated = alertsService.deleteAlert(id);
    expect(updated).toHaveLength(0);
    await flush();
    const del = ops.find(o => o.table === 'alerts' && o.op.type === 'delete');
    expect(del.filters).toMatchObject({ user_id: 'user-123', client_id: String(id) });
  });

  it('checkAlerts triggers, syncs status, and persists a notification', async () => {
    const created = alertsService.createAlert({ asset: 'BTC', condition: 'above', value: 100 });
    ops.length = 0;
    const result = alertsService.checkAlerts(created, { BTC: { price: 150 } });
    expect(result.changed).toBe(true);
    expect(result.newlyTriggered).toHaveLength(1);
    expect(result.alerts[0].status).toBe('triggered');
    await flush();
    const upd = ops.find(o => o.table === 'alerts' && o.op.type === 'update');
    expect(upd.op.payload).toMatchObject({ status: 'triggered', notification_state: 'sent' });
    const notification = ops.find(o => o.table === 'notifications' && o.op.type === 'insert');
    expect(notification.op.payload).toMatchObject({
      user_id: 'user-123',
      type: 'alert_triggered',
      title: 'BTC price alert triggered',
      source: `alert:${created[0].id}`,
    });
  });

  it('checkAlerts leaves alerts untouched when the threshold is not crossed', () => {
    const created = alertsService.createAlert({ asset: 'BTC', condition: 'above', value: 100 });
    const result = alertsService.checkAlerts(created, { BTC: { price: 50 } });
    expect(result.changed).toBe(false);
    expect(result.newlyTriggered).toHaveLength(0);
  });

  it('hydrates alerts and maps threshold/triggered_at back to UI shape', async () => {
    selectResult = { data: [{ id: 'uuid-9', client_id: '777', asset: 'BTC', type: 'price', condition: 'below', threshold: 42, status: 'active', created_at: '2024-01-01T00:00:00Z' }], error: null };
    const alerts = await alertsService.hydrateAlerts();
    expect(alerts[0]).toMatchObject({ id: '777', asset: 'BTC', condition: 'below', value: 42, status: 'active' });
  });
});

// ---- per-user storage isolation ----------------------------------------
describe('per-user storage scoping', () => {
  it('keeps favorites for different users in separate buckets', () => {
    setStorageUser('user-A');
    favoritesService.toggleFavorite('AAA');
    setStorageUser('user-B');
    expect(favoritesService.getFavorites()).toEqual([]);
    favoritesService.toggleFavorite('BBB');
    expect(favoritesService.getFavorites()).toEqual(['BBB']);
    setStorageUser('user-A');
    expect(favoritesService.getFavorites()).toEqual(['AAA']);
  });
});
