import { useState, useEffect, useMemo } from 'react';
import { Bell, Plus, Trash2, X, AlertCircle } from 'lucide-react';
import { useCryptoBatch, useBatchQuotes } from '../../hooks/useMarketData.js';
import { getCategory } from '../../services/marketDataService.js';
import { getAlerts, createAlert, deleteAlert, checkAlerts } from '../../services/alertsService.js';
import { useSymbolSearch } from '../../hooks/useSymbolSearch.js';

export default function AlertsScreen() {
  const [alerts, setAlerts] = useState(() => getAlerts());
  const [showForm, setShowForm] = useState(false);
  const [formAsset, setFormAsset] = useState('');
  const [formCondition, setFormCondition] = useState('above');
  const [formValue, setFormValue] = useState('');
  const [formError, setFormError] = useState('');
  const [deleteConfirmAlert, setDeleteConfirmAlert] = useState(null);
  const [triggeredAlerts, setTriggeredAlerts] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchResults, setShowSearchResults] = useState(false);
  const { results: searchResults, isLoading: searchLoading } = useSymbolSearch(searchQuery);

  const selectSearchResult = (result) => {
    setFormAsset(result.symbol);
    setSearchQuery(result.symbol);
    setShowSearchResults(false);
    setFormError('');
  };

  // Split alert symbols by category so we can fetch live prices for
  // whichever assets currently have active alerts on them.
  const alertSymbols = useMemo(() => alerts.map(a => a.asset), [alerts]);
  const cryptoSymbols = useMemo(() => alertSymbols.filter(s => getCategory(s) === 'crypto'), [alertSymbols]);
  const nonCryptoSymbols = useMemo(() => alertSymbols.filter(s => getCategory(s) !== 'crypto'), [alertSymbols]);

  const { data: cryptoData } = useCryptoBatch(cryptoSymbols.length > 0);
  const { data: nonCryptoData } = useBatchQuotes(nonCryptoSymbols, nonCryptoSymbols.length > 0);
  const livePrices = useMemo(() => ({ ...(cryptoData || {}), ...(nonCryptoData || {}) }), [cryptoData, nonCryptoData]);

  // Whenever live prices update, check active alerts against them.
  useEffect(() => {
    if (alerts.length === 0 || Object.keys(livePrices).length === 0) return;
    try {
      const result = checkAlerts(alerts, livePrices);
      if (result.changed) {
        setAlerts(result.alerts);
        // Track newly triggered alerts for notification display
        if (result.newlyTriggered.length > 0) {
          setTriggeredAlerts(prev => [...prev, ...result.newlyTriggered]);
          // Request browser notification permission
          if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
          }
          // Show browser notification for each triggered alert
          result.newlyTriggered.forEach(alert => {
            if (!alert.id || !alert.asset) return; // Skip malformed alerts
            if ('Notification' in window && Notification.permission === 'granted') {
              try {
                new Notification(`Alert: ${alert.asset}`, {
                  body: `Price is now ${alert.condition} ${alert.value}`,
                  icon: '/vite.svg',
                  tag: `alert-${alert.id}`,
                });
              } catch (err) {
                console.error('[Alerts] Notification error:', err);
              }
            }
          });
        }
      }
    } catch (err) {
      console.error('[Alerts] Error checking alerts:', err);
    }
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
    setSearchQuery('');
    setShowSearchResults(false);
    setShowForm(false);
  };

  const handleDelete = (alert) => {
    const updated = deleteAlert(alert.id);
    setAlerts(updated);
    setDeleteConfirmAlert(null);
  };

  const handleDeleteClick = (alert) => {
    setDeleteConfirmAlert(alert);
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
          <p className="text-sm font-semibold theme-text-primary">New Price Alert</p>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] theme-text-secondary uppercase tracking-wider">Asset Symbol</label>
              {formAsset && searchResults.length === 0 && (
                <span className="text-[10px] theme-text-secondary font-mono">Manual entry</span>
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
                  setFormAsset(val.trim().toUpperCase());
                  setShowSearchResults(true);
                  if (formError) setFormError('');
                }}
                onFocus={() => setShowSearchResults(true)}
                onBlur={() => setTimeout(() => setShowSearchResults(false), 200)}
                className="w-full input-field pr-8"
              />
              {searchQuery && (
                <button onClick={() => { setSearchQuery(''); setFormAsset(''); setShowSearchResults(false); setFormError(''); }} className="absolute right-3 top-1/2 -translate-y-1/2 theme-text-secondary hover:theme-text-primary">
                  <X size={14} />
                </button>
              )}
              {showSearchResults && searchQuery.trim() && (
                <div className="absolute z-50 w-full mt-1 theme-bg-secondary theme-border rounded-xl shadow-xl max-h-60 overflow-y-auto">
                  {searchLoading && <div className="p-3 text-xs theme-text-secondary text-center">Searching...</div>}
                  {!searchLoading && searchResults.length === 0 && (
                    <div className="p-3 text-xs theme-text-secondary text-center">No results — you can still create an alert manually.</div>
                  )}
                  {!searchLoading && searchResults.map(result => (
                    <button
                      key={`${result.source}:${result.symbol}`}
                      onClick={() => selectSearchResult(result)}
                      className="w-full text-left p-3 flex items-center justify-between hover:theme-bg-tertiary transition-colors theme-border last:border-0"
                    >
                      <div>
                        <span className="text-sm font-semibold theme-text-primary">{result.symbol}</span>
                        <span className="text-xs theme-text-secondary ml-2">{result.name}</span>
                      </div>
                      <span className="text-[10px] text-slate-600 uppercase theme-bg-secondary px-2 py-0.5 rounded">{result.category}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] theme-text-secondary uppercase tracking-wider mb-1 block">Condition</label>
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
              <label className="text-[10px] theme-text-secondary uppercase tracking-wider mb-1 block">Target Price</label>
              <input
                type="number"
                placeholder="1.0900"
                value={formValue}
                onChange={e => {
                  setFormValue(e.target.value);
                  if (formError) setFormError('');
                }}
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

      {/* Triggered alerts notification banner */}
      {triggeredAlerts.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 mb-4">
          <div className="flex items-start gap-3">
            <AlertCircle size={20} className="text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-400 mb-1">Alerts Triggered</p>
              <div className="space-y-1">
                {triggeredAlerts.map(alert => (
                  <p key={alert.id} className="text-xs text-amber-300">
                    <span className="font-bold">{alert.asset}</span> — Price is now {alert.condition} {alert.value}
                  </p>
                ))}
              </div>
              <button
                onClick={() => setTriggeredAlerts([])}
                className="text-[10px] text-amber-500 mt-2 hover:text-amber-400"
              >
                Dismiss
              </button>
            </div>
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
              <button onClick={() => handleDeleteClick(alert)} className="text-slate-600 hover:text-red-400 transition-colors">
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

      {/* Delete confirmation modal */}
      {deleteConfirmAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setDeleteConfirmAlert(null)}>
          <div className="bg-slate-900 w-full sm:w-[400px] rounded-2xl border border-slate-700 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-slate-700 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center flex-shrink-0">
                <Trash2 size={20} className="text-red-400" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-200">Delete Alert?</h3>
                <p className="text-xs text-slate-500 mt-0.5">This action cannot be undone.</p>
              </div>
            </div>
            <div className="p-5">
              <p className="text-sm text-slate-300">
                Are you sure you want to delete the alert for <span className="font-semibold text-slate-200">{deleteConfirmAlert.asset}</span>{' '}
                (Price {deleteConfirmAlert.condition} {deleteConfirmAlert.value})?
              </p>
            </div>
            <div className="flex gap-2 p-4 border-t border-slate-700">
              <button
                onClick={() => setDeleteConfirmAlert(null)}
                className="flex-1 py-3 rounded-xl text-sm font-semibold bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirmAlert)}
                className="flex-1 py-3 rounded-xl text-sm font-semibold bg-red-500 text-white hover:bg-red-600 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
