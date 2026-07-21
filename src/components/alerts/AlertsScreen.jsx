import { useState, useEffect, useMemo } from 'react';
import { Bell, Plus, Trash2, X } from 'lucide-react';
import { useCryptoBatch, useBatchQuotes } from '../../hooks/useMarketData.js';
import { getCategory } from '../../services/marketDataService.js';
import { getAlerts, createAlert, deleteAlert, checkAlerts } from '../../services/alertsService.js';

export default function AlertsScreen() {
  const [alerts, setAlerts] = useState(() => getAlerts());
  const [showForm, setShowForm] = useState(false);
  const [formAsset, setFormAsset] = useState('');
  const [formCondition, setFormCondition] = useState('above');
  const [formValue, setFormValue] = useState('');
  const [formError, setFormError] = useState('');

  // Split alert symbols by category so we can fetch live prices for
  // whichever assets currently have active alerts on them.
  const alertSymbols = useMemo(() => alerts.map(a => a.asset), [alerts]);
  const cryptoSymbols = useMemo(() => alertSymbols.filter(s => getCategory(s) === 'crypto'), [alertSymbols]);
  const nonCryptoSymbols = useMemo(() => alertSymbols.filter(s => getCategory(s) !== 'crypto'), [alertSymbols]);

  const { data: cryptoData } = useCryptoBatch(cryptoSymbols.length > 0);
  const { data: nonCryptoData } = useBatchQuotes(nonCryptoSymbols, nonCryptoSymbols.length > 0);
  const livePrices = useMemo(() => ({ ...cryptoData, ...nonCryptoData }), [cryptoData, nonCryptoData]);

  // Whenever live prices update, check active alerts against them.
  useEffect(() => {
    if (alerts.length === 0 || Object.keys(livePrices).length === 0) return;
    const result = checkAlerts(alerts, livePrices);
    if (result.changed) setAlerts(result.alerts);
  }, [livePrices]);

  const handleToggleForm = () => {
    setFormError('');
    setShowForm(s => !s);
  };

  const handleCreate = () => {
    const asset = formAsset.trim();
    const value = parseFloat(formValue);

    if (!asset) { setFormError('Enter an asset symbol.'); return; }
    if (formValue === '' || Number.isNaN(value)) { setFormError('Enter a valid target price.'); return; }

    const updated = createAlert({ asset, condition: formCondition, value });
    setAlerts(updated);
    setFormAsset('');
    setFormValue('');
    setFormCondition('above');
    setFormError('');
    setShowForm(false);
  };

  const handleDelete = (id) => {
    const updated = deleteAlert(id);
    setAlerts(updated);
  };

  return (
    <div className="px-4 pt-4 pb-6 animate-fade-in">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-extrabold">Alerts</h1>
        <button
          onClick={handleToggleForm}
          className="w-9 h-9 bg-emerald-500 rounded-xl flex items-center justify-center text-slate-950"
        >
          {showForm ? <X size={18} /> : <Plus size={18} />}
        </button>
      </div>

      {showForm && (
        <div className="glass-card p-4 mb-4 flex flex-col gap-3">
          <p className="text-sm font-semibold text-slate-300">New Price Alert</p>

          <div>
            <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">Asset Symbol</label>
            <input
              type="text"
              placeholder="EUR/USD, BTC, AAPL..."
              value={formAsset}
              onChange={e => setFormAsset(e.target.value)}
              className="w-full input-field"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">Condition</label>
              <select
                value={formCondition}
                onChange={e => setFormCondition(e.target.value)}
                className="w-full input-field"
              >
                <option value="above">Price Above</option>
                <option value="below">Price Below</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">Target Price</label>
              <input
                type="number"
                placeholder="1.0900"
                value={formValue}
                onChange={e => setFormValue(e.target.value)}
                className="w-full input-field"
              />
            </div>
          </div>

          {formError && <p className="text-xs text-red-400">{formError}</p>}

          <div className="flex gap-2">
            <button onClick={handleToggleForm} className="flex-1 btn-secondary">Cancel</button>
            <button onClick={handleCreate} className="flex-1 btn-primary">Create Alert</button>
          </div>
        </div>
      )}

      {alerts.length === 0 && !showForm && (
        <div className="text-center py-12">
          <Bell size={40} className="mx-auto text-slate-700 mb-3" />
          <p className="text-sm font-semibold text-slate-300 mb-1">No alerts yet</p>
          <p className="text-xs text-slate-500">Create one to get notified when a price hits your target.</p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {alerts.map(alert => (
          <div key={alert.id} className={`glass-card p-4 ${
            alert.status === 'triggered' ? 'border-amber-500/30 bg-amber-500/5' : ''
          }`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Bell size={16} className={alert.status === 'triggered' ? 'text-amber-400' : 'text-emerald-400'} />
                <span className="text-sm font-bold">{alert.asset}</span>
              </div>
              <button onClick={() => handleDelete(alert.id)} className="text-slate-600 hover:text-red-400 transition-colors">
                <Trash2 size={14} />
              </button>
            </div>
            <p className="text-xs text-slate-400 mb-2">
              Price {alert.condition} {alert.value}
            </p>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border uppercase ${
              alert.status === 'active'
                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20'
                : 'bg-amber-500/15 text-amber-400 border-amber-500/20'
            }`}>
              {alert.status}
            </span>
          </div>
        ))}
      </div>

      {alerts.length > 0 && !showForm && (
        <button onClick={handleToggleForm} className="w-full mt-4 btn-primary">
          <Plus size={16} />
          Create New Alert
        </button>
      )}
    </div>
  );
}
