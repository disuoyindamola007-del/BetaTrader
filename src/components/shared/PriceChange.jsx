export default function PriceChange({ value, pct, size = 'sm' }) {
  const isPositive = value >= 0;
  const colorClass = isPositive ? 'text-emerald-400' : 'text-danger';
  const sign = isPositive ? '+' : '';

  const sizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base font-semibold',
  };

  return (
    <span className={`${colorClass} ${sizeClasses[size]} font-mono`}>
      {sign}{pct}%
    </span>
  );
}
