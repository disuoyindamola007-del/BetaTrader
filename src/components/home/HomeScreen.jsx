import { useState, useEffect, useRef } from 'react';
import { useApp } from '../../AppContext.jsx';
import {
  Search, TrendingUp, TrendingDown, ArrowRight,
  Activity, BookOpen, Bell, BarChart3,
  ChevronRight, Sparkles, RefreshCw
} from 'lucide-react';
import {
  mockAssets, marketPulse, watchlist, trending,
  newsItems, economicEvents, aiBriefing
} from '../../data/mockData.js';
import { fetchBinanceAllTickers, fetchBinanceKlines, isCrypto } from '../../services/api.js';
import { createChart, CandlestickSeries } from 'lightweight-charts';
import AIBadge from '../shared/AIBadge.jsx';
import PriceChange from '../shared/PriceChange.jsx';

export default function HomeScreen() {
  const { navigateToAsset, setActiveTab, userName } = useApp();
  const [greeting, setGreeting] = useState('');
  const [currentTime, setCurrentTime] = useState('');
  const [session, setSession] = useState('');
  const [livePrices, setLivePrices] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const homeChartRef = useRef(null);
  const homeChartInstance = useRef(null);

  // Time/session setup
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

  // Fetch real Binance prices
  useEffect(() => {
    async function loadPrices() {
      setIsLoading(true);
      const binanceData = await fetchBinanceAllTickers();
      if (binanceData) {
        setLivePrices(binanceData);
        setLastUpdated(new Date());
      }
      setIsLoading(false);
    }
    loadPrices();
    const refreshInterval = setInterval(loadPrices, 30000);
    return () => clearInterval(refreshInterval);
  }, []);

  // Home chart - BTC/USDT 1h
  useEffect(() => {
    async function loadHomeChart() {
      if (!homeChartRef.current) return;
      const candles = await fetchBinanceKlines('BTC', '1h', 100);
      if (candles.length === 0) return;

      if (homeChartInstance.current) {
        homeChartInstance.current.remove();
        homeChartInstance.current = null;
      }

      const chart = createChart(homeChartRef.current, {
        layout: {
          background: { color: 'transparent' },
          textColor: '#94a3b8',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        },
        grid: {
          vertLines: { color: 'rgba(51, 65, 85, 0.3)' },
          horzLines: { color: 'rgba(51, 65, 85, 0.3)' },
        },
        crosshair: { mode: 0 },
        rightPriceScale: { borderColor: 'rgba(51, 65, 85, 0.5)' },
        timeScale: { borderColor: 'rgba(51, 65, 85, 0.5)', timeVisible: true },
        height: 180,
        handleScroll: false,
        handleScale: false,
      });

      const candleSeries = chart.addCandlestickSeries({
        upColor: '#10b981', downColor: '#ef4444',
        borderUpColor: '#10b981', borderDownColor: '#ef4444',
        wickUpColor: '#10b981', wickDownColor: '#ef4444',
      });
      candleSeries.setData(candles);
      chart.timeScale().fitContent();
      homeChartInstance.current = chart;

      const handleResize = () => {
        if (homeChartRef.current && homeChartInstance.current) {
          homeChartInstance.current.applyOptions({ width: homeChartRef.current.clientWidth });
        }
      };
      window.addEventListener('resize', handleResize);
      return () => {
        window.removeEventListener('resize', handleResize);
        if (homeChartInstance.current) {
          homeChartInstance.current.remove();
          homeChartInstance.current = null;
        }
      };
    }
    loadHomeChart();
  }, []);

  // Merge live prices with mock data
  const getAssetData = (symbol) => {
    const mock = mockAssets.find(a => a.symbol === symbol);
    const live = livePrices[symbol.replace('/', '')];
    if (live && mock) {
      return { ...mock, price: live.price, change: live.change, changePct: live.changePct };
    }
    return mock;
  };

  const getLiveTrending = () => {
    const cryptoSymbols = ['BTC', 'ETH', 'SOL', 'XRP', 'BNB', 'ADA', 'DOT', 'LINK'];
    const liveTrending = cryptoSymbols
      .map(sym => ({ symbol: sym, ...livePrices[sym] }))
      .filter(item => item.price)
      .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));
    return {
      gainers: liveTrending.filter(t => t.changePct > 0).slice(0, 3),
      losers: liveTrending.filter(t => t.changePct < 0).slice(0, 3),
    };
  };

  const watchlistAssets = watchlist.map(getAssetData).filter(Boolean);
  const liveTrending = Object.keys(livePrices).length > 0 ? getLiveTrending() : trending;

  const getImpactColor = (impact) => {
    if (impact === 'high') return 'bg-red-500/15 text-red-400 border-red-500/20';
    if (impact === 'medium') return 'bg-amber-500/15 text-amber-400 border-amber-500/20';
    return 'bg-slate-700/30 text-slate-400 border-slate-600/20';
  };

  return (
    <div className="px-4 pt-4 pb-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Sparkles size={20} className="text-white" />
          </div>
          <h1 className="text-xl font-extrabold tracking-tight">BetaTrader</h1>
        </div>
        <div className="flex items-center gap-2">
          {isLoading && <RefreshCw size={16} className="text-emerald-400 animate-spin" />}
          {lastUpdated && (
            <span className="text-[10px] text-slate-500">
              {lastUpdated.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
            </span>
          )}
          <button className="w-9 h-9 glass-card flex items-center justify-center text-amber-400 hover:text-amber-300 transition-colors">
            <Activity size={18} />
          </button>
        </div>
      </div>

      {/* Greeting */}
      <div className="mb-5">
        <p className="text-sm text-slate-400">{greeting}, {userName}</p>
        <p className="text-xs text-slate-500">{session} &bull; {currentTime} UTC</p>
      </div>

      {/* AI Briefing */}
      <div className="mb-5 bg-gradient-to-br from-emerald-500/8 via-emerald-500/4 to-cyan-500/5 border border-emerald-500/15 rounded-2xl p-4 glow-emerald">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg">🤖</span>
          <span className="text-[11px] font-bold tracking-[0.15em] text-emerald-400 uppercase">Daily AI Briefing</span>
        </div>
        <div className="flex items-center gap-3 mb-3">
          <span className="text-sm font-semibold text-slate-100">{aiBriefing.sentiment}</span>
          <span className="badge-bullish">{aiBriefing.confidence}% Conf</span>
        </div>
        <p className="text-[13px] text-slate-300 leading-relaxed mb-4">{aiBriefing.summary}</p>
        <div className="flex gap-4 mb-4">
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">Volatility</p>
            <p className="text-sm font-semibold text-amber-400">{aiBriefing.volatility}</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">Key Risk</p>
            <p className="text-sm font-semibold text-slate-200">ISM Data Tomorrow</p>
          </div>
        </div>
        <button className="w-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 hover:bg-emerald-500/15 transition-colors">
          Read Full Analysis <ArrowRight size={14} />
        </button>
      </div>

      {/* Market Pulse */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-3">
          <span className="section-title">Market Pulse</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {marketPulse.map((item) => (
            <div key={item.label} className="glass-card p-3 text-center">
              <p className="text-[10px] text-slate-500 mb-1">{item.label}</p>
              <p className="text-base font-bold font-mono text-slate-100">{item.value}</p>
              <p className={`text-[10px] font-medium ${
                item.color === 'emerald' ? 'text-emerald-400' :
                item.color === 'warning' ? 'text-amber-400' : 'text-slate-400'
              }`}>{item.sublabel}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Live Chart Preview */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-3">
          <span className="section-title">BTC/USDT — 1H</span>
          <button
            onClick={() => {
              const btcAsset = mockAssets.find(a => a.symbol === 'BTC');
              if (btcAsset) navigateToAsset(btcAsset);
            }}
            className="text-xs text-emerald-400 font-medium hover:text-emerald-300 transition-colors flex items-center gap-1"
          >
            Open <ChevronRight size={12} />
          </button>
        </div>
        <div className="glass-card p-2">
          <div ref={homeChartRef} className="w-full h-44 rounded-lg" />
        </div>
      </div>

      {/* Watchlist */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-3">
          <span className="section-title">Watchlist</span>
          <button onClick={() => setActiveTab('markets')} className="text-xs text-emerald-400 font-medium hover:text-emerald-300 transition-colors flex items-center gap-1">
            View All <ChevronRight size={12} />
          </button>
        </div>
        <div className="flex flex-col gap-2">
          {watchlistAssets.map((asset) => (
            <button
              key={asset.symbol}
              onClick={() => navigateToAsset(asset)}
              className="glass-card-hover p-3.5 flex items-center justify-between text-left"
            >
              <div className="flex items-center gap-3">
                <div>
                  <p className="text-sm font-bold">{asset.symbol}</p>
                  <AIBadge bias={asset.bias} confidence={asset.confidence} />
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold font-mono">
                  {asset.symbol.includes('BTC') || asset.symbol === 'BTC'
                    ? `$${asset.price?.toLocaleString() || asset.price}`
                    : asset.price?.toFixed(4) || asset.price}
                </p>
                <PriceChange value={asset.change} pct={asset.changePct} />
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Trending Today */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-3">
          <span className="section-title">Trending Today</span>
          {Object.keys(livePrices).length > 0 && (
            <span className="text-[10px] text-emerald-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live
            </span>
          )}
        </div>
        <div className="flex gap-2 overflow-x-auto scroll-hide pb-1">
          {liveTrending.gainers.map((item) => (
            <button
              key={item.symbol}
              onClick={() => {
                const asset = mockAssets.find(a => a.symbol === item.symbol) || { symbol: item.symbol, name: item.symbol, category: 'crypto', bias: 'neutral', confidence: 50 };
                navigateToAsset(asset);
              }}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/8 border border-emerald-500/15 whitespace-nowrap hover:bg-emerald-500/12 transition-colors"
            >
              <span className="text-sm font-semibold">{item.symbol}</span>
              <TrendingUp size={14} className="text-emerald-400" />
              <span className="text-sm font-bold font-mono text-emerald-400">+{item.changePct?.toFixed(2)}%</span>
            </button>
          ))}
          {liveTrending.losers.map((item) => (
            <button
              key={item.symbol}
              onClick={() => {
                const asset = mockAssets.find(a => a.symbol === item.symbol) || { symbol: item.symbol, name: item.symbol, category: 'crypto', bias: 'neutral', confidence: 50 };
                navigateToAsset(asset);
              }}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-500/8 border border-red-500/15 whitespace-nowrap hover:bg-red-500/12 transition-colors"
            >
              <span className="text-sm font-semibold">{item.symbol}</span>
              <TrendingDown size={14} className="text-red-400" />
              <span className="text-sm font-bold font-mono text-red-400">{item.changePct?.toFixed(2)}%</span>
            </button>
          ))}
        </div>
      </div>

      {/* News */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-3">
          <span className="section-title">Latest News</span>
          <span className="text-xs text-emerald-400 font-medium">View All</span>
        </div>
        <div className="flex flex-col gap-3">
          {newsItems.slice(0, 3).map((news) => (
            <div key={news.id} className="glass-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs text-slate-500">{news.source}</span>
                <span className="text-xs text-slate-600">&bull;</span>
                <span className="text-xs text-slate-500">{news.time}</span>
              </div>
              <p className="text-sm font-semibold leading-relaxed mb-3">{news.headline}</p>
              <div className="flex gap-2 flex-wrap">
                {news.related.map(tag => (
                  <span key={tag} className="text-[10px] text-slate-400 bg-slate-800/60 px-2 py-1 rounded-md border border-slate-700/30">{tag}</span>
                ))}
                <span className="text-[10px] text-emerald-400 bg-emerald-500/8 px-2 py-1 rounded-md border border-emerald-500/15 flex items-center gap-1">
                  <Sparkles size={10} /> AI Summary
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Economic Calendar */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-3">
          <span className="section-title">Economic Calendar</span>
        </div>
        <div className="flex flex-col gap-2">
          {economicEvents.slice(0, 3).map((event, i) => (
            <div key={i} className="glass-card p-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-500 font-mono">{event.time}</span>
                <div>
                  <p className="text-xs font-semibold">{event.event}</p>
                  <p className="text-[10px] text-slate-500">{event.country} &bull; Forecast: {event.forecast}</p>
                </div>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border uppercase ${getImpactColor(event.impact)}`}>
                {event.impact}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <span className="section-title">Quick Actions</span>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <button onClick={() => setActiveTab('markets')} className="glass-card p-4 flex flex-col items-center gap-2 hover:border-emerald-500/30 transition-colors group">
            <Search size={20} className="text-emerald-400 group-hover:scale-110 transition-transform" />
            <span className="text-xs font-semibold text-slate-300">Analyze Asset</span>
          </button>
          <button onClick={() => setActiveTab('markets')} className="glass-card p-4 flex flex-col items-center gap-2 hover:border-blue-500/30 transition-colors group">
            <BarChart3 size={20} className="text-blue-400 group-hover:scale-110 transition-transform" />
            <span className="text-xs font-semibold text-slate-300">Run Backtest</span>
          </button>
          <button onClick={() => setActiveTab('journal')} className="glass-card p-4 flex flex-col items-center gap-2 hover:border-violet-500/30 transition-colors group">
            <BookOpen size={20} className="text-violet-400 group-hover:scale-110 transition-transform" />
            <span className="text-xs font-semibold text-slate-300">Open Journal</span>
          </button>
          <button onClick={() => setActiveTab('alerts')} className="glass-card p-4 flex flex-col items-center gap-2 hover:border-amber-500/30 transition-colors group">
            <Bell size={20} className="text-amber-400 group-hover:scale-110 transition-transform" />
            <span className="text-xs font-semibold text-slate-300">Create Alert</span>
          </button>
        </div>
      </div>
    </div>
  );
}
