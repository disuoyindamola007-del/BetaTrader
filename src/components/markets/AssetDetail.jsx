import { useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from '../../AppContext.jsx';
import { ArrowLeft, Heart, Share2, Bell, Sparkles, AlertTriangle, Clock, RefreshCw, Check } from 'lucide-react';
import PriceChange from '../shared/PriceChange.jsx';
import { useQuote, useCandles } from '../../hooks/useMarketData.js';
import { calcEMA, calcRSI, calcBollinger, getCategory, isMarketOpen } from '../../services/marketDataService.js';

const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d', '1w'];

// Map current timeframe to higher timeframe for institutional-grade analysis
function getHigherTimeframe(tf) {
  const map = {
    '1m': '5m', '5m': '15m', '15m': '1h',
    '1h': '4h', '4h': '1d', '1d': '1w', '1w': '1w'
  };
  return map[tf] || '4h';
}

export default function AssetDetail() {
  const { selectedAsset, goBack, setActiveTab, isFavorite, toggleFavorite } = useApp();
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const chartObserverRef = useRef(null);
  const [timeframe, setTimeframe] = useState('1h');
  const [shareState, setShareState] = useState('idle'); // 'idle' | 'copied'

  const symbol = selectedAsset?.symbol;

  // Stale-while-revalidate: useQuote displays cached data immediately.
  // If the cached quote is fresh (within TTL), no network request is made.
  // If expired, the old value displays while a fresh quote is fetched in background.
  const { data: quote, error: quoteError, isLoading: quoteLoading, isStale, isUnavailable: quoteUnavailable, refetch: refetchQuote } = useQuote(symbol, !!symbol, selectedAsset?.providerSymbol, selectedAsset?.category);
  const { data: candles, error: candleError, isLoading: candleLoading, isUnavailable: candleUnavailable, refetch: refetchCandles } = useCandles(symbol, timeframe, { enabled: !!symbol, limit: 200, providerSymbol: selectedAsset?.providerSymbol, categoryHint: selectedAsset?.category });

  // Higher timeframe candles for institutional-grade trend confirmation
  const higherTimeframe = getHigherTimeframe(timeframe);
  const { data: htCandles } = useCandles(symbol, higherTimeframe, { enabled: !!symbol, limit: 100, providerSymbol: selectedAsset?.providerSymbol, categoryHint: selectedAsset?.category });

  const handleRetry = useCallback(() => {
    refetchQuote();
    refetchCandles();
  }, [refetchQuote, refetchCandles]);

  const isLoading = quoteLoading || candleLoading;
  const isUnavailable = quoteUnavailable || candleUnavailable;
  const chartError = quoteError || candleError;

  // Indicators for both current and higher timeframe
  const [indicators, setIndicators] = useState({});
  useEffect(() => {
    if (!candles?.length) return;
    try {
      const ema9 = calcEMA(candles, 9);
      const ema21 = calcEMA(candles, 21);
      const ema50 = calcEMA(candles, 50);
      const rsi = calcRSI(candles);
      const bb = calcBollinger(candles);
      const last = candles.length - 1;

      // Calculate 24h high/low and volume from recent candles
      const recentCandles = candles.slice(-24); // Approximate 24h for hourly data
      const high24h = Math.max(...recentCandles.map(c => c.high));
      const low24h = Math.min(...recentCandles.map(c => c.low));
      const volume24h = recentCandles.reduce((sum, c) => sum + c.volume, 0);

      // Higher timeframe indicators
      let htIndicators = {};
      if (htCandles?.length >= 50) {
        const htEma9 = calcEMA(htCandles, 9);
        const htEma21 = calcEMA(htCandles, 21);
        const htEma50 = calcEMA(htCandles, 50);
        const htRsi = calcRSI(htCandles);
        const htLast = htCandles.length - 1;
        htIndicators = {
          htEma9: htEma9[htLast],
          htEma21: htEma21[htLast],
          htEma50: htEma50[htLast],
          htRsi: htRsi[htRsi.length - 1]?.toFixed(1) || '--',
          htTimeframe: higherTimeframe,
        };
      }

      setIndicators({
        rsi: rsi[rsi.length - 1]?.toFixed(1) || '--',
        ema9: ema9[last], ema21: ema21[last], ema50: ema50[last],
        bbUpper: bb.upper[last], bbLower: bb.lower[last],
        high24h, low24h, volume24h,
        ...htIndicators,
      });
    } catch (err) { console.error('Indicator error:', err); }
  }, [candles, htCandles, higherTimeframe]);

  // Render chart
  const renderChart = useCallback(async (candleData) => {
    if (!chartContainerRef.current || !candleData?.length) return;
    try {
      const charts = await import('lightweight-charts');
      const { createChart, CandlestickSeries, HistogramSeries, LineSeries } = charts;
      if (chartRef.current) { chartRef.current.remove(); chartRef.current = null; }
      chartContainerRef.current.innerHTML = '';
      const chart = createChart(chartContainerRef.current, {
        layout: { background: { color: 'transparent' }, textColor: '#94a3b8', fontFamily: 'system-ui, -apple-system, sans-serif' },
        grid: { vertLines: { color: 'rgba(51, 65, 85, 0.3)' }, horzLines: { color: 'rgba(51, 65, 85, 0.3)' } },
        crosshair: { mode: 1 },
        rightPriceScale: { borderColor: 'rgba(51, 65, 85, 0.5)', scaleMargins: { top: 0.05, bottom: 0.25 } },
        timeScale: { borderColor: 'rgba(51, 65, 85, 0.5)', timeVisible: true },
        height: 360,
      });
      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: '#10b981', downColor: '#ef4444', borderUpColor: '#10b981', borderDownColor: '#ef4444',
        wickUpColor: '#10b981', wickDownColor: '#ef4444',
      });
      candleSeries.setData(candleData);

      const volSeries = chart.addSeries(HistogramSeries, { color: '#10b981', priceFormat: { type: 'volume' }, priceScaleId: 'volume' });
      volSeries.setData(candleData.map(d => ({ time: d.time, value: d.volume, color: d.close >= d.open ? 'rgba(16,185,129,0.5)' : 'rgba(239,68,68,0.5)' })));
      chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 }, borderVisible: false, visible: false });

      const ema9 = calcEMA(candleData, 9);
      const ema21 = calcEMA(candleData, 21);
      chart.addSeries(LineSeries, { color: '#f59e0b', lineWidth: 1, title: 'EMA 9' }).setData(candleData.map((d, i) => ({ time: d.time, value: ema9[i] })));
      chart.addSeries(LineSeries, { color: '#3b82f6', lineWidth: 1, title: 'EMA 21' }).setData(candleData.map((d, i) => ({ time: d.time, value: ema21[i] })));

      chart.timeScale().fitContent();
      chartRef.current = chart;
      if (chartObserverRef.current) { chartObserverRef.current.disconnect(); chartObserverRef.current = null; }
      const ro = new ResizeObserver(() => { if (chartRef.current && chartContainerRef.current) chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth, height: 360 }); });
      ro.observe(chartContainerRef.current);
      chartObserverRef.current = ro;
    } catch (err) { console.error('Chart render error:', err); }
  }, []);

  useEffect(() => { if (candles?.length) renderChart(candles); }, [candles, renderChart]);
  useEffect(() => () => {
    if (chartObserverRef.current) { chartObserverRef.current.disconnect(); chartObserverRef.current = null; }
    if (chartRef.current) { chartRef.current.remove(); chartRef.current = null; }
  }, []);

  // AI Analysis (Batch 4 — real Groq call, replaces static if/else text)
  const [analysis, setAnalysis] = useState(null);
  const [analyzeError, setAnalyzeError] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const analyzeRequestId = useRef(0);

  // Reset stale analysis when the user navigates to a different asset
  useEffect(() => { setAnalysis(null); setAnalyzeError(null); }, [symbol]);

  const hasIndicators = indicators.rsi && indicators.rsi !== '--'
    && indicators.ema9 != null && indicators.ema21 != null && indicators.ema50 != null;

  // Fetch relevant news for context (general news, filtered for symbol relevance)
  const [newsContext, setNewsContext] = useState(null);
  useEffect(() => {
    if (!symbol) return;
    const fetchNews = async () => {
      try {
        const res = await fetch(`/api/news`);
        if (res.ok) {
          const data = await res.json();
          if (data.news?.length > 0) {
            // Filter for symbol relevance (check headline and related symbols)
            const symbolUpper = symbol.toUpperCase();
            const relevant = data.news.filter(n =>
              n.headline?.toUpperCase().includes(symbolUpper) ||
              n.related?.some(r => r.toUpperCase() === symbolUpper)
            ).slice(0, 2);

            if (relevant.length > 0) {
              const context = relevant.map(a => `${a.headline} (${a.source || 'news'})`).join('; ');
              setNewsContext(context);
            } else {
              setNewsContext(''); // No relevant news
            }
          }
        }
      } catch (err) { /* News is optional for analysis */ }
    };
    fetchNews();
  }, [symbol]);

  const handleAnalyze = useCallback(async () => {
    if (!symbol || !quote || !hasIndicators || isAnalyzing) return;

    const requestId = ++analyzeRequestId.current;
    setIsAnalyzing(true);
    setAnalyzeError(null);

    const params = new URLSearchParams({
      price: String(quote.price),
      changePct: String(quote.changePct ?? 0),
      rsi: String(indicators.rsi),
      ema9: String(indicators.ema9),
      ema21: String(indicators.ema21),
      ema50: String(indicators.ema50),
      bbUpper: indicators.bbUpper ? String(indicators.bbUpper.toFixed(2)) : '',
      bbLower: indicators.bbLower ? String(indicators.bbLower.toFixed(2)) : '',
      volume24h: indicators.volume24h ? String(Math.round(indicators.volume24h)) : '',
      high24h: indicators.high24h ? String(indicators.high24h.toFixed(2)) : '',
      low24h: indicators.low24h ? String(indicators.low24h.toFixed(2)) : '',
      htEma9: indicators.htEma9 ? String(indicators.htEma9.toFixed(2)) : '',
      htEma21: indicators.htEma21 ? String(indicators.htEma21.toFixed(2)) : '',
      htEma50: indicators.htEma50 ? String(indicators.htEma50.toFixed(2)) : '',
      htRsi: indicators.htRsi ? String(indicators.htRsi) : '',
      htTimeframe: indicators.htTimeframe || '',
      news: newsContext ? encodeURIComponent(newsContext) : '',
    });

    try {
      const res = await fetch(`/api/analyze/${encodeURIComponent(symbol)}?${params}`);
      const data = await res.json();
      // Guard: ignore response if the user navigated to a different asset while this was in flight
      if (analyzeRequestId.current !== requestId) return;

      if (!res.ok) {
        setAnalyzeError(data.rateLimited ? 'AI analysis is rate limited right now — try again in a minute.' : (data.error || 'Analysis failed'));
        return;
      }
      setAnalysis(data.analysis);
    } catch (err) {
      if (analyzeRequestId.current !== requestId) return;
      setAnalyzeError('Could not reach AI analysis service');
    } finally {
      if (analyzeRequestId.current === requestId) setIsAnalyzing(false);
    }
  }, [symbol, quote, hasIndicators, indicators, isAnalyzing]);

  const handleShare = useCallback(async () => {
    const priceText = quote?.price != null ? ` — currently $${quote.price}` : '';
    const shareData = {
      title: `${selectedAsset.symbol} on BetaTrader`,
      text: `Check out ${selectedAsset.symbol}${priceText}`,
      url: typeof window !== 'undefined' ? window.location.href : undefined,
    };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        // AbortError just means the user cancelled the native share sheet — not a real failure
        if (err.name !== 'AbortError') console.error('Share failed:', err.message);
      }
      return;
    }
    // Fallback for browsers without the Web Share API (most desktop browsers)
    try {
      await navigator.clipboard.writeText(`${shareData.text} — ${shareData.url}`);
      setShareState('copied');
      setTimeout(() => setShareState('idle'), 2000);
    } catch (err) {
      console.error('Clipboard copy failed:', err.message);
    }
  }, [selectedAsset, quote]);

  if (!selectedAsset) return null;

  const formatPrice = (price) => {
    if (price == null) return '--';
    if (price === 0) return '0.00';
    if (price < 0.01) return price.toFixed(6);
    if (price < 1) return price.toFixed(5);
    if (price < 1000) return price.toFixed(4);
    return price.toLocaleString('en-US', { maximumFractionDigits: 2 });
  };
  const formatVol = (n) => {
    if (n == null) return '--';
    if (n >= 1e12) return (n / 1e12).toFixed(2) + 'T';
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(2) + 'K';
    return n.toFixed(2);
  };

  return (
    <div className="animate-slide-up">
      <div className="sticky top-0 z-10 bg-slate-950/90 backdrop-blur-xl border-b border-slate-800/50 px-4 py-3">
        <div className="flex items-center justify-between">
          <button onClick={goBack} className="w-9 h-9 glass-card flex items-center justify-center hover:bg-slate-800 transition-colors"><ArrowLeft size={18} /></button>
          <div className="text-center"><p className="text-sm font-bold">{selectedAsset.symbol}</p><p className="text-[10px] text-slate-500">{selectedAsset.name}</p></div>
          <div className="flex gap-2">
            <button
              onClick={() => toggleFavorite(selectedAsset.symbol)}
              className={`w-9 h-9 glass-card flex items-center justify-center transition-colors ${isFavorite(selectedAsset.symbol) ? 'text-red-400' : 'text-slate-400 hover:text-red-400'}`}
            >
              <Heart size={16} fill={isFavorite(selectedAsset.symbol) ? 'currentColor' : 'none'} />
            </button>
            <button onClick={handleShare} className="w-9 h-9 glass-card flex items-center justify-center text-slate-400 hover:text-slate-200 transition-colors">
              {shareState === 'copied' ? <Check size={16} className="text-emerald-400" /> : <Share2 size={16} />}
            </button>
          </div>
        </div>
      </div>

      <div className="px-4 pt-4 pb-6">
        <div className="mb-5">
          <p className="text-3xl font-extrabold font-mono mb-1">${formatPrice(quote?.price)}</p>
          {quote?.changePct !== undefined && <PriceChange value={quote?.change} pct={quote?.changePct} size="lg" />}
          {/* Market status indicator */}
          {symbol && (() => {
            const category = getCategory(symbol, selectedAsset?.category);
            const marketOpen = isMarketOpen(category);
            if (category === 'crypto') return null; // Crypto is always open
            return (
              <div className={`flex items-center gap-1.5 mt-2 text-xs ${marketOpen ? 'text-emerald-400' : 'text-amber-400'}`}>
                <span className={`w-2 h-2 rounded-full ${marketOpen ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                {marketOpen ? 'Market Open' : 'Market Closed — Data will update when market reopens'}
              </div>
            );
          })()}
        </div>

        {/* Timeframes */}
        <div className="flex gap-1.5 mb-4 overflow-x-auto scroll-hide">
          {TIMEFRAMES.map(tf => (
            <button key={tf} onClick={() => setTimeframe(tf)} disabled={isLoading} className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all disabled:opacity-50 ${timeframe === tf ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800/60 text-slate-400 border border-slate-700/30 hover:text-slate-200'}`}>{tf}</button>
          ))}
        </div>

        {/* Chart */}
        <div className="glass-card p-2 mb-5 relative" style={{ minHeight: '360px' }}>
          <div ref={chartContainerRef} style={{ width: '100%', height: '360px', position: 'relative' }} />
          {isLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/60 rounded-lg z-10">
              <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mb-2" />
              <p className="text-xs text-slate-500">Loading chart...</p>
            </div>
          )}
          {chartError && !isLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/60 rounded-lg z-10 px-6">
              {isUnavailable ? (
                <>
                  <AlertTriangle size={24} className="text-amber-400 mb-2" />
                  <p className="text-sm text-amber-400 mb-1 font-semibold">Unavailable on current plan</p>
                  <p className="text-xs text-slate-400 text-center">{chartError}</p>
                </>
              ) : isStale ? (
                <>
                  <AlertTriangle size={24} className="text-amber-400 mb-2" />
                  <p className="text-sm text-amber-400 mb-1 font-semibold">Rate Limit Reached</p>
                  <p className="text-xs text-slate-400 text-center mb-2">{chartError}<span className="ml-1 inline-flex items-center gap-1"><Clock size={12} />Showing cached data</span></p>
                </>
              ) : (
                <>
                  <p className="text-sm text-red-400 mb-1">Chart Error</p>
                  <p className="text-xs text-slate-500 text-center">{chartError}</p>
                </>
              )}
              {!isUnavailable && <button onClick={handleRetry} className="mt-3 px-3 py-1.5 bg-emerald-500/20 text-emerald-400 text-xs rounded-lg border border-emerald-500/30">Retry</button>}
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
          <div className="glass-card p-3"><p className="text-[10px] text-slate-500 uppercase">24h High</p><p className="text-sm font-semibold font-mono">{formatPrice(quote?.high24h)}</p></div>
          <div className="glass-card p-3"><p className="text-[10px] text-slate-500 uppercase">24h Low</p><p className="text-sm font-semibold font-mono">{formatPrice(quote?.low24h)}</p></div>
          <div className="glass-card p-3"><p className="text-[10px] text-slate-500 uppercase">Volume</p><p className="text-sm font-semibold font-mono">{formatVol(quote?.volume)}</p></div>
          <div className="glass-card p-3"><p className="text-[10px] text-slate-500 uppercase">24h Change</p><p className={`text-sm font-semibold font-mono ${quote?.changePct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{quote?.changePct >= 0 ? '+' : ''}{quote?.changePct?.toFixed(2)}%</p></div>
        </div>

        {/* Indicators */}
        <div className="mb-5">
          <p className="section-title mb-3">Technical Indicators</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <div className="glass-card p-3"><p className="text-[10px] text-slate-500 uppercase mb-1">RSI (14)</p><p className="text-sm font-semibold font-mono">{indicators.rsi || '--'}</p></div>
            <div className="glass-card p-3"><p className="text-[10px] text-slate-500 uppercase mb-1">EMA 9</p><p className="text-sm font-semibold font-mono">{formatPrice(indicators.ema9)}</p></div>
            <div className="glass-card p-3"><p className="text-[10px] text-slate-500 uppercase mb-1">EMA 21</p><p className="text-sm font-semibold font-mono">{formatPrice(indicators.ema21)}</p></div>
            <div className="glass-card p-3"><p className="text-[10px] text-slate-500 uppercase mb-1">EMA 50</p><p className="text-sm font-semibold font-mono">{formatPrice(indicators.ema50)}</p></div>
            <div className="glass-card p-3"><p className="text-[10px] text-slate-500 uppercase mb-1">BB Upper</p><p className="text-sm font-semibold font-mono">{formatPrice(indicators.bbUpper)}</p></div>
            <div className="glass-card p-3"><p className="text-[10px] text-slate-500 uppercase mb-1">BB Lower</p><p className="text-sm font-semibold font-mono">{formatPrice(indicators.bbLower)}</p></div>
          </div>
          {/* Higher timeframe trend indicator */}
          {indicators.htRsi && indicators.htEma9 != null && (
            <div className="mt-3 glass-card p-3 border-l-4 border-l-emerald-500/30">
              <p className="text-[10px] text-slate-500 uppercase mb-1">Higher Timeframe ({indicators.htTimeframe || '4h'})</p>
              <div className="flex items-center gap-3 text-sm">
                <span className="font-mono">RSI: <span className={indicators.htRsi > 50 ? 'text-emerald-400' : 'text-red-400'}>{indicators.htRsi}</span></span>
                <span className="text-slate-500">|</span>
                <span>EMA Stack: <span className={indicators.htEma9 > indicators.htEma21 ? 'text-emerald-400' : indicators.htEma9 < indicators.htEma21 ? 'text-red-400' : 'text-slate-400'}>
                  {indicators.htEma9 > indicators.htEma21 && indicators.htEma21 > indicators.htEma50 ? 'Bullish' : indicators.htEma9 < indicators.htEma21 && indicators.htEma21 < indicators.htEma50 ? 'Bearish' : 'Mixed'}
                </span></span>
              </div>
            </div>
          )}
        </div>

        {/* AI Analysis */}
        <div className="mb-5 bg-gradient-to-br from-emerald-500/8 to-cyan-500/5 border border-emerald-500/15 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3"><Sparkles size={16} className="text-emerald-400" /><span className="text-[11px] font-bold tracking-wider text-emerald-400 uppercase">AI Analysis</span></div>

          {isAnalyzing && (
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <div className="w-3.5 h-3.5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              Analyzing {selectedAsset.symbol}...
            </div>
          )}

          {!isAnalyzing && analyzeError && (
            <div className="flex items-start gap-2">
              <AlertTriangle size={14} className="text-amber-400 mt-0.5 shrink-0" />
              <p className="text-sm text-amber-400">{analyzeError}</p>
            </div>
          )}

          {!isAnalyzing && !analyzeError && analysis && (
            <div className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">
              {analysis.split('\n').map((line, i) => {
                // Bold section headers like **Trend Read**
                if (line.startsWith('**') && line.endsWith('**')) {
                  return <p key={i} className="font-semibold text-emerald-400 mt-3 mb-1 text-xs uppercase tracking-wide">{line.replace(/\*\*/g, '')}</p>;
                }
                // Regular content lines
                return <p key={i} className="mb-2">{line}</p>;
              })}
            </div>
          )}

          {!isAnalyzing && !analyzeError && !analysis && (
            <p className="text-sm text-slate-500 leading-relaxed">
              {hasIndicators ? 'Tap Analyze for an AI read on current conditions.' : 'Not enough price history yet to analyze this asset.'}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button onClick={() => setActiveTab('alerts')} className="flex-1 btn-secondary"><Bell size={16} />Create Alert</button>
          <button
            onClick={handleAnalyze}
            disabled={isAnalyzing || !hasIndicators || !quote}
            className="flex-1 btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isAnalyzing ? <RefreshCw size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {isAnalyzing ? 'Analyzing...' : 'Analyze'}
          </button>
        </div>
      </div>
    </div>
  );
}
