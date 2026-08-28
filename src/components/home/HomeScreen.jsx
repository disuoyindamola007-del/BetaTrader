import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useApp } from '../../AppContext.jsx';
import {
  Search, TrendingUp, TrendingDown, ArrowRight,
  Activity, BookOpen, Bell, BarChart3,
  ChevronRight, Sparkles, RefreshCw, Clock
} from 'lucide-react';
import { mockAssets, watchlist, trending } from '../../data/mockData.js';
import { useNews } from '../../hooks/useNews.js';
import { useMarketOverview } from '../../hooks/useMarketOverview.js';
import { useCryptoBatch, useCandles, useBatchQuotes } from '../../hooks/useMarketData.js';
import { getCategory } from '../../services/marketDataService.js';
import AIBadge from '../shared/AIBadge.jsx';
import PriceChange from '../shared/PriceChange.jsx';
import MarketPulseExplainer from './MarketPulseExplainer.jsx';

export default function HomeScreen() {
  const { navigateToAsset, navigateToNews, setActiveTab, openMarketSearch, userName } = useApp();
  const { news: liveNews, isLoading: newsLoading, error: newsError } = useNews();
  const {
    pulse: livePulse, briefing: liveBriefing, briefingGeneratedAt,
    pulseLoading, briefingLoading, pulseError, briefingError,
    reloadPulse, reloadBriefing,
  } = useMarketOverview();
  const [briefingExpanded, setBriefingExpanded] = useState(false);
  const [selectedPulseMetric, setSelectedPulseMetric] = useState(null);
  const [greeting, setGreeting] = useState('');
  const [currentTime, setCurrentTime] = useState('');
  const [session, setSession] = useState('');
  const homeChartRef = useRef(null);
  const homeChartInstance = useRef(null);
  const homeChartObserver = useRef(null);

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('Good Morning');
    else if (hour < 18) setGreeting('Good Afternoon');
    else setGreeting('Good Evening');

    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }));
      const h = now.getUTCHours();
      if (h >= 0 && h < 8) setSession('Sydney Session');
      else if (h >= 8 && h < 16) setSession('London Session');
      else setSession('New York Session');
    };
    updateTime();
    const interval = setInterval(updateTime, 60000);
    return () => clearInterval(interval);
  }, []);

  const { data: cryptoData, isLoading: cryptoLoading, isStale: cryptoStale } = useCryptoBatch(true);
  const { data: btcCandles, error: chartError } = useCandles('BTC', '1h', { enabled: true, limit: 100 });

  // FIX: watchlist entries are already symbol strings (e.g. 'EUR/USD', 'BTC'),
  // not objects — the old `.map(w => w.symbol)` produced `undefined` for every
  // entry, which caused malformed batch requests like /api/stocks/,,,,, 
  const watchlistSymbols = useMemo(() =>
    watchlist.filter(s => getCategory(s) !== 'crypto'),
  []);
  const { data: watchlistQuotes, isLoading: wlLoading, isStale: wlStale } = useBatchQuotes(watchlistSymbols, watchlistSymbols.length > 0);

  const livePrices = useMemo(() => ({ ...cryptoData, ...watchlistQuotes }), [cryptoData, watchlistQuotes]);
  const isLoading = cryptoLoading || wlLoading;
  const isStale = cryptoStale || wlStale;

  const renderHomeChart = useCallback(async (candles) => {
    if (!homeChartRef.current || !candles?.length) return;
    try {
      const charts = await import('lightweight-charts');
      const { createChart, CandlestickSeries } = charts;
      if (homeChartInstance.current) { homeChartInstance.current.remove(); homeChartInstance.current = null; }
      homeChartRef.current.innerHTML = '';
      const chart = createChart(homeChartRef.current, {
        layout: { background: { color: 'transparent' }, textColor: '#94a3b8', fontFamily: 'system-ui, -apple-system, sans-serif' },
        grid: { vertLines: { color: 'rgba(51, 65, 85, 0.3)' }, horzLines: { color: 'rgba(51, 65, 85, 0.3)' } },
        crosshair: { mode: 0 },
        rightPriceScale: { borderColor: 'rgba(51, 65, 85, 0.5)' },
        timeScale: { borderColor: 'rgba(51, 65, 85, 0.5)', timeVisible: true },
        height: 180,
        handleScroll: false,
        handleScale: false,
      });
      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: '#10b981', downColor: '#ef4444',
        borderUpColor: '#10b981', borderDownColor: '#ef4444',
        wickUpColor: '#10b981', wickDownColor: '#ef4444',
      });
      candleSeries.setData(candles);
      chart.timeScale().fitContent();
      homeChartInstance.current = chart;
      if (homeChartObserver.current) { homeChartObserver.current.disconnect(); homeChartObserver.current = null; }
      const ro = new ResizeObserver(() => {
        if (homeChartInstance.current && homeChartRef.current) {
          homeChartInstance.current.applyOptions({ width: homeChartRef.current.clientWidth, height: 180 });
        }
      });
      ro.observe(homeChartRef.current);
      homeChartObserver.current = ro;
    } catch (err) { console.error('Home chart error:', err); }
  }, []);

  useEffect(() => { if (btcCandles?.length) renderHomeChart(btcCandles); }, [btcCandles, renderHomeChart]);
  useEffect(() => () => {
    if (homeChartObserver.current) { homeChartObserver.current.disconnect(); homeChartObserver.current = null; }
    if (homeChartInstance.current) { homeChartInstance.current.remove(); homeChartInstance.current = null; }
  }, []);

  const getAssetData = (symbol) => {
    const mock = mockAssets.find(a => a.symbol === symbol);
    const live = livePrices[symbol.replace('/', '')];
    return live && mock ? { ...mock, price: live.price, change: live.change, changePct: live.changePct } : mock;
  };

  const getLiveTrending = () => {
    const syms = ['BTC','ETH','SOL','XRP','BNB','ADA','DOT','LINK'];
    const arr = syms.map(s => ({ symbol: s, ...livePrices[s] })).filter(x => x.price).sort((a,b) => Math.abs(b.changePct) - Math.abs(a.changePct));
    return { gainers: arr.filter(x => x.changePct > 0).slice(0,3), losers: arr.filter(x => x.changePct < 0).slice(0,3) };
  };

  const watchlistAssets = watchlist.map(getAssetData).filter(Boolean);
  const liveTrending = Object.keys(livePrices).length > 0 ? getLiveTrending() : trending;

  const displayedNews = liveNews.length > 0 ? liveNews : [];

  return (
    <div className="px-4 pt-4 pb-6 animate-fade-in">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Sparkles size={20} className="text-white" />
          </div>
          <h1 className="text-xl font-extrabold tracking-tight">BetaTrader</h1>
        </div>
        <div className="flex items-center gap-2">
          {isLoading && <RefreshCw size={16} className="text-emerald-400 animate-spin" />}
          {isStale && <span className="text-[10px] text-amber-400 flex items-center gap-1"><Clock size={10} />Stale</span>}
        </div>
      </div>

      <div className="mb-5">
        <p className="text-sm text-slate-400">{greeting}, {userName}</p>
        <p className="text-xs text-slate-500">{session} &bull; {currentTime} UTC</p>
      </div>

      <div className="mb-5 bg-gradient-to-br from-emerald-500/8 via-emerald-500/4 to-cyan-500/5 border border-emerald-500/15 rounded-2xl p-4 glow-emerald">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">🤖</span>
            <span className="text-[11px] font-bold tracking-[0.15em] text-emerald-400 uppercase">Daily AI Briefing</span>
          </div>
          {briefingGeneratedAt && <span className="text-[9px] text-slate-500">Live • {new Date(briefingGeneratedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
        </div>
        {briefingLoading && <div className="py-8 flex justify-center"><RefreshCw size={20} className="text-emerald-400 animate-spin" /></div>}
        {!briefingLoading && liveBriefing && <>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-sm font-semibold text-slate-100">{liveBriefing.sentiment}</span>
            <span className="badge-bullish">{liveBriefing.confidence}% Conf</span>
          </div>
          <p className="text-[13px] text-slate-300 leading-relaxed mb-4">{liveBriefing.summary}</p>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div><p className="text-[10px] text-slate-500 uppercase tracking-wider">Volatility</p><p className="text-sm font-semibold text-amber-400">{liveBriefing.volatility}</p></div>
            <div><p className="text-[10px] text-slate-500 uppercase tracking-wider">Key Risk</p><p className="text-sm font-semibold text-slate-200">{liveBriefing.keyRisk}</p></div>
          </div>
          {briefingExpanded && <div className="mb-4 border-t border-slate-700/40 pt-3 space-y-3">
            <div><p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Key Drivers</p><ul className="space-y-1">{liveBriefing.keyDrivers.map((item, index) => <li key={index} className="text-xs text-slate-300">• {item}</li>)}</ul></div>
            <div><p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">What to Watch</p><ul className="space-y-1">{liveBriefing.watchNext.map((item, index) => <li key={index} className="text-xs text-slate-300">• {item}</li>)}</ul></div>
          </div>}
          <button onClick={() => setBriefingExpanded(value => !value)} className="w-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 hover:bg-emerald-500/15 transition-colors">
            {briefingExpanded ? 'Show Less' : 'Read Full Analysis'} <ArrowRight size={14} className={briefingExpanded ? '-rotate-90' : 'rotate-90'} />
          </button>
        </>}
        {!briefingLoading && !liveBriefing && <div className="py-4 text-center"><p className="text-sm text-amber-400 mb-3">{briefingError || 'Daily AI Briefing is temporarily unavailable.'}</p><button onClick={reloadBriefing} className="text-xs text-emerald-400">Try Again</button></div>}
      </div>

      <div className="mb-5">
        <div className="flex items-center justify-between mb-3"><span className="section-title">Market Pulse</span>{livePulse.length > 0 && <span className="text-[10px] text-emerald-400 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />Live</span>}</div>
        {pulseLoading && <div className="glass-card p-5 flex justify-center"><RefreshCw size={18} className="text-emerald-400 animate-spin" /></div>}
        {!pulseLoading && livePulse.length > 0 && <div className="grid grid-cols-3 gap-2">
          {livePulse.map((item) => (
            <button key={item.label} onClick={() => setSelectedPulseMetric(item)} className="glass-card p-3 text-center hover:border-emerald-500/30 active:scale-[0.98] transition-all" aria-label={`Explain ${item.label}`}>
              <p className="text-[10px] text-slate-500 mb-1">{item.label}</p>
              <p className="text-base font-bold font-mono text-slate-100">{item.value}</p>
              <p className={`text-[10px] font-medium ${item.color === 'emerald' ? 'text-emerald-400' : item.color === 'warning' ? 'text-amber-400' : 'text-slate-400'}`}>{item.sublabel}</p>
              <p className="text-[9px] text-slate-600 mt-1">Tap to explain</p>
            </button>
          ))}
        </div>}
        {!pulseLoading && livePulse.length === 0 && <div className="glass-card p-4 text-center"><p className="text-sm text-amber-400 mb-2">{pulseError || 'Live Market Pulse is temporarily unavailable.'}</p><button onClick={reloadPulse} className="text-xs text-emerald-400">Try Again</button></div>}
      </div>

      <div className="mb-5">
        <div className="flex items-center justify-between mb-3">
          <span className="section-title">BTC/USDT — 1H</span>
          <button onClick={() => { const a = mockAssets.find(x => x.symbol === 'BTC'); if (a) navigateToAsset(a); }} className="text-xs text-emerald-400 font-medium hover:text-emerald-300 transition-colors flex items-center gap-1">Open <ChevronRight size={12} /></button>
        </div>
        <div className="glass-card p-2 relative" style={{ minHeight: '180px' }}>
          <div ref={homeChartRef} style={{ width: '100%', height: '180px', position: 'relative' }} />
          {chartError && <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/60 rounded-lg"><p className="text-xs text-red-400">{chartError}</p></div>}
        </div>
      </div>

      <div className="mb-5">
        <div className="flex items-center justify-between mb-3">
          <span className="section-title">Watchlist</span>
          <button onClick={() => setActiveTab('markets')} className="text-xs text-emerald-400 font-medium hover:text-emerald-300 transition-colors flex items-center gap-1">View All <ChevronRight size={12} /></button>
        </div>
        <div className="flex flex-col gap-2">
          {watchlistAssets.map((asset) => (
            <button key={asset.symbol} onClick={() => navigateToAsset(asset)} className="glass-card-hover p-3.5 flex items-center justify-between text-left">
              <div className="flex items-center gap-3">
                <div>
                  <p className="text-sm font-bold">{asset.symbol}</p>
                  <AIBadge bias={asset.bias} confidence={asset.confidence} />
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold font-mono">{asset.symbol === 'BTC' ? `$${asset.price?.toLocaleString() || asset.price}` : asset.price?.toFixed(4) || asset.price}</p>
                <PriceChange value={asset.change} pct={asset.changePct} />
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="mb-5">
        <div className="flex items-center justify-between mb-3">
          <span className="section-title">Trending Today</span>
          {Object.keys(livePrices).length > 0 && <span className="text-[10px] text-emerald-400 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />Live</span>}
        </div>
        <div className="flex gap-2 overflow-x-auto scroll-hide pb-1">
          {liveTrending.gainers?.map((item) => (
            <button key={item.symbol} onClick={() => navigateToAsset(mockAssets.find(a => a.symbol === item.symbol) || { symbol: item.symbol, name: item.symbol, category: 'crypto', bias: 'neutral', confidence: 50 })} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/8 border border-emerald-500/15 whitespace-nowrap hover:bg-emerald-500/12 transition-colors">
              <span className="text-sm font-semibold">{item.symbol}</span><TrendingUp size={14} className="text-emerald-400" /><span className="text-sm font-bold font-mono text-emerald-400">+{item.changePct?.toFixed(2)}%</span>
            </button>
          ))}
          {liveTrending.losers?.map((item) => (
            <button key={item.symbol} onClick={() => navigateToAsset(mockAssets.find(a => a.symbol === item.symbol) || { symbol: item.symbol, name: item.symbol, category: 'crypto', bias: 'neutral', confidence: 50 })} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-500/8 border border-red-500/15 whitespace-nowrap hover:bg-red-500/12 transition-colors">
              <span className="text-sm font-semibold">{item.symbol}</span><TrendingDown size={14} className="text-red-400" /><span className="text-sm font-bold font-mono text-red-400">{item.changePct?.toFixed(2)}%</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mb-5">
        <div className="flex items-center justify-between mb-3"><span className="section-title">Latest News</span><button onClick={() => setActiveTab('news')} className="text-xs text-emerald-400 font-medium">View All <ChevronRight size={12} className="inline" /></button></div>
        <div className="flex flex-col gap-3">
          {newsLoading && <div className="glass-card p-5 text-center"><RefreshCw size={18} className="mx-auto text-emerald-400 animate-spin" /></div>}
          {!newsLoading && newsError && <div className="glass-card p-4 text-center text-sm text-amber-400">News is temporarily unavailable.</div>}
          {!newsLoading && !newsError && displayedNews.slice(0, 3).map((news) => (
            <button key={news.id} onClick={() => navigateToNews(news)} className="glass-card-hover p-4 text-left">
              <div className="flex items-center gap-2 mb-2"><span className="text-xs text-slate-500">{news.source}</span><span className="text-xs text-slate-600">&bull;</span><span className="text-xs text-slate-500">{news.datetime ? new Date(news.datetime * 1000).toLocaleDateString() : ''}</span></div>
              <p className="text-sm font-semibold leading-relaxed mb-3">{news.headline}</p>
              <div className="flex gap-2 flex-wrap">{news.related.map(tag => <span key={tag} className="text-[10px] text-slate-400 bg-slate-800/60 px-2 py-1 rounded-md border border-slate-700/30">{tag}</span>)}<span className="text-[10px] text-emerald-400 bg-emerald-500/8 px-2 py-1 rounded-md border border-emerald-500/15 flex items-center gap-1"><Sparkles size={10} /> AI Summary</span></div>
            </button>
          ))}
          {!newsLoading && !newsError && displayedNews.length === 0 && <div className="glass-card p-4 text-center text-sm text-slate-500">No news available.</div>}
        </div>
      </div>

      <div className="mb-5">
        <div className="flex items-center justify-between mb-3"><span className="section-title">Economic Calendar</span></div>
        <div className="glass-card p-6 flex flex-col items-center text-center gap-2">
          <Clock size={20} className="text-slate-500" />
          <p className="text-sm font-semibold text-slate-300">Coming Soon</p>
          <p className="text-[11px] text-slate-500">Live economic events will appear here shortly.</p>
        </div>
      </div>

      <div className="mb-8">
        <div className="flex items-center justify-between mb-3"><span className="section-title">Quick Actions</span></div>
        <div className="grid grid-cols-2 gap-2.5">
          <button onClick={openMarketSearch} className="glass-card p-4 flex flex-col items-center gap-2 hover:border-emerald-500/30 transition-colors group"><Search size={20} className="text-emerald-400 group-hover:scale-110 transition-transform" /><span className="text-xs font-semibold text-slate-300">Analyze Asset</span></button>
          <button onClick={() => setActiveTab('markets')} className="glass-card p-4 flex flex-col items-center gap-2 hover:border-blue-500/30 transition-colors group"><BarChart3 size={20} className="text-blue-400 group-hover:scale-110 transition-transform" /><span className="text-xs font-semibold text-slate-300">Run Backtest</span></button>
          <button onClick={() => setActiveTab('journal')} className="glass-card p-4 flex flex-col items-center gap-2 hover:border-violet-500/30 transition-colors group"><BookOpen size={20} className="text-violet-400 group-hover:scale-110 transition-transform" /><span className="text-xs font-semibold text-slate-300">Open Journal</span></button>
          <button onClick={() => setActiveTab('alerts')} className="glass-card p-4 flex flex-col items-center gap-2 hover:border-amber-500/30 transition-colors group"><Bell size={20} className="text-amber-400 group-hover:scale-110 transition-transform" /><span className="text-xs font-semibold text-slate-300">Create Alert</span></button>
        </div>
      </div>

      <MarketPulseExplainer metric={selectedPulseMetric} onClose={() => setSelectedPulseMetric(null)} />
    </div>
  );
}
