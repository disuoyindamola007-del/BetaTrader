import { useState } from 'react';
import { BookOpen, Plus, BarChart3, TrendingUp, TrendingDown, Calendar } from 'lucide-react';
import { journalTrades } from '../../data/mockData.js';

export default function JournalScreen() {
  const [activeTab, setActiveTab] = useState('trades');
  const [logStep, setLogStep] = useState(1);

  const stats = {
    totalTrades: journalTrades.length,
    wins: journalTrades.filter(t => t.result === 'win').length,
    losses: journalTrades.filter(t => t.result === 'loss').length,
    winRate: journalTrades.length ? ((journalTrades.filter(t => t.result === 'win').length / journalTrades.length) * 100).toFixed(1) : 0,
    totalPL: journalTrades.reduce((acc, t) => acc + t.pl, 0),
  };

  return (
    <div className="px-4 pt-4 pb-6 animate-fade-in">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-extrabold">Trading Journal</h1>
        <button 
          onClick={() => setActiveTab('log')}
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
          {/* Dashboard Stats */}
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
                {stats.totalPL >= 0 ? '+' : ''}${stats.totalPL}
              </p>
            </div>
            <div className="glass-card p-3">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">W / L</p>
              <p className="text-xl font-bold font-mono">{stats.wins} / {stats.losses}</p>
            </div>
          </div>

          {/* Trade List */}
          <div className="flex flex-col gap-2">
            {journalTrades.map(trade => (
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
                  <span className={`text-sm font-bold font-mono ${trade.pl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {trade.pl >= 0 ? '+' : ''}${trade.pl}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  <span>{trade.date}</span>
                  <span className="capitalize">{trade.strategy}</span>
                  <span className="capitalize">{trade.emotion}</span>
                </div>
                <p className="text-xs text-slate-400 mt-2 line-clamp-1">{trade.notes}</p>
              </div>
            ))}
          </div>
        </>
      )}

      {/* LOG TRADE - 3 Step Wizard */}
      {activeTab === 'log' && (
        <div className="glass-card p-4">
          {/* Step Indicator */}
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

          {logStep === 1 && (
            <div className="flex flex-col gap-4">
              <p className="text-sm font-semibold text-slate-300">Step 1: Setup</p>
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">Asset Symbol</label>
                <input type="text" placeholder="EUR/USD, BTCUSD..." className="w-full input-field" />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">Direction</label>
                <div className="grid grid-cols-2 gap-2">
                  <button className="btn-primary"><TrendingUp size={16} /> Buy / Long</button>
                  <button className="btn-secondary text-red-400 border-red-500/20"><TrendingDown size={16} /> Sell / Short</button>
                </div>
              </div>
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">Timeframe</label>
                <select className="w-full input-field">
                  <option>1 Hour (1H)</option>
                  <option>4 Hours (4H)</option>
                  <option>1 Day (1D)</option>
                </select>
              </div>
              <button onClick={() => setLogStep(2)} className="btn-primary">Continue</button>
            </div>
          )}

          {logStep === 2 && (
            <div className="flex flex-col gap-4">
              <p className="text-sm font-semibold text-slate-300">Step 2: Entry & Exit</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">Entry Price</label>
                  <input type="number" placeholder="1.0854" className="w-full input-field" />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">Lot Size</label>
                  <input type="number" placeholder="0.01" className="w-full input-field" />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">Stop Loss</label>
                  <input type="number" placeholder="1.0820" className="w-full input-field" />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">Take Profit</label>
                  <input type="number" placeholder="1.0910" className="w-full input-field" />
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setLogStep(1)} className="flex-1 btn-secondary">Back</button>
                <button onClick={() => setLogStep(3)} className="flex-1 btn-primary">Continue</button>
              </div>
            </div>
          )}

          {logStep === 3 && (
            <div className="flex flex-col gap-4">
              <p className="text-sm font-semibold text-slate-300">Step 3: Review</p>
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">Market Bias</label>
                <select className="w-full input-field">
                  <option>Bullish</option>
                  <option>Bearish</option>
                  <option>Neutral</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">Emotional State</label>
                <select className="w-full input-field">
                  <option>Calm 🧘</option>
                  <option>Confident 💪</option>
                  <option>Anxious 😰</option>
                  <option>FOMO 🚀</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">Strategy</label>
                <select className="w-full input-field">
                  <option>Breakout</option>
                  <option>Trend Following</option>
                  <option>Reversal</option>
                  <option>Range Trading</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">Notes</label>
                <textarea placeholder="Explain your setup..." rows={3} className="w-full input-field resize-none" />
              </div>
              <div className="flex gap-2">
                <button onClick={() => setLogStep(2)} className="flex-1 btn-secondary">Back</button>
                <button onClick={() => { setActiveTab('trades'); setLogStep(1); }} className="flex-1 btn-primary">Save Trade</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* PERFORMANCE */}
      {activeTab === 'performance' && (
        <div className="glass-card p-8 text-center">
          <BarChart3 size={48} className="mx-auto text-slate-700 mb-3" />
          <p className="text-sm font-semibold text-slate-300 mb-1">No performance data yet</p>
          <p className="text-xs text-slate-500">
            Log closed trades to see your<br />win rate, P&L charts, and more.
          </p>
        </div>
      )}
    </div>
  );
}
