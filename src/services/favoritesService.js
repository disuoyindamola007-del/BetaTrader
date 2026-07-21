// favoritesService — persistence for favorited/watchlisted assets.
// Storage: localStorage (client-only, per-device), same pattern as
// alertsService.js and journalService.js.

const STORAGE_KEY = 'betatrader:favorites:v1';

function loadFavorites() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('[favoritesService] Failed to load favorites from storage:', err.message);
    return [];
  }
}

function saveFavorites(symbols) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(symbols));
  } catch (err) {
    console.error('[favoritesService] Failed to save favorites to storage:', err.message);
  }
}

export function getFavorites() {
  return loadFavorites();
}

export function isFavorite(symbol) {
  if (!symbol) return false;
  return loadFavorites().includes(symbol);
}

export function toggleFavorite(symbol) {
  if (!symbol) return loadFavorites();
  const current = loadFavorites();
  const updated = current.includes(symbol)
    ? current.filter(s => s !== symbol)
    : [...current, symbol];
  saveFavorites(updated);
  return updated;
}
