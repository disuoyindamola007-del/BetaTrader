// alertsService — persistence and trigger logic for price alerts.
// Storage: localStorage (client-only, per-device). No backend yet —
// this is intentionally simple so it can be swapped for a real
// backend in Batch 6/7 without changing the AlertsScreen call sites.

const STORAGE_KEY = 'betatrader:alerts:v1';

function loadAlerts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('[alertsService] Failed to load alerts from storage:', err.message);
    return [];
  }
}

function saveAlerts(alerts) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(alerts));
  } catch (err) {
    console.error('[alertsService] Failed to save alerts to storage:', err.message);
  }
}

export function getAlerts() {
  return loadAlerts();
}

export function createAlert({ asset, condition, value }) {
  const alerts = loadAlerts();
  const newAlert = {
    id: Date.now(),
    asset: asset.toUpperCase().trim(),
    type: 'price',
    condition, // 'above' | 'below'
    value: parseFloat(value),
    status: 'active',
    createdAt: new Date().toISOString(),
  };
  const updated = [...alerts, newAlert];
  saveAlerts(updated);
  return updated;
}

export function deleteAlert(id) {
  const alerts = loadAlerts();
  const updated = alerts.filter(a => a.id !== id);
  saveAlerts(updated);
  return updated;
}

// Given the current alert list and a live-prices map (keyed by symbol,
// e.g. from useBatchQuotes/useCryptoBatch), check every still-active
// alert's condition against the live price. Returns the updated list
// (persisting it if anything changed) plus whether any alert newly
// triggered, so the caller can decide whether to show a notification.
export function checkAlerts(alerts, livePrices) {
  let changed = false;
  const newlyTriggered = [];

  const updated = alerts.map(alert => {
    if (alert.status === 'triggered') return alert;

    const symbolKey = alert.asset.replace('/', '');
    const live = livePrices[alert.asset] || livePrices[symbolKey];
    if (!live || live.price == null) return alert;

    let hit = false;
    if (alert.condition === 'above' && live.price >= alert.value) hit = true;
    if (alert.condition === 'below' && live.price <= alert.value) hit = true;

    if (hit) {
      changed = true;
      const triggeredAlert = { ...alert, status: 'triggered', triggeredAt: new Date().toISOString() };
      newlyTriggered.push(triggeredAlert);
      return triggeredAlert;
    }
    return alert;
  });

  if (changed) saveAlerts(updated);
  return { alerts: updated, changed, newlyTriggered };
}
