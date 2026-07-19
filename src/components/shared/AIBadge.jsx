export default function AIBadge({ bias, confidence }) {
  const colors = {
    bullish: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
    bearish: 'bg-danger/15 text-danger border-danger/20',
    neutral: 'bg-slate-700/50 text-slate-400 border-slate-600/30',
  };

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border ${colors[bias] || colors.neutral}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
      {bias} {confidence}%
    </span>
  );
}
