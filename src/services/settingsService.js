// settingsService — persistence for simple user preferences that don't
// warrant their own backend yet (notifications opt-in, dark mode flag).
// Settings are scoped per authenticated user. Cloud profile values are the
// source of truth after sign-in; local storage is an offline/startup cache.
import { scopedStorageKey } from './userStorageScope.js';

const STORAGE_KEY = 'betatrader:settings:v1';

const DEFAULTS = {
  notificationsEnabled: true,
  darkMode: true,
  timezone: 'UTC',
};

export const TIMEZONE_OPTIONS = [
  { value: 'UTC', label: 'UTC' },
  { value: 'Africa/Lagos', label: 'West Africa Time (WAT)' },
  { value: 'Europe/London', label: 'London (BST/GMT)' },
  { value: 'Europe/Berlin', label: 'Central Europe (CET)' },
  { value: 'America/New_York', label: 'New York (EST/EDT)' },
  { value: 'America/Chicago', label: 'Chicago (CST/CDT)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
  { value: 'Asia/Shanghai', label: 'Shanghai (CST)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST/AEDT)' },
];

function getBrowserAuthUserId() {
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key || !/^sb-.*-auth-token$/.test(key)) continue;
      const parsed = JSON.parse(localStorage.getItem(key) || 'null');
      const userId = parsed?.user?.id || parsed?.currentSession?.user?.id;
      if (userId) return userId;
    }
  } catch { /* use the current storage scope */ }
  return null;
}

function loadSettings() {
  try {
    const scopedKey = scopedStorageKey(STORAGE_KEY);
    const browserUserId = getBrowserAuthUserId();
    const authScopedKey = browserUserId ? `${STORAGE_KEY}:user:${browserUserId}` : null;
    const raw = localStorage.getItem(scopedKey) || (authScopedKey && localStorage.getItem(authScopedKey));
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed };
  } catch (err) {
    console.error('[settingsService] Failed to load settings from storage:', err.message);
    return { ...DEFAULTS };
  }
}

function saveSettings(settings) {
  try {
    localStorage.setItem(scopedStorageKey(STORAGE_KEY), JSON.stringify(settings));
  } catch (err) {
    console.error('[settingsService] Failed to save settings to storage:', err.message);
  }
}

export function getSettings() {
  return loadSettings();
}

export function updateSetting(key, value) {
  const current = loadSettings();
  const updated = { ...current, [key]: value };
  saveSettings(updated);
  return updated;
}

// Replace the local cache after authenticated profile hydration without
// triggering another cloud write. This keeps the restored preference
// available to index.html before the next first paint.
export function replaceSettings(settings) {
  const next = { ...DEFAULTS, ...(settings || {}) };
  saveSettings(next);
  return next;
}

// Requests browser notification permission (real action, not a decoration).
// Returns the resulting permission string, or 'unsupported' if the browser
// doesn't have the Notification API at all.
export async function requestNotificationPermission() {
  if (typeof Notification === 'undefined') return 'unsupported';
  if (Notification.permission === 'granted' || Notification.permission === 'denied') {
    return Notification.permission;
  }
  try {
    return await Notification.requestPermission();
  } catch (err) {
    console.error('[settingsService] Notification permission request failed:', err.message);
    return 'denied';
  }
}
