import { useState, useMemo } from 'react';
import { User, Moon, Bell, Shield, HelpCircle, LogOut, ChevronRight, Wallet, X } from 'lucide-react';
import { useApp } from '../../AppContext.jsx';
import { getTrades } from '../../services/journalService.js';
import { getAlerts } from '../../services/alertsService.js';
import { requestNotificationPermission } from '../../services/settingsService.js';

export default function ProfileScreen() {
  const { darkMode, setDarkMode, notificationsEnabled, setNotificationsEnabled, userName } = useApp();
  const [toast, setToast] = useState(null);

  // Real stats — computed live from actual persisted journal/alerts data,
  // not hardcoded placeholders.
  const stats = useMemo(() => {
    const trades = getTrades();
    const alerts = getAlerts();
    const wins = trades.filter(t => t.result === 'win').length;
    const winRate = trades.length ? Math.round((wins / trades.length) * 100) : 0;
    return { totalTrades: trades.length, winRate, totalAlerts: alerts.length };
  }, []);

  const showComingSoon = (label) => {
    setToast(`${label} isn't built yet — coming in a future update.`);
    setTimeout(() => setToast(null), 2500);
  };

  const handleNotificationsToggle = async () => {
    const next = !notificationsEnabled;
    if (next) {
      const permission = await requestNotificationPermission();
      if (permission === 'denied') {
        setToast('Notifications are blocked in your browser settings.');
        setTimeout(() => setToast(null), 2500);
        return;
      }
      if (permission === 'unsupported') {
        setToast('Your browser doesn\u2019t support push notifications.');
        setTimeout(() => setToast(null), 2500);
      }
    }
    setNotificationsEnabled(next);
  };

  const menuItems = [
    { icon: User, label: 'Personal Information', action: () => showComingSoon('Personal Information') },
    { icon: Wallet, label: 'Subscription', badge: 'Free', action: () => showComingSoon('Subscription management') },
    { icon: Bell, label: 'Notifications', toggle: true, value: notificationsEnabled, action: handleNotificationsToggle },
    { icon: Moon, label: 'Dark Mode', toggle: true, value: darkMode, action: () => setDarkMode(!darkMode), note: 'Theme switching coming soon' },
    { icon: Shield, label: 'Security', action: () => showComingSoon('Security settings') },
    { icon: HelpCircle, label: 'Help & Support', action: () => showComingSoon('Help & Support') },
  ];

  return (
    <div className="px-4 pt-4 pb-6 animate-fade-in relative">
      <h1 className="text-xl font-extrabold mb-5">Profile</h1>

      {/* Toast feedback for not-yet-built features */}
      {toast && (
        <div className="fixed top-4 left-4 right-4 z-50 max-w-md mx-auto bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 flex items-center justify-between gap-3 shadow-lg animate-fade-in">
          <p className="text-xs text-slate-300">{toast}</p>
          <button onClick={() => setToast(null)} className="text-slate-500 hover:text-slate-300 shrink-0"><X size={14} /></button>
        </div>
      )}

      {/* User Card */}
      <div className="glass-card p-4 mb-5 flex items-center gap-4">
        <div className="w-14 h-14 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-full flex items-center justify-center text-xl font-bold text-white shadow-lg shadow-emerald-500/20">
          {userName?.[0]?.toUpperCase() || 'T'}
        </div>
        <div>
          <p className="font-bold text-lg">{userName}</p>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Free Plan</span>
            <span className="text-[10px] bg-emerald-500/15 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/20">Active</span>
          </div>
        </div>
      </div>

      {/* Stats Row — real, computed from Journal/Alerts data */}
      <div className="grid grid-cols-3 gap-2 mb-5">
        <div className="glass-card p-3 text-center">
          <p className="text-lg font-bold">{stats.totalTrades}</p>
          <p className="text-[10px] text-slate-500">Trades</p>
        </div>
        <div className="glass-card p-3 text-center">
          <p className="text-lg font-bold text-emerald-400">{stats.totalTrades ? `${stats.winRate}%` : '--'}</p>
          <p className="text-[10px] text-slate-500">Win Rate</p>
        </div>
        <div className="glass-card p-3 text-center">
          <p className="text-lg font-bold">{stats.totalAlerts}</p>
          <p className="text-[10px] text-slate-500">Alerts</p>
        </div>
      </div>

      {/* Menu */}
      <div className="flex flex-col gap-1">
        {menuItems.map((item, i) => {
          const Icon = item.icon;
          return (
            <button
              key={i}
              onClick={item.action}
              className="glass-card-hover p-4 flex items-center justify-between text-left"
            >
              <div className="flex items-center gap-3">
                <Icon size={18} className="text-slate-400" />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{item.label}</span>
                    {item.badge && (
                      <span className="text-[10px] bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full">{item.badge}</span>
                    )}
                  </div>
                  {item.note && <p className="text-[10px] text-slate-600 mt-0.5">{item.note}</p>}
                </div>
              </div>
              {item.toggle ? (
                <div className={`w-11 h-6 rounded-full relative transition-colors shrink-0 ${
                  item.value ? 'bg-emerald-500' : 'bg-slate-700'
                }`}>
                  <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                    item.value ? 'translate-x-5' : 'translate-x-0.5'
                  }`} />
                </div>
              ) : (
                <ChevronRight size={16} className="text-slate-600 shrink-0" />
              )}
            </button>
          );
        })}
      </div>

      <button
        onClick={() => showComingSoon('Log Out')}
        className="w-full mt-4 btn-secondary text-red-400 border-red-500/20 hover:bg-red-500/10"
      >
        <LogOut size={16} />
        Log Out
      </button>

      <p className="text-center text-[10px] text-slate-600 mt-6">BetaTrader v2.0.0</p>
    </div>
  );
}
