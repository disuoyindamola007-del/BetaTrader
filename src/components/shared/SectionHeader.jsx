export default function SectionHeader({ title, action, onAction }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="section-title">{title}</h2>
      {action && (
        <button 
          onClick={onAction}
          className="text-xs text-emerald-400 font-medium hover:text-emerald-300 transition-colors"
        >
          {action}
        </button>
      )}
    </div>
  );
}
