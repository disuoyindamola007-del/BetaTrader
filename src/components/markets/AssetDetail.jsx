import { useApp } from '../../AppContext.jsx';
import { ArrowLeft, Heart, Share2, Bell, Sparkles } from 'lucide-react';
import { assetDetails, newsItems } from '../../data/mockData.js';
import PriceChange from '../shared/PriceChange.jsx';

export default function AssetDetail() {
  const { selectedAsset, goBack, setActiveTab } = useApp();

  if (!selectedAsset) return null;

  const details = assetDetails[selectedAsset.symbol] || {};
  const relatedNews = newsItems.filter(n => n.related.includes(selectedAsset.symbol));

  const getSignalColor = (type) => {
    if (type === 'bullish') return 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400';
    if (type === 'bearish') return 'bg-red-500/10 border-red-500/20 text-red-400';
    return 'bg-amber-500/10 border-amber-500/20 text-amber-400';
  };

  return (
    <div className="animate-slide-up">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-slate-950/90 backdrop-blur-xl border-b border-slate-800/50 px-4 py-3">
        <div className="flex items-center justify-between">
          <button onClick={goBack} className="w-9 h-9 glass-card flex items-center justify-center hover:bg-slate-800 transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div className="text-center">
            <p className="text-sm font-bold">{selectedAsset.symbol}</p>
            <p className="text-[10px] text-slate-500">{selectedAsset.name}</p>
          </div>
          <div className="flex gap-2">
            <button className="w-9 h-9 glass-card flex items-center justify-center text-slate-400 hover:text-red-400 transition-colors">
              <Heart size={16} />
            </button>
            <button className="w-9 h-9 glass-card flex items-center justify-center text-slate-400 hover:text-slate-200 transition-colors">
              <Share2 size={16} />
            </button>
          </div>
        </div>
      </div>

      <div className="px-4 pt-4 pb-6">
        {/* Price Header */}
        <div className="mb-5">
          <p className="text-3xl font-extrabold font-mono mb-1">${selectedAsset.price.toLocaleString()}</p>
          <PriceChange value={selectedAsset.change} pct={selectedAsset.changePct} size="lg" />
        </div>

        {/* Chart Placeholder */}
        <div className="glass-card p-4 mb-5 h-48 flex items-center justify-center">
          <div className="text-center">
            <p className="text-sm text-slate-500 mb-2">Interactive Chart</p>
            <p className="text-xs text-slate-600">TradingView Lightweight Charts</p>
          </div>
        </div>

        {/* Timeframes */}
        <div className="flex gap-2 mb-5 overflow-x-auto scroll-hide">
          {['1m', '5m', '15m', '1H', '4H', '1D', '1W', '1M'].map(tf => (
            <button key={tf} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
              tf === '1D' ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800/60 text-slate-400'
            }`}>
              {tf}
            </button>
          ))}
        </div>

        {/* AI Analysis */}
        <div className="mb-5 bg-gradient-to-br from-emerald-500/8 to-cyan-500/5 border border-emerald-500/15 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={16} className="text-emerald-400" />
            <span className="text-[11px] font-bold tracking-wider text-emerald-400 uppercase">AI Analysis</span>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <p className="text-[10px] text-slate-500 uppercase">Trend</p>
              <p className="text-sm font-semibold text-slate-200">{details.trend || 'Analyzing...'}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-500 uppercase">RSI (14)</p>
              <p className="text-sm font-semibold text-slate-200">{details.rsi || '--'} <span className="text-xs text-slate-500">{details.rsiSignal}</span></p>
            </div>
            <div>
              <p className="text-[10px] text-slate-500 uppercase">Support</p>
              <p className="text-sm font-semibold text-emerald-400">{details.support || '--'}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-500 uppercase">Resistance</p>
              <p className="text-sm font-semibold text-red-400">{details.resistance || '--'}</p>
            </div>
          </div>
          {details.technicalSignal && (
            <div className={`p-3 rounded-xl border ${getSignalColor(details.signalType)}`}>
              <p className="text-[10px] font-bold uppercase tracking-wider mb-1">Technical Signal</p>
              <p className="text-sm font-semibold">{details.technicalSignal}</p>
            </div>
          )}
        </div>

        {/* Technical Indicators */}
        <div className="mb-5">
          <p className="section-title mb-3">Technical Indicators</p>
          <div className="flex flex-col gap-2">
            <div className="glass-card p-3">
              <p className="text-[10px] text-slate-500 uppercase mb-1">MACD (12/26/9)</p>
              <div className="flex gap-4">
                <span className="text-xs font-mono">Line: {details.macd?.line || '--'}</span>
                <span className="text-xs font-mono">Sig: {details.macd?.signal || '--'}</span>
                <span className="text-xs font-mono text-emerald-400">Hist: {details.macd?.hist || '--'}</span>
              </div>
            </div>
            <div className="glass-card p-3">
              <p className="text-[10px] text-slate-500 uppercase mb-1">Bollinger Bands (20, 2)</p>
              <div className="flex gap-4">
                <span className="text-xs font-mono">L: {details.bollinger?.lower || '--'}</span>
                <span className="text-xs font-mono font-bold">M: {details.bollinger?.middle || '--'}</span>
                <span className="text-xs font-mono">U: {details.bollinger?.upper || '--'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Market Stats */}
        <div className="mb-5">
          <p className="section-title mb-3">Market Statistics</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="glass-card p-3">
              <p className="text-[10px] text-slate-500 uppercase">24H High</p>
              <p className="text-sm font-semibold font-mono">{details.high24 || '--'}</p>
            </div>
            <div className="glass-card p-3">
              <p className="text-[10px] text-slate-500 uppercase">24H Low</p>
              <p className="text-sm font-semibold font-mono">{details.low24 || '--'}</p>
            </div>
            <div className="glass-card p-3">
              <p className="text-[10px] text-slate-500 uppercase">Volume</p>
              <p className="text-sm font-semibold font-mono">{details.volume || '--'}</p>
            </div>
          </div>
        </div>

        {/* Related News */}
        {relatedNews.length > 0 && (
          <div className="mb-5">
            <p className="section-title mb-3">Related News</p>
            <div className="flex flex-col gap-2">
              {relatedNews.map(news => (
                <div key={news.id} className="glass-card p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] text-slate-500">{news.source}</span>
                    <span className="text-[10px] text-slate-600">&bull;</span>
                    <span className="text-[10px] text-slate-500">{news.time}</span>
                  </div>
                  <p className="text-xs font-semibold leading-relaxed">{news.headline}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2">
          <button 
            onClick={() => setActiveTab('alerts')}
            className="flex-1 btn-secondary"
          >
            <Bell size={16} />
            Create Alert
          </button>
          <button className="flex-1 btn-primary">
            <Sparkles size={16} />
            Analyze
          </button>
        </div>
      </div>
    </div>
  );
}
