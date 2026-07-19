import { useState } from 'react';
import { useApp } from '../../AppContext.jsx';
import { Search, ChevronRight } from 'lucide-react';
import { mockAssets } from '../../data/mockData.js';
import AIBadge from '../shared/AIBadge.jsx';
import PriceChange from '../shared/PriceChange.jsx';

const categories = ['All', 'Forex', 'Crypto', 'Metals', 'Indices', 'Commodities'];

export default function MarketsScreen() {
  const { navigateToAsset } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');

  const filteredAssets = mockAssets.filter(asset => {
    const matchesSearch = asset.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         asset.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = activeCategory === 'All' || 
                           asset.category.toLowerCase() === activeCategory.toLowerCase();
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="px-4 pt-4 pb-6 animate-fade-in">
      <h1 className="text-xl font-extrabold mb-5">Markets</h1>

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
      <div className="grid grid-cols-2 gap-2.5">
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
                <p className="text-sm font-bold font-mono">{asset.price.toLocaleString()}</p>
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
