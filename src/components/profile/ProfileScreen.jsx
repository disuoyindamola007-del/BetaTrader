import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { User, Moon, Bell, Shield, HelpCircle, LogOut, ChevronRight, Wallet, X, Globe, Check, Loader2 } from 'lucide-react';
import { useApp } from '../../AppContext.jsx';
import { getTrades } from '../../services/journalService.js';
import { getAlerts } from '../../services/alertsService.js';
import { requestNotificationPermission, TIMEZONE_OPTIONS } from '../../services/settingsService.js';

export default function ProfileScreen() {
  const { darkMode, setDarkMode, notificationsEnabled, setNotificationsEnabled, userName, timezone, setTimezone, signOut, profile, updateProfile } = useApp();
  const [toast, setToast] = useState(null);
  const [showPersonalInfo, setShowPersonalInfo] = useState(false);
  const [personalInfo, setPersonalInfo] = useState({ firstName: '', lastName: '', displayName: '' });
  const [savingProfile, setSavingProfile] = useState(false);
  const [showTimezonePicker, setShowTimezonePicker] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

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

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
    } catch {
      setToast('Could not log out. Check your connection and try again.');
      setTimeout(() => setToast(null), 2500);
      setSigningOut(false);
    }
  };

  const openPersonalInfo = () => {
    setPersonalInfo({ firstName: profile.firstName || '', lastName: profile.lastName || '', displayName: profile.displayName || '' });
    setToast(null);
    setShowPersonalInfo(true);
  };

  const savePersonalInfo = async event => {
    event.preventDefault();
    setSavingProfile(true);
    setToast(null);
    try {
      await updateProfile(personalInfo);
      setShowPersonalInfo(false);
      setToast('Personal information updated.');
      setTimeout(() => setToast(null), 2500);
    } catch (error) {
      setToast(error.message || 'Could not update your information.');
      setTimeout(() => setToast(null), 3000);
    } finally { setSavingProfile(false); }
  };

  const chooseTimezone = value => {
    setTimezone(value);
    setShowTimezonePicker(false);
  };

  const menuItems = [
    { icon: User, label: 'Personal Information', action: openPersonalInfo },
    { icon: Wallet, label: 'Subscription', badge: 'Free', action: () => showComingSoon('Subscription management') },
    { icon: Bell, label: 'Notifications', toggle: true, value: notificationsEnabled, action: handleNotificationsToggle },
    { icon: Moon, label: darkMode ? 'Dark Mode' : 'Light Mode', toggle: true, value: darkMode, action: () => setDarkMode(!darkMode) },
    { icon: Globe, label: 'Time Zone', value: timezone, action: () => setShowTimezonePicker(true), note: `Current: ${TIMEZONE_OPTIONS.find(t => t.value === timezone)?.label || timezone}` },
    { icon: Shield, label: 'Security', action: () => showComingSoon('Security settings') },
    { icon: HelpCircle, label: 'Help & Support', action: () => showComingSoon('Help & Support') },
  ];

  return (
    <div className="px-4 pt-4 pb-6 animate-fade-in relative">
      {/* Sticky top region: header + user card + stats — transparent, theme-aware */}
      <div className="sticky top-0 z-10 theme-bg-primary/85 backdrop-blur-xl -mx-4 px-4 pb-2">
        <h1 className="text-xl font-extrabold mb-4 pt-1">Profile</h1>

        {/* Toast feedback for not-yet-built features */}
        {toast && (
          <div className="fixed top-4 left-4 right-4 z-50 max-w-md mx-auto bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 flex items-center justify-between gap-3 shadow-lg animate-fade-in">
            <p className="text-xs text-slate-300">{toast}</p>
            <button onClick={() => setToast(null)} className="text-slate-500 hover:text-slate-300 shrink-0"><X size={14} /></button>
          </div>
        )}

        {/* User Card */}
        <div className="glass-card p-4 mb-4 flex items-center gap-4">
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
        <div className="grid grid-cols-3 gap-2 mb-2">
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
      </div>

      {/* Menu — scrolls beneath sticky region */}
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
                <div className="flex items-center gap-2 shrink-0">
                  {item.value && typeof item.value === 'string' && !item.toggle && (
                    <span className="text-[10px] text-slate-500 max-w-[100px] truncate">{item.value}</span>
                  )}
                  <ChevronRight size={16} className="text-slate-600 shrink-0" />
                </div>
              )}
            </button>
          );
        })}
      </div>

      <button
        onClick={handleSignOut}
        disabled={signingOut}
        className="w-full mt-4 btn-secondary text-red-400 border-red-500/20 hover:bg-red-500/10 flex items-center justify-center gap-2 disabled:opacity-60"
      >
        {signingOut ? <Loader2 size={16} className="animate-spin" /> : <LogOut size={16} />}
        {signingOut ? 'Logging out…' : 'Log Out'}
      </button>

      {showTimezonePicker && createPortal(
        <div className="fixed inset-0 z-[2000] bg-black/60 flex items-end sm:items-center justify-center" onClick={() => setShowTimezonePicker(false)}>
          <div className="w-full max-w-md theme-bg-secondary rounded-t-2xl sm:rounded-2xl border theme-border p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] max-h-[calc(100dvh-1rem)] sm:max-h-[75vh] flex flex-col" onClick={event => event.stopPropagation()}>
            <div className="flex items-center justify-between mb-3 shrink-0">
              <div><h2 className="font-bold theme-text-primary">Select time zone</h2><p className="text-xs theme-text-secondary">Times and greetings will use this zone.</p></div>
              <button onClick={() => setShowTimezonePicker(false)} className="p-2 theme-text-secondary"><X size={18} /></button>
            </div>
            <div className="space-y-1 overflow-y-auto overscroll-contain pb-2">
              {TIMEZONE_OPTIONS.map(option => (
                <button key={option.value} onClick={() => chooseTimezone(option.value)} className={`w-full p-3 rounded-xl flex items-center justify-between text-left ${timezone === option.value ? 'bg-emerald-500/15 text-emerald-400' : 'theme-bg-tertiary theme-text-primary'}`}>
                  <span className="text-sm font-medium">{option.label}</span>
                  {timezone === option.value && <Check size={17} />}
                </button>
              ))}
            </div>
          </div>
        </div>,
        document.body
      )}

      {showPersonalInfo && createPortal(
        <div className="fixed inset-0 z-[2000] bg-black/60 flex items-end sm:items-center justify-center" onClick={() => !savingProfile && setShowPersonalInfo(false)}>
          <form onSubmit={savePersonalInfo} className="w-full max-w-md theme-bg-secondary rounded-t-2xl sm:rounded-2xl border theme-border p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]" onClick={event => event.stopPropagation()}>
            <div className="flex items-center justify-between mb-4"><div><h2 className="font-bold theme-text-primary">Personal Information</h2><p className="text-xs theme-text-secondary mt-1">Update the name shown on your account.</p></div><button type="button" onClick={() => setShowPersonalInfo(false)} disabled={savingProfile} className="p-2 theme-text-secondary"><X size={18} /></button></div>
            <label className="block text-xs theme-text-secondary mb-3">First name<input required maxLength={80} value={personalInfo.firstName} onChange={event => setPersonalInfo(current => ({ ...current, firstName: event.target.value }))} className="input-field mt-1" autoComplete="given-name" /></label>
            <label className="block text-xs theme-text-secondary mb-3">Last name<input required maxLength={80} value={personalInfo.lastName} onChange={event => setPersonalInfo(current => ({ ...current, lastName: event.target.value }))} className="input-field mt-1" autoComplete="family-name" /></label>
            <label className="block text-xs theme-text-secondary mb-4">Display name <span className="normal-case tracking-normal">(optional)</span><input maxLength={160} value={personalInfo.displayName} onChange={event => setPersonalInfo(current => ({ ...current, displayName: event.target.value }))} className="input-field mt-1" autoComplete="nickname" /></label>
            <p className="text-xs theme-text-secondary mb-4">Email: <span className="theme-text-primary">{profile.email || 'Unavailable'}</span></p>
            <button disabled={savingProfile} className="w-full btn-primary flex items-center justify-center gap-2 disabled:opacity-60">{savingProfile && <Loader2 size={16} className="animate-spin" />}{savingProfile ? 'Saving…' : 'Save changes'}</button>
          </form>
        </div>, document.body
      )}

      <p className="text-center text-[10px] text-slate-600 mt-6">BetaTrader v2.0.0</p>
    </div>
  );
}
