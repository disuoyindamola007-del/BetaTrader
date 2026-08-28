import { useState, useEffect } from 'react';
import { BookOpen, Plus, BarChart3, TrendingUp, TrendingDown, Trash2, X, ChevronRight, Calendar, Clock, Target } from 'lucide-react';
import { useSymbolSearch } from '../../hooks/useSymbolSearch.js';
import { getTrades, createTrade, deleteTrade } from '../../services/journalService.js';

const TIMEFRAME_OPTIONS = ['5m', '15m', '30m', '1H', '4H', '8H', '1D'];
const EMOTIONS = [
  { value: 'calm', label: 'Calm 🧘' },
  { value: 'confident', label: 'Confident 💪' },
  { value: 'anxious', label: 'Anxious 😰' },
  { value: 'fomo', label: 'FOMO 🚀' },
];
const STRATEGIES = ['Breakout', 'Trend Following', 'Reversal', 'Range Trading', 'Scalping', 'Swing'];

// Field config per asset class
const FIELD_CONFIG = {
  forex: {
    quantityLabel: 'Lot Size',
    quantityPlaceholder: '0.01',
    quantityKey: 'lotSize',
  },
  stocks: {
    quantityLabel: 'Shares',
    quantityPlaceholder: '10',
    quantityKey: 'quantity',
  },
  crypto: {
    quantityLabel: 'Coins',
    quantityPlaceholder: '0.5',
    quantityKey: 'quantity',
  },
  commodities: {
    quantityLabel: 'Units',
    quantityPlaceholder: '1',
    quantityKey: 'quantity',
  },
};

const emptyForm = {
  asset: '',
  assetSymbol: '',
  assetName: '',
  assetClass: '',
  direction: '',
  timeframe: '',
  timeframeCustom: '',
  entry: '',
  exit: '',
  quantity: '',
  lotSize: '',
  stopLoss: '',
  takeProfit: '',
  bias: '',
  emotion: '',
  strategy: '',
  notes: '',
};

const step1Errors = { asset: '', direction: '', timeframe: '' };
const step2Errors = { entry: '', exit: '', quantity: '' };
const step3Errors = { bias: '', emotion: '', strategy: '' };

// Calculate P&L from trade data
function calculatePnL(trade) {
  const entry = Number(trade.entry) || 0;
  const exit = Number(trade.exit) || 0;
  const qty = Number(trade.quantity) || Number(trade.lotSize) || 0;

  if (!entry || !exit || !qty) return 0;

  const gross = trade.direction === 'buy' ? (exit - entry) * qty : (entry - exit) * qty;
  return Math.round(gross * 100) / 100;
}

function deriveResult(pnl) {
  if (Math.abs(pnl) < 0.01) return 'breakeven';
  return pnl > 0 ? 'win' : 'loss';
}

export default function JournalScreen() {
  const [activeTab, setActiveTab] = useState('trades');
  const [logStep, setLogStep] = useState(1);
  const [trades, setTrades] = useState(() => getTrades());
  const [form, setForm] = useState(emptyForm);
  const [formErrors, setFormErrors] = useState({ step1: { ...step1Errors }, step2: { ...step2Errors }, step3: { ...step3Errors } });
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [selectedTrade, setSelectedTrade] = useState(null);
  const { results: searchResults, isLoading: searchLoading } = useSymbolSearch(searchQuery);

  // Persist trades to localStorage whenever they change
  useEffect(() => {
    // getTrades() already reads from localStorage on init via useState lazy init
    // No need to re-save here since createTrade/deleteTrade handle persistence
  }, [trades]);

  // Compute P&L and result for each trade
  const tradesWithPnL = trades.map(t => {
    const pnl = calculatePnL(t);
    return { ...t, pnl, result: deriveResult(pnl) };
  });

  const stats = {
    totalTrades: tradesWithPnL.length,
    wins: tradesWithPnL.filter(t => t.result === 'win').length,
    losses: tradesWithPnL.filter(t => t.result === 'loss').length,
    winRate: tradesWithPnL.length ? ((tradesWithPnL.filter(t => t.result === 'win').length / tradesWithPnL.length) * 100).toFixed(1) : 0,
    totalPL: tradesWithPnL.reduce((acc, t) => acc + (t.pnl || 0), 0),
  };

  const losingTrades = tradesWithPnL.filter(t => t.pnl < 0);
  const winningTrades = tradesWithPnL.filter(t => t.pnl > 0);
  const bestTrade = winningTrades.length ? winningTrades.reduce((best, t) => (t.pnl > best.pnl ? t : best), winningTrades[0]) : null;
  const worstTrade = losingTrades.length ? losingTrades.reduce((worst, t) => (t.pnl < worst.pnl ? t : worst), losingTrades[0]) : null;
  const avgWin = winningTrades.length ? (winningTrades.reduce((a, t) => a + t.pnl, 0) / winningTrades.length).toFixed(2) : 0;
  const avgLoss = losingTrades.length ? (losingTrades.reduce((a, t) => a + t.pnl, 0) / losingTrades.length).toFixed(2) : 0;

  const updateField = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const resetWizard = () => {
    setForm(emptyForm);
    setLogStep(1);
    setFormErrors({ step1: { ...step1Errors }, step2: { ...step2Errors }, step3: { ...step3Errors } });
    setSearchQuery('');
    setShowSearchResults(false);
  };

  const handleNext = () => {
    const errors = { ...step1Errors };
    if (!form.assetSymbol.trim()) errors.asset = 'Select an asset from the suggestions.';
    if (!form.direction) errors.direction = 'Choose Buy or Sell.';
    if (!form.timeframe) errors.timeframe = 'Select a timeframe.';
    setFormErrors(prev => ({ ...prev, step1: errors }));

    if (Object.values(errors).some(e => e)) return;
    setLogStep(s => Math.min(3, s + 1));
  };

  const handleSave = () => {
    // Step 2 validation
    if (logStep === 2) {
      const config = FIELD_CONFIG[form.assetClass] || FIELD_CONFIG.forex;
      const errors = { ...step2Errors };
      if (form.entry === '' || Number.isNaN(Number(form.entry))) errors.entry = 'Enter entry price.';
      if (form.exit === '' || Number.isNaN(Number(form.exit))) errors.exit = 'Enter exit price.';
      if (form[config.quantityKey] === '' || Number.isNaN(Number(form[config.quantityKey]))) {
        errors.quantity = `Enter ${config.quantityLabel.toLowerCase()}.`;
      }
      setFormErrors(prev => ({ ...prev, step2: errors }));
      if (Object.values(errors).some(e => e)) return;
    }

    // Step 3 validation
    if (logStep === 3) {
      const errors = { ...step3Errors };
      if (!form.bias) errors.bias = 'Select market bias.';
      if (!form.emotion) errors.emotion = 'Select emotional state.';
      if (!form.strategy) errors.strategy = 'Select strategy.';
      setFormErrors(prev => ({ ...prev, step3: errors }));
      if (Object.values(errors).some(e => e)) return;
    }

    const qtyKey = FIELD_CONFIG[form.assetClass]?.quantityKey || 'lotSize';
    const updated = createTrade({
      asset: form.assetSymbol.trim().toUpperCase(),
      assetName: form.assetName,
      assetClass: form.assetClass,
      direction: form.direction,
      timeframe: form.timeframe === 'custom' ? form.timeframeCustom.trim() : form.timeframe,
      entry: Number(form.entry) || null,
      exit: Number(form.exit) || null,
      [qtyKey]: Number(form[qtyKey]) || null,
      stopLoss: form.stopLoss === '' ? null : Number(form.stopLoss),
      takeProfit: form.takeProfit === '' ? null : Number(form.takeProfit),
      bias: form.bias,
      emotion: form.emotion,
      strategy: form.strategy,
      notes: form.notes.trim(),
    });
    setTrades(updated);
    resetWizard();
    setActiveTab('trades');
  };

  const handleDelete = (trade) => {
    const confirmed = window.confirm(`Delete this ${trade.asset} trade (${trade.date})?`);
    if (!confirmed) return;
    const updated = deleteTrade(trade.id);
    setTrades(updated);
  };

  const selectSearchResult = (result) => {
    setForm(f => ({
      ...f,
      asset: result.symbol,
      assetSymbol: result.symbol,
      assetName: result.name,
      assetClass: result.category,
    }));
    setSearchQuery(result.symbol);
    setShowSearchResults(false);
  };

  const getFieldConfig = () => FIELD_CONFIG[form.assetClass] || FIELD_CONFIG.forex;

  return (
    <div className="px-4 pt-4 pb-6 animate-fade-in">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-extrabold">Trading Journal</h1>
        <button
          onClick={() => { resetWizard(); setActiveTab('log'); }}
          className="w-9 h-9 bg-emerald-500 rounded-xl flex items-center justify-center text-slate-950"
        >
          <Plus size={18} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-slate-900/50 p-1 rounded-xl">
        {[
          { id: 'trades', label: 'My Trades', icon: BookOpen },
          { id: 'log', label: 'Log Trade', icon: Plus },
          { id: 'performance', label: 'Performance', icon: BarChart3 },
        ].map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === tab.id ? 'bg-slate-800 text-emerald-400' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* MY TRADES */}
      {activeTab === 'trades' && (
        <>
          <div className="grid grid-cols-2 gap-2 mb-4">
            <div className="glass-card p-3">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">Total Trades</p>
              <p className="text-xl font-bold font-mono">{stats.totalTrades}</p>
            </div>
            <div className="glass-card p-3">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">Win Rate</p>
              <p className="text-xl font-bold font-mono text-emerald-400">{stats.winRate}%</p>
            </div>
            <div className="glass-card p-3">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">Total P&L</p>
              <p className={`text-xl font-bold font-mono ${stats.totalPL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {stats.totalPL >= 0 ? '+' : ''}${stats.totalPL.toFixed(2)}
              </p>
            </div>
            <div className="glass-card p-3">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">W / L</p>
              <p className="text-xl font-bold font-mono">{stats.wins} / {stats.losses}</p>
            </div>
          </div>

          {tradesWithPnL.length === 0 && (
            <div className="glass-card p-8 text-center">
              <BookOpen size={40} className="mx-auto text-slate-700 mb-3" />
              <p className="text-sm font-semibold text-slate-300 mb-1">No trades logged yet</p>
              <p className="text-xs text-slate-500">Tap the + button to log your first trade.</p>
            </div>
          )}

          <div className="flex flex-col gap-2">
            {tradesWithPnL.map(trade => (
              <button
                key={trade.id}
                onClick={() => setSelectedTrade(trade)}
                className="glass-card-hover p-4 text-left w-full"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold">{trade.asset}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                      trade.direction === 'buy' ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/15 text-red-400 border border-red-500/20'
                    }`}>
                      {trade.direction}
                    </span>
                    <span className="text-[10px] text-slate-500">{trade.timeframe}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-bold font-mono ${trade.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)}
                    </span>
                    <ChevronRight size={14} className="text-slate-600" />
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  <span>{trade.date}</span>
                  {trade.strategy && <span className="capitalize">{trade.strategy}</span>}
                </div>
                {trade.notes && <p className="text-xs text-slate-400 mt-2 line-clamp-1">{trade.notes}</p>}
              </button>
            ))}
          </div>
        </>
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
                <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">Asset Symbol</label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="EUR/USD, BTC, AAPL..."
                    value={searchQuery}
                    onChange={e => { setSearchQuery(e.target.value); setShowSearchResults(true); updateField('assetSymbol', ''); updateField('assetName', ''); updateField('assetClass', ''); }}
                    onFocus={() => setShowSearchResults(true)}
                    className="w-full input-field pr-8"
                  />
                  {searchQuery && (
                    <button onClick={() => { setSearchQuery(''); setShowSearchResults(false); updateField('assetSymbol', ''); updateField('assetName', ''); updateField('assetClass', ''); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                      <X size={14} />
                    </button>
                  )}
                  {showSearchResults && searchQuery.trim() && (
                    <div className="absolute z-50 w-full mt-1 bg-slate-900 border border-slate-700 rounded-xl shadow-xl max-h-60 overflow-y-auto">
                      {searchLoading && <div className="p-3 text-xs text-slate-500 text-center">Searching...</div>}
                      {!searchLoading && searchResults.length === 0 && (
                        <div className="p-3 text-xs text-slate-500 text-center">No results found. Try a different symbol.</div>
                      )}
                      {!searchLoading && searchResults.map(result => (
                        <button
                          key={`${result.source}:${result.symbol}`}
                          onClick={() => selectSearchResult(result)}
                          className="w-full text-left p-3 flex items-center justify-between hover:bg-slate-800 transition-colors border-b border-slate-800/50 last:border-0"
                        >
                          <div>
                            <span className="text-sm font-semibold text-slate-200">{result.symbol}</span>
                            <span className="text-xs text-slate-500 ml-2">{result.name}</span>
                          </div>
                          <span className="text-[10px] text-slate-600 uppercase bg-slate-800 px-2 py-0.5 rounded">{result.category}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {formErrors.step1.asset && <p className="text-xs text-red-400 mt-1">{formErrors.step1.asset}</p>}
                {form.assetSymbol && (
                  <p className="text-[10px] text-emerald-400 mt-1">✓ {form.assetSymbol} ({form.assetClass})</p>
                )}
              </div>

              {/* Direction */}
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">Direction</label>
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
                <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">Timeframe</label>
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
              {form.assetSymbol && (
                <p className="text-xs text-slate-500">
                  {form.assetSymbol} • {form.direction === 'buy' ? 'Long' : 'Short'} • {form.timeframe === 'custom' ? form.timeframeCustom : form.timeframe}
                </p>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">Entry Price *</label>
                  <input
                    type="number"
                    placeholder="1.0854"
                    value={form.entry}
                    onChange={e => updateField('entry', e.target.value)}
                    className="w-full input-field"
                  />
                  {formErrors.step2.entry && <p className="text-xs text-red-400 mt-1">{formErrors.step2.entry}</p>}
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">Exit Price *</label>
                  <input
                    type="number"
                    placeholder="1.0895"
                    value={form.exit}
                    onChange={e => updateField('exit', e.target.value)}
                    className="w-full input-field"
                  />
                  {formErrors.step2.exit && <p className="text-xs text-red-400 mt-1">{formErrors.step2.exit}</p>}
                </div>
              </div>

              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">
                  {getFieldConfig().quantityLabel} *
                </label>
                <input
                  type="number"
                  placeholder={getFieldConfig().quantityPlaceholder}
                  value={form[getFieldConfig().quantityKey]}
                  onChange={e => updateField(getFieldConfig().quantityKey, e.target.value)}
                  className="w-full input-field"
                />
                {formErrors.step2.quantity && <p className="text-xs text-red-400 mt-1">{formErrors.step2.quantity}</p>}
                <p className="text-[10px] text-slate-500 mt-1">
                  {getFieldConfig().quantityLabel} for {form.assetClass || 'forex'} trades
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">Stop Loss</label>
                  <input
                    type="number"
                    placeholder="1.0820"
                    value={form.stopLoss}
                    onChange={e => updateField('stopLoss', e.target.value)}
                    className="w-full input-field"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">Take Profit</label>
                  <input
                    type="number"
                    placeholder="1.0910"
                    value={form.takeProfit}
                    onChange={e => updateField('takeProfit', e.target.value)}
                    className="w-full input-field"
                  />
                </div>
              </div>

              <div className="flex gap-2 mt-2">
                <button onClick={() => setLogStep(1)} className="flex-1 btn-secondary">Back</button>
                <button onClick={handleSave} className="flex-1 btn-primary">Save Trade</button>
              </div>
            </div>
          )}

          {/* STEP 3 */}
          {logStep === 3 && (() => {
            const pnl = calculatePnL(form);
            const result = deriveResult(pnl);
            return (
              <div className="flex flex-col gap-5">
                <p className="text-sm font-semibold text-slate-300">Step 3: Result & Review</p>

                {/* Auto-calculated P&L display */}
                <div className="glass-card bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Calculated P&L</p>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-2xl font-bold font-mono" style={{ color: pnl >= 0 ? '#10b981' : '#ef4444' }}>
                        {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        Entry: ${Number(form.entry).toFixed(4)} → Exit: ${Number(form.exit).toFixed(4)} • {getFieldConfig().quantityLabel}: {form[getFieldConfig().quantityKey]}
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

                <div>
                  <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">Market Bias *</label>
                  <select value={form.bias} onChange={e => updateField('bias', e.target.value)} className="w-full input-field">
                    <option value="">Select bias...</option>
                    <option>Bullish</option>
                    <option>Bearish</option>
                    <option>Neutral</option>
                  </select>
                  {formErrors.step3.bias && <p className="text-xs text-red-400 mt-1">{formErrors.step3.bias}</p>}
                </div>

                <div>
                  <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">Emotional State *</label>
                  <select value={form.emotion} onChange={e => updateField('emotion', e.target.value)} className="w-full input-field">
                    <option value="">Select emotion...</option>
                    {EMOTIONS.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
                  </select>
                  {formErrors.step3.emotion && <p className="text-xs text-red-400 mt-1">{formErrors.step3.emotion}</p>}
                </div>

                <div>
                  <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">Strategy *</label>
                  <select value={form.strategy} onChange={e => updateField('strategy', e.target.value)} className="w-full input-field">
                    <option value="">Select strategy...</option>
                    {STRATEGIES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  {formErrors.step3.strategy && <p className="text-xs text-red-400 mt-1">{formErrors.step3.strategy}</p>}
                </div>

                <div>
                  <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">Notes</label>
                  <textarea
                    placeholder="Explain your setup..."
                    rows={3}
                    value={form.notes}
                    onChange={e => updateField('notes', e.target.value)}
                    className="w-full input-field resize-none"
                  />
                </div>

                <div className="flex gap-2 mt-2">
                  <button onClick={() => setLogStep(2)} className="flex-1 btn-secondary">Back</button>
                  <button onClick={handleSave} className="flex-1 btn-primary">Save Trade</button>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* PERFORMANCE */}
      {activeTab === 'performance' && (
        tradesWithPnL.length === 0 ? (
          <div className="glass-card p-8 text-center">
            <BarChart3 size={48} className="mx-auto text-slate-700 mb-3" />
            <p className="text-sm font-semibold text-slate-300 mb-1">No performance data yet</p>
            <p className="text-xs text-slate-500">Log closed trades to see your win rate, P&L, and more.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="glass-card p-3">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider">Total P&L</p>
                <p className={`text-lg font-bold font-mono ${stats.totalPL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {stats.totalPL >= 0 ? '+' : ''}${stats.totalPL.toFixed(2)}
                </p>
              </div>
              <div className="glass-card p-3">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider">Win Rate</p>
                <p className="text-lg font-bold font-mono text-emerald-400">{stats.winRate}%</p>
              </div>
              <div className="glass-card p-3">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider">Avg Win</p>
                <p className="text-lg font-bold font-mono text-emerald-400">${avgWin}</p>
              </div>
              <div className="glass-card p-3">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider">Avg Loss</p>
                {losingTrades.length > 0 ? (
                  <p className="text-lg font-bold font-mono text-red-400">${avgLoss}</p>
                ) : (
                  <p className="text-lg font-bold font-mono text-slate-500">No losses</p>
                )}
              </div>
            </div>
            {bestTrade && (
              <div className="glass-card p-3">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Best Trade</p>
                <p className="text-sm font-semibold">{bestTrade.asset} <span className="text-emerald-400 font-mono">+${bestTrade.pnl.toFixed(2)}</span></p>
              </div>
            )}
            {worstTrade ? (
              <div className="glass-card p-3">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Worst Trade</p>
                <p className="text-sm font-semibold">{worstTrade.asset} <span className="text-red-400 font-mono">${worstTrade.pnl.toFixed(2)}</span></p>
              </div>
            ) : (
              <div className="glass-card p-3">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Worst Trade</p>
                <p className="text-sm font-semibold text-emerald-400">No losses yet 🎉</p>
              </div>
            )}
            <p className="text-[10px] text-slate-600 text-center mt-2">P&L auto-calculated from entry, exit, and quantity. Charts coming in a future update.</p>
          </div>
        )
      )}

      {/* Trade Detail Modal */}
      {selectedTrade && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setSelectedTrade(null)}>
          <div className="bg-slate-900 w-full sm:w-[480px] sm:rounded-2xl rounded-t-2xl max-h-[85vh] overflow-y-auto border border-slate-700 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-slate-900 border-b border-slate-700 p-4 flex items-center justify-between z-10">
              <h2 className="text-lg font-bold">Trade Details</h2>
              <button onClick={() => setSelectedTrade(null)} className="p-1 hover:bg-slate-800 rounded-full transition-colors">
                <X size={20} className="text-slate-400" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xl font-bold">{selectedTrade.asset}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-bold uppercase ${
                    selectedTrade.direction === 'buy' ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/15 text-red-400 border border-red-500/20'
                  }`}>
                    {selectedTrade.direction}
                  </span>
                </div>
                <span className={`text-xl font-bold font-mono ${selectedTrade.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {selectedTrade.pnl >= 0 ? '+' : ''}${selectedTrade.pnl.toFixed(2)}
                </span>
              </div>

              <div className="flex items-center gap-4 text-xs text-slate-500">
                <span className="flex items-center gap-1"><Calendar size={12} /> {selectedTrade.date}</span>
                <span className="flex items-center gap-1"><Clock size={12} /> {selectedTrade.timeframe}</span>
                {selectedTrade.assetClass && <span className="capitalize bg-slate-800 px-2 py-0.5 rounded">{selectedTrade.assetClass}</span>}
              </div>

              {/* Prices */}
              <div className="glass-card p-3 space-y-2">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider">Prices</p>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Entry</span>
                  <span className="font-mono text-slate-200">${Number(selectedTrade.entry).toFixed(4)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Exit</span>
                  <span className="font-mono text-slate-200">${Number(selectedTrade.exit).toFixed(4)}</span>
                </div>
                {(selectedTrade.stopLoss || selectedTrade.takeProfit) && (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">Stop Loss</span>
                      <span className="font-mono text-slate-200">{selectedTrade.stopLoss ? `$${Number(selectedTrade.stopLoss).toFixed(4)}` : '—'}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">Take Profit</span>
                      <span className="font-mono text-slate-200">{selectedTrade.takeProfit ? `$${Number(selectedTrade.takeProfit).toFixed(4)}` : '—'}</span>
                    </div>
                  </>
                )}
              </div>

              {/* Size */}
              {(selectedTrade.lotSize || selectedTrade.quantity) && (
                <div className="glass-card p-3">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Size</p>
                  <p className="text-sm font-mono text-slate-200">
                    {selectedTrade.lotSize ? `Lot Size: ${selectedTrade.lotSize}` : `Quantity: ${selectedTrade.quantity}`}
                  </p>
                </div>
              )}

              {/* Result */}
              <div className="glass-card p-3">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Result</p>
                <span className={`text-sm font-bold px-3 py-1 rounded-full uppercase ${
                  selectedTrade.result === 'win' ? 'bg-emerald-500/15 text-emerald-400' :
                  selectedTrade.result === 'loss' ? 'bg-red-500/15 text-red-400' : 'bg-slate-500/15 text-slate-400'
                }`}>
                  {selectedTrade.result}
                </span>
              </div>

              {/* Review */}
              {(selectedTrade.bias || selectedTrade.emotion || selectedTrade.strategy) && (
                <div className="glass-card p-3 space-y-2">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider">Review</p>
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

              {selectedTrade.notes && (
                <div className="glass-card p-3">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Notes</p>
                  <p className="text-sm text-slate-300">{selectedTrade.notes}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => { setSelectedTrade(null); handleDelete(selectedTrade); }}
                  className="flex-1 py-3 rounded-xl text-sm font-semibold bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/15 transition-colors flex items-center justify-center gap-2"
                >
                  <Trash2 size={16} /> Delete Trade
                </button>
                <button
                  onClick={() => setSelectedTrade(null)}
                  className="flex-1 py-3 rounded-xl text-sm font-semibold bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
