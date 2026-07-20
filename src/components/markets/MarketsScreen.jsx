import { useState, useEffect, useMemo } from 'react';
import { useApp } from '../../AppContext.jsx';
import { Search, ChevronRight, RefreshCw, AlertTriangle, Clock } from 'lucide-react';
import { mockAssets } from '../../data/mockData.js';
import { fetchBatchQuotes, fetchCryptoBatchQuotes, getCategory, getCooldownSeconds } from '../../services/api.js';
import AIBadge from '../shared/AIBadge.jsx';
import PriceChange from '../shared/PriceChange.jsx';

const categories = ['All', 'Forex', 'Crypto', 'Metals', 'Indices', 'Commodities'];

function groupByCategory(assets) {
  const groups = { crypto: [], forex: [], commodities: [], stocks: [] };
  for (const asset of assets) {
    const cat = getCategory(asset.symbol);
    if (groups[cat]) groups[cat].push(asset.symbol);
  }
  return groups;
}

export default function MarketsScreen() {
  const { navigateToAsset } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [livePrices, setLivePrices] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [rateLimitError, setRateLimitError] = useState(null);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  // Countdown timer for cooldown
  useEffect(() => {
    if (!rateLimitError) {
      setCooldownSeconds(0);
      return;
    }
    const timer = setInterval(() => {
      const remaining = getCooldownSeconds();
      setCooldownSeconds(remaining);
      if (remaining <= 0) {
        setRateLimitError(null);
        clearInterval(timer);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [rateLimitError]);

  // Fetch all prices in batches
  useEffect(() => {
    async function loadPrices() {
      setIsLoading(true);
      setRateLimitError(null);

      // 1. Crypto via CoinGecko proxy
      const cryptoData = await fetchCryptoBatchQuotes();
      const newPrices = {};

      if (cryptoData && !cryptoData.error) {
        Object.assign(newPrices, cryptoData);
      } else if (cryptoData?.rateLimited) {
        setRateLimitError(cryptoData.error || 'Rate limit reached');
      }

      // 2. Non-crypto: batch by category
      const nonCryptoAssets = mockAssets.filter(a => getCategory(a.symbol) !== 'crypto');
      const groups = groupByCategory(nonCryptoAssets);

      const { data: batchData, errors } = await fetchBatchQuotes(groups);

      for (const [symbol, quote] of Object.entries(batchData)) {
        newPrices[symbol] = quote;
      }

      const rateLimit = errors.find(e => e.rateLimited);
      if (rateLimit) {
        setRateLimitError(rateLimit.message);
      }

      setLivePrices(newPrices);
      setIsLoading(false);
    }

    loadPrices();
    const interval = setInterval(loadPrices, 30000);
    return () => clearInterval(interval);
  }, []);

  const mergedAssets = useMemo(() => {
    return mockAssets.map(asset => {
      const live = livePrices[asset.symbol] || livePrices[asset.symbol.replace('/', '')];
      if (live && live.price) {
        return {
          ...asset,
          price: live.price,
          change: live.change,
          changePct: live.changePct,
        };
      }
      return asset;
    });
  }, [livePrices]);

  const filteredAssets = mergedAssets.filter(asset => {
    const matchesSearch = asset.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         asset.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = activeCategory === 'All' ||
                           asset.category.toLowerCase() === activeCategory.toLowerCase();
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="px-4 pt-4 pb-6 animate-fade-in">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-extrabold">Markets</h1>
        {isLoading && <RefreshCw size={16} className="text-emerald-400 animate-spin" />}
      </div>

      {/* Rate limit warning with countdown */}
      {rateLimitError && (
        <div className="mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center gap-2">
          <AlertTriangle size={16} className="text-amber-400 shrink-0" />
          <div className="flex-1">
            <p className="text-xs text-amber-400">
              {rateLimitError}
              {cooldownSeconds > 0 && (
                <span className="ml-1 inline-flex items-center gap-1">
                  <Clock size={12} />
                  retrying in {cooldownSeconds}s
                </span>
              )}
            </p>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-4">
        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          type="text"
          placeholder="Search symbol (e.g. EUR/USD, BTC...)"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full input-field pl-11"
        />
      </div>

      {/* Categories */}
      <div className="flex gap-2 overflow-x-auto scroll-hide mb-4 pb-1">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
              activeCategory === cat
                ? 'bg-emerald-500 text-slate-950'
                : 'bg-slate-800/60 text-slate-400 border border-slate-700/30 hover:text-slate-200'
            }`}
          >
            {cat.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Asset Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filteredAssets.map((asset) => (
          <button
            key={asset.symbol}
            onClick={() => navigateToAsset(asset)}
            className="glass-card-hover p-4 text-left"
          >
            <div className="flex items-start justify-between mb-2">
              <p className="text-sm font-bold">{asset.symbol}</p>
              <ChevronRight size={14} className="text-slate-600" />
            </div>
            <p className="text-[11px] text-slate-500 mb-3 truncate">{asset.name}</p>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-sm font-bold font-mono">
                  {asset.category === 'crypto' && asset.price > 1000
                    ? `$${asset.price?.toLocaleString()}`
                    : asset.price?.toFixed(asset.price < 1 ? 5 : 4)}
                </p>
                <PriceChange value={asset.change} pct={asset.changePct} />
              </div>
              <AIBadge bias={asset.bias} confidence={asset.confidence} />
            </div>
          </button>
        ))}
      </div>

      {filteredAssets.length === 0 && (
        <div className="text-center py-12">
          <p className="text-slate-500 text-sm">No assets found</p>
        </div>
      )}
    </div>
  );
}
