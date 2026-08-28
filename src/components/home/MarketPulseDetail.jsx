import { useEffect, useState } from 'react';
import { ArrowLeft, RefreshCw, Sparkles } from 'lucide-react';
import { useApp } from '../../AppContext.jsx';
import { marketPulseExplainers } from '../../data/marketPulseExplainers.js';

export default function MarketPulseDetail({ metric }) {
  const { goBack } = useApp();
  const [explanation, setExplanation] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const content = marketPulseExplainers[metric.label];

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    async function loadContext() {
      try {
        const params = new URLSearchParams({
          metric: metric.label,
          value: metric.value,
          signal: metric.sublabel,
        });
        const response = await fetch(`/api/market-overview/explain?${params}`, { signal: controller.signal });
        const data = await response.json();
        if (!response.ok || !data.explanation) throw new Error(data.error || 'Context unavailable');
        setExplanation(data.explanation);
      } catch (error) {
        if (error.name !== 'AbortError') console.error('Market context unavailable:', error.message);
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }

    loadContext();
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [metric]);

  if (!content) return null;

  return (
    <div className="animate-slide-up">
      <div className="sticky top-0 z-10 bg-slate-950/90 backdrop-blur-xl border-b border-slate-800/50 px-4 py-3 flex items-center gap-3">
        <button onClick={goBack} className="w-9 h-9 glass-card flex items-center justify-center hover:bg-slate-800 transition-colors" aria-label="Back"><ArrowLeft size={18} /></button>
        <span className="text-sm font-bold text-slate-200">Market Pulse</span>
      </div>

      <article className="px-4 pt-5 pb-8">
        <p className="text-[10px] uppercase tracking-[0.15em] text-emerald-400 font-bold mb-2">Live Market Metric</p>
        <h1 className="text-2xl font-extrabold leading-tight mb-5">{content.title}</h1>

        <div className="bg-gradient-to-br from-emerald-500/10 to-cyan-500/5 border border-emerald-500/20 rounded-2xl p-5 mb-5">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Current reading</p>
          <div className="flex items-end gap-3">
            <span className="text-3xl font-extrabold font-mono text-slate-100">{metric.value}</span>
            <span className={`text-sm font-semibold pb-1 ${metric.color === 'emerald' ? 'text-emerald-400' : metric.color === 'warning' ? 'text-amber-400' : 'text-slate-400'}`}>{metric.sublabel}</span>
          </div>
        </div>

        <div className="glass-card p-5 mb-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-100 mb-2">What it measures</h2>
          <p className="text-sm leading-relaxed text-slate-300">{content.definition}</p>
        </div>

        <div className="glass-card p-5 mb-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-100 mb-2">How to read this value</h2>
          <p className="text-sm leading-relaxed text-slate-300">{content.read(metric.value, metric.sublabel)}</p>
        </div>

        {(isLoading || explanation) && <div className="bg-emerald-500/8 border border-emerald-500/15 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3"><Sparkles size={16} className="text-emerald-400" /><span className="text-[11px] font-bold tracking-wider text-emerald-400 uppercase">AI Market Context</span></div>
          {isLoading && <div className="flex items-center gap-2 text-sm text-slate-400"><RefreshCw size={15} className="animate-spin" />Reading the current market context...</div>}
          {!isLoading && explanation && <p className="text-sm leading-relaxed text-slate-300">{explanation}</p>}
        </div>}
      </article>
    </div>
  );
}
