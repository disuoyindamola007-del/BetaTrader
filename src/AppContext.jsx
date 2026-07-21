import React, { createContext, useContext, useState } from 'react';
import { getSettings, updateSetting } from './services/settingsService.js';
import { getFavorites, toggleFavorite as toggleFavoriteInStorage } from './services/favoritesService.js';

const AppContext = createContext();

export function AppProvider({ children }) {
  const [activeTab, setActiveTab] = useState('home');
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [backtestStep, setBacktestStep] = useState(0);
  const [journalView, setJournalView] = useState('dashboard');
  const [userName, setUserName] = useState('Trader');

  // Persisted settings — single source of truth (previously ProfileScreen
  // kept its own disconnected local state for darkMode, which meant the
  // toggle changed nothing anywhere else in the app).
  const [settings, setSettings] = useState(() => getSettings());
  const darkMode = settings.darkMode;
  const setDarkMode = (value) => setSettings(updateSetting('darkMode', value));
  const notificationsEnabled = settings.notificationsEnabled;
  const setNotificationsEnabled = (value) => setSettings(updateSetting('notificationsEnabled', value));

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
  };

  const value = {
    activeTab, setActiveTab,
    selectedAsset, setSelectedAsset, navigateToAsset, goBack,
    backtestStep, setBacktestStep,
    journalView, setJournalView,
    darkMode, setDarkMode,
    notificationsEnabled, setNotificationsEnabled,
    favorites, toggleFavorite, isFavorite,
    userName, setUserName,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  return useContext(AppContext);
}
