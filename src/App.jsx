import { AppProvider, useApp } from './AppContext.jsx';
import BottomNav from './components/shared/BottomNav.jsx';
import HomeScreen from './components/home/HomeScreen.jsx';
import MarketsScreen from './components/markets/MarketsScreen.jsx';
import AssetDetail from './components/markets/AssetDetail.jsx';
import JournalScreen from './components/journal/JournalScreen.jsx';
import AlertsScreen from './components/alerts/AlertsScreen.jsx';
import ProfileScreen from './components/profile/ProfileScreen.jsx';

function AppContent() {
  const { activeTab, selectedAsset } = useApp();

  const renderScreen = () => {
    if (activeTab === 'home') return <HomeScreen />;
    if (activeTab === 'markets') {
      return selectedAsset ? <AssetDetail /> : <MarketsScreen />;
    }
    if (activeTab === 'journal') return <JournalScreen />;
    if (activeTab === 'alerts') return <AlertsScreen />;
    if (activeTab === 'profile') return <ProfileScreen />;
    return <HomeScreen />;
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950">
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
