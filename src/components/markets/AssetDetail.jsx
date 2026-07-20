import { useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from '../../AppContext.jsx';
import { ArrowLeft, Heart, Share2, Bell, Sparkles, AlertTriangle, Clock } from 'lucide-react';
import PriceChange from '../shared/PriceChange.jsx';
import { useQuote, useCandles } from '../../hooks/useMarketData.js';
import { calcEMA, calcRSI, calcBollinger } from '../../services/marketDataService.js';

const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d', '1w'];

export default function AssetDetail() {
  const { selectedAsset, goBack, setActiveTab } = useApp();
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const [timeframe, setTimeframe] = useState('1h');

  const symbol = selectedAsset?.symbol;

  // Stale-while-revalidate: useQuote displays cached data immediately.
  // If the cached quote is fresh (within TTL), no network request is made.
  // If expired, the old value displays while a fresh quote is fetched in background.
  const { data: quote, error: quoteError, isLoading: quoteLoading, isStale } = useQuote(symbol, !!symbol);
  const { data: candles, error: candleError, isLoading: candleLoading } = useCandles(symbol, timeframe, { enabled: !!symbol, limit: 200 });

  const isLoading = quoteLoading || candleLoading;
  const chartError = quoteError || candleError;

  // Indicators
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
      setIndicators({
        rsi: rsi[rsi.length - 1]?.toFixed(1) || '--',
        ema9: ema9[last], ema21: ema21[last], ema50: ema50[last],
        bbUpper: bb.upper[last], bbLower: bb.lower[last],
      });
    } catch (err) { console.error('Indicator error:', err); }
  }, [candles]);

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
      const ro = new ResizeObserver(() => { if (chartRef.current && chartContainerRef.current) chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth, height: 360 }); });
      ro.observe(chartContainerRef.current);
    } catch (err) { console.error('Chart render error:', err); }
  }, []);

  useEffect(() => { if (candles?.length) renderChart(candles); }, [candles, renderChart]);
  useEffect(() => () => { if (chartRef.current) { chartRef.current.remove(); chartRef.current = null; } }, []);

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
            <button className="w-9 h-9 glass-card flex items-center justify-center text-slate-400 hover:text-red-400 transition-colors"><Heart size={16} /></button>
            <button className="w-9 h-9 glass-card flex items-center justify-center text-slate-400 hover:text-slate-200 transition-colors"><Share2 size={16} /></button>
          </div>
        </div>
      </div>

      <div className="px-4 pt-4 pb-6">
        <div className="mb-5">
          <p className="text-3xl font-extrabold font-mono mb-1">${formatPrice(quote?.price)}</p>
          {quote?.changePct !== undefined && <PriceChange value={quote?.change} pct={quote?.changePct} size="lg" />}
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
              {isStale ? (
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
              <button className="mt-3 px-3 py-1.5 bg-emerald-500/20 text-emerald-400 text-xs rounded-lg border border-emerald-500/30">Retry</button>
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
        </div>

        {/* AI Analysis (static until Batch 4) */}
        <div className="mb-5 bg-gradient-to-br from-emerald-500/8 to-cyan-500/5 border border-emerald-500/15 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3"><Sparkles size={16} className="text-emerald-400" /><span className="text-[11px] font-bold tracking-wider text-emerald-400 uppercase">AI Analysis</span></div>
          <p className="text-sm text-slate-300 leading-relaxed">
            {(quote?.changePct || 0) > 2 ? `${selectedAsset.symbol} is showing strong bullish momentum. Consider waiting for a pullback.`
             : (quote?.changePct || 0) < -2 ? `${selectedAsset.symbol} is in a downtrend. Watch for reversal signals.`
             : `${selectedAsset.symbol} is consolidating. Patience is key.`}
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button onClick={() => setActiveTab('alerts')} className="flex-1 btn-secondary"><Bell size={16} />Create Alert</button>
          <button className="flex-1 btn-primary"><Sparkles size={16} />Analyze</button>
        </div>
      </div>
    </div>
  );
}
