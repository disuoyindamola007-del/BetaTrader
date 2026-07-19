import { useState } from 'react';
import { User, Moon, Bell, Shield, HelpCircle, LogOut, ChevronRight, Sparkles, Wallet } from 'lucide-react';

export default function ProfileScreen() {
  const [darkMode, setDarkMode] = useState(true);
  const [notifications, setNotifications] = useState(true);

  const menuItems = [
    { icon: User, label: 'Personal Information' },
    { icon: Wallet, label: 'Subscription', badge: 'Free' },
    { icon: Bell, label: 'Notifications', toggle: true, value: notifications, action: () => setNotifications(!notifications) },
    { icon: Moon, label: 'Dark Mode', toggle: true, value: darkMode, action: () => setDarkMode(!darkMode) },
    { icon: Shield, label: 'Security' },
    { icon: HelpCircle, label: 'Help & Support' },
  ];

  return (
    <div className="px-4 pt-4 pb-6 animate-fade-in">
      <h1 className="text-xl font-extrabold mb-5">Profile</h1>

      {/* User Card */}
      <div className="glass-card p-4 mb-5 flex items-center gap-4">
        <div className="w-14 h-14 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-full flex items-center justify-center text-xl font-bold text-white shadow-lg shadow-emerald-500/20">
          T
        </div>
        <div>
          <p className="font-bold text-lg">Trader</p>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Free Plan</span>
            <span className="text-[10px] bg-emerald-500/15 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/20">Active</span>
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-2 mb-5">
        <div className="glass-card p-3 text-center">
          <p className="text-lg font-bold">12</p>
          <p className="text-[10px] text-slate-500">Trades</p>
        </div>
        <div className="glass-card p-3 text-center">
          <p className="text-lg font-bold text-emerald-400">68%</p>
          <p className="text-[10px] text-slate-500">Win Rate</p>
        </div>
        <div className="glass-card p-3 text-center">
          <p className="text-lg font-bold">3</p>
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
              onClick={item.action || (() => {})}
              className="glass-card-hover p-4 flex items-center justify-between text-left"
            >
              <div className="flex items-center gap-3">
                <Icon size={18} className="text-slate-400" />
                <span className="text-sm font-medium">{item.label}</span>
                {item.badge && (
                  <span className="text-[10px] bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full">{item.badge}</span>
                )}
              </div>
              {item.toggle ? (
                <div className={`w-11 h-6 rounded-full relative transition-colors ${
                  item.value ? 'bg-emerald-500' : 'bg-slate-700'
                }`}>
                  <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                    item.value ? 'translate-x-5' : 'translate-x-0.5'
                  }`} />
                </div>
              ) : (
                <ChevronRight size={16} className="text-slate-600" />
              )}
            </button>
          );
        })}
      </div>

      <button className="w-full mt-4 btn-secondary text-red-400 border-red-500/20 hover:bg-red-500/10">
        <LogOut size={16} />
        Log Out
      </button>

      <p className="text-center text-[10px] text-slate-600 mt-6">BetaTrader v2.0.0</p>
    </div>
  );
}
