// Debug endpoint to check TwelveData rate limiter state
export default async function handler(req, res) {
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const minute = Math.floor(Date.now() / 60_000);

  try {
    // Check current credit usage
    const { data, error } = await supabase
      .from('twelvedata_credits')
      .select('*')
      .eq('minute', minute)
      .single();

    if (error) {
      return res.status(200).json({
        minute,
        error: error.message,
        note: 'No row for current minute yet',
      });
    }

    return res.status(200).json({
      minute,
      used_count: data.used_count,
      limit: 8,
      remaining: 8 - data.used_count,
    });
  } catch (error) {
    return res.status(200).json({
      minute,
      error: error.message,
      note: 'Supabase query failed',
    });
  }
}
