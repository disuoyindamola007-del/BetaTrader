import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

export default function PriceChange({ value, pct, size = 'sm' }) {
  const isPositive = pct > 0;
  const isNeutral = pct === 0 || pct === undefined || pct === null;

  const sizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  };

  // Format percentage to exactly 2 decimal places
  const formattedPct = pct !== undefined && pct !== null
    ? `${isPositive ? '+' : ''}${pct.toFixed(2)}%`
    : '--';

  if (isNeutral) {
    return (
      <span className={`${sizeClasses[size]} text-slate-500 flex items-center gap-1`}>
        <Minus size={size === 'lg' ? 16 : 12} />
        {formattedPct}
      </span>
    );
  }

  return (
    <span className={`${sizeClasses[size]} font-medium flex items-center gap-1 ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
      {isPositive ? <TrendingUp size={size === 'lg' ? 16 : 12} /> : <TrendingDown size={size === 'lg' ? 16 : 12} />}
      {formattedPct}
    </span>
  );
}
