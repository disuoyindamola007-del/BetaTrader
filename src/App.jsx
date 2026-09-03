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
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { supabase } from './lib/supabaseClient.js';

function isAuthCallbackUrl() {
  const params = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  return Boolean(params.get('code') || hash.get('access_token') || hash.get('error') || hash.get('error_code') || hash.get('type') === 'signup' || hash.get('type') === 'email');
}

function AuthCallbackScreen() {
  const [state, setState] = useState({ loading: true, error: null, expired: false });

  useEffect(() => {
    let active = true;
    const finish = async () => {
      try {
        const code = new URLSearchParams(window.location.search).get('code');
        const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        const callbackError = hash.get('error_description') || hash.get('error_code');
        if (callbackError) throw new Error(callbackError.replace(/\+/g, ' '));
        if (!supabase) throw new Error('Authentication is not configured for this deployment.');
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else {
          const accessToken = hash.get('access_token');
          const refreshToken = hash.get('refresh_token');
          if (!accessToken || !refreshToken) throw new Error('This verification link is invalid or has expired.');
          const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
          if (error) throw error;
        }
        await supabase.auth.signOut();
        window.history.replaceState({}, '', window.location.pathname);
        if (active) setState({ loading: false, error: null, expired: false });
      } catch (error) {
        const message = error.message || 'Email confirmation could not be completed.';
        const expired = /expired|invalid|otp/i.test(message);
        if (active) setState({ loading: false, error: message, expired });
      }
    };
    finish();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!state.expired) return undefined;
    const timer = setTimeout(() => {
      try { sessionStorage.setItem('betatrader:authNotice', 'Your verification link expired. Sign in to continue. If your email is still unverified, we will send a new link.'); } catch { /* ignore */ }
      window.location.replace('/');
    }, 3500);
    return () => clearTimeout(timer);
  }, [state.expired]);

  return <main className="min-h-screen theme-bg-primary flex items-center justify-center px-5"><div className="w-full max-w-md glass-card p-6 text-center">
    {state.loading ? <><Loader2 className="mx-auto text-emerald-400 animate-spin" size={30} /><p className="text-sm theme-text-secondary mt-3">Confirming your email…</p></> : state.error ? <><AlertCircle className="mx-auto text-red-400" size={30} /><h1 className="text-lg font-bold theme-text-primary mt-3">{state.expired ? 'Verification link expired' : 'Email confirmation failed'}</h1><p className="text-sm text-red-400 mt-2">{state.expired ? 'This verification link is no longer valid. Redirecting you to sign in…' : state.error}</p></> : <><CheckCircle className="mx-auto text-emerald-400" size={30} /><h1 className="text-lg font-bold theme-text-primary mt-3">Email confirmed</h1><p className="text-sm theme-text-secondary mt-2">Your email is verified. Please sign in to continue.</p></>}
    {!state.loading && <button onClick={() => window.location.reload()} className="w-full btn-primary mt-5">Continue to sign in</button>}
  </div></main>;
}

function AppContent() {
  const { activeTab, selectedAsset, selectedNews, selectedPulseMetric, darkMode, authLoading, isAuthenticated } = useApp();
  const [authCallback] = useState(isAuthCallbackUrl);

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

  if (authCallback) return <AuthCallbackScreen />;
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
