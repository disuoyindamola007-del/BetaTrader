import { useState, useEffect, useRef } from 'react';
import { useApp } from '../../AppContext.jsx';
import { ArrowLeft, Heart, Share2, Bell, Sparkles } from 'lucide-react';
import { createChart, CandlestickSeries, HistogramSeries, LineSeries } from 'lightweight-charts';
import PriceChange from '../shared/PriceChange.jsx';
import {
  fetchBinanceKlines, fetchBinance24h,
  generateMockCandles, generateMock24h,
  calcEMA, calcRSI, calcBollinger, isCrypto,
} from '../../services/api.js';

const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d', '1w'];

export default function AssetDetail() {
  const { selectedAsset, goBack, setActiveTab } = useApp();
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const [timeframe, setTimeframe] = useState('1h');
  const [assetData, setAssetData] = useState(null);
  const [candles, setCandles] = useState([]);
  const [indicators, setIndicators] = useState({});
  const [isLoading, setIsLoading] = useState(true);

  const symbol = selectedAsset?.symbol;
  const crypto = isCrypto(symbol);

  useEffect(() => {
    if (!symbol) return;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, timeframe]);

  async function loadData() {
    setIsLoading(true);
    let data24h, klines;

    if (crypto) {
      [data24h, klines] = await Promise.all([
        fetchBinance24h(symbol),
        fetchBinanceKlines(symbol, timeframe, 200),
      ]);
    } else {
      data24h = generateMock24h(symbol);
      klines = generateMockCandles(symbol, 200, timeframe);
    }

    setAssetData(data24h);
    setCandles(klines);

    if (klines.length > 0) {
      const ema9 = calcEMA(klines, 9);
      const ema21 = calcEMA(klines, 21);
      const ema50 = calcEMA(klines, 50);
      const rsi = calcRSI(klines);
      const bb = calcBollinger(klines);
      const last = klines.length - 1;

      setIndicators({
        rsi: rsi[rsi.length - 1].toFixed(1),
        ema9: ema9[last],
        ema21: ema21[last],
        ema50: ema50[last],
        bbUpper: bb.upper[last],
        bbLower: bb.lower[last],
      });
    }
    setIsLoading(false);
  }

  // Render TradingView chart
  useEffect(() => {
    if (!chartContainerRef.current || candles.length === 0) return;

    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { color: 'transparent' },
        textColor: '#94a3b8',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      },
      grid: {
        vertLines: { color: 'rgba(51, 65, 85, 0.3)' },
        horzLines: { color: 'rgba(51, 65, 85, 0.3)' },
      },
      crosshair: { mode: 1 },
      rightPriceScale: {
        borderColor: 'rgba(51, 65, 85, 0.5)',
        scaleMargins: { top: 0.1, bottom: 0.25 },
      },
      timeScale: {
        borderColor: 'rgba(51, 65, 85, 0.5)',
        timeVisible: true,
      },
      height: 320,
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: '#10b981',
      downColor: '#ef4444',
      borderUpColor: '#10b981',
      borderDownColor: '#ef4444',
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
    });
    candleSeries.setData(candles);

    // Volume
    const volSeries = chart.addHistogramSeries({
      color: '#10b981',
      priceFormat: { type: 'volume' },
      priceScaleId: '',
      scaleMargins: { top: 0.85, bottom: 0 },
    });
    volSeries.setData(
      candles.map(d => ({
        time: d.time,
        value: d.volume,
        color: d.close >= d.open ? 'rgba(16,185,129,0.5)' : 'rgba(239,68,68,0.5)',
      }))
    );

    // EMA lines
    const ema9 = calcEMA(candles, 9);
    const ema21 = calcEMA(candles, 21);
    const ema9Series = chart.addLineSeries({ color: '#f59e0b', lineWidth: 1, title: 'EMA 9' });
    const ema21Series = chart.addLineSeries({ color: '#3b82f6', lineWidth: 1, title: 'EMA 21' });
    ema9Series.setData(candles.map((d, i) => ({ time: d.time, value: ema9[i] })));
    ema21Series.setData(candles.map((d, i) => ({ time: d.time, value: ema21[i] })));

    chart.timeScale().fitContent();
    chartRef.current = chart;

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [candles]);

  if (!selectedAsset) return null;

  const formatPrice = (price) => {
    if (!price && price !== 0) return '--';
    if (price < 1) return price.toFixed(5);
    if (price < 1000) return price.toFixed(2);
    return price.toLocaleString('en-US', { maximumFractionDigits: 2 });
  };

  const formatVol = (n) => {
    if (!n) return '--';
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(2) + 'K';
    return n.toFixed(2);
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
          <p className="text-3xl font-extrabold font-mono mb-1">
            ${formatPrice(assetData?.price)}
          </p>
          <PriceChange value={assetData?.change} pct={assetData?.changePct} size="lg" />
        </div>

        {/* Timeframes */}
        <div className="flex gap-1.5 mb-4 overflow-x-auto scroll-hide">
          {TIMEFRAMES.map(tf => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                timeframe === tf
                  ? 'bg-emerald-500 text-slate-950'
                  : 'bg-slate-800/60 text-slate-400 border border-slate-700/30 hover:text-slate-200'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>

        {/* Chart */}
        <div className="glass-card p-2 mb-5">
          <div ref={chartContainerRef} className="w-full h-80 rounded-lg" />
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-950/50 rounded-lg">
              <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
          <div className="glass-card p-3">
            <p className="text-[10px] text-slate-500 uppercase">24h High</p>
            <p className="text-sm font-semibold font-mono">{formatPrice(assetData?.high24h)}</p>
          </div>
          <div className="glass-card p-3">
            <p className="text-[10px] text-slate-500 uppercase">24h Low</p>
            <p className="text-sm font-semibold font-mono">{formatPrice(assetData?.low24h)}</p>
          </div>
          <div className="glass-card p-3">
            <p className="text-[10px] text-slate-500 uppercase">Volume</p>
            <p className="text-sm font-semibold font-mono">{formatVol(assetData?.volume)}</p>
          </div>
          <div className="glass-card p-3">
            <p className="text-[10px] text-slate-500 uppercase">24h Change</p>
            <p className={`text-sm font-semibold font-mono ${assetData?.changePct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {assetData?.changePct >= 0 ? '+' : ''}{assetData?.changePct?.toFixed(2)}%
            </p>
          </div>
        </div>

        {/* Technical Indicators */}
        <div className="mb-5">
          <p className="section-title mb-3">Technical Indicators</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <div className="glass-card p-3">
              <p className="text-[10px] text-slate-500 uppercase mb-1">RSI (14)</p>
              <p className="text-sm font-semibold font-mono">{indicators.rsi || '--'}</p>
            </div>
            <div className="glass-card p-3">
              <p className="text-[10px] text-slate-500 uppercase mb-1">EMA 9</p>
              <p className="text-sm font-semibold font-mono">{formatPrice(indicators.ema9)}</p>
            </div>
            <div className="glass-card p-3">
              <p className="text-[10px] text-slate-500 uppercase mb-1">EMA 21</p>
              <p className="text-sm font-semibold font-mono">{formatPrice(indicators.ema21)}</p>
            </div>
            <div className="glass-card p-3">
              <p className="text-[10px] text-slate-500 uppercase mb-1">EMA 50</p>
              <p className="text-sm font-semibold font-mono">{formatPrice(indicators.ema50)}</p>
            </div>
            <div className="glass-card p-3">
              <p className="text-[10px] text-slate-500 uppercase mb-1">BB Upper</p>
              <p className="text-sm font-semibold font-mono">{formatPrice(indicators.bbUpper)}</p>
            </div>
            <div className="glass-card p-3">
              <p className="text-[10px] text-slate-500 uppercase mb-1">BB Lower</p>
              <p className="text-sm font-semibold font-mono">{formatPrice(indicators.bbLower)}</p>
            </div>
          </div>
        </div>

        {/* AI Analysis (static for now, Batch 4 will make it live) */}
        <div className="mb-5 bg-gradient-to-br from-emerald-500/8 to-cyan-500/5 border border-emerald-500/15 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={16} className="text-emerald-400" />
            <span className="text-[11px] font-bold tracking-wider text-emerald-400 uppercase">AI Analysis</span>
          </div>
          <p className="text-sm text-slate-300 leading-relaxed">
            {assetData?.changePct > 2
              ? `${selectedAsset.symbol} is showing strong bullish momentum with above-average volume. Consider waiting for a pullback before entering long.`
              : assetData?.changePct < -2
              ? `${selectedAsset.symbol} is in a downtrend. Support levels may be tested. Watch for reversal signals before considering a long position.`
              : `${selectedAsset.symbol} is consolidating. Key levels to watch: support at recent lows, resistance at recent highs. Patience is key here.`}
          </p>
        </div>

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
