import { useState } from 'react';
import { Bell, ArrowLeft, CheckCheck, AlertCircle, Info, TrendingUp, Clock } from 'lucide-react';
import { useApp } from '../../AppContext.jsx';
import { useNotifications } from '../../hooks/useNotifications.js';

export default function NotificationsScreen() {
  const { setActiveTab } = useApp();
  const { notifications, isLoading, error, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const [filter, setFilter] = useState('all'); // all, unread, read

  const filtered = notifications.filter(n => {
    if (filter === 'unread') return !n.read;
    if (filter === 'read') return n.read;
    return true;
  });

  const getIcon = (type) => {
    if (type === 'alert') return <AlertCircle size={16} className="text-amber-400" />;
    if (type === 'system') return <Info size={16} className="text-blue-400" />;
    return <TrendingUp size={16} className="text-emerald-400" />;
  };

  return (
    <div className="px-4 pt-4 pb-6 animate-fade-in">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 theme-bg-primary/85 backdrop-blur-xl -mx-4 px-4 pb-2">
        <div className="flex items-center justify-between mb-4 pt-1">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setActiveTab('home')}
              className="w-9 h-9 glass-card flex items-center justify-center text-slate-400 hover:text-slate-200 transition-colors"
            >
              <ArrowLeft size={18} />
            </button>
            <h1 className="text-xl font-extrabold">Notifications</h1>
          </div>
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
            >
              <CheckCheck size={12} /> Mark all read
            </button>
          )}
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 mb-3 theme-bg-tertiary/50 p-1 rounded-xl">
          {[
            { id: 'all', label: 'All' },
            { id: 'unread', label: `Unread (${unreadCount})` },
            { id: 'read', label: 'Read' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
                filter === tab.id
                  ? 'theme-bg-secondary text-emerald-400'
                  : 'theme-text-secondary hover:theme-text-primary'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-col gap-2">
        {isLoading && (
          <div className="glass-card p-8 flex justify-center">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-emerald-500 border-t-transparent"></div>
          </div>
        )}

        {error && (
          <div className="glass-card p-8 text-center">
            <Bell size={32} className="mx-auto text-slate-600 mb-3" />
            <p className="text-sm font-semibold text-slate-300 mb-1">Failed to load notifications</p>
            <p className="text-xs text-slate-500">{error}</p>
          </div>
        )}

        {!isLoading && !error && filtered.length === 0 && (
          <div className="glass-card p-8 text-center">
            <Bell size={32} className="mx-auto text-slate-600 mb-3" />
            <p className="text-sm font-semibold text-slate-300 mb-1">
              {filter === 'unread' ? 'No unread notifications' : filter === 'read' ? 'No read notifications' : 'No notifications yet'}
            </p>
            <p className="text-xs text-slate-500">
              {filter === 'all' ? 'Alerts and system updates will appear here.' : 'Check back later.'}
            </p>
          </div>
        )}

        {filtered.map(notification => (
          <button
            key={notification.id}
            onClick={() => markAsRead(notification.id)}
            className={`glass-card-hover p-4 text-left ${notification.read ? 'opacity-60' : ''}`}
          >
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 theme-bg-tertiary">
                {getIcon(notification.type)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold theme-text-primary truncate">{notification.title}</p>
                <p className="text-[10px] text-slate-500 mt-1 line-clamp-2">{notification.message}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-[9px] text-slate-600 flex items-center gap-1">
                    <Clock size={10} />
                    {new Date(notification.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {notification.source && (
                    <span className="text-[9px] theme-text-muted theme-bg-tertiary px-1.5 py-0.5 rounded">{notification.source}</span>
                  )}
                  {!notification.read && (
                    <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
                  )}
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
