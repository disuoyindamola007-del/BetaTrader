import { useState } from 'react';
import { ArrowLeft, Heart, Trash2 } from 'lucide-react';
import { useApp } from '../../AppContext.jsx';
import { mockAssets } from '../../data/mockData.js';
import { useBatchQuotes } from '../../hooks/useMarketData.js';
import { getCategory } from '../../services/marketDataService.js';
import PriceChange from '../shared/PriceChange.jsx';

export default function WatchlistScreen() {
  const { favorites, toggleFavorite, setActiveTab, navigateToAsset } = useApp();
  const [swipedId, setSwipedId] = useState(null);

  // Build watchlist assets from favorites
  const watchlistAssets = favorites.map(symbol => mockAssets.find(a => a.symbol === symbol)).filter(Boolean);
  const nonCryptoSymbols = watchlistAssets.filter(a => getCategory(a.symbol) !== 'crypto').map(a => a.symbol);
  const { data: quotes } = useBatchQuotes(nonCryptoSymbols, nonCryptoSymbols.length > 0);

  const assetsWithLive = watchlistAssets.map(asset => {
    const live = quotes?.[asset.symbol.replace('/', '')];
    return live ? { ...asset, price: live.price, change: live.change, changePct: live.changePct } : asset;
  });

  const handleRemove = (symbol) => {
    toggleFavorite(symbol);
    setSwipedId(null);
  };

  return (
    <div className="px-4 pt-4 pb-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <button
          onClick={() => setActiveTab('home')}
          className="w-9 h-9 glass-card flex items-center justify-center"
          aria-label="Back"
        >
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-xl font-extrabold">Watchlist</h1>
      </div>

      {assetsWithLive.length === 0 && (
        <div className="glass-card p-8 text-center flex flex-col items-center gap-3">
          <Heart size={32} className="text-slate-600" />
          <p className="text-sm font-semibold theme-text-primary">Your watchlist is empty</p>
          <p className="text-xs theme-text-secondary">Tap the heart icon on any asset to add it to your watchlist.</p>
          <button onClick={() => setActiveTab('markets')} className="btn-primary mt-2">Browse Markets</button>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {assetsWithLive.map((asset) => {
          const isSwiped = swipedId === asset.symbol;
          return (
            <div key={asset.symbol} className="relative overflow-hidden rounded-xl">
              {/* Remove button behind the row */}
              <div
                className={`absolute inset-0 flex items-center justify-end pr-4 bg-red-500 rounded-xl transition-opacity duration-200 ${isSwiped ? 'opacity-100' : 'opacity-0'}`}
                style={{ zIndex: 0 }}
              >
                <button
                  onClick={() => handleRemove(asset.symbol)}
                  className="flex items-center gap-2 text-white font-semibold px-4 py-3 rounded-lg"
                >
                  <Trash2 size={16} /> Remove
                </button>
              </div>
              {/* Asset row — slides left on swipe */}
              <button
                onClick={() => navigateToAsset(asset)}
                className="glass-card-hover p-3.5 flex items-center justify-between text-left relative rounded-xl transition-transform duration-200"
                style={{ zIndex: 1, transform: isSwiped ? 'translateX(-100px)' : 'translateX(0)' }}
                onTouchStart={e => {
                  asset._swipeStartX = e.touches[0].clientX;
                  setSwipedId(null);
                }}
                onTouchMove={e => {
                  const dx = e.touches[0].clientX - (asset._swipeStartX || 0);
                  if (dx < 0 && dx > -120) {
                    e.currentTarget.style.transform = `translateX(${dx}px)`;
                  }
                }}
                onTouchEnd={e => {
                  const dx = e.changedTouches[0].clientX - (asset._swipeStartX || 0);
                  if (dx < -80) {
                    setSwipedId(asset.symbol);
                    e.currentTarget.style.transform = 'translateX(-100px)';
                  } else {
                    setSwipedId(null);
                    e.currentTarget.style.transform = 'translateX(0)';
                  }
                }}
              >
                <div className="flex items-center gap-3">
                  <div>
                    <p className="text-sm font-bold">{asset.symbol}</p>
                    <p className="text-[10px] theme-text-secondary">{asset.name}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold font-mono">
                    {asset.price != null
                      ? (asset.price > 1000 ? `$${asset.price.toLocaleString()}` : asset.price.toFixed(4))
                      : '--'}
                  </p>
                  <PriceChange value={asset.change} pct={asset.changePct} />
                </div>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
