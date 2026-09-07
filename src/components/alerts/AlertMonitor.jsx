import { useEffect, useMemo, useState } from 'react';
import { useCryptoBatch, useBatchQuotes } from '../../hooks/useMarketData.js';
import { getCategory } from '../../services/marketDataService.js';
import { checkAlerts, getAlerts } from '../../services/alertsService.js';

// Alert monitoring is mounted in the authenticated app shell, not only on the
// Alerts screen, so price triggers are detected while users view other tabs.
export default function AlertMonitor() {
  const [alerts, setAlerts] = useState(() => getAlerts());
  useEffect(() => {
    const refresh = () => setAlerts(getAlerts());
    window.addEventListener('betatrader:alerts-changed', refresh);
    const interval = setInterval(refresh, 5000);
    return () => { window.removeEventListener('betatrader:alerts-changed', refresh); clearInterval(interval); };
  }, []);
  const symbols = useMemo(() => alerts.filter(alert => alert.status !== 'triggered').map(alert => alert.asset), [alerts]);
  const cryptoSymbols = useMemo(() => symbols.filter(symbol => getCategory(symbol) === 'crypto'), [symbols]);
  const otherSymbols = useMemo(() => symbols.filter(symbol => getCategory(symbol) !== 'crypto'), [symbols]);
  const { data: cryptoData } = useCryptoBatch(cryptoSymbols.length > 0);
  const { data: otherData } = useBatchQuotes(otherSymbols, otherSymbols.length > 0);
  const livePrices = useMemo(() => ({ ...(cryptoData || {}), ...(otherData || {}) }), [cryptoData, otherData]);

  useEffect(() => {
    if (!alerts.length || !Object.keys(livePrices).length) return;
    const result = checkAlerts(getAlerts(), livePrices);
    if (result.changed) setAlerts(result.alerts);
  }, [alerts, livePrices]);

  return null;
}
