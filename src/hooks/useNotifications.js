import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient.js';

export function useNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadAlertCount, setUnreadAlertCount] = useState(0);

  const applyNotifications = rows => {
    setNotifications(rows);
    setUnreadCount(rows.filter(notification => !notification.read).length);
    setUnreadAlertCount(rows.filter(notification => !notification.read && notification.type === 'alert_triggered').length);
  };

  const fetchNotifications = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (supabase) {
        const { data: auth } = await supabase.auth.getUser();
        if (!auth?.user) {
          applyNotifications([]);
          return;
        }
        const { data, error: queryError } = await supabase
          .from('notifications')
          .select('id, type, title, message, source, url, read_at, created_at')
          .eq('user_id', auth.user.id)
          .order('created_at', { ascending: false });
        if (queryError) throw queryError;
        applyNotifications((data || []).map(row => ({ ...row, timestamp: row.created_at, read: Boolean(row.read_at) })));
        return;
      }
      const response = await fetch('/api/news?mode=notifications');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      applyNotifications(data.notifications || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const markAsRead = useCallback(async id => {
    const target = notifications.find(notification => notification.id === id);
    if (!target || target.read) return;
    try {
      if (supabase) {
        const { data: auth } = await supabase.auth.getUser();
        if (!auth?.user) throw new Error('You must be signed in.');
        const { error: updateError } = await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id).eq('user_id', auth.user.id);
        if (updateError) throw updateError;
      }
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true, read_at: new Date().toISOString() } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
      if (target.type === 'alert_triggered') setUnreadAlertCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      setError(err.message);
    }
  }, [notifications]);

  const markAllAsRead = useCallback(async () => {
    try {
      if (supabase) {
        const { data: auth } = await supabase.auth.getUser();
        if (!auth?.user) throw new Error('You must be signed in.');
        const { error: updateError } = await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', auth.user.id).is('read_at', null);
        if (updateError) throw updateError;
      }
      setNotifications(prev => prev.map(n => ({ ...n, read: true, read_at: n.read_at || new Date().toISOString() })));
      setUnreadCount(0);
      setUnreadAlertCount(0);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 120_000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  return { notifications, isLoading, error, unreadCount, unreadAlertCount, fetchNotifications, markAsRead, markAllAsRead };
}
