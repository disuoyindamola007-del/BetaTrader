import { useState, useMemo, useEffect, useRef } from 'react';
import { useApp } from '../../AppContext.jsx';
import { Search, ChevronRight, RefreshCw, AlertTriangle, Clock } from 'lucide-react';
import { mockAssets } from '../../data/mockData.js';
import { useCryptoBatch, useBatchQuotes } from '../../hooks/useMarketData.js';
import { useSymbolSearch } from '../../hooks/useSymbolSearch.js';
import { assetFromSearchResult } from '../../data/supportedSymbols.js';
import { getCategory } from '../../services/marketDataService.js';
import PriceChange from '../shared/PriceChange.jsx';

const categories = ['All', 'Forex', 'Crypto', 'Metals', 'Indices', 'Commodities'];
const unsupportedSymbols = new Set(['OIL', 'SILVER']);

export default function MarketsScreen() {
  const { navigateToAsset, marketSearchRequest, clearMarketSearchRequest } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState(() => {
    try {
      return localStorage.getItem('betatrader:activeCategory') || 'All';
    } catch {
      return 'All';
    }
  });
  const searchInputRef = useRef(null);

  // Persist activeCategory to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem('betatrader:activeCategory', activeCategory);
    } catch { /* ignore */ }
  }, [activeCategory]);
  const { results: searchResults, isLoading: searchLoading, error: searchError } = useSymbolSearch(searchQuery);

  useEffect(() => {
    if (!marketSearchRequest) return;
    setSearchQuery('');
    setActiveCategory('All');
    requestAnimationFrame(() => searchInputRef.current?.focus());
    clearMarketSearchRequest();
  }, [marketSearchRequest, clearMarketSearchRequest]);

  // Filter assets
  const filteredAssets = useMemo(() => {
    return mockAssets.filter(asset => {
      const matchesCategory = activeCategory === 'All' ||
                             asset.category.toLowerCase() === activeCategory.toLowerCase();
      return matchesCategory;
    });
  }, [activeCategory]);

  // Separate crypto and non-crypto symbols
  const cryptoSymbols = useMemo(() => filteredAssets.filter(a => getCategory(a.symbol) === 'crypto').map(a => a.symbol), [filteredAssets]);
  const nonCryptoSymbols = useMemo(() => filteredAssets.filter(a => getCategory(a.symbol) !== 'crypto' && !unsupportedSymbols.has(a.symbol)).map(a => a.symbol), [filteredAssets]);

  // Fetch data via centralized hooks
  const { data: cryptoData, isLoading: cryptoLoading, isStale: cryptoStale, error: cryptoError } = useCryptoBatch(cryptoSymbols.length > 0);
  const { data: nonCryptoData, isLoading: ncLoading, isStale: ncStale, error: ncError } = useBatchQuotes(nonCryptoSymbols, nonCryptoSymbols.length > 0);

  const livePrices = useMemo(() => ({ ...cryptoData, ...nonCryptoData }), [cryptoData, nonCryptoData]);
  const isLoading = cryptoLoading || ncLoading;
  const isStale = cryptoStale || ncStale;
  const rateLimitError = cryptoError || ncError;

  return (
    <div className="px-4 pt-4 pb-6 animate-fade-in">
      {/* Sticky control region: header, search, categories — with backdrop for readability */}
      <div className="sticky top-0 z-10 theme-bg-primary/85 backdrop-blur-xl -mx-4 px-4 pb-2">
        <div className="flex items-center justify-between mb-4 pt-1">
          <h1 className="text-xl font-extrabold">Markets</h1>
          {isLoading && <RefreshCw size={16} className="text-emerald-400 animate-spin" />}
        </div>

        {/* Rate limit / stale warning */}
        {(rateLimitError || isStale) && (
          <div className="mb-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center gap-2">
            <AlertTriangle size={16} className="text-amber-400 shrink-0" />
            <div className="flex-1">
              <p className="text-xs text-amber-400">
                {rateLimitError ? `${rateLimitError} — ` : ''}Showing latest available market data
                {isStale && <span className="ml-1 inline-flex items-center gap-1"><Clock size={12} />(stale)</span>}
              </p>
            </div>
          </div>
        )}

        {/* Search */}
        <div className="relative mb-3">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
          <input ref={searchInputRef} type="search" placeholder="Search crypto, forex, or stocks" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full input-field pl-11 pr-10" autoComplete="off" aria-label="Search markets" />
          {searchLoading && <RefreshCw size={15} className="absolute right-4 top-1/2 -translate-y-1/2 text-emerald-400 animate-spin" />}
        </div>

        {searchQuery.trim() && (
          <div className="mb-3 border-y theme-border">
            {searchResults.map(result => (
              <button
                key={`${result.category}:${result.symbol}:${result.providerSymbol || result.source}`}
                onClick={() => navigateToAsset(assetFromSearchResult(result))}
                className="w-full min-h-14 py-3 flex items-center justify-between gap-3 text-left border-b theme-border last:border-b-0 hover:theme-bg-tertiary transition-colors"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold">{result.symbol}</span>
                    <span className="text-[10px] uppercase theme-text-secondary">{result.category}</span>
                  </div>
                  <p className="text-xs theme-text-secondary truncate">{result.name}</p>
                </div>
                <ChevronRight size={16} className="shrink-0 theme-text-secondary" />
              </button>
            ))}
            {!searchLoading && searchResults.length === 0 && (
              <p className="py-8 text-center text-sm text-slate-500 theme-text-secondary">No supported symbols found</p>
            )}
            {searchError && <p className="pb-3 text-center text-xs text-amber-400">Search is temporarily unavailable.</p>}
          </div>
        )}

        {/* Categories */}
        <div className="flex gap-2 overflow-x-auto scroll-hide pb-1">
          {categories.map(cat => (
            <button key={cat} onClick={() => setActiveCategory(cat)} className={`px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${activeCategory === cat ? 'bg-emerald-500 text-slate-950' : 'theme-bg-secondary theme-text-secondary theme-border hover:theme-text-primary'}`}>
              {cat.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Asset Grid */}
      <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 ${searchQuery.trim() ? 'hidden' : ''}`}>
        {filteredAssets.map((asset) => {
          const live = livePrices[asset.symbol] || livePrices[asset.symbol.replace('/', '')];
          const hasLive = live && live.price != null;
          return (
            <button
              key={asset.symbol}
              onClick={() => !unsupportedSymbols.has(asset.symbol) && navigateToAsset(asset)}
              disabled={unsupportedSymbols.has(asset.symbol)}
              className={`glass-card-hover p-4 text-left ${unsupportedSymbols.has(asset.symbol) ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
              <div className="flex items-start justify-between mb-2">
                <p className="text-sm font-bold">{asset.symbol}</p>
                {unsupportedSymbols.has(asset.symbol) ? <AlertTriangle size={14} className="text-amber-400" /> : <ChevronRight size={14} className="theme-text-secondary" />}
              </div>
              <p className="text-[11px] theme-text-secondary mb-3 truncate">{asset.name}</p>
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-sm font-bold font-mono">
                    {unsupportedSymbols.has(asset.symbol)
                      ? 'Unavailable'
                      : hasLive
                      ? (asset.category === 'crypto' && live.price > 1000 ? `$${live.price.toLocaleString()}` : live.price.toFixed(live.price < 1 ? 5 : 4))
                      : (asset.price != null ? (asset.category === 'crypto' && asset.price > 1000 ? `$${asset.price.toLocaleString()}` : asset.price.toFixed(asset.price < 1 ? 5 : 4)) : '--')
                    }
                  </p>
                  <PriceChange value={unsupportedSymbols.has(asset.symbol) ? null : (hasLive ? live.change : asset.change)} pct={unsupportedSymbols.has(asset.symbol) ? null : (hasLive ? live.changePct : asset.changePct)} />
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {!searchQuery.trim() && filteredAssets.length === 0 && <div className="text-center py-12"><p className="text-slate-500 theme-text-secondary">No assets found</p></div>}
    </div>
  );
}
