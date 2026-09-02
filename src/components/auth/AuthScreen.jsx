import { useEffect, useState } from 'react';
import { Eye, EyeOff, Loader2, Mail, Lock, UserPlus, LogIn, CheckCircle } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../../lib/supabaseClient.js';

function isEmailCallback() {
  const params = new URLSearchParams(window.location.search);
  return Boolean(params.get('code')) || window.location.hash.includes('type=signup');
}

export default function AuthScreen() {
  const [mode, setMode] = useState('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [callbackBusy, setCallbackBusy] = useState(isEmailCallback());
  const [message, setMessage] = useState(null);

  useEffect(() => {
    if (!isEmailCallback()) return;
    let active = true;
    const finishConfirmation = async () => {
      try {
        const code = new URLSearchParams(window.location.search).get('code');
        if (code && supabase) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          // Do not leave a verification session active on the sign-in screen.
          await supabase.auth.signOut();
        } else if (supabase) {
          // Hash tokens are handled by Supabase's detectSessionInUrl option.
          await new Promise(resolve => setTimeout(resolve, 300));
          await supabase.auth.signOut();
        }
        window.history.replaceState({}, '', window.location.pathname);
        if (active) setMessage({ type: 'success', text: 'Email confirmed. Please sign in.' });
      } catch (error) {
        if (active) setMessage({ type: 'error', text: error.message || 'Email confirmation could not be completed. Please request a new link.' });
      } finally {
        if (active) setCallbackBusy(false);
      }
    };
    finishConfirmation();
    return () => { active = false; };
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    setMessage(null);
    const cleanEmail = email.trim();
    if (!cleanEmail || !cleanEmail.includes('@')) return setMessage({ type: 'error', text: 'Enter a valid email address.' });
    if (password.length < 6) return setMessage({ type: 'error', text: 'Password must be at least 6 characters.' });
    if (!isSupabaseConfigured) return setMessage({ type: 'error', text: 'Authentication is not configured for this deployment yet.' });

    setBusy(true);
    try {
      const result = mode === 'sign-in'
        ? await supabase.auth.signInWithPassword({ email: cleanEmail, password })
        : await supabase.auth.signUp({ email: cleanEmail, password, options: { data: { display_name: displayName.trim() || undefined }, emailRedirectTo: `${window.location.origin}/` } });
      if (result.error) throw result.error;
      if (mode === 'sign-up' && !result.data.session) {
        setMessage({ type: 'success', text: 'Account created. Check your email to verify it, then sign in.' });
      }
    } catch (error) {
      const text = error.message?.toLowerCase().includes('invalid login credentials')
        ? 'Email or password is incorrect.'
        : error.message || 'Authentication failed. Try again.';
      setMessage({ type: 'error', text });
    } finally { setBusy(false); }
  };

  if (callbackBusy) {
    return <main className="min-h-screen theme-bg-primary flex items-center justify-center px-5"><div className="text-center"><Loader2 className="mx-auto text-emerald-400 animate-spin" size={28} /><p className="text-sm theme-text-secondary mt-3">Confirming your email…</p></div></main>;
  }

  return (
    <main className="min-h-screen theme-bg-primary flex items-center justify-center px-5 py-6">
      <div className="w-full max-w-md -translate-y-4 animate-fade-in">
        <div className="text-center mb-5">
          <img src="/icons/icon-192.png" alt="BetaTrader" className="w-16 h-16 mx-auto mb-3 rounded-2xl shadow-lg shadow-emerald-500/20" />
          <h1 className="text-2xl font-extrabold theme-text-primary">Welcome to BetaTrader</h1>
          <p className="text-sm theme-text-secondary mt-1">Your trading companion, securely synced.</p>
        </div>
        <form onSubmit={submit} className="glass-card p-5 space-y-4">
          <div className="flex gap-2 p-1 rounded-xl theme-bg-secondary">
            <button type="button" onClick={() => { setMode('sign-in'); setMessage(null); }} className={`flex-1 py-2 rounded-lg text-sm font-semibold ${mode === 'sign-in' ? 'bg-emerald-500 text-white' : 'theme-text-secondary'}`}><LogIn size={15} className="inline mr-1" />Sign in</button>
            <button type="button" onClick={() => { setMode('sign-up'); setMessage(null); }} className={`flex-1 py-2 rounded-lg text-sm font-semibold ${mode === 'sign-up' ? 'bg-emerald-500 text-white' : 'theme-text-secondary'}`}><UserPlus size={15} className="inline mr-1" />Create account</button>
          </div>
          {message && <p className={`text-xs rounded-lg px-3 py-2 flex items-start gap-2 ${message.type === 'error' ? 'bg-red-500/10 text-red-400' : message.type === 'info' ? 'bg-blue-500/10 text-blue-400' : 'bg-emerald-500/10 text-emerald-400'}`}>{message.type === 'success' && <CheckCircle size={15} className="shrink-0" />}{message.text}</p>}
          {mode === 'sign-up' && <label className="block text-sm theme-text-secondary">Display name<input value={displayName} onChange={e => setDisplayName(e.target.value)} maxLength={80} className="input-field mt-1" placeholder="Trader" /></label>}
          <label className="block text-sm theme-text-secondary">Email<div className="relative mt-1"><Mail size={16} className="absolute left-3 top-3 text-slate-500" /><input required type="email" value={email} onChange={e => setEmail(e.target.value)} className="input-field pl-9" autoComplete="email" /></div></label>
          <label className="block text-sm theme-text-secondary">Password<div className="relative mt-1"><Lock size={16} className="absolute left-3 top-3 text-slate-500" /><input required type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} className="input-field pl-9 pr-10" autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'} /><button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-3 top-2.5 text-slate-500">{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div>{mode === 'sign-up' && <span className="block text-[11px] theme-text-muted mt-1">Minimum 6 characters</span>}</label>
          <button disabled={busy} className="w-full btn-primary flex justify-center items-center gap-2">{busy && <Loader2 size={16} className="animate-spin" />}{mode === 'sign-in' ? 'Sign in securely' : 'Create secure account'}</button>
          {mode === 'sign-in' && <button type="button" onClick={() => setMessage({ type: 'info', text: 'Password recovery will be available after redirect URLs are configured.' })} className="w-full text-xs text-emerald-400">Forgot password?</button>}
        </form>
        <p className="text-center text-[11px] theme-text-muted mt-3">Your data is private and secure.</p>
      </div>
    </main>
  );
}
