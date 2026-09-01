import { Check, Info, X } from 'lucide-react';
import { useApp } from '../../AppContext.jsx';

export default function Toast() {
  const { toast } = useApp();
  if (!toast) return null;

  const bgColor = toast.type === 'success' ? 'bg-emerald-500' : toast.type === 'error' ? 'bg-red-500' : 'bg-slate-700';
  const Icon = toast.type === 'success' ? Check : toast.type === 'error' ? X : Info;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 animate-scale-in">
      <div className={`${bgColor} text-white px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 text-sm font-semibold`}>
        <Icon size={14} />
        {toast.message}
      </div>
    </div>
  );
}
