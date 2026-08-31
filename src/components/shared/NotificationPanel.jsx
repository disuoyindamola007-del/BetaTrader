import { useState } from 'react';
import { Bell, X, ExternalLink, Check, CheckCheck, Clock, TrendingUp, AlertCircle, Info } from 'lucide-react';
import { useNotifications } from '../../hooks/useNotifications.js';

export default function NotificationPanel({ isOpen, onClose }) {
  const { notifications, isLoading, error, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const [showAll, setShowAll] = useState(false);

  if (!isOpen) return null;

  const displayed = showAll ? notifications : notifications.slice(0, 5);

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-end p-4" onClick={onClose}>
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm" 
        onClick={onClose}
      />
      <div 
        className="relative w-full max-w-md glass-card bg-slate-900/95 border border-slate-700/50 rounded-2xl shadow-2xl max-h-[80vh] flex flex-col animate-scale-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-700/50">
          <div className="flex items-center gap-2">
            <Bell size={18} className="text-emerald-400" />
            <span className="text-sm font-bold">Notifications</span>
            {unreadCount > 0 && (
              <span className="text-[10px] bg-red-500 text-white rounded-full px-2 py-0.5 font-bold">
                {unreadCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button 
                onClick={markAllAsRead}
                className="text-[10px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
              >
                <CheckCheck size={12} /> Mark all read
              </button>
            )}
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-800 transition-colors">
              <X size={16} className="text-slate-400" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto py-2">
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-emerald-500 border-t-transparent"></div>
            </div>
          )}

          {error && (
            <div className="text-center py-8">
              <Bell size={32} className="mx-auto text-slate-600 mb-2" />
              <p className="text-sm text-slate-500">Failed to load notifications</p>
            </div>
          )}

          {!isLoading && !error && displayed.length === 0 && (
            <div className="text-center py-8">
              <Bell size={32} className="mx-auto text-slate-600 mb-2" />
              <p className="text-sm text-slate-500">No notifications yet</p>
            </div>
          )}

          {displayed.map(notification => (
            <button
              key={notification.id}
              onClick={() => markAsRead(notification.id)}
              className={`w-full text-left p-3 border-b border-slate-800/50 transition-colors ${notification.read ? 'opacity-60' : 'bg-slate-800/30'}`}
            >
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--bg-tertiary)' }}>
                  {notification.type === 'alert' ? (
                    <AlertCircle size={14} className="text-amber-400" />
                  ) : notification.type === 'system' ? (
                    <Info size={14} className="text-blue-400" />
                  ) : (
                    <TrendingUp size={14} className="text-emerald-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-200 truncate">{notification.title}</p>
                  <p className="text-[10px] text-slate-500 mt-1 line-clamp-2">{notification.message}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[9px] text-slate-600 flex items-center gap-1">
                      <Clock size={10} />
                      {new Date(notification.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {notification.source && (
                      <span className="text-[9px] text-slate-600 bg-slate-800 px-1.5 py-0.5 rounded">{notification.source}</span>
                    )}
                  </div>
                </div>
                {notification.url && (
                  <ExternalLink size={14} className="text-slate-500 shrink-0" />
                )}
              </div>
            </button>
          ))}
        </div>

        {/* Footer */}
        {notifications.length > 5 && (
          <div className="border-t border-slate-700/50 pt-3">
            <button 
              onClick={() => setShowAll(!showAll)}
              className="w-full text-center text-xs text-emerald-400 hover:text-emerald-300 py-2"
            >
              {showAll ? 'Show Less' : `Show All (${notifications.length})`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
