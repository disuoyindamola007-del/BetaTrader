import { useState, useEffect } from 'react';
import { BookOpen, Plus, BarChart3, TrendingUp, TrendingDown, Trash2, X, ChevronRight, Calendar, Clock, Leaf, ShieldCheck, AlertTriangle, Zap, ArrowUp, ArrowDown, Minus } from 'lucide-react';
import { useSymbolSearch } from '../../hooks/useSymbolSearch.js';
import { getTrades, createTrade, deleteTrade, saveTrades } from '../../services/journalService.js';

const TIMEFRAME_OPTIONS = ['5m', '15m', '30m', '1H', '4H', '8H', '1D'];
const EMOTIONS = [
  { value: 'calm', label: 'Calm', icon: Leaf, color: 'text-emerald-400' },
  { value: 'confident', label: 'Confident', icon: ShieldCheck, color: 'text-blue-400' },
  { value: 'anxious', label: 'Anxious', icon: AlertTriangle, color: 'text-amber-400' },
  { value: 'fomo', label: 'FOMO', icon: Zap, color: 'text-purple-400' },
];
const STRATEGIES = ['Breakout', 'Trend Following', 'Reversal', 'Range Trading', 'Scalping', 'Swing'];

const BIAS_OPTIONS = [
  { value: 'Bullish', icon: ArrowUp, color: 'text-emerald-400' },
  { value: 'Bearish', icon: ArrowDown, color: 'text-red-400' },
  { value: 'Neutral', icon: Minus, color: 'text-slate-400' },
];

const STRATEGY_ICONS = {
  Breakout: TrendingUp,
  'Trend Following': TrendingUp,
  Reversal: TrendingDown,
  'Range Trading': BarChart3,
  Scalping: Zap,
  Swing: TrendingUp,
};

// Forex pip-value conversion (USD-quoted pairs)
const PIP_VALUE_PER_LOT = {
  standard: 10,
  mini: 1,
  micro: 0.1,
};

// Detect JPY pairs (pip = price * 100, not * 10000)
function isJpyPair(symbol) {
  return /JPY$/.test((symbol || '').toUpperCase());
}

// Detect commodity instrument type: 'cfd' (metals → Lot Size) or 'futures' (energy/etc → Contracts)
function getCommodityType(symbol) {
  const upper = (symbol || '').toUpperCase().replace('/', '');
  // Metals trade CFD/forex-style with lot sizing
  if (/^(XAU|XAG|XPT|XPD|GOLD|SILVER|PLATINUM|PALLADIUM)/.test(upper)) return 'cfd';
  return 'futures';
}

// Field config per asset class / instrument type
function getFieldConfig(assetClass, symbol) {
  if (assetClass === 'forex') {
    return { quantityLabel: 'Lot Size', quantityPlaceholder: '0.01', quantityKey: 'lotSize', hasLeverage: false, usesCapital: false, usesPips: true };
  }
  if (assetClass === 'crypto') {
    return { quantityLabel: 'Capital (USD)', quantityPlaceholder: '1000', quantityKey: 'capital', hasLeverage: true, usesCapital: true, usesPips: false };
  }
  if (assetClass === 'stocks') {
    return { quantityLabel: 'Shares', quantityPlaceholder: '10', quantityKey: 'quantity', hasLeverage: false, usesCapital: false, usesPips: false };
  }
  if (assetClass === 'commodities') {
    const type = getCommodityType(symbol);
    if (type === 'cfd') {
      return { quantityLabel: 'Lot Size', quantityPlaceholder: '0.01', quantityKey: 'lotSize', hasLeverage: false, usesCapital: false, usesPips: true };
    }
    return { quantityLabel: 'Contracts', quantityPlaceholder: '1', quantityKey: 'quantity', hasLeverage: false, usesCapital: false, usesPips: false };
  }
  return { quantityLabel: 'Lot Size', quantityPlaceholder: '0.01', quantityKey: 'lotSize', hasLeverage: false, usesCapital: false, usesPips: false };
}

// Derive coin quantity from capital (margin), leverage, and entry price (crypto only)
function deriveCryptoQuantity(capital, leverage, entryPrice) {
  const lev = Number(leverage) || 1;
  return (Number(capital) * lev) / Number(entryPrice);
}

// Calculate liquidation price for leveraged positions (crypto)
function calcLiquidationPrice(entry, leverage, side) {
  const lev = Number(leverage) || 1;
  if (lev <= 1) return null;
  const direction = side === 'buy' ? -1 : 1;
  return entry * (1 + direction / lev);
}

// Validate a price level against liquidation price
function validateAgainstLiquidation(entry, level, leverage, side, label) {
  const liqPrice = calcLiquidationPrice(entry, leverage, side);
  if (!liqPrice) return null;
  const breached = side === 'buy' ? Number(level) <= liqPrice : Number(level) >= liqPrice;
  if (breached) {
    return `${label} (${Number(level).toFixed(4)}) is beyond the liquidation price (${liqPrice.toFixed(4)}) at ${leverage}x leverage — this position would have been liquidated first.`;
  }
  return null;
}

const emptyForm = {
  asset: '',
  assetSymbol: '',
  assetName: '',
  assetClass: '',
  status: 'closed',
  direction: '',
  timeframe: '',
  timeframeCustom: '',
  entry: '',
  exit: '',
  quantity: '',
  lotSize: '',
  capital: '',
  lotType: '',
  leverage: '',
  stopLoss: '',
  takeProfit: '',
  bias: '',
  emotion: '',
  strategy: '',
  notes: '',
};

const step1Errors = { asset: '', direction: '', timeframe: '' };
const step2Errors = { entry: '', exit: '', quantity: '', slError: '', tpError: '', liqError: '' };
const step3Errors = { bias: '', emotion: '', strategy: '' };

// Format dollar amounts: drop trailing .00 on whole numbers, add thousands separators
function formatMoney(amount) {
  const hasCents = Math.round(amount * 100) % 100 !== 0;
  return amount.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  });
}

// Calculate P&L from trade data
// Realized P/L for closed trades
function calculateClosedPnL(trade) {
  const entry = Number(trade.entry) || 0;
  const exit = Number(trade.exit) || 0;
  const direction = trade.direction === 'sell' ? -1 : 1;

  // Forex: pip-value conversion
  if (trade.assetClass === 'forex') {
    const lotSize = Number(trade.lotSize) || 0;
    if (!entry || !exit || !lotSize) return 0;
    const pipMultiplier = isJpyPair(trade.asset) ? 100 : 10000;
    const pips = (exit - entry) * pipMultiplier * direction;
    const lotType = trade.lotType || 'standard';
    const pipValue = PIP_VALUE_PER_LOT[lotType] || PIP_VALUE_PER_LOT.standard;
    const gross = pips * pipValue * lotSize;
    return Math.round(gross * 100) / 100;
  }

  // Crypto: derive quantity from capital (margin) + leverage
  if (trade.assetClass === 'crypto') {
    const capital = Number(trade.capital) || 0;
    const leverage = Number(trade.leverage) || 1;
    if (!entry || !exit || !capital) return 0;
    const qty = deriveCryptoQuantity(capital, leverage, entry);
    const gross = (exit - entry) * qty * direction;
    return Math.round(gross * 100) / 100;
  }

  // Stocks & Commodities: standard (exit - entry) * quantity
  const qty = Number(trade.quantity) || 0;
  if (!entry || !exit || !qty) return 0;
  const gross = (exit - entry) * qty * direction;
  return Math.round(gross * 100) / 100;
}

// Projected P/L for open trades (substitute a target price for exit)
function calculateProjectedPnL(entry, targetPrice, qty, direction) {
  if (!entry || !targetPrice || !qty) return 0;
  const dir = direction === 'sell' ? -1 : 1;
  const gross = (targetPrice - entry) * qty * dir;
  return Math.round(gross * 100) / 100;
}

function deriveResult(pnl) {
  if (Math.abs(pnl) < 0.01) return 'breakeven';
  return pnl > 0 ? 'win' : 'loss';
}

export default function JournalScreen() {
  const [activeTab, setActiveTab] = useState(() => {
    // Bug 3 fix: restore active tab from URL on page load
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get('tab');
      if (tab && ['trades', 'log', 'performance'].includes(tab)) return tab;
    }
    return 'trades';
  });
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    // Update URL without adding to browser history
    const params = new URLSearchParams(window.location.search);
    params.set('tab', tab);
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState(null, '', newUrl);
  };

  const handleStepChange = (step) => {
    setLogStep(step);
    // Persist step in URL so refresh keeps the user on the same wizard step
    const params = new URLSearchParams(window.location.search);
    params.set('step', String(step));
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState(null, '', newUrl);
  };

  const [logStep, setLogStep] = useState(() => {
    // Bug 4 fix: restore wizard step from URL on page load
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const step = parseInt(params.get('step') || '1', 10);
      if (step >= 1 && step <= 3) return step;
    }
    return 1;
  });
  const [trades, setTrades] = useState(() => getTrades());
  const [form, setForm] = useState(emptyForm);
  const [formErrors, setFormErrors] = useState({ step1: { ...step1Errors }, step2: { ...step2Errors }, step3: { ...step3Errors } });
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [selectedTrade, setSelectedTrade] = useState(null);
  const [deleteConfirmTrade, setDeleteConfirmTrade] = useState(null);
  const [swipedId, setSwipedId] = useState(null); // for swipe-to-delete
  const [showOutcomeModal, setShowOutcomeModal] = useState(false);
  const [outcomeTrade, setOutcomeTrade] = useState(null);
  const [outcomeResult, setOutcomeResult] = useState('');
  const [outcomeExitPrice, setOutcomeExitPrice] = useState('');
  const { results: searchResults, isLoading: searchLoading } = useSymbolSearch(searchQuery);

  // Refresh trades from localStorage whenever switching to Performance tab
  // This guarantees Performance always reads the same source of truth as My Trades
  useEffect(() => {
    if (activeTab === 'performance') {
      setTrades(getTrades());
    }
  }, [activeTab]);

  // Compute P&L and result for each trade (single source of truth for all tabs)
  const tradesWithPnL = trades.map(t => {
    if (t.status === 'open') {
      const entry = Number(t.entry) || 0;
      let qty = Number(t.quantity) || Number(t.lotSize) || 0;
      // Crypto: derive quantity from capital (margin) + leverage
      if (t.assetClass === 'crypto' && qty === 0) {
        qty = deriveCryptoQuantity(Number(t.capital), Number(t.leverage), entry);
      }
      const tpPnl = calculateProjectedPnL(entry, Number(t.takeProfit), qty, t.direction);
      const slPnl = calculateProjectedPnL(entry, Number(t.stopLoss), qty, t.direction);
      return { ...t, tpPnl, slPnl, pnl: 0, result: null };
    } else {
      const pnl = calculateClosedPnL(t);
      return { ...t, pnl, result: deriveResult(pnl) };
    }
  });

  // Separate closed and open trades
  const closedTrades = tradesWithPnL.filter(t => t.status !== 'open');
  const openTrades = tradesWithPnL.filter(t => t.status === 'open');

  // Performance stats computed ONLY from closed trades
  const stats = {
    totalTrades: closedTrades.length,
    wins: closedTrades.filter(t => t.result === 'win').length,
    losses: closedTrades.filter(t => t.result === 'loss').length,
    winRate: closedTrades.length ? ((closedTrades.filter(t => t.result === 'win').length / closedTrades.length) * 100).toFixed(1) : 0,
    totalPL: closedTrades.reduce((acc, t) => acc + (t.pnl || 0), 0),
  };

  const losingTrades = closedTrades.filter(t => t.pnl < 0);
  const winningTrades = closedTrades.filter(t => t.pnl > 0);
  const bestTrade = winningTrades.length ? winningTrades.reduce((best, t) => (t.pnl > best.pnl ? t : best), winningTrades[0]) : null;
  const worstTrade = losingTrades.length ? losingTrades.reduce((worst, t) => (t.pnl < worst.pnl ? t : worst), losingTrades[0]) : null;
  const avgWin = winningTrades.length ? (winningTrades.reduce((a, t) => a + t.pnl, 0) / winningTrades.length) : 0;
  const avgLoss = losingTrades.length ? (losingTrades.reduce((a, t) => a + t.pnl, 0) / losingTrades.length) : 0;

  // Map from form field names to their error keys for instant error clearing
  const FIELD_ERROR_MAP = {
    assetSymbol: { key: 'asset', step: 'step1' },
    direction: { key: 'direction', step: 'step1' },
    timeframe: { key: 'timeframe', step: 'step1' },
    timeframeCustom: { key: 'timeframe', step: 'step1' },
    entry: { key: 'entry', step: 'step2' },
    exit: { key: 'exit', step: 'step2' },
    quantity: { key: 'quantity', step: 'step2' },
    lotSize: { key: 'quantity', step: 'step2' },
    capital: { key: 'quantity', step: 'step2' },
    stopLoss: { key: 'slError', step: 'step2' },
    takeProfit: { key: 'tpError', step: 'step2' },
    bias: { key: 'bias', step: 'step3' },
    emotion: { key: 'emotion', step: 'step3' },
    strategy: { key: 'strategy', step: 'step3' },
  };

  const updateField = (field, value) => {
    setForm(f => ({ ...f, [field]: value }));
    // Clear the corresponding error immediately when the user interacts with any field
    const err = FIELD_ERROR_MAP[field];
    if (err) {
      setFormErrors(prev => ({
        ...prev,
        [err.step]: { ...prev[err.step], [err.key]: '' }
      }));
    }
  };

  const resetWizard = () => {
    setForm(emptyForm);
    handleStepChange(1);
    setFormErrors({ step1: { ...step1Errors }, step2: { ...step2Errors }, step3: { ...step3Errors } });
    setSearchQuery('');
    setShowSearchResults(false);
  };

  const handleNext = () => {
    const errors = { ...step1Errors };
    if (!form.assetSymbol.trim()) errors.asset = 'Enter an asset symbol.';
    if (!form.direction) errors.direction = 'Choose Buy or Sell.';
    if (!form.timeframe) errors.timeframe = 'Select a timeframe.';
    setFormErrors(prev => ({ ...prev, step1: errors }));
    if (Object.values(errors).some(e => e)) return;
    handleStepChange(Math.min(3, logStep + 1));
  };

  const handleContinue = () => {
    const config = getFieldConfig(resolveAssetClass(), form.assetSymbol);
    const errors = { ...step2Errors };

    // Entry and quantity/capital always required
    if (form.entry === '' || Number.isNaN(Number(form.entry))) errors.entry = 'Enter entry price.';
    if (form[config.quantityKey] === '' || Number.isNaN(Number(form[config.quantityKey]))) {
      errors.quantity = `Enter ${config.quantityLabel.toLowerCase()}.`;
    }

    if (form.status === 'closed') {
      // Closed trade: exit price required, SL/TP not shown
      if (form.exit === '' || Number.isNaN(Number(form.exit))) errors.exit = 'Enter exit price.';
      errors.slError = '';
      errors.tpError = '';
      errors.liqError = '';
    } else {
      // Open trade: SL and TP required, exit not shown
      errors.exit = '';
      if (form.stopLoss === '' || Number.isNaN(Number(form.stopLoss))) errors.slError = 'Enter stop loss.';
      if (form.takeProfit === '' || Number.isNaN(Number(form.takeProfit))) errors.tpError = 'Enter take profit.';

      // Direction-aware validation (only when both values present)
      const entry = Number(form.entry);
      const sl = Number(form.stopLoss);
      const tp = Number(form.takeProfit);
      if (form.direction && entry && sl && tp) {
        if (form.direction === 'buy') {
          if (sl >= entry) errors.slError = 'Stop loss must be below entry for long positions.';
          if (tp <= entry) errors.tpError = 'Take profit must be above entry for long positions.';
        } else {
          if (sl <= entry) errors.slError = 'Stop loss must be above entry for short positions.';
          if (tp >= entry) errors.tpError = 'Take profit must be below entry for short positions.';
        }
      }

      // Crypto liquidation validation (when leverage > 1)
      errors.liqError = '';
      if (resolveAssetClass() === 'crypto' && Number(form.leverage) > 1 && entry) {
        const lev = Number(form.leverage);
        if (sl) {
          const slLiq = validateAgainstLiquidation(entry, sl, lev, form.direction, 'Stop Loss');
          if (slLiq) errors.slError = slLiq;
        }
        if (tp) {
          const tpLiq = validateAgainstLiquidation(entry, tp, lev, form.direction, 'Take Profit');
          if (tpLiq) errors.tpError = tpLiq;
        }
      }
    }

    setFormErrors(prev => ({ ...prev, step2: errors }));
    if (Object.values(errors).some(e => e)) return;
    handleStepChange(3);
  };

  const handleSave = () => {
    const errors = { ...step3Errors };
    if (!form.bias) errors.bias = 'Select market bias.';
    if (!form.emotion) errors.emotion = 'Select emotional state.';
    if (!form.strategy) errors.strategy = 'Select strategy.';
    setFormErrors(prev => ({ ...prev, step3: errors }));
    if (Object.values(errors).some(e => e)) return;

    const assetClass = resolveAssetClass();
    const config = getFieldConfig(assetClass, form.assetSymbol);
    const qtyKey = config.quantityKey;
    const tradeData = {
      asset: form.assetSymbol.trim().toUpperCase(),
      assetName: form.assetName || form.assetSymbol.trim().toUpperCase(),
      assetClass,
      status: form.status,
      direction: form.direction,
      timeframe: form.timeframe === 'custom' ? form.timeframeCustom.trim() : form.timeframe,
      entry: Number(form.entry) || null,
      exit: form.status === 'closed' ? (Number(form.exit) || null) : null,
      [qtyKey]: Number(form[qtyKey]) || null,
      leverage: config.hasLeverage ? (Number(form.leverage) || null) : null,
      stopLoss: form.status === 'open' ? (Number(form.stopLoss) || null) : null,
      takeProfit: form.status === 'open' ? (Number(form.takeProfit) || null) : null,
      bias: form.bias,
      emotion: form.emotion,
      strategy: form.strategy,
      notes: form.notes.trim(),
    };
    // Persist lot type for forex/commodity CFD trades
    if (config.usesPips) tradeData.lotType = form.lotType || 'standard';
    const updated = createTrade(tradeData);
    setTrades(updated);
    resetWizard();
    setActiveTab('trades');
  };

  const handleDelete = (trade) => {
    const updated = deleteTrade(trade.id);
    setTrades(updated);
    setDeleteConfirmTrade(null);
  };

  const handleSetOutcome = () => {
    if (!outcomeTrade || !outcomeResult || !outcomeExitPrice) return;
    const exit = parseFloat(outcomeExitPrice);
    if (Number.isNaN(exit)) return;

    const trades = Array.isArray(trades) ? trades : getTrades();
    const updatedTrades = trades.map(t => {
      if (t.id === outcomeTrade.id) {
        return {
          ...t,
          status: 'closed',
          exit: String(exit),
          result: outcomeResult,
        };
      }
      return t;
    });
    saveTrades(updatedTrades);
    setTrades(updatedTrades);
    setShowOutcomeModal(false);
    setOutcomeTrade(null);
    setOutcomeResult('');
    setOutcomeExitPrice('');
    // Refresh selectedTrade to show updated state
    const refreshed = updatedTrades.find(t => t.id === outcomeTrade.id);
    if (refreshed) setSelectedTrade(refreshed);
  };

  const handleOpenOutcome = (trade) => {
    setOutcomeTrade(trade);
    setOutcomeResult('');
    setOutcomeExitPrice('');
    setShowOutcomeModal(true);
  };

  const selectSearchResult = (result) => {
    setForm(f => ({
      ...f,
      asset: result.symbol,
      assetSymbol: result.symbol,
      assetName: result.name,
      assetClass: result.category,
      // Bug 5 fix: reset all Step 2 fields when asset type changes
      entry: '',
      exit: '',
      quantity: '',
      lotSize: '',
      capital: '',
      lotType: '',
      leverage: '',
      stopLoss: '',
      takeProfit: '',
    }));
    setSearchQuery(result.symbol);
    setShowSearchResults(false);
  };

  // Resolve the effective asset class — uses the detected class if a
  // suggestion was selected, otherwise defaults to 'forex' for manual entries.
  const resolveAssetClass = () => form.assetClass || 'forex';

  const fieldConfig = getFieldConfig(resolveAssetClass(), form.assetSymbol);

  // Validate SL/TP on blur for open trades
  const handleSlBlur = () => {
    if (form.status !== 'open' || !form.direction) return;
    const entry = Number(form.entry);
    const sl = Number(form.stopLoss);
    if (!entry || !sl) return;
    const errors = { ...formErrors.step2 };
    if (form.direction === 'buy') {
      errors.slError = sl >= entry ? 'Stop loss must be below entry for long positions.' : '';
    } else {
      errors.slError = sl <= entry ? 'Stop loss must be above entry for short positions.' : '';
    }
    setFormErrors(prev => ({ ...prev, step2: errors }));
  };

  const handleTpBlur = () => {
    if (form.status !== 'open' || !form.direction) return;
    const entry = Number(form.entry);
    const tp = Number(form.takeProfit);
    if (!entry || !tp) return;
    const errors = { ...formErrors.step2 };
    if (form.direction === 'buy') {
      errors.tpError = tp <= entry ? 'Take profit must be above entry for long positions.' : '';
    } else {
      errors.tpError = tp >= entry ? 'Take profit must be below entry for short positions.' : '';
    }
    setFormErrors(prev => ({ ...prev, step2: errors }));
  };

  return (
    <div className="px-4 pt-4 pb-6 animate-fade-in">
      {/* Sticky header: title + tab bar */}
      <div className="sticky top-0 z-10 bg-gradient-to-b from-slate-950 via-slate-950/98 to-transparent pb-2">
        <div className="flex items-center justify-between mb-3 pt-1">
          <h1 className="text-xl font-extrabold">Trading Journal</h1>
          <button
            onClick={() => { resetWizard(); handleTabChange('log'); }}
            className="w-9 h-9 bg-emerald-500 rounded-xl flex items-center justify-center text-slate-950"
          >
            <Plus size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-2 p-1 rounded-xl" style={{ backgroundColor: 'var(--bg-primary)', backdropFilter: 'blur(8px)' }}>
          {[
            { id: 'trades', label: 'My Trades', icon: BookOpen },
            { id: 'log', label: 'Log Trade', icon: Plus },
            { id: 'performance', label: 'Performance', icon: BarChart3 },
          ].map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === tab.id ? 'text-emerald-400' : 'text-slate-500 hover:text-slate-300'
                }`}
                style={activeTab === tab.id ? { backgroundColor: 'var(--bg-secondary)' } : {}}
              >
                <Icon size={14} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* MY TRADES */}
      {activeTab === 'trades' && !selectedTrade && (
        <>
          <div className="grid grid-cols-2 gap-2 mb-4">
            <div className="glass-card p-3">
              <p className="text-[10px] theme-text-secondary uppercase tracking-wider">Total Trades</p>
              <p className="text-xl font-bold font-mono">{tradesWithPnL.length}</p>
            </div>
            <div className="glass-card p-3">
              <p className="text-[10px] theme-text-secondary uppercase tracking-wider">Open</p>
              <p className="text-xl font-bold font-mono text-amber-400">{openTrades.length}</p>
            </div>
            <div className="glass-card p-3">
              <p className="text-[10px] theme-text-secondary uppercase tracking-wider">Closed</p>
              <p className="text-xl font-bold font-mono">{closedTrades.length}</p>
            </div>
            <div className="glass-card p-3">
              <p className="text-[10px] theme-text-secondary uppercase tracking-wider">Win Rate</p>
              <p className="text-xl font-bold font-mono text-emerald-400">{stats.winRate}%</p>
            </div>
          </div>

          {tradesWithPnL.length === 0 && (
            <div className="glass-card p-8 text-center">
              <BookOpen size={40} className="mx-auto text-slate-700 mb-3" />
              <p className="text-sm font-semibold theme-text-primary mb-1">No trades logged yet</p>
              <p className="text-xs theme-text-secondary">Tap the + button to log your first trade.</p>
            </div>
          )}

          <div className="flex flex-col gap-2">
            {tradesWithPnL.map(trade => {
              const isSwiped = swipedId === trade.id;
              return (
                <div key={trade.id} className="relative overflow-hidden rounded-xl" style={{ height: 'auto' }}>
                  {/* Delete button behind the row */}
                  <div
                    className={`absolute inset-0 flex items-center justify-end pr-4 bg-red-500 rounded-xl transition-opacity duration-200 ${isSwiped ? 'opacity-100' : 'opacity-0'}`}
                    style={{ zIndex: 0 }}
                  >
                    <button
                      onClick={() => setDeleteConfirmTrade(trade)}
                      className="flex items-center gap-2 text-white font-semibold px-4 py-3 rounded-lg"
                    >
                      <Trash2 size={16} /> Delete
                    </button>
                  </div>
                  {/* Trade row — slides left on swipe */}
                  <div
                    className={`glass-card p-4 flex items-center justify-between relative transition-transform duration-200 ${isSwiped ? '' : ''}`}
                    style={{ zIndex: 1, transform: isSwiped ? 'translateX(-100px)' : 'translateX(0)' }}
                    onTouchStart={e => {
                      trade._swipeStartX = e.touches[0].clientX;
                      setSwipedId(null); // close other swiped rows
                    }}
                    onTouchMove={e => {
                      const dx = e.touches[0].clientX - (trade._swipeStartX || 0);
                      if (dx < 0 && dx > -120) {
                        e.currentTarget.style.transform = `translateX(${dx}px)`;
                      }
                    }}
                    onTouchEnd={e => {
                      const dx = e.changedTouches[0].clientX - (trade._swipeStartX || 0);
                      if (dx < -80) {
                        setSwipedId(trade.id);
                        e.currentTarget.style.transform = 'translateX(-100px)';
                      } else {
                        setSwipedId(null);
                        e.currentTarget.style.transform = 'translateX(0)';
                      }
                    }}
                    onClick={() => {
                      if (isSwiped) {
                        setSwipedId(null);
                        e.currentTarget.style.transform = 'translateX(0)';
                        return;
                      }
                      setSelectedTrade(trade);
                    }}
                  >
                    <div className="flex-1 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold">{trade.asset}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                          trade.direction === 'buy' ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/15 text-red-400 border border-red-500/20'
                        }`}>
                          {trade.direction}
                        </span>
                        <span className="text-[10px] text-slate-500">{trade.timeframe}</span>
                        {trade.status === 'open' ? (
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase bg-amber-500/15 text-amber-400 border border-amber-500/20">Open</span>
                        ) : (
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase bg-slate-500/15 text-slate-400 border border-slate-500/20">Closed</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {trade.status === 'open' ? (
                          <span className="text-xs theme-text-secondary text-right">
                            TP: <span className="text-emerald-400 font-mono">+{formatMoney(trade.tpPnl || 0)}</span>{' '}
                            SL: <span className="text-red-400 font-mono">{formatMoney(trade.slPnl || 0)}</span>
                          </span>
                        ) : (
                          <span className={`text-sm font-bold font-mono ${trade.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {trade.pnl >= 0 ? '+' : ''}{formatMoney(trade.pnl)}
                          </span>
                        )}
                        <ChevronRight size={14} className="text-slate-600" />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Full-page Trade Detail */}
      {activeTab === 'trades' && selectedTrade && (
        <div className="animate-fade-in">
          <div className="flex items-center gap-3 mb-5">
            <button
              onClick={() => setSelectedTrade(null)}
              className="w-9 h-9 theme-bg-secondary rounded-xl flex items-center justify-center theme-text-secondary hover:theme-text-primary transition-colors"
            >
              <ChevronRight size={18} className="rotate-180" />
            </button>
            <h1 className="text-xl font-extrabold">Trade Details</h1>
          </div>

          <div className="space-y-4">
            {/* Header: asset, direction, status, P/L */}
            <div className="glass-card p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xl font-bold">{selectedTrade.asset}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-bold uppercase ${
                    selectedTrade.direction === 'buy' ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/15 text-red-400 border border-red-500/20'
                  }`}>
                    {selectedTrade.direction}
                  </span>
                  {selectedTrade.status === 'open' ? (
                    <span className="text-xs px-2 py-0.5 rounded-full font-bold uppercase bg-amber-500/15 text-amber-400 border border-amber-500/20">Open</span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded-full font-bold uppercase bg-slate-500/15 text-slate-400 border border-slate-500/20">Closed</span>
                  )}
                </div>
                {selectedTrade.status === 'closed' ? (
                  <span className={`text-xl font-bold font-mono ${selectedTrade.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {selectedTrade.pnl >= 0 ? '+' : ''}{formatMoney(selectedTrade.pnl)}
                  </span>
                ) : (
                  <span className="text-xs theme-text-secondary">No realized P/L yet</span>
                )}
              </div>
              <div className="flex items-center gap-4 text-xs theme-text-secondary flex-wrap">
                <span className="flex items-center gap-1"><Calendar size={12} /> {selectedTrade.date}</span>
                <span className="flex items-center gap-1"><Clock size={12} /> {selectedTrade.timeframe}</span>
                {selectedTrade.assetClass && <span className="capitalize bg-slate-800 px-2 py-0.5 rounded">{selectedTrade.assetClass}</span>}
              </div>
            </div>

            {/* Prices */}
            <div className="glass-card p-4 space-y-3">
              <p className="text-[10px] theme-text-secondary uppercase tracking-wider">Prices</p>
              <div className="flex justify-between text-sm">
                <span className="theme-text-secondary">Entry</span>
                <span className="font-mono theme-text-primary">${Number(selectedTrade.entry).toFixed(4)}</span>
              </div>
              {selectedTrade.status === 'closed' && selectedTrade.exit && (
                <div className="flex justify-between text-sm">
                  <span className="theme-text-secondary">Exit</span>
                  <span className="font-mono theme-text-primary">${Number(selectedTrade.exit).toFixed(4)}</span>
                </div>
              )}
              {selectedTrade.status === 'open' && (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="theme-text-secondary">Stop Loss</span>
                    <span className="font-mono theme-text-primary">{selectedTrade.stopLoss ? `$${Number(selectedTrade.stopLoss).toFixed(4)}` : '—'}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="theme-text-secondary">Take Profit</span>
                    <span className="font-mono theme-text-primary">{selectedTrade.takeProfit ? `$${Number(selectedTrade.takeProfit).toFixed(4)}` : '—'}</span>
                  </div>
                </>
              )}
              {selectedTrade.status === 'closed' && (selectedTrade.stopLoss || selectedTrade.takeProfit) && (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="theme-text-secondary">Stop Loss</span>
                    <span className="font-mono theme-text-primary">{selectedTrade.stopLoss ? `$${Number(selectedTrade.stopLoss).toFixed(4)}` : '—'}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="theme-text-secondary">Take Profit</span>
                    <span className="font-mono theme-text-primary">{selectedTrade.takeProfit ? `$${Number(selectedTrade.takeProfit).toFixed(4)}` : '—'}</span>
                  </div>
                </>
              )}
            </div>

            {/* Size */}
            {(selectedTrade.lotSize || selectedTrade.quantity || selectedTrade.capital) && (
              <div className="glass-card p-4">
                <p className="text-[10px] theme-text-secondary uppercase tracking-wider mb-2">Size</p>
                <p className="text-sm font-mono theme-text-primary">
                  {selectedTrade.lotSize && `Lot Size: ${selectedTrade.lotSize}`}
                  {selectedTrade.quantity && selectedTrade.assetClass !== 'crypto' && `Quantity: ${selectedTrade.quantity}`}
                  {selectedTrade.capital && `Capital: ${formatMoney(selectedTrade.capital)}`}
                  {selectedTrade.leverage ? ` • ${selectedTrade.leverage}x Leverage` : ''}
                </p>
              </div>
            )}

            {/* Projected Outcomes (open trades) */}
            {selectedTrade.status === 'open' && selectedTrade.tpPnl != null && (
              <div className="glass-card p-4">
                <p className="text-[10px] theme-text-secondary uppercase tracking-wider mb-3">Projected Outcomes</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-3">
                    <p className="text-[10px] text-emerald-500 uppercase tracking-wider mb-1">If TP Hits</p>
                    <p className="text-xl font-bold font-mono text-emerald-400">+{formatMoney(selectedTrade.tpPnl)}</p>
                  </div>
                  <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-3">
                    <p className="text-[10px] text-red-500 uppercase tracking-wider mb-1">If SL Hits</p>
                    <p className="text-xl font-bold font-mono text-red-400">{formatMoney(selectedTrade.slPnl)}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Result (closed trades) */}
            {selectedTrade.status === 'closed' && selectedTrade.result && (
              <div className="glass-card p-4">
                <p className="text-[10px] theme-text-secondary uppercase tracking-wider mb-2">Result</p>
                <span className={`text-sm font-bold px-3 py-1 rounded-full uppercase ${
                  selectedTrade.result === 'win' ? 'bg-emerald-500/15 text-emerald-400' :
                  selectedTrade.result === 'loss' ? 'bg-red-500/15 text-red-400' : 'bg-slate-500/15 text-slate-400'
                }`}>
                  {selectedTrade.result}
                </span>
              </div>
            )}

            {/* Review */}
            {(selectedTrade.bias || selectedTrade.emotion || selectedTrade.strategy) && (
              <div className="glass-card p-4 space-y-3">
                <p className="text-[10px] theme-text-secondary uppercase tracking-wider">Review</p>
                {selectedTrade.bias && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Bias</span>
                    <span className="text-slate-200">{selectedTrade.bias}</span>
                  </div>
                )}
                {selectedTrade.emotion && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Emotion</span>
                    <span className="text-slate-200 capitalize">{selectedTrade.emotion}</span>
                  </div>
                )}
                {selectedTrade.strategy && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Strategy</span>
                    <span className="text-slate-200 capitalize">{selectedTrade.strategy}</span>
                  </div>
                )}
              </div>
            )}

            {/* Notes */}
            {selectedTrade.notes && (
              <div className="glass-card p-4">
                <p className="text-[10px] theme-text-secondary uppercase tracking-wider mb-2">Notes</p>
                <p className="text-sm text-slate-300">{selectedTrade.notes}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => { setSelectedTrade(null); setDeleteConfirmTrade(selectedTrade); }}
                className="flex-1 py-3 rounded-xl text-sm font-semibold bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/15 transition-colors flex items-center justify-center gap-2"
              >
                <Trash2 size={16} /> Delete Trade
              </button>
              {selectedTrade.status === 'open' ? (
                <button
                  onClick={() => handleOpenOutcome(selectedTrade)}
                  className="flex-1 py-3 rounded-xl text-sm font-semibold bg-emerald-500 text-slate-950 hover:bg-emerald-600 transition-colors"
                >
                  Set Outcome
                </button>
              ) : (
                <button
                  onClick={() => setSelectedTrade(null)}
                  className="flex-1 py-3 rounded-xl text-sm font-semibold bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors"
                >
                  Back
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* LOG TRADE - 3 Step Wizard */}
      {activeTab === 'log' && (
        <div className="glass-card p-4">
          <div className="flex items-center gap-2 mb-6">
            {[1, 2, 3].map(step => (
              <div key={step} className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                  logStep === step ? 'bg-emerald-500 text-slate-950' :
                  logStep > step ? 'bg-emerald-500/30 text-emerald-400' : 'bg-slate-800 text-slate-500'
                }`}>
                  {logStep > step ? '✓' : step}
                </div>
                {step < 3 && <div className={`w-8 h-0.5 ${logStep > step ? 'bg-emerald-500/30' : 'bg-slate-800'}`} />}
              </div>
            ))}
          </div>

          {/* STEP 1 */}
          {logStep === 1 && (
            <div className="flex flex-col gap-5">
              <p className="text-sm font-semibold text-slate-300">Step 1: Setup</p>

              {/* Asset Search */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] theme-text-secondary uppercase tracking-wider">Asset Symbol</label>
                  {form.assetSymbol && form.assetName && (
                    <span className="text-[10px] text-emerald-400 font-mono">{form.assetClass}</span>
                  )}
                </div>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="EUR/USD, BTC, AAPL..."
                    value={searchQuery}
                    onChange={e => {
                      const val = e.target.value;
                      setSearchQuery(val);
                      setShowSearchResults(true);
                      // Always keep assetSymbol in sync with what's typed —
                      // user can proceed with manual entry even without selecting a suggestion
                      updateField('assetSymbol', val.trim().toUpperCase());
                    }}
                    onFocus={() => setShowSearchResults(true)}
                    onBlur={() => setTimeout(() => setShowSearchResults(false), 200)}
                    className="w-full input-field pr-8"
                  />
                  {searchQuery && (
                    <button onClick={() => { setSearchQuery(''); setShowSearchResults(false); updateField('assetSymbol', ''); updateField('assetName', ''); updateField('assetClass', ''); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                      <X size={14} />
                    </button>
                  )}
                  {showSearchResults && searchQuery.trim() && (
                    <div className="absolute z-50 w-full mt-1 bg-slate-900 border border-slate-700 rounded-xl shadow-xl max-h-60 overflow-y-auto">
                      {searchLoading && <div className="p-3 text-xs theme-text-secondary text-center">Searching...</div>}
                      {!searchLoading && searchResults.length === 0 && (
                        <div className="p-3 text-xs theme-text-secondary text-center">No results — you can still log it manually.</div>
                      )}
                      {!searchLoading && searchResults.map(result => (
                        <button
                          key={`${result.source}:${result.symbol}`}
                          onClick={() => selectSearchResult(result)}
                          className="w-full text-left p-3 flex items-center justify-between hover:bg-slate-800 transition-colors border-b border-slate-800/50 last:border-0"
                        >
                          <div>
                            <span className="text-sm font-semibold text-slate-200">{result.symbol}</span>
                            <span className="text-xs theme-text-secondary ml-2">{result.name}</span>
                          </div>
                          <span className="text-[10px] text-slate-600 uppercase bg-slate-800 px-2 py-0.5 rounded">{result.category}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {formErrors.step1.asset && <p className="text-xs text-red-400 mt-1">{formErrors.step1.asset}</p>}
                {form.assetSymbol && !form.assetName && (
                  <p className="text-[10px] text-slate-400 mt-1">Manual entry — asset type will default to forex</p>
                )}
              </div>

              {/* Direction */}
              <div>
                <label className="text-[10px] theme-text-secondary uppercase tracking-wider mb-1 block">Direction</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => updateField('direction', 'buy')}
                    className={`py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all ${
                      form.direction === 'buy'
                        ? 'bg-emerald-500 text-slate-950'
                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700 border border-slate-700'
                    }`}
                  >
                    <TrendingUp size={16} /> Buy / Long
                  </button>
                  <button
                    onClick={() => updateField('direction', 'sell')}
                    className={`py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all ${
                      form.direction === 'sell'
                        ? 'bg-red-500 text-white'
                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700 border border-slate-700'
                    }`}
                  >
                    <TrendingDown size={16} /> Sell / Short
                  </button>
                </div>
                {formErrors.step1.direction && <p className="text-xs text-red-400 mt-1">{formErrors.step1.direction}</p>}
              </div>

              {/* Timeframe */}
              <div>
                <label className="text-[10px] theme-text-secondary uppercase tracking-wider mb-1 block">Timeframe</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {TIMEFRAME_OPTIONS.map(tf => (
                    <button
                      key={tf}
                      onClick={() => { updateField('timeframe', tf); updateField('timeframeCustom', ''); }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        form.timeframe === tf
                          ? 'bg-emerald-500 text-slate-950'
                          : 'bg-slate-800 text-slate-400 hover:bg-slate-700 border border-slate-700'
                      }`}
                    >
                      {tf}
                    </button>
                  ))}
                  <button
                    onClick={() => { updateField('timeframe', 'custom'); updateField('timeframeCustom', ''); }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      form.timeframe === 'custom'
                        ? 'bg-emerald-500 text-slate-950'
                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700 border border-slate-700'
                    }`}
                  >
                    Custom
                  </button>
                </div>
                {form.timeframe === 'custom' && (
                  <input
                    type="text"
                    placeholder="e.g. 2H, 3D, 1W"
                    value={form.timeframeCustom}
                    onChange={e => updateField('timeframeCustom', e.target.value)}
                    className="w-full input-field"
                  />
                )}
                {formErrors.step1.timeframe && <p className="text-xs text-red-400 mt-1">{formErrors.step1.timeframe}</p>}
              </div>

              <button onClick={handleNext} className="btn-primary mt-2">Continue</button>
            </div>
          )}

          {/* STEP 2 */}
          {logStep === 2 && (
            <div className="flex flex-col gap-5">
              <p className="text-sm font-semibold text-slate-300">Step 2: Entry & Exit</p>

              {/* Status Toggle */}
              <div>
                <label className="text-[10px] theme-text-secondary uppercase tracking-wider mb-1 block">Trade Status</label>
                <div className="flex gap-1 bg-slate-800 p-1 rounded-xl">
                  <button
                    onClick={() => { updateField('status', 'closed'); updateField('exit', ''); updateField('stopLoss', ''); updateField('takeProfit', ''); }}
                    className={`flex-1 py-2.5 rounded-lg text-xs font-semibold transition-all ${
                      form.status === 'closed'
                        ? 'bg-emerald-500 text-slate-950'
                        : 'text-slate-400 hover:text-slate-300'
                    }`}
                  >
                    Closed
                  </button>
                  <button
                    onClick={() => { updateField('status', 'open'); updateField('exit', ''); updateField('stopLoss', ''); updateField('takeProfit', ''); }}
                    className={`flex-1 py-2.5 rounded-lg text-xs font-semibold transition-all ${
                      form.status === 'open'
                        ? 'bg-amber-500 text-slate-950'
                        : 'text-slate-400 hover:text-slate-300'
                    }`}
                  >
                    Open
                  </button>
                </div>
              </div>

              {form.assetSymbol && (
                <p className="text-xs theme-text-secondary">
                  {form.assetSymbol} • {form.direction === 'buy' ? 'Long' : 'Short'} • {form.timeframe === 'custom' ? form.timeframeCustom : form.timeframe}
                  {fieldConfig.hasLeverage && form.leverage ? ` • ${form.leverage}x Leverage` : ''}
                </p>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] theme-text-secondary uppercase tracking-wider mb-1 block">Entry Price *</label>
                  <input
                    type="number"
                    placeholder="1.0854"
                    value={form.entry}
                    onChange={e => updateField('entry', e.target.value)}
                    className="w-full input-field"
                  />
                  {formErrors.step2.entry && <p className="text-xs text-red-400 mt-1">{formErrors.step2.entry}</p>}
                </div>
                {form.status === 'closed' && (
                  <div>
                    <label className="text-[10px] theme-text-secondary uppercase tracking-wider mb-1 block">Exit Price *</label>
                    <input
                      type="number"
                      placeholder="1.0895"
                      value={form.exit}
                      onChange={e => updateField('exit', e.target.value)}
                      className="w-full input-field"
                    />
                    {formErrors.step2.exit && <p className="text-xs text-red-400 mt-1">{formErrors.step2.exit}</p>}
                  </div>
                )}
              </div>

              <div>
                <label className="text-[10px] theme-text-secondary uppercase tracking-wider mb-1 block">
                  {fieldConfig.quantityLabel} *
                </label>
                <input
                  type="number"
                  placeholder={fieldConfig.quantityPlaceholder}
                  value={form[fieldConfig.quantityKey]}
                  onChange={e => updateField(fieldConfig.quantityKey, e.target.value)}
                  className="w-full input-field"
                />
                {formErrors.step2.quantity && <p className="text-xs text-red-400 mt-1">{formErrors.step2.quantity}</p>}
              </div>

              {/* Forex Lot Type */}
              {fieldConfig.usesPips && (
                <div>
                  <label className="text-[10px] theme-text-secondary uppercase tracking-wider mb-1 block">Lot Type</label>
                  <div className="flex gap-1 bg-slate-800 p-1 rounded-xl">
                    {['standard', 'mini', 'micro'].map(type => (
                      <button
                        key={type}
                        onClick={() => updateField('lotType', type)}
                        className={`flex-1 py-2 rounded-lg text-xs font-semibold capitalize transition-all ${
                          form.lotType === type
                            ? 'bg-emerald-500 text-slate-950'
                            : 'text-slate-400 hover:text-slate-300'
                        }`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">Standard = $10/pip, Mini = $1/pip, Micro = $0.10/pip</p>
                </div>
              )}

              {fieldConfig.hasLeverage && (
                <div>
                  <label className="text-[10px] theme-text-secondary uppercase tracking-wider mb-1 block">Leverage</label>
                  <input
                    type="number"
                    placeholder="10"
                    value={form.leverage}
                    onChange={e => updateField('leverage', e.target.value)}
                    className="w-full input-field"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">e.g. 10, 20, 50, 100</p>
                </div>
              )}

              {form.status === 'open' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] theme-text-secondary uppercase tracking-wider mb-1 block">Stop Loss *</label>
                    <input
                      type="number"
                      placeholder="1.0820"
                      value={form.stopLoss}
                      onChange={e => updateField('stopLoss', e.target.value)}
                      onBlur={handleSlBlur}
                      className="w-full input-field"
                    />
                    {formErrors.step2.slError && <p className="text-xs text-red-400 mt-1">{formErrors.step2.slError}</p>}
                  </div>
                  <div>
                    <label className="text-[10px] theme-text-secondary uppercase tracking-wider mb-1 block">Take Profit *</label>
                    <input
                      type="number"
                      placeholder="1.0910"
                      value={form.takeProfit}
                      onChange={e => updateField('takeProfit', e.target.value)}
                      onBlur={handleTpBlur}
                      className="w-full input-field"
                    />
                    {formErrors.step2.tpError && <p className="text-xs text-red-400 mt-1">{formErrors.step2.tpError}</p>}
                  </div>
                </div>
              )}

              {/* Crypto liquidation price info */}
              {form.status === 'open' && resolveAssetClass() === 'crypto' && Number(form.leverage) > 1 && Number(form.entry) && (
                <div className="glass-card bg-amber-500/5 border border-amber-500/20 p-3 rounded-xl">
                  <p className="text-[10px] text-amber-500 uppercase tracking-wider mb-1">Liquidation Price</p>
                  <p className="text-sm font-mono text-amber-400">
                    ${calcLiquidationPrice(Number(form.entry), Number(form.leverage), form.direction)?.toFixed(4)}
                  </p>
                  <p className="text-[10px] text-slate-500 mt-1">
                    At {form.leverage}x leverage on {form.direction === 'buy' ? 'long' : 'short'}
                  </p>
                </div>
              )}

              <div className="flex gap-2 mt-2">
                <button onClick={() => handleStepChange(1)} className="flex-1 btn-secondary">Back</button>
                <button onClick={handleContinue} className="flex-1 btn-primary">Continue</button>
              </div>
            </div>
          )}

          {/* STEP 3 */}
          {logStep === 3 && (() => {
            const isClosed = form.status === 'closed';
            const closedPnl = isClosed ? calculateClosedPnL(form) : 0;
            const entry = Number(form.entry) || 0;
            const assetClass = resolveAssetClass();
            // Derive effective quantity for projected P/L display
            let qty = 0;
            if (assetClass === 'crypto') {
              qty = deriveCryptoQuantity(Number(form.capital), Number(form.leverage), entry);
            } else {
              qty = Number(form.quantity) || Number(form.lotSize) || 0;
            }
            const tpPnl = calculateProjectedPnL(entry, Number(form.takeProfit), qty, form.direction);
            const slPnl = calculateProjectedPnL(entry, Number(form.stopLoss), qty, form.direction);
            const result = isClosed ? deriveResult(closedPnl) : null;
            return (
              <div className="flex flex-col gap-5">
                <p className="text-sm font-semibold text-slate-300">Step 3: Result & Review</p>

                {isClosed ? (
                  // Closed trade: realized P/L
                  <div className="glass-card bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                    <p className="text-[10px] theme-text-secondary uppercase tracking-wider mb-2">Realized P/L</p>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-2xl font-bold font-mono" style={{ color: closedPnl >= 0 ? '#10b981' : '#ef4444' }}>
                          {closedPnl >= 0 ? '+' : ''}{formatMoney(closedPnl)}
                        </p>
                        <p className="text-xs theme-text-secondary mt-1">
                          Entry: ${entry.toFixed(4)} → Exit: ${Number(form.exit).toFixed(4)} • {fieldConfig.quantityLabel}: {form[fieldConfig.quantityKey]}
                          {fieldConfig.hasLeverage && form.leverage ? ` • ${form.leverage}x` : ''}
                        </p>
                      </div>
                      <span className={`text-sm font-bold px-3 py-1 rounded-full uppercase ${
                        result === 'win' ? 'bg-emerald-500/15 text-emerald-400' :
                        result === 'loss' ? 'bg-red-500/15 text-red-400' : 'bg-slate-500/15 text-slate-400'
                      }`}>
                        {result}
                      </span>
                    </div>
                  </div>
                ) : (
                  // Open trade: projected outcomes
                  <div className="glass-card bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                    <p className="text-[10px] theme-text-secondary uppercase tracking-wider mb-2">Projected Outcomes</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-[10px] text-emerald-500 uppercase tracking-wider mb-1">If TP Hits</p>
                        <p className="text-xl font-bold font-mono text-emerald-400">
                          {tpPnl >= 0 ? '+' : ''}{formatMoney(tpPnl)}
                        </p>
                        <p className="text-xs theme-text-secondary mt-1">
                          Entry: ${entry.toFixed(4)} → TP: ${Number(form.takeProfit).toFixed(4)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-red-500 uppercase tracking-wider mb-1">If SL Hits</p>
                        <p className="text-xl font-bold font-mono text-red-400">
                          {slPnl >= 0 ? '+' : ''}{formatMoney(slPnl)}
                        </p>
                        <p className="text-xs theme-text-secondary mt-1">
                          Entry: ${entry.toFixed(4)} → SL: ${Number(form.stopLoss).toFixed(4)}
                        </p>
                      </div>
                    </div>
                    <p className="text-[9px] text-slate-600 mt-2 text-center">
                      {fieldConfig.quantityLabel}: {form[fieldConfig.quantityKey]}{fieldConfig.hasLeverage && form.leverage ? ` • ${form.leverage}x` : ''}
                    </p>
                  </div>
                )}

                <div>
                  <label className="text-[10px] theme-text-secondary uppercase tracking-wider mb-2 block">Market Bias *</label>
                  <div className="grid grid-cols-3 gap-2">
                    {BIAS_OPTIONS.map(opt => {
                      const Icon = opt.icon;
                      return (
                        <button
                          key={opt.value}
                          onClick={() => updateField('bias', opt.value)}
                          className={`flex flex-col items-center gap-1.5 py-3 rounded-xl text-xs font-semibold transition-all ${
                            form.bias === opt.value
                              ? 'bg-emerald-500 text-slate-950'
                              : 'bg-slate-800 text-slate-400 hover:bg-slate-700 border border-slate-700'
                          }`}
                        >
                          <Icon size={18} className={opt.color} />
                          {opt.value}
                        </button>
                      );
                    })}
                  </div>
                  {formErrors.step3.bias && <p className="text-xs text-red-400 mt-1">{formErrors.step3.bias}</p>}
                </div>

                <div>
                  <label className="text-[10px] theme-text-secondary uppercase tracking-wider mb-2 block">Emotional State *</label>
                  <div className="grid grid-cols-2 gap-2">
                    {EMOTIONS.map(opt => {
                      const Icon = opt.icon;
                      return (
                        <button
                          key={opt.value}
                          onClick={() => updateField('emotion', opt.value)}
                          className={`flex items-center gap-2 py-3 px-3 rounded-xl text-sm font-semibold transition-all ${
                            form.emotion === opt.value
                              ? 'bg-emerald-500 text-slate-950'
                              : 'bg-slate-800 text-slate-400 hover:bg-slate-700 border border-slate-700'
                          }`}
                        >
                          <Icon size={16} className={opt.color} />
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                  {formErrors.step3.emotion && <p className="text-xs text-red-400 mt-1">{formErrors.step3.emotion}</p>}
                </div>

                <div>
                  <label className="text-[10px] theme-text-secondary uppercase tracking-wider mb-2 block">Strategy *</label>
                  <div className="grid grid-cols-2 gap-2">
                    {STRATEGIES.map(s => {
                      const Icon = STRATEGY_ICONS[s] || TrendingUp;
                      return (
                        <button
                          key={s}
                          onClick={() => updateField('strategy', s)}
                          className={`flex items-center gap-2 py-3 px-3 rounded-xl text-sm font-semibold transition-all ${
                            form.strategy === s
                              ? 'bg-emerald-500 text-slate-950'
                              : 'bg-slate-800 text-slate-400 hover:bg-slate-700 border border-slate-700'
                          }`}
                        >
                          <Icon size={16} className="text-slate-400" />
                          {s}
                        </button>
                      );
                    })}
                  </div>
                  {formErrors.step3.strategy && <p className="text-xs text-red-400 mt-1">{formErrors.step3.strategy}</p>}
                </div>

                <div>
                  <label className="text-[10px] theme-text-secondary uppercase tracking-wider mb-1 block">Notes</label>
                  <textarea
                    placeholder="Explain your setup..."
                    rows={3}
                    value={form.notes}
                    onChange={e => updateField('notes', e.target.value)}
                    className="w-full input-field resize-none"
                  />
                </div>

                <div className="flex gap-2 mt-2">
                  <button onClick={() => handleStepChange(2)} className="flex-1 btn-secondary">Back</button>
                  <button onClick={handleSave} className="flex-1 btn-primary">Save Trade</button>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* PERFORMANCE */}
      {activeTab === 'performance' && (
        closedTrades.length === 0 ? (
          <div className="glass-card p-8 text-center">
            <BarChart3 size={48} className="mx-auto text-slate-700 mb-3" />
            <p className="text-sm font-semibold theme-text-primary mb-1">No performance data yet</p>
            <p className="text-xs theme-text-secondary">
              {openTrades.length > 0
                ? `You have ${openTrades.length} open position${openTrades.length > 1 ? 's' : ''}. Close them to see performance stats.`
                : 'Log closed trades to see your win rate, P&L, and more.'}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {openTrades.length > 0 && (
              <div className="glass-card p-3 border border-amber-500/20 bg-amber-500/5">
                <p className="text-[10px] text-amber-500 uppercase tracking-wider mb-1">Open Positions</p>
                <p className="text-lg font-bold font-mono text-amber-400">{openTrades.length}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">Not included in stats below until closed</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div className="glass-card p-3">
                <p className="text-[10px] theme-text-secondary uppercase tracking-wider">Total P&L</p>
                <p className={`text-lg font-bold font-mono ${stats.totalPL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {stats.totalPL >= 0 ? '+' : ''}{formatMoney(stats.totalPL)}
                </p>
              </div>
              <div className="glass-card p-3">
                <p className="text-[10px] theme-text-secondary uppercase tracking-wider">Win Rate</p>
                <p className="text-lg font-bold font-mono text-emerald-400">{stats.winRate}%</p>
              </div>
              <div className="glass-card p-3">
                <p className="text-[10px] theme-text-secondary uppercase tracking-wider">Avg Win</p>
                <p className="text-lg font-bold font-mono text-emerald-400">{avgWin > 0 ? formatMoney(avgWin) : 'No wins'}</p>
              </div>
              <div className="glass-card p-3">
                <p className="text-[10px] theme-text-secondary uppercase tracking-wider">Avg Loss</p>
                {losingTrades.length > 0 ? (
                  <p className="text-lg font-bold font-mono text-red-400">{avgLoss < 0 ? formatMoney(avgLoss) : 'No losses'}</p>
                ) : (
                  <p className="text-lg font-bold font-mono text-slate-500">No losses</p>
                )}
              </div>
            </div>
            {bestTrade && (
              <div className="glass-card p-3">
                <p className="text-[10px] theme-text-secondary uppercase tracking-wider mb-1">Best Trade</p>
                <p className="text-sm font-semibold">{bestTrade.asset} <span className="text-emerald-400 font-mono">+{formatMoney(bestTrade.pnl)}</span></p>
              </div>
            )}
            {worstTrade ? (
              <div className="glass-card p-3">
                <p className="text-[10px] theme-text-secondary uppercase tracking-wider mb-1">Worst Trade</p>
                <p className="text-sm font-semibold">{worstTrade.asset} <span className="text-red-400 font-mono">{formatMoney(worstTrade.pnl)}</span></p>
              </div>
            ) : (
              <div className="glass-card p-3">
                <p className="text-[10px] theme-text-secondary uppercase tracking-wider mb-1">Worst Trade</p>
                <p className="text-sm font-semibold text-emerald-400">No losses yet 🎉</p>
              </div>
            )}
            <p className="text-[10px] text-slate-600 text-center mt-2">Stats computed from closed trades only. Charts coming in a future update.</p>
          </div>
        )
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmTrade && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setDeleteConfirmTrade(null)}>
          <div className="bg-slate-900 w-full sm:w-[400px] rounded-2xl border border-slate-700 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-slate-700 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center flex-shrink-0">
                <Trash2 size={20} className="text-red-400" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-200">Delete Trade?</h3>
                <p className="text-xs theme-text-secondary mt-0.5">This action cannot be undone.</p>
              </div>
            </div>
            <div className="p-5">
              <p className="text-sm text-slate-300">
                Are you sure you want to delete the trade for <span className="font-semibold text-slate-200">{deleteConfirmTrade.asset}</span>
                {' '}({deleteConfirmTrade.date}) with P&L of{' '}
                <span className={`font-mono font-semibold ${deleteConfirmTrade.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {deleteConfirmTrade.pnl >= 0 ? '+' : ''}{formatMoney(deleteConfirmTrade.pnl)}
                </span>?
              </p>
            </div>
            <div className="flex gap-2 p-4 border-t border-slate-700">
              <button
                onClick={() => setDeleteConfirmTrade(null)}
                className="flex-1 py-3 rounded-xl text-sm font-semibold bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirmTrade)}
                className="flex-1 py-3 rounded-xl text-sm font-semibold bg-red-500 text-white hover:bg-red-600 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Set Outcome Modal */}
      {showOutcomeModal && outcomeTrade && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowOutcomeModal(false)}>
          <div className="bg-slate-900 w-full sm:w-[440px] rounded-2xl border border-slate-700 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-slate-700 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                <TrendingUp size={20} className="text-emerald-400" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-200">Set Trade Outcome</h3>
                <p className="text-xs theme-text-secondary mt-0.5">{outcomeTrade.asset} • {outcomeTrade.direction === 'buy' ? 'Long' : 'Short'}</p>
              </div>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-[10px] theme-text-secondary uppercase tracking-wider mb-1 block">Exit Price *</label>
                <input
                  type="number"
                  step="any"
                  placeholder="Enter exit price"
                  value={outcomeExitPrice}
                  onChange={e => setOutcomeExitPrice(e.target.value)}
                  className="w-full input-field"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-[10px] theme-text-secondary uppercase tracking-wider mb-2 block">Result *</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setOutcomeResult('win')}
                    className={`py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all ${
                      outcomeResult === 'win'
                        ? 'bg-emerald-500 text-slate-950'
                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700 border border-slate-700'
                    }`}
                  >
                    <TrendingUp size={16} /> Win
                  </button>
                  <button
                    onClick={() => setOutcomeResult('loss')}
                    className={`py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all ${
                      outcomeResult === 'loss'
                        ? 'bg-red-500 text-white'
                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700 border border-slate-700'
                    }`}
                  >
                    <TrendingDown size={16} /> Loss
                  </button>
                </div>
              </div>
              {outcomeExitPrice && outcomeResult && (
                <div className="bg-slate-800/50 rounded-xl p-3">
                  <p className="text-[10px] theme-text-secondary uppercase tracking-wider mb-1">Preview</p>
                  <p className="text-sm text-slate-300">
                    Exit: <span className="font-mono theme-text-primary">${Number(outcomeExitPrice).toFixed(4)}</span> •
                    Result: <span className={`font-bold ${outcomeResult === 'win' ? 'text-emerald-400' : 'text-red-400'}`}>{outcomeResult}</span>
                  </p>
                  <p className="text-[10px] text-slate-500 mt-1">This action is final — the trade will be marked as closed and cannot be changed.</p>
                </div>
              )}
            </div>
            <div className="flex gap-2 p-4 border-t border-slate-700">
              <button
                onClick={() => setShowOutcomeModal(false)}
                className="flex-1 py-3 rounded-xl text-sm font-semibold bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSetOutcome}
                disabled={!outcomeExitPrice || !outcomeResult}
                className="flex-1 py-3 rounded-xl text-sm font-semibold bg-emerald-500 text-slate-950 hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Confirm Outcome
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
