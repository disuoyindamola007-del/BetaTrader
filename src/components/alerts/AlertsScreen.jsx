import { Bell, Plus, Trash2 } from 'lucide-react';
import { alerts } from '../../data/mockData.js';

export default function AlertsScreen() {
  return (
    <div className="px-4 pt-4 pb-6 animate-fade-in">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-extrabold">Alerts</h1>
        <button className="w-9 h-9 bg-emerald-500 rounded-xl flex items-center justify-center text-slate-950">
          <Plus size={18} />
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {alerts.map(alert => (
          <div key={alert.id} className={`glass-card p-4 ${
            alert.status === 'triggered' ? 'border-amber-500/30 bg-amber-500/5' : ''
          }`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Bell size={16} className={alert.status === 'triggered' ? 'text-amber-400' : 'text-emerald-400'} />
                <span className="text-sm font-bold">{alert.asset}</span>
              </div>
              <button className="text-slate-600 hover:text-red-400 transition-colors">
                <Trash2 size={14} />
              </button>
            </div>
            <p className="text-xs text-slate-400 mb-2">
              {alert.type === 'price' && `Price ${alert.condition} ${alert.value}`}
              {alert.type === 'indicator' && `${alert.condition} ${alert.value}`}
            </p>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border uppercase ${
              alert.status === 'active' 
                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' 
                : 'bg-amber-500/15 text-amber-400 border-amber-500/20'
            }`}>
              {alert.status}
            </span>
          </div>
        ))}
      </div>

      <button className="w-full mt-4 btn-primary">
        <Plus size={16} />
        Create New Alert
      </button>
    </div>
  );
}
