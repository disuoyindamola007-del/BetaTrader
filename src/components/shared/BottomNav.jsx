import { Home, BarChart3, BookOpen, Bell, User } from 'lucide-react';
import { useApp } from '../../AppContext.jsx';

export default function BottomNav() {
  const { activeTab, setActiveTab, setSelectedAsset } = useApp();

  const tabs = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'markets', label: 'Markets', icon: BarChart3 },
    { id: 'journal', label: 'Journal', icon: BookOpen },
    { id: 'alerts', label: 'Alerts', icon: Bell },
    { id: 'profile', label: 'Profile', icon: User },
  ];

  const handleTabClick = (tabId) => {
    setActiveTab(tabId);
    if (tabId !== 'markets') setSelectedAsset(null);
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-slate-900/90 backdrop-blur-xl border-t border-slate-800/50 safe-area-pb">
      <div className="flex items-center justify-around px-2 py-1 max-w-lg mx-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              className={isActive ? 'nav-item-active' : 'nav-item-inactive'}
            >
              <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
              <span className="text-[10px] font-medium">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
