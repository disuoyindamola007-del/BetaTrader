import { createClient } from '@supabase/supabase-js';

// Only VITE_ variables are bundled into the browser. Never use the service-role key here.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // Callback credentials are processed explicitly in App.jsx so the UI
        // can always show success, expiry, or failure instead of racing auth state.
        detectSessionInUrl: false,
      },
    })
  : null;
