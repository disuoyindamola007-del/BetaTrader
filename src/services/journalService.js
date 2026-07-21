// journalService — persistence for trade journal entries.
// Storage: localStorage (client-only, per-device), same pattern as
// alertsService.js. Swappable for a real backend in Batch 6/7 without
// changing JournalScreen's call sites.

const STORAGE_KEY = 'betatrader:journal:v1';

function loadTrades() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('[journalService] Failed to load trades from storage:', err.message);
    return [];
  }
}

function saveTrades(trades) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trades));
  } catch (err) {
    console.error('[journalService] Failed to save trades to storage:', err.message);
  }
}

export function getTrades() {
  return loadTrades();
}

// trade: { asset, direction, timeframe, entry, exit, stopLoss, takeProfit,
//          lotSize, result, pl, bias, emotion, strategy, notes }
// pl and result are entered directly by the user rather than derived —
// the correct P&L formula depends on pip value / contract size / leverage,
// which differ per asset class and aren't reliably knowable here.
export function createTrade(trade) {
  const trades = loadTrades();
  const newTrade = {
    id: Date.now(),
    date: new Date().toISOString().slice(0, 10),
    ...trade,
  };
  const updated = [newTrade, ...trades];
  saveTrades(updated);
  return updated;
}

export function updateTrade(id, updates) {
  const trades = loadTrades();
  const updated = trades.map(t => (t.id === id ? { ...t, ...updates } : t));
  saveTrades(updated);
  return updated;
}

export function deleteTrade(id) {
  const trades = loadTrades();
  const updated = trades.filter(t => t.id !== id);
  saveTrades(updated);
  return updated;
}
