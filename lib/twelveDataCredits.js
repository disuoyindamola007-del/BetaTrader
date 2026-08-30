// Shared TwelveData per-minute credit reservation.
// The RPC performs the increment atomically in Supabase, so concurrent Vercel
// instances cannot each observe the same remaining balance and overspend it.
// If the RPC/table is unavailable, fail open: callers retain today's behavior.
import { createClient } from '@supabase/supabase-js';
import { logRequest } from './structuredLogger.js';

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
    const used = row?.used_count ?? 0;

    // Log every tracker decision for audit and collision testing.
    logRequest({
      provider: 'twelvedata-credits',
      endpoint: 'reserve_twelvedata_credits',
      method: 'RPC',
      status: allowed ? 200 : 429,
      duration: 0,
      extra: {
        event: 'credit_reservation',
        context,
        minute,
        costRequested: cost,
        allowed,
        usedAfter: used,
        limit: LIMIT,
      },
    });

    if (!allowed) {
      console.warn('[TwelveData credits] budget exhausted', { context, cost, used, limit: LIMIT });
    }
    return { allowed, tracked: true, used, limit: LIMIT };
  } catch (error) {
    // Log tracker failures so we can distinguish "no blocking" from "tracker down".
    logRequest({
      provider: 'twelvedata-credits',
      endpoint: 'reserve_twelvedata_credits',
      method: 'RPC',
      status: 500,
      duration: 0,
      failure: true,
      extra: {
        event: 'credit_reservation_error',
        context,
        minute,
        costRequested: cost,
        error: error.message,
        limit: LIMIT,
      },
    });
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
