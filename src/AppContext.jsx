import React, { createContext, useContext, useState } from 'react';

const AppContext = createContext();

export function AppProvider({ children }) {
  const [activeTab, setActiveTab] = useState('home');
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [backtestStep, setBacktestStep] = useState(0);
  const [journalView, setJournalView] = useState('dashboard');
  const [darkMode, setDarkMode] = useState(true);
  const [userName, setUserName] = useState('Trader');

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
    userName, setUserName,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  return useContext(AppContext);
}
