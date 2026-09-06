import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token || !process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(401).json({ error: 'Authentication required' });
  const auth = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
  const { data: { user }, error } = await auth.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: 'Invalid session' });
  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) return res.status(500).json({ error: 'Account deletion failed' });
  return res.status(200).json({ deleted: true });
}
