// Reusable skeleton loading placeholders for consistent UX across all screens.

export function SkeletonCard({ className = '' }) {
  return (
    <div className={`glass-card p-4 animate-pulse ${className}`}>
      <div className="h-4 bg-slate-700/50 rounded w-3/4 mb-3" />
      <div className="h-3 bg-slate-700/30 rounded w-1/2" />
    </div>
  );
}

export function SkeletonText({ lines = 3, className = '' }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-3 bg-slate-700/40 rounded animate-pulse"
          style={{ width: `${Math.max(40, 100 - i * 15)}%` }}
        />
      ))}
    </div>
  );
}

export function SkeletonMetric({ className = '' }) {
  return (
    <div className={`glass-card p-4 animate-pulse ${className}`}>
      <div className="h-3 bg-slate-700/40 rounded w-20 mb-2" />
      <div className="h-6 bg-slate-700/60 rounded w-16" />
    </div>
  );
}

export function SkeletonChart({ className = '' }) {
  return (
    <div className={`glass-card p-4 animate-pulse ${className}`}>
      <div className="h-4 bg-slate-700/50 rounded w-1/3 mb-4" />
      <div className="h-48 bg-slate-700/30 rounded" />
    </div>
  );
}

export function SkeletonNews({ count = 3 }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="glass-card p-4 animate-pulse">
          <div className="flex gap-3">
            <div className="w-16 h-16 bg-slate-700/40 rounded shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-3 bg-slate-700/50 rounded w-full" />
              <div className="h-3 bg-slate-700/30 rounded w-2/3" />
              <div className="h-2 bg-slate-700/20 rounded w-1/3 mt-2" />
            </div>
          </div>
        </div>
      ))}
    </>
  );
}

export function SkeletonList({ count = 5, height = 'h-12' }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={`glass-card ${height} animate-pulse`} />
      ))}
    </>
  );
}
