import { AppProvider, useApp } from './AppContext.jsx';
import BottomNav from './components/shared/BottomNav.jsx';
import ScrollToTop from './components/shared/ScrollToTop.jsx';
import Toast from './components/shared/Toast.jsx';
import HomeScreen from './components/home/HomeScreen.jsx';
import NewsScreen from './components/home/NewsScreen.jsx';
import NewsDetail from './components/home/NewsDetail.jsx';
import MarketPulseDetail from './components/home/MarketPulseDetail.jsx';
import NotificationsScreen from './components/home/NotificationsScreen.jsx';
import WatchlistScreen from './components/home/WatchlistScreen.jsx';
import MarketsScreen from './components/markets/MarketsScreen.jsx';
import AssetDetail from './components/markets/AssetDetail.jsx';
import JournalScreen from './components/journal/JournalScreen.jsx';
import AlertsScreen from './components/alerts/AlertsScreen.jsx';
import ProfileScreen from './components/profile/ProfileScreen.jsx';
import AuthScreen from './components/auth/AuthScreen.jsx';
import { Loader2 } from 'lucide-react';
import { useEffect } from 'react';

function AppContent() {
  const { activeTab, selectedAsset, selectedNews, selectedPulseMetric, darkMode, authLoading, isAuthenticated } = useApp();

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

  if (authLoading) {
    return <div className="min-h-screen theme-bg-primary flex items-center justify-center"><Loader2 className="text-emerald-400 animate-spin" size={28} /></div>;
  }
  if (!isAuthenticated) return <AuthScreen />;

  const renderScreen = () => {
    if (activeTab === 'home') {
      if (selectedNews) return <NewsDetail article={selectedNews} />;
      if (selectedPulseMetric) return <MarketPulseDetail metric={selectedPulseMetric} />;
      return <HomeScreen />;
    }
    if (activeTab === 'news') return <NewsScreen />;
    if (activeTab === 'notifications') return <NotificationsScreen />;
    if (activeTab === 'watchlist') return <WatchlistScreen />;
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
      <Toast />
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
