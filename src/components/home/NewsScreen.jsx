import { ArrowLeft, RefreshCw, AlertTriangle } from 'lucide-react';
import { useApp } from '../../AppContext.jsx';
import { useNews } from '../../hooks/useNews.js';

export default function NewsScreen() {
  const { goBack, navigateToNews, setActiveTab } = useApp();
  const { news, isLoading, error, reload } = useNews();
  const handleBack = () => { setActiveTab('home'); goBack(); };

  return (
    <div className="px-4 pt-4 pb-6 animate-fade-in">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={handleBack} className="w-9 h-9 glass-card flex items-center justify-center" aria-label="Back"><ArrowLeft size={18} /></button>
        <h1 className="text-xl font-extrabold">Latest News</h1>
      </div>
      {isLoading && <div className="glass-card p-8 text-center"><RefreshCw size={20} className="mx-auto text-emerald-400 animate-spin" /><p className="text-sm theme-text-secondary mt-2">Loading live news...</p></div>}
      {!isLoading && error && <div className="glass-card p-6 text-center"><AlertTriangle size={20} className="mx-auto text-amber-400 mb-2" /><p className="text-sm text-amber-400 mb-3">{error}</p><button onClick={reload} className="btn-secondary mx-auto">Retry</button></div>}
      {!isLoading && !error && <div className="flex flex-col gap-3">{news.map(article => <button key={article.id} onClick={() => navigateToNews(article)} className="glass-card-hover p-4 text-left"><p className="text-xs theme-text-secondary mb-2">{article.source}</p><p className="text-sm font-semibold leading-relaxed mb-2 theme-text-primary">{article.headline}</p><p className="text-xs theme-text-secondary line-clamp-2">{article.summary}</p></button>)}</div>}
    </div>
  );
}
