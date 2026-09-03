import React, { createContext, useContext, useState, useEffect } from 'react';
import { getSettings, updateSetting } from './services/settingsService.js';
import { getFavorites, toggleFavorite as toggleFavoriteInStorage } from './services/favoritesService.js';
import { supabase, isSupabaseConfigured } from './lib/supabaseClient.js';
import { setStorageUser } from './services/userStorageScope.js';

const AppContext = createContext();

function getSessionFirstName(session) {
  const metadata = session?.user?.user_metadata;
  return metadata?.first_name || metadata?.display_name?.trim()?.split(/\s+/)[0] || null;
}

export function AppProvider({ children }) {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    if (!supabase) return undefined;
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setStorageUser(data.session?.user?.id);
        setUserName(getSessionFirstName(data.session));
        setSession(data.session);
        setFavorites(getFavorites());
        setAuthLoading(false);
      }
    }).catch(() => { if (mounted) setAuthLoading(false); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (mounted) {
        setStorageUser(nextSession?.user?.id);
        setUserName(getSessionFirstName(nextSession));
        setSession(nextSession);
        setFavorites(getFavorites());
        setAuthLoading(false);
      }
    });
    return () => { mounted = false; listener.subscription.unsubscribe(); };
  }, []);

  const signOut = async () => {
    if (!supabase) { setSession(null); return; }
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setStorageUser(null);
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
    if (!supabase || !session?.user?.id) { setUserName(null); setProfile({ firstName: '', lastName: '', displayName: '', email: '' }); return; }
    let active = true;
    const sessionName = getSessionFirstName(session);
    if (sessionName) setUserName(sessionName);
    setProfile(current => ({ ...current, email: session.user.email || '' }));
    supabase.from('profiles').select('first_name, last_name, display_name').eq('user_id', session.user.id).single()
      .then(({ data }) => {
        if (!active) return;
        const firstName = data?.first_name || sessionName || '';
        const lastName = data?.last_name || session.user.user_metadata?.last_name || '';
        const displayName = data?.display_name || [firstName, lastName].filter(Boolean).join(' ');
        setProfile({ firstName, lastName, displayName, email: session.user.email || '' });
        setUserName(firstName || displayName.trim().split(/\s+/)[0] || 'Trader');
      });
    return () => { active = false; };
  }, [session?.user?.id]);

  // Persisted settings — single source of truth (previously ProfileScreen
  // kept its own disconnected local state for darkMode, which meant the
  // toggle changed nothing anywhere else in the app).
  const [settings, setSettings] = useState(() => getSettings());
  const darkMode = settings.darkMode;
  const setDarkMode = (value) => setSettings(updateSetting('darkMode', value));
  const notificationsEnabled = settings.notificationsEnabled;
  const setNotificationsEnabled = (value) => setSettings(updateSetting('notificationsEnabled', value));
  const timezone = settings.timezone || 'UTC';
  const setTimezone = (value) => setSettings(updateSetting('timezone', value));

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
    setUserName(cleanFirst);
    return next;
  };

  // Toast notifications — ephemeral, for user feedback on actions
  const [toast, setToast] = useState(null); // { message, type, id }
  const showToast = (message, type = 'info', duration = 1500) => {
    const id = Date.now();
    setToast({ message, type, id });
    setTimeout(() => setToast(prev => prev?.id === id ? null : prev), duration);
  };

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
    userName, setUserName, profile, updateProfile,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  return useContext(AppContext);
}
