import { useEffect, useState } from 'react';
import { Sparkles, RefreshCw, X } from 'lucide-react';
import { marketPulseExplainers } from '../../data/marketPulseExplainers.js';

export default function MarketPulseExplainer({ metric, onClose }) {
  const [explanation, setExplanation] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showAIButton, setShowAIButton] = useState(true);
  const content = metric ? marketPulseExplainers[metric.label] : null;

  useEffect(() => {
    if (!metric) return undefined;
    setExplanation('');
    setIsLoading(false);
    setShowAIButton(true);
    const onKeyDown = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [metric, onClose]);

  if (!metric || !content) return null;

  const loadContext = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ metric: metric.label, value: metric.value, signal: metric.sublabel });
      const response = await fetch(`/api/market-overview/explain?${params}`);
      const data = await response.json();
      if (!response.ok || !data.explanation) throw new Error(data.error || 'Unavailable');
      setExplanation(data.explanation);
    } catch {
      setShowAIButton(false);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center sm:justify-center" role="dialog" aria-modal="true" aria-labelledby="pulse-explainer-title">
      <button className="absolute inset-0 bg-slate-950/75 backdrop-blur-sm" onClick={onClose} aria-label="Close market pulse explainer" />
      <div className="relative w-full sm:max-w-md bg-slate-900 border border-slate-700/70 rounded-t-3xl sm:rounded-3xl p-5 pb-7 shadow-2xl animate-fade-in max-h-[85vh] overflow-y-auto">
        <div className="w-10 h-1 rounded-full bg-slate-700 mx-auto mb-4 sm:hidden" />
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.15em] text-emerald-400 font-bold mb-1">Market Pulse</p>
            <h2 id="pulse-explainer-title" className="text-lg font-bold text-slate-100">{content.title}</h2>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-xl bg-slate-800 text-slate-400 flex items-center justify-center hover:text-white" aria-label="Close"><X size={18} /></button>
        </div>

        <div className="flex items-center gap-3 mb-4 p-3 rounded-xl bg-slate-950/50 border border-slate-800">
          <span className="text-xl font-bold font-mono text-slate-100">{metric.value}</span>
          <span className={`text-xs font-semibold ${metric.color === 'emerald' ? 'text-emerald-400' : metric.color === 'warning' ? 'text-amber-400' : 'text-slate-400'}`}>{metric.sublabel}</span>
        </div>

        <div className="space-y-4">
          <div><p className="text-xs font-bold text-slate-300 mb-1.5">What it measures</p><p className="text-[13px] leading-relaxed text-slate-400">{content.definition}</p></div>
          <div><p className="text-xs font-bold text-slate-300 mb-1.5">How to read this value</p><p className="text-[13px] leading-relaxed text-slate-400">{content.read(metric.value, metric.sublabel)}</p></div>
        </div>

        {explanation && <div className="mt-5 p-4 rounded-xl bg-emerald-500/7 border border-emerald-500/15">
          <p className="text-[10px] uppercase tracking-wider text-emerald-400 font-bold flex items-center gap-1.5 mb-2"><Sparkles size={12} /> AI Market Context</p>
          <p className="text-[13px] leading-relaxed text-slate-300">{explanation}</p>
        </div>}

        {showAIButton && !explanation && <button onClick={loadContext} disabled={isLoading} className="mt-5 w-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 hover:bg-emerald-500/15 disabled:opacity-60">
          {isLoading ? <RefreshCw size={15} className="animate-spin" /> : <Sparkles size={15} />}
          {isLoading ? 'Explaining in context…' : 'Explain this in context'}
        </button>}
      </div>
    </div>
  );
}
