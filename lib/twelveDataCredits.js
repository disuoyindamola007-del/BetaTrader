// Shared TwelveData per-minute credit reservation.
// The RPC performs the increment atomically in Supabase, so concurrent Vercel
// instances cannot each observe the same remaining balance and overspend it.
// If the RPC/table is unavailable, fail open: callers retain today's behavior.
import { createClient } from '@supabase/supabase-js';

const LIMIT = 8;
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export async function reserveTwelveDataCredits(cost, context = 'unknown') {
  if (!Number.isInteger(cost) || cost < 1) return { allowed: true, tracked: false };
  const minute = Math.floor(Date.now() / 60_000);

  try {
    const { data, error } = await supabase.rpc('reserve_twelvedata_credits', {
      p_minute: minute,
      p_cost: cost,
      p_limit: LIMIT,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    const allowed = row?.allowed !== false;
    if (!allowed) {
      console.warn('[TwelveData credits] budget exhausted', { context, cost, used: row?.used, limit: LIMIT });
    }
    return { allowed, tracked: true, used: row?.used, limit: LIMIT };
  } catch (error) {
    console.warn('[TwelveData credits] tracker unavailable; allowing request:', error.message);
    return { allowed: true, tracked: false, trackerError: true };
  }
}

export function twelveDataBudgetError(cost, used) {
  const error = new Error(`TwelveData credit budget exhausted (${used ?? 8}/8 credits reserved this minute)`);
  error.creditBudget = true;
  error.creditCost = cost;
  error.rateLimited = true;
  return error;
}
