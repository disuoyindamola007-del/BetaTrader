import React, { createContext, useContext, useState, useEffect } from 'react';
import { getSettings, updateSetting } from './services/settingsService.js';
import { getFavorites, toggleFavorite as toggleFavoriteInStorage } from './services/favoritesService.js';

const AppContext = createContext();

export function AppProvider({ children }) {
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
  const [userName, setUserName] = useState('Trader');

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

  // Favorites/watchlist — persisted per device. No dedicated "My Favorites"
  // screen yet; this just makes the heart button on Asset Detail real.
  const [favorites, setFavorites] = useState(() => getFavorites());
  const toggleFavorite = (symbol) => setFavorites(toggleFavoriteInStorage(symbol));
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
    userName, setUserName,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  return useContext(AppContext);
}
