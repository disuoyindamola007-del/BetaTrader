import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient.js';

const API_BASE = '/api';

export function useNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchNotifications = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (supabase) {
        const { data: auth } = await supabase.auth.getUser();
        if (!auth?.user) {
          setNotifications([]);
          setUnreadCount(0);
          return;
        }
        const { data, error: queryError } = await supabase
          .from('notifications')
          .select('id, type, title, message, source, url, read_at, created_at')
          .eq('user_id', auth.user.id)
          .order('created_at', { ascending: false });
        if (queryError) throw queryError;
        const rows = (data || []).map(row => ({
          ...row,
          timestamp: row.created_at,
          read: Boolean(row.read_at),
        }));
        setNotifications(rows);
        setUnreadCount(rows.filter(notification => !notification.read).length);
        return;
      }
      const response = await fetch('/api/news?mode=notifications');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setNotifications(data.notifications || []);
      setUnreadCount(data.notifications?.filter(n => !n.read).length || 0);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const markAsRead = useCallback(async (id) => {
    const target = notifications.find(notification => notification.id === id);
    if (!target || target.read) return;
    try {
      if (supabase) {
        const { data: auth } = await supabase.auth.getUser();
        if (!auth?.user) throw new Error('You must be signed in.');
        const { error } = await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id).eq('user_id', auth.user.id);
        if (error) throw error;
      }
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true, read_at: new Date().toISOString() } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      setError(error.message);
    }
  }, [notifications]);

  const markAllAsRead = useCallback(async () => {
    try {
      if (supabase) {
        const { data: auth } = await supabase.auth.getUser();
        if (!auth?.user) throw new Error('You must be signed in.');
        const { error } = await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', auth.user.id).is('read_at', null);
        if (error) throw error;
      }
      setNotifications(prev => prev.map(n => ({ ...n, read: true, read_at: n.read_at || new Date().toISOString() })));
      setUnreadCount(0);
    } catch (error) {
      setError(error.message);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    // Poll every 2 minutes for new notifications
    const interval = setInterval(fetchNotifications, 120_000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  return { notifications, isLoading, error, unreadCount, fetchNotifications, markAsRead, markAllAsRead };
}
