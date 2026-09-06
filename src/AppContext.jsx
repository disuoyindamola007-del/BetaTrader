import { createContext, useContext, useState, useEffect } from 'react';
import { getSettings, updateSetting, replaceSettings } from './services/settingsService.js';
import { getFavorites, toggleFavorite as toggleFavoriteInStorage, hydrateFavorites } from './services/favoritesService.js';
import { supabase, isSupabaseConfigured } from './lib/supabaseClient.js';
import { setStorageUser } from './services/userStorageScope.js';
import { getLocalMigrationData, hasLocalMigrationData, importLocalMigrationData, skipLocalMigration } from './services/migrationService.js';

const AppContext = createContext();

function getSessionName(session) {
  const metadata = session?.user?.user_metadata;
  return metadata?.display_name?.trim() || metadata?.username?.trim() || metadata?.first_name?.trim() || null;
}

export function AppProvider({ children }) {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured);
  const [migrationData, setMigrationData] = useState(null);

  useEffect(() => {
    if (!supabase) return undefined;
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setStorageUser(data.session?.user?.id);
        setSettings(getSettings());
        setUserName(getSessionName(data.session));
        setSession(data.session);
        setFavorites(getFavorites());
        setMigrationData(data.session && hasLocalMigrationData() ? getLocalMigrationData() : null);
        setAuthLoading(false);
      }
    }).catch(() => { if (mounted) setAuthLoading(false); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (mounted) {
        setStorageUser(nextSession?.user?.id);
        setSettings(getSettings());
        setUserName(getSessionName(nextSession));
        setSession(nextSession);
        setFavorites(getFavorites());
        setMigrationData(nextSession && hasLocalMigrationData() ? getLocalMigrationData() : null);
        setAuthLoading(false);
      }
    });
    return () => { mounted = false; listener.subscription.unsubscribe(); };
  }, []);

  const importLocalData = async () => {
    try {
      await importLocalMigrationData(migrationData || undefined);
      // Migration writes to the cloud only; re-hydrate favorites from the
      // server so the merged set (not the stale local cache) drives the UI.
      setFavorites(await hydrateFavorites());
      setMigrationData(null);
      showToast('Local data imported to your cloud account.', 'success', 2500);
    } catch (error) {
      showToast(error.message || 'Could not import local data. Nothing was removed.', 'error', 4000);
    }
  };

  const skipLocalData = () => {
    skipLocalMigration();
    setMigrationData(null);
  };

  const exportAccountData = async () => {
    if (!supabase) throw new Error('Authentication is not configured.');
    const { data: { session: currentSession } } = await supabase.auth.getSession();
    const response = await fetch('/api/account/export', { headers: { Authorization: `Bearer ${currentSession?.access_token || ''}` } });
    if (!response.ok) throw new Error('Could not export account data.');
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = 'betatrader-export.json'; link.click();
    URL.revokeObjectURL(url);
  };

  const deleteAccount = async () => {
    if (!supabase) throw new Error('Authentication is not configured.');
    const { data: { session: currentSession } } = await supabase.auth.getSession();
    const response = await fetch('/api/account/delete', { method: 'POST', headers: { Authorization: `Bearer ${currentSession?.access_token || ''}` } });
    if (!response.ok) throw new Error('Could not delete account.');
    await supabase.auth.signOut();
    setStorageUser(null); setSettings(getSettings()); setSession(null); setFavorites([]);
  };

  const signOut = async () => {
    if (!supabase) { setSession(null); return; }
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setStorageUser(null);
    setSettings(getSettings());
    setSession(null);
    setFavorites([]);
    setSelectedAsset(null);
    setSelectedNews(null);
    setSelectedPulseMetric(null);
    setActiveTab('home');
  };

  const [activeTab, setActiveTab] = useState(() => {
    try {
      return localStorage.getItem('betatrader:activeTab') || 'home';
    } catch {
      return 'home';
    }
  });

  const [selectedAsset, setSelectedAsset] = useState(() => {
    try {
      // Restore from URL param on page load/refresh
      const params = new URLSearchParams(window.location.search);
      const assetParam = params.get('asset');
      if (assetParam) {
        const saved = localStorage.getItem('betatrader:selectedAsset');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && parsed.symbol === assetParam) {
            return parsed;
          }
        }
      }
      // Fallback to localStorage
      const saved = localStorage.getItem('betatrader:selectedAsset');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // Persist activeTab to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem('betatrader:activeTab', activeTab);
    } catch { /* ignore */ }
  }, [activeTab]);

  const [selectedNews, setSelectedNews] = useState(() => {
    try {
      const saved = localStorage.getItem('betatrader:selectedNews');
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });
  const [selectedPulseMetric, setSelectedPulseMetric] = useState(() => {
    try {
      const saved = localStorage.getItem('betatrader:selectedPulseMetric');
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });
  const [marketSearchRequest, setMarketSearchRequest] = useState(0);
  const [backtestStep, setBacktestStep] = useState(0);
  const [journalView, setJournalView] = useState(() => {
    try {
      return localStorage.getItem('betatrader:journalView') || 'dashboard';
    } catch { return 'dashboard'; }
  });

  // Persist selectedAsset to localStorage and URL params whenever it changes
  useEffect(() => {
    try {
      if (selectedAsset) {
        localStorage.setItem('betatrader:selectedAsset', JSON.stringify(selectedAsset));
        // Update URL without triggering navigation
        const params = new URLSearchParams(window.location.search);
        params.set('asset', selectedAsset.symbol);
        window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
      } else {
        localStorage.removeItem('betatrader:selectedAsset');
        const params = new URLSearchParams(window.location.search);
        params.delete('asset');
        window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
      }
    } catch { /* ignore */ }
  }, [selectedAsset]);

  // Persist selectedNews whenever it changes
  useEffect(() => {
    try {
      if (selectedNews) {
        localStorage.setItem('betatrader:selectedNews', JSON.stringify(selectedNews));
      } else {
        localStorage.removeItem('betatrader:selectedNews');
      }
    } catch { /* ignore */ }
  }, [selectedNews]);

  // Persist selectedPulseMetric whenever it changes
  useEffect(() => {
    try {
      if (selectedPulseMetric) {
        localStorage.setItem('betatrader:selectedPulseMetric', JSON.stringify(selectedPulseMetric));
      } else {
        localStorage.removeItem('betatrader:selectedPulseMetric');
      }
    } catch { /* ignore */ }
  }, [selectedPulseMetric]);

  // Persist journalView whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem('betatrader:journalView', journalView);
    } catch { /* ignore */ }
  }, [journalView]);
  const [userName, setUserName] = useState(null);
  const [profile, setProfile] = useState({ firstName: '', lastName: '', displayName: '', email: '' });

  // Load the authenticated profile so greetings use the user's real first name.
  useEffect(() => {
    if (supabase && session?.user?.id) hydrateFavorites().then(setFavorites).catch(error => console.error('[favorites] Cloud hydration failed:', error.message));
  }, [session?.user?.id]);

  useEffect(() => {
    if (!supabase || !session?.user?.id) { setUserName(null); setProfile({ firstName: '', lastName: '', displayName: '', email: '' }); return; }
    let active = true;
    const sessionName = getSessionName(session);
    if (sessionName) setUserName(sessionName);
    setProfile(current => ({ ...current, email: session.user.email || '' }));
    supabase.from('profiles').select('first_name, last_name, display_name, timezone, notifications_enabled, dark_mode').eq('user_id', session.user.id).single()
      .then(({ data }) => {
        if (!active) return;
        const firstName = data?.first_name || sessionName || '';
        const lastName = data?.last_name || session.user.user_metadata?.last_name || '';
        const displayName = data?.display_name || [firstName, lastName].filter(Boolean).join(' ');
        setProfile({ firstName, lastName, displayName, email: session.user.email || '' });
        setSettings(current => ({
          ...current,
          timezone: data?.timezone || current.timezone,
          notificationsEnabled: data?.notifications_enabled ?? current.notificationsEnabled,
          darkMode: data?.dark_mode ?? current.darkMode,
        }));
        // Keep the pre-paint cache synchronized with the cloud profile so a
        // later refresh starts in the user's actual theme.
        const hydratedSettings = getSettings();
        replaceSettings({
          timezone: data?.timezone || hydratedSettings.timezone,
          notificationsEnabled: data?.notifications_enabled ?? hydratedSettings.notificationsEnabled,
          darkMode: data?.dark_mode ?? hydratedSettings.darkMode,
        });
        // A user-entered username/display name takes precedence on Home;
        // otherwise use the person's first name.
        setUserName(displayName.trim() || firstName || 'Trader');
      });
    return () => { active = false; };
  }, [session?.user?.id]);

  const currentSettings = () => getSettings();

  // Persisted settings — single source of truth (previously ProfileScreen
  // kept its own disconnected local state for darkMode, which meant the
  // toggle changed nothing anywhere else in the app).
  const [settings, setSettings] = useState(() => getSettings());
  const syncSettingsToCloud = (changes) => {
    if (!supabase || !session?.user?.id) return Promise.resolve();
    return supabase.from('profiles').update(changes).eq('user_id', session.user.id)
      .then(({ error }) => {
        if (error) throw error;
        return true;
      })
      .catch(error => {
        console.error('[profile] Preference sync failed:', error.message);
        showToast('Saved on this device; cloud sync will retry when available.', 'info', 3000);
        return false;
      });
  };
  const darkMode = settings.darkMode;
  const setDarkMode = (value) => {
    setSettings(updateSetting('darkMode', value));
    syncSettingsToCloud({ dark_mode: value });
  };
  const notificationsEnabled = settings.notificationsEnabled;
  const setNotificationsEnabled = (value) => {
    setSettings(updateSetting('notificationsEnabled', value));
    syncSettingsToCloud({ notifications_enabled: value });
  };
  const timezone = settings.timezone || 'UTC';
  const setTimezone = (value) => {
    setSettings(updateSetting('timezone', value));
    syncSettingsToCloud({ timezone: value });
  };

  const updateProfile = async ({ firstName, lastName, displayName }) => {
    if (!supabase || !session?.user?.id) throw new Error('You must be signed in to edit your profile.');
    const cleanFirst = firstName.trim();
    const cleanLast = lastName.trim();
    const cleanDisplay = displayName.trim() || [cleanFirst, cleanLast].filter(Boolean).join(' ');
    if (!cleanFirst || !cleanLast) throw new Error('First name and last name are required.');
    if (cleanFirst.length > 80 || cleanLast.length > 80 || cleanDisplay.length > 160) throw new Error('Please shorten the name fields.');
    const { data, error } = await supabase.from('profiles').update({ first_name: cleanFirst, last_name: cleanLast, display_name: cleanDisplay, avatar_initial: cleanFirst.slice(0, 1).toUpperCase() }).eq('user_id', session.user.id).select('first_name, last_name, display_name').single();
    if (error) throw error;
    await supabase.auth.updateUser({ data: { first_name: cleanFirst, last_name: cleanLast, display_name: cleanDisplay } });
    const next = { firstName: data.first_name, lastName: data.last_name, displayName: data.display_name, email: session.user.email || '' };
    setProfile(next);
    setUserName(cleanDisplay || cleanFirst);
    return next;
  };

  // Toast notifications — ephemeral, for user feedback on actions
  const [toast, setToast] = useState(null); // { message, type, id }
  const showToast = (message, type = 'info', duration = 1500) => {
    const id = Date.now();
    setToast({ message, type, id });
    setTimeout(() => setToast(prev => prev?.id === id ? null : prev), duration);
  };

  useEffect(() => {
    const handleCloudSyncError = event => {
      const label = event.detail?.service === 'favoritesService' ? 'Watchlist' : event.detail?.service === 'journalService' ? 'Journal' : 'Cloud';
      showToast(`${label} saved on this device, but cloud sync failed: ${event.detail?.message || 'unknown error'}`, 'error', 5000);
    };
    window.addEventListener('betatrader:cloud-sync-error', handleCloudSyncError);
    return () => window.removeEventListener('betatrader:cloud-sync-error', handleCloudSyncError);
  }, []);

  // Favorites/watchlist — persisted per device
  const [favorites, setFavorites] = useState(() => getFavorites());
  const toggleFavorite = (symbol) => {
    const wasFav = favorites.includes(symbol);
    const updated = toggleFavoriteInStorage(symbol);
    setFavorites(updated);
    // Show flash feedback
    showToast(wasFav ? 'Removed from watchlist' : 'Added to watchlist', wasFav ? 'info' : 'success');
  };
  const isFavorite = (symbol) => favorites.includes(symbol);

  const navigateToAsset = (asset) => {
    setSelectedAsset(asset);
    setActiveTab('markets');
  };

  const goBack = () => {
    setSelectedAsset(null);
    setSelectedNews(null);
    setSelectedPulseMetric(null);
    // Clear from localStorage too
    try {
      localStorage.removeItem('betatrader:selectedNews');
      localStorage.removeItem('betatrader:selectedPulseMetric');
    } catch { /* ignore */ }
  };

  const clearNewsSelection = () => setSelectedNews(null);

  const navigateToNews = (article) => {
    setSelectedNews(article);
    setSelectedPulseMetric(null);
    setActiveTab('home');
  };

  const navigateToPulseMetric = (metric) => {
    setSelectedPulseMetric(metric);
    setSelectedNews(null);
    setActiveTab('home');
  };

  const openMarketSearch = () => {
    setSelectedAsset(null);
    setActiveTab('markets');
    setMarketSearchRequest(request => request + 1);
  };

  const clearMarketSearchRequest = () => setMarketSearchRequest(0);

  const value = {
    activeTab, setActiveTab,
    session, authLoading, signOut,
    isAuthenticated: Boolean(session),
    selectedAsset, setSelectedAsset, navigateToAsset, goBack,
    selectedNews, navigateToNews, clearNewsSelection,
    selectedPulseMetric, navigateToPulseMetric,
    marketSearchRequest, openMarketSearch, clearMarketSearchRequest,
    backtestStep, setBacktestStep,
    journalView, setJournalView,
    darkMode, setDarkMode,
    notificationsEnabled, setNotificationsEnabled,
    timezone, setTimezone,
    favorites, toggleFavorite, isFavorite,
    toast,
    migrationData, importLocalData, skipLocalData,
    exportAccountData, deleteAccount,
    userName, setUserName, profile, updateProfile,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  return useContext(AppContext);
}
