import { useEffect, useMemo, useState } from 'react';
import { Check, Eye, EyeOff, Loader2, Mail, Lock, UserPlus, LogIn, CheckCircle, Sparkles } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../../lib/supabaseClient.js';

const passwordRules = [
  { key: 'length', label: '6+ characters', test: value => value.length >= 6 },
  { key: 'upper', label: 'Uppercase A-Z', test: value => /[A-Z]/.test(value) },
  { key: 'lower', label: 'Lowercase a-z', test: value => /[a-z]/.test(value) },
  { key: 'number', label: 'Number 0-9', test: value => /\d/.test(value) },
  { key: 'special', label: 'Symbol @ $ !', test: value => /[^A-Za-z0-9]/.test(value) },
];

function consumeAuthNotice() {
  try {
    const notice = sessionStorage.getItem('betatrader:authNotice');
    sessionStorage.removeItem('betatrader:authNotice');
    return notice ? { type: 'info', text: notice } : null;
  } catch { return null; }
}

export default function AuthScreen({ initialMode = 'sign-in' }) {
  const [mode, setMode] = useState(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(consumeAuthNotice);
  const ruleState = useMemo(() => passwordRules.map(rule => ({ ...rule, passed: rule.test(password) })), [password]);
  const validPassword = ruleState.every(rule => rule.passed);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const notice = params.get('notice');
    if (notice === 'email-confirmed') setMessage({ type: 'success', text: 'Email confirmed. Please sign in.' });
    if (notice === 'link-expired') setMessage({ type: 'error', text: 'That verification link expired. Sign in to continue. If your email is still unverified, we will send a new link.' });
    if (notice) window.history.replaceState({}, '', window.location.pathname);
  }, []);

  const switchMode = nextMode => {
    setMode(nextMode);
    setMessage(null);
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setShowConfirmPassword(false);
  };

  const resendVerification = async cleanEmail => {
    const { error } = await supabase.auth.resend({ type: 'signup', email: cleanEmail, options: { emailRedirectTo: `${window.location.origin}/` } });
    if (error) throw error;
  };

  const submit = async event => {
    event.preventDefault();
    setMessage(null);
    const cleanEmail = email.trim();
    if (!cleanEmail || !cleanEmail.includes('@')) return setMessage({ type: 'error', text: 'Enter a valid email address.' });
    if (!isSupabaseConfigured) return setMessage({ type: 'error', text: 'Authentication is not configured for this deployment yet.' });

    if (mode === 'forgot') {
      setBusy(true);
      try {
        const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
          redirectTo: `${window.location.origin}/?type=recovery`,
        });
        if (error) throw error;
        setMessage({ type: 'success', text: 'If an account exists for this email, a password reset link has been sent.' });
      } catch (error) {
        setMessage({ type: 'error', text: /rate limit/i.test(error.message || '') ? 'Please wait before requesting another reset email.' : error.message || 'Password reset could not be requested.' });
      } finally { setBusy(false); }
      return;
    }

    if (mode === 'reset') {
      if (password.length < 6) return setMessage({ type: 'error', text: 'Password must be at least 6 characters.' });
      if (password !== confirmPassword) return setMessage({ type: 'error', text: 'Passwords do not match.' });
    } else if (mode === 'sign-up') {
      if (!firstName.trim() || !lastName.trim()) return setMessage({ type: 'error', text: 'Enter your first and last name.' });
      if (!validPassword) return setMessage({ type: 'error', text: 'Your password must meet all requirements.' });
      if (password !== confirmPassword) return setMessage({ type: 'error', text: 'Passwords do not match.' });
    } else if (password.length < 6) {
      return setMessage({ type: 'error', text: 'Password must be at least 6 characters.' });
    }

    setBusy(true);
    try {
      if (mode === 'reset') {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        await supabase.auth.signOut();
        setMode('sign-in');
        setPassword('');
        setConfirmPassword('');
        setMessage({ type: 'success', text: 'Your password was updated. Please sign in with your new password.' });
      } else if (mode === 'sign-in') {
        const result = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
        if (result.error) {
          const unverified = /email.*not.*confirm/i.test(result.error.message || '');
          if (unverified) {
            await resendVerification(cleanEmail);
            setMessage({ type: 'info', text: 'Your email is not verified. A new verification link has been sent to your email.' });
            return;
          }
          throw result.error;
        }
      } else {
        const { error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            data: { first_name: firstName.trim(), last_name: lastName.trim() },
            emailRedirectTo: `${window.location.origin}/`,
          },
        });
        if (error) throw error;
        setMessage({ type: 'success', text: 'Account created. A verification link has been sent to your email.' });
      }
    } catch (error) {
      const text = /invalid login credentials/i.test(error.message || '')
        ? 'Email or password is incorrect.'
        : /rate limit/i.test(error.message || '')
          ? 'Please wait before requesting another verification email.'
          : error.message || 'Authentication failed. Try again.';
      setMessage({ type: 'error', text });
    } finally { setBusy(false); }
  };

  return (
    <main className="min-h-screen theme-bg-primary flex items-center justify-center px-5 py-5">
      <div className="w-full max-w-md -translate-y-2 animate-fade-in">
        <div className="text-center mb-4">
          <div aria-label="BetaTrader" className="w-14 h-14 mx-auto mb-2 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20"><Sparkles size={27} className="text-white" /></div>
          <h1 className="text-2xl font-extrabold theme-text-primary">{mode === 'forgot' ? 'Reset your password' : mode === 'reset' ? 'Choose a new password' : 'Welcome to BetaTrader'}</h1>
          <p className="text-sm theme-text-secondary mt-1">{mode === 'forgot' ? 'We’ll email you a secure reset link.' : mode === 'reset' ? 'Create a new password for your account.' : 'Your trading companion, securely synced.'}</p>
        </div>
        <form onSubmit={submit} className="glass-card p-5 space-y-3">
          {mode !== 'reset' && <div className="flex gap-2 p-1 rounded-xl theme-bg-secondary">
            <button type="button" onClick={() => switchMode('sign-in')} className={`flex-1 py-2 rounded-lg text-sm font-semibold ${mode === 'sign-in' ? 'bg-emerald-500 text-white' : 'theme-text-secondary'}`}><LogIn size={15} className="inline mr-1" />Sign in</button>
            <button type="button" onClick={() => switchMode('sign-up')} className={`flex-1 py-2 rounded-lg text-sm font-semibold ${mode === 'sign-up' ? 'bg-emerald-500 text-white' : 'theme-text-secondary'}`}><UserPlus size={15} className="inline mr-1" />Create account</button>
          </div>}
          {message && <p className={`text-xs rounded-lg px-3 py-2 flex items-start gap-2 ${message.type === 'error' ? 'bg-red-500/10 text-red-400' : message.type === 'info' ? 'bg-blue-500/10 text-blue-400' : 'bg-emerald-500/10 text-emerald-400'}`}>{message.type === 'success' && <CheckCircle size={15} className="shrink-0" />}{message.text}</p>}
          {mode === 'sign-up' && <div className="grid grid-cols-2 gap-2"><label className="text-sm theme-text-secondary">First name<input required value={firstName} onChange={e => setFirstName(e.target.value)} maxLength={80} className="input-field mt-1" autoComplete="given-name" /></label><label className="text-sm theme-text-secondary">Last name<input required value={lastName} onChange={e => setLastName(e.target.value)} maxLength={80} className="input-field mt-1" autoComplete="family-name" /></label></div>}
          <label className="block text-sm theme-text-secondary">Email<div className="relative mt-1"><Mail size={16} className="absolute left-3 top-3 text-slate-500" /><input required type="email" value={email} onChange={e => setEmail(e.target.value)} className="input-field pl-9" autoComplete="email" /></div></label>
          {mode !== 'forgot' && <label className="block text-sm theme-text-secondary">Password<div className="relative mt-1"><Lock size={16} className="absolute left-3 top-3 text-slate-500" /><input required type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} className="input-field pl-9 pr-10" autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'} /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(value => !value)} className="absolute right-3 top-2.5 text-slate-500">{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>}
          {(mode === 'sign-up' || mode === 'reset') && <><div className="grid grid-cols-2 gap-x-2 gap-y-1">{ruleState.map(rule => <span key={rule.key} className={`text-[10px] flex items-center gap-1 ${rule.passed ? 'text-emerald-400' : 'theme-text-muted'}`}><span className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${rule.passed ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-600'}`}>{rule.passed && <Check size={10} />}</span>{rule.label}</span>)}</div><label className="block text-sm theme-text-secondary">Confirm password<div className="relative mt-1"><Lock size={16} className="absolute left-3 top-3 text-slate-500" /><input required type={showConfirmPassword ? 'text' : 'password'} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="input-field pl-9 pr-10" autoComplete="new-password" /><button type="button" aria-label={showConfirmPassword ? 'Hide confirmed password' : 'Show confirmed password'} onClick={() => setShowConfirmPassword(value => !value)} className="absolute right-3 top-2.5 text-slate-500">{showConfirmPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div>{confirmPassword && <span className={`block text-[10px] mt-1 ${password === confirmPassword ? 'text-emerald-400' : 'text-red-400'}`}>{password === confirmPassword ? 'Passwords match' : 'Passwords do not match'}</span>}</label></>}
          <button disabled={busy} className="w-full btn-primary flex justify-center items-center gap-2 disabled:opacity-60">{busy && <Loader2 size={16} className="animate-spin" />}{mode === 'sign-in' ? 'Sign in securely' : mode === 'forgot' ? 'Send reset link' : mode === 'reset' ? 'Update password' : 'Create secure account'}</button>
          {mode === 'sign-in' && <button type="button" onClick={() => switchMode('forgot')} className="w-full text-xs text-emerald-400">Forgot password?</button>}
          {(mode === 'forgot' || mode === 'reset') && <button type="button" onClick={() => switchMode('sign-in')} className="w-full text-xs theme-text-secondary">Back to sign in</button>}
        </form>
      </div>
    </main>
  );
}
