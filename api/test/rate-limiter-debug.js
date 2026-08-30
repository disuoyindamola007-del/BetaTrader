// Debug endpoint to check TwelveData rate limiter state
export default async function handler(req, res) {
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const minute = Math.floor(Date.now() / 60_000);

  try {
    // Check current credit usage
    const { data, error: tableError } = await supabase
      .from('twelvedata_credit_buckets')
      .select('*')
      .eq('minute', minute)
      .single();

    if (tableError) {
      // Try testing the RPC function
      const { data: rpcData, error: rpcError } = await supabase.rpc('reserve_twelvedata_credits', {
        p_minute: minute,
        p_cost: 1,
        p_limit: 8,
      });

      return res.status(200).json({
        minute,
        table_error: tableError.message,
        table_exists: false,
        rpc_test: rpcError ? { error: rpcError.message, exists: false } : { result: rpcData, exists: true },
      });
    }

    // Test RPC function
    const { data: rpcData, error: rpcError } = await supabase.rpc('reserve_twelvedata_credits', {
      p_minute: minute,
      p_cost: 1,
      p_limit: 8,
    });

    return res.status(200).json({
      minute,
      used_count: data.used,
      limit: 8,
      remaining: 8 - data.used,
      rpc_test: rpcError ? { error: rpcError.message } : { result: rpcData },
    });
  } catch (error) {
    return res.status(200).json({
      minute,
      error: error.message,
      note: 'Supabase query failed',
    });
  }
}
