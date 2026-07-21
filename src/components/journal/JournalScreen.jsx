import { useState } from 'react';
import { BookOpen, Plus, BarChart3, TrendingUp, TrendingDown, Trash2 } from 'lucide-react';
import { getTrades, createTrade, deleteTrade } from '../../services/journalService.js';

const emptyForm = {
  asset: '',
  direction: 'buy',
  timeframe: '1H',
  entry: '',
  exit: '',
  stopLoss: '',
  takeProfit: '',
  lotSize: '',
  result: 'win',
  pl: '',
  bias: 'Bullish',
  emotion: 'calm',
  strategy: 'Breakout',
  notes: '',
};

export default function JournalScreen() {
  const [activeTab, setActiveTab] = useState('trades');
  const [logStep, setLogStep] = useState(1);
  const [trades, setTrades] = useState(() => getTrades());
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState('');

  const stats = {
    totalTrades: trades.length,
    wins: trades.filter(t => t.result === 'win').length,
    losses: trades.filter(t => t.result === 'loss').length,
    winRate: trades.length ? ((trades.filter(t => t.result === 'win').length / trades.length) * 100).toFixed(1) : 0,
    totalPL: trades.reduce((acc, t) => acc + (Number(t.pl) || 0), 0),
  };

  const bestTrade = trades.length ? trades.reduce((best, t) => (Number(t.pl) > Number(best.pl) ? t : best), trades[0]) : null;
  const worstTrade = trades.length ? trades.reduce((worst, t) => (Number(t.pl) < Number(worst.pl) ? t : worst), trades[0]) : null;
  const avgWin = stats.wins ? (trades.filter(t => t.result === 'win').reduce((a, t) => a + Number(t.pl), 0) / stats.wins).toFixed(2) : 0;
  const avgLoss = stats.losses ? (trades.filter(t => t.result === 'loss').reduce((a, t) => a + Number(t.pl), 0) / stats.losses).toFixed(2) : 0;

  const updateField = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const resetWizard = () => {
    setForm(emptyForm);
    setLogStep(1);
    setFormError('');
  };

  const handleNext = () => {
    if (logStep === 1 && !form.asset.trim()) { setFormError('Enter an asset symbol.'); return; }
    setFormError('');
    setLogStep(s => Math.min(3, s + 1));
  };

  const handleSave = () => {
    if (!form.asset.trim()) { setFormError('Enter an asset symbol.'); return; }
    if (form.pl === '' || Number.isNaN(Number(form.pl))) { setFormError('Enter your actual P&L for this trade.'); return; }

    const updated = createTrade({
      asset: form.asset.trim().toUpperCase(),
      direction: form.direction,
      timeframe: form.timeframe,
      entry: form.entry === '' ? null : Number(form.entry),
      exit: form.exit === '' ? null : Number(form.exit),
      stopLoss: form.stopLoss === '' ? null : Number(form.stopLoss),
      takeProfit: form.takeProfit === '' ? null : Number(form.takeProfit),
      lotSize: form.lotSize === '' ? null : Number(form.lotSize),
      result: form.result,
      pl: Number(form.pl),
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

          {trades.length === 0 && (
            <div className="glass-card p-8 text-center">
              <BookOpen size={40} className="mx-auto text-slate-700 mb-3" />
              <p className="text-sm font-semibold text-slate-300 mb-1">No trades logged yet</p>
              <p className="text-xs text-slate-500">Tap the + button to log your first trade.</p>
            </div>
          )}

          <div className="flex flex-col gap-2">
            {trades.map(trade => (
              <div key={trade.id} className="glass-card p-4">
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
                  <div className="flex items-center gap-3">
                    <span className={`text-sm font-bold font-mono ${trade.pl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {trade.pl >= 0 ? '+' : ''}${Number(trade.pl).toFixed(2)}
                    </span>
                    <button onClick={() => handleDelete(trade)} className="text-slate-600 hover:text-red-400 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  <span>{trade.date}</span>
                  {trade.strategy && <span className="capitalize">{trade.strategy}</span>}
                  {trade.emotion && <span className="capitalize">{trade.emotion}</span>}
                </div>
                {trade.notes && <p className="text-xs text-slate-400 mt-2 line-clamp-1">{trade.notes}</p>}
              </div>
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

          {formError && <p className="text-xs text-red-400 mb-3">{formError}</p>}

          {logStep === 1 && (
            <div className="flex flex-col gap-4">
              <p className="text-sm font-semibold text-slate-300">Step 1: Setup</p>
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">Asset Symbol</label>
                <input type="text" placeholder="EUR/USD, BTCUSD..." value={form.asset} onChange={e => updateField('asset', e.target.value)} className="w-full input-field" />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">Direction</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => updateField('direction', 'buy')}
                    className={form.direction === 'buy' ? 'btn-primary' : 'btn-secondary'}
                  >
                    <TrendingUp size={16} /> Buy / Long
                  </button>
                  <button
                    onClick={() => updateField('direction', 'sell')}
                    className={form.direction === 'sell' ? 'btn-primary bg-red-500 text-slate-950' : 'btn-secondary text-red-400 border-red-500/20'}
                  >
                    <TrendingDown size={16} /> Sell / Short
                  </button>
                </div>
              </div>
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">Timeframe</label>
                <select value={form.timeframe} onChange={e => updateField('timeframe', e.target.value)} className="w-full input-field">
                  <option value="1H">1 Hour (1H)</option>
                  <option value="4H">4 Hours (4H)</option>
                  <option value="1D">1 Day (1D)</option>
                </select>
              </div>
              <button onClick={handleNext} className="btn-primary">Continue</button>
            </div>
          )}

          {logStep === 2 && (
            <div className="flex flex-col gap-4">
              <p className="text-sm font-semibold text-slate-300">Step 2: Entry & Exit</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">Entry Price</label>
                  <input type="number" placeholder="1.0854" value={form.entry} onChange={e => updateField('entry', e.target.value)} className="w-full input-field" />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">Exit Price</label>
                  <input type="number" placeholder="1.0895" value={form.exit} onChange={e => updateField('exit', e.target.value)} className="w-full input-field" />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">Lot Size</label>
                  <input type="number" placeholder="0.01" value={form.lotSize} onChange={e => updateField('lotSize', e.target.value)} className="w-full input-field" />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">Stop Loss</label>
                  <input type="number" placeholder="1.0820" value={form.stopLoss} onChange={e => updateField('stopLoss', e.target.value)} className="w-full input-field" />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">Take Profit</label>
                  <input type="number" placeholder="1.0910" value={form.takeProfit} onChange={e => updateField('takeProfit', e.target.value)} className="w-full input-field" />
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setLogStep(1)} className="flex-1 btn-secondary">Back</button>
                <button onClick={handleNext} className="flex-1 btn-primary">Continue</button>
              </div>
            </div>
          )}

          {logStep === 3 && (
            <div className="flex flex-col gap-4">
              <p className="text-sm font-semibold text-slate-300">Step 3: Result & Review</p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">Result</label>
                  <select value={form.result} onChange={e => updateField('result', e.target.value)} className="w-full input-field">
                    <option value="win">Win</option>
                    <option value="loss">Loss</option>
                    <option value="breakeven">Breakeven</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">P&L ($)</label>
                  <input type="number" placeholder="375" value={form.pl} onChange={e => updateField('pl', e.target.value)} className="w-full input-field" />
                </div>
              </div>

              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">Market Bias</label>
                <select value={form.bias} onChange={e => updateField('bias', e.target.value)} className="w-full input-field">
                  <option>Bullish</option>
                  <option>Bearish</option>
                  <option>Neutral</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">Emotional State</label>
                <select value={form.emotion} onChange={e => updateField('emotion', e.target.value)} className="w-full input-field">
                  <option value="calm">Calm 🧘</option>
                  <option value="confident">Confident 💪</option>
                  <option value="anxious">Anxious 😰</option>
                  <option value="fomo">FOMO 🚀</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">Strategy</label>
                <select value={form.strategy} onChange={e => updateField('strategy', e.target.value)} className="w-full input-field">
                  <option>Breakout</option>
                  <option>Trend Following</option>
                  <option>Reversal</option>
                  <option>Range Trading</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">Notes</label>
                <textarea placeholder="Explain your setup..." rows={3} value={form.notes} onChange={e => updateField('notes', e.target.value)} className="w-full input-field resize-none" />
              </div>
              <div className="flex gap-2">
                <button onClick={() => setLogStep(2)} className="flex-1 btn-secondary">Back</button>
                <button onClick={handleSave} className="flex-1 btn-primary">Save Trade</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* PERFORMANCE */}
      {activeTab === 'performance' && (
        trades.length === 0 ? (
          <div className="glass-card p-8 text-center">
            <BarChart3 size={48} className="mx-auto text-slate-700 mb-3" />
            <p className="text-sm font-semibold text-slate-300 mb-1">No performance data yet</p>
            <p className="text-xs text-slate-500">
              Log closed trades to see your<br />win rate, P&L, and more.
            </p>
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
                <p className="text-lg font-bold font-mono text-red-400">${avgLoss}</p>
              </div>
            </div>
            {bestTrade && (
              <div className="glass-card p-3">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Best Trade</p>
                <p className="text-sm font-semibold">{bestTrade.asset} <span className="text-emerald-400 font-mono">+${Number(bestTrade.pl).toFixed(2)}</span></p>
              </div>
            )}
            {worstTrade && (
              <div className="glass-card p-3">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Worst Trade</p>
                <p className="text-sm font-semibold">{worstTrade.asset} <span className="text-red-400 font-mono">${Number(worstTrade.pl).toFixed(2)}</span></p>
              </div>
            )}
            <p className="text-[10px] text-slate-600 text-center mt-2">Charts coming in a future update — numbers above are computed live from your logged trades.</p>
          </div>
        )
      )}
    </div>
  );
}
