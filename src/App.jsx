import { AppProvider, useApp } from './AppContext.jsx';
import BottomNav from './components/shared/BottomNav.jsx';
import ScrollToTop from './components/shared/ScrollToTop.jsx';
import HomeScreen from './components/home/HomeScreen.jsx';
import NewsScreen from './components/home/NewsScreen.jsx';
import NewsDetail from './components/home/NewsDetail.jsx';
import MarketPulseDetail from './components/home/MarketPulseDetail.jsx';
import MarketsScreen from './components/markets/MarketsScreen.jsx';
import AssetDetail from './components/markets/AssetDetail.jsx';
import JournalScreen from './components/journal/JournalScreen.jsx';
import AlertsScreen from './components/alerts/AlertsScreen.jsx';
import ProfileScreen from './components/profile/ProfileScreen.jsx';
import { useEffect } from 'react';

function AppContent() {
  const { activeTab, selectedAsset, selectedNews, selectedPulseMetric, darkMode } = useApp();

  // Sync theme class to html element (like reference project)
  useEffect(() => {
    const root = window.document.documentElement;
    if (darkMode) {
      root.classList.remove('light');
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
      root.classList.add('light');
    }
  }, [darkMode]);

  const renderScreen = () => {
    if (activeTab === 'home') {
      if (selectedNews) return <NewsDetail article={selectedNews} />;
      if (selectedPulseMetric) return <MarketPulseDetail metric={selectedPulseMetric} />;
      return <HomeScreen />;
    }
    if (activeTab === 'news') return <NewsScreen />;
    if (activeTab === 'markets') {
      return selectedAsset ? <AssetDetail /> : <MarketsScreen />;
    }
    if (activeTab === 'journal') return <JournalScreen />;
    if (activeTab === 'alerts') return <AlertsScreen />;
    if (activeTab === 'profile') return <ProfileScreen />;
    return <HomeScreen />;
  };

  return (
    <div className="flex flex-col h-screen">
      <ScrollToTop activeTab={activeTab} selectedAsset={selectedAsset} selectedNews={selectedNews} selectedPulseMetric={selectedPulseMetric} />
      <main className="flex-1 overflow-y-auto scroll-hide pb-24">
        {renderScreen()}
      </main>
      <BottomNav />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
