import { Home, BarChart3, BookOpen, Bell, User } from 'lucide-react';
import { useApp } from '../../AppContext.jsx';

export default function BottomNav() {
  const { activeTab, setActiveTab, setSelectedAsset, clearNewsSelection } = useApp();

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
    clearNewsSelection();
  };

  return (
    <nav className="nav-container safe-area-pb">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => handleTabClick(tab.id)}
            className={isActive ? 'nav-item nav-item-active' : 'nav-item nav-item-inactive'}
          >
            <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
