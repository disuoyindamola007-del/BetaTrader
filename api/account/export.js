import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Invalid session' });
  const tables = ['profiles', 'favorites', 'journal_trades', 'alerts', 'notifications'];
  const result = { version: 1, generated_at: new Date().toISOString(), user_id: user.id, data: {} };
  for (const table of tables) {
    const { data, error } = await supabase.from(table).select('*').eq('user_id', user.id);
    if (error) return res.status(500).json({ error: `Could not export ${table}` });
    result.data[table] = data || [];
  }
  res.setHeader('Content-Disposition', 'attachment; filename="betatrader-export.json"');
  return res.status(200).json(result);
}
