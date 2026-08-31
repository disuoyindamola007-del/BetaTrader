import { useEffect, useState } from 'react';
import { ArrowLeft, ExternalLink, RefreshCw, Sparkles, AlertTriangle } from 'lucide-react';
import { useApp } from '../../AppContext.jsx';

function formatDate(timestamp) {
  if (!timestamp) return '';
  return new Date(timestamp * 1000).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

export default function NewsDetail({ article }) {
  const { goBack } = useApp();
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    async function loadSummary() {
      try {
        const params = new URLSearchParams({ headline: article.headline, source: article.source, article: article.summary || article.headline });
        const response = await fetch(`/api/news/summary?${params}`, { signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Summary unavailable');
        setSummary(data.summary);
      } catch (err) {
        if (err.name !== 'AbortError') setError(err.message);
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }
    loadSummary();
    return () => controller.abort();
  }, [article]);

  return (
    <div className="animate-slide-up">
      <div className="sticky top-0 z-10 theme-bg-secondary/90 backdrop-blur-xl border-b theme-border px-4 py-3">
        <button onClick={goBack} className="w-9 h-9 glass-card flex items-center justify-center hover:bg-slate-800 transition-colors" aria-label="Back"><ArrowLeft size={18} /></button>
      </div>
      <article className="px-4 pt-5 pb-8">
        <div className="flex items-center gap-2 text-xs text-slate-500 mb-3"><span>{article.source}</span><span>&bull;</span><span>{formatDate(article.datetime)}</span></div>
        <h1 className="text-xl font-extrabold leading-tight mb-5">{article.headline}</h1>
        <div className="bg-emerald-500/8 border border-emerald-500/15 rounded-2xl p-4 mb-5">
          <div className="flex items-center gap-2 mb-3"><Sparkles size={16} className="text-emerald-400" /><span className="text-[11px] font-bold tracking-wider text-emerald-400 uppercase">AI News Breakdown</span></div>
          {isLoading && <div className="flex items-center gap-2 text-sm text-slate-400"><RefreshCw size={15} className="animate-spin" />Preparing summary...</div>}
          {!isLoading && error && <div className="flex items-start gap-2 text-sm text-amber-400"><AlertTriangle size={15} className="mt-0.5 shrink-0" />{error}</div>}
          {!isLoading && !error && summary && (
            <div className="space-y-5 text-sm text-slate-300 leading-relaxed">
              <section>
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-100 mb-2">Overview</h2>
                <p>{summary.overview}</p>
              </section>
              <section>
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-100 mb-2">Key developments</h2>
                <ul className="space-y-2">
                  {summary.keyDevelopments.map((item, index) => <li key={index} className="flex gap-2"><span className="text-emerald-400">•</span><span>{item}</span></li>)}
                </ul>
              </section>
              <section>
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-100 mb-2">Why it matters</h2>
                <p>{summary.whyItMatters}</p>
              </section>
              <section>
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-100 mb-2">Possible market impact</h2>
                <p>{summary.marketImpact}</p>
              </section>
              <section>
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-100 mb-2">What to watch next</h2>
                <ul className="space-y-2">
                  {summary.whatToWatch.map((item, index) => <li key={index} className="flex gap-2"><span className="text-emerald-400">•</span><span>{item}</span></li>)}
                </ul>
              </section>
            </div>
          )}
        </div>
        <div className="glass-card p-4 mb-5"><p className="text-[10px] text-slate-500 uppercase mb-2">Source description</p><p className="text-sm text-slate-300 leading-relaxed">{article.summary || 'The source did not provide an article description.'}</p></div>
        <a href={article.url} target="_blank" rel="noreferrer" className="btn-primary w-full"><ExternalLink size={16} />Read from {article.source}</a>
      </article>
    </div>
  );
}
