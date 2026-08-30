// ========================================================================
// Generalized shared rate limiter backed by Supabase.
// Coordinates rate limits ACROSS ALL Vercel instances and ALL users.
//
// Unlike the per-instance in-memory rate limiting in rateLimitState.js,
// this tracker uses Supabase Postgres as a shared coordination layer,
// ensuring that concurrent requests from different users and different
// serverless instances collectively respect each provider's limits.
//
// Fail-open design: if Supabase is unavailable, requests are allowed
// through (preserving app functionality) with a warning logged.
// ========================================================================

import { createClient } from '@supabase/supabase-js';
import { logRequest } from './structuredLogger.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ========================================================================
// Provider rate limit configurations.
// Each entry defines:
//   - windowMs: time window in milliseconds
//   - limit: max requests allowed within that window
//   - name: human-readable description
//
// Documented limits (conservative values used):
//   Kraken Public API:      ~1 req/sec per IP
//   CoinGecko Free Tier:    ~10-30 calls/min (conservative: 10)
//   Finnhub Free Tier:      ~30 calls/min
//   AlphaVantage Free Tier:  5 calls/min
// ========================================================================
const PROVIDER_CONFIGS = {
  kraken: {
    windowMs: 1000,   // 1-second windows
    limit: 1,         // 1 request per second
    name: 'Kraken Public API',
  },
  coingecko: {
    windowMs: 60000,  // 1-minute windows
    limit: 10,        // 10 requests per minute (conservative)
    name: 'CoinGecko Free Tier',
  },
  finnhub: {
    windowMs: 60000,  // 1-minute windows
    limit: 30,        // 30 requests per minute
    name: 'Finnhub Free Tier',
  },
  alphavantage: {
    windowMs: 60000,  // 1-minute windows
    limit: 5,         // 5 requests per minute
    name: 'AlphaVantage Free Tier',
  },
  binance: {
    windowMs: 1000,   // 1-second windows (for reference, currently blocked)
    limit: 10,        // 10 requests per second (not wired in)
    name: 'Binance Public API',
  },
};

/**
 * Get the configuration for a provider.
 * @param {string} provider - Provider identifier
 * @returns {object|null} Provider config or null if unknown
 */
export function getProviderConfig(provider) {
  return PROVIDER_CONFIGS[provider] || null;
}

/**
 * Get all configured providers.
 * @returns {string[]} Array of provider identifiers
 */
export function getConfiguredProviders() {
  return Object.keys(PROVIDER_CONFIGS);
}

/**
 * Reserve credits for a provider within its time window.
 *
 * This is the core function that provides GLOBAL rate limiting.
 * It calls a Supabase RPC that atomically increments a counter
 * for the current time window, ensuring all Vercel instances
 * share the same rate limit budget.
 *
 * @param {string} provider - Provider identifier (e.g. 'kraken', 'coingecko')
 * @param {number} [cost=1] - Number of credits to reserve
 * @param {string} [context='unknown'] - Context for logging (e.g. route, endpoint)
 * @returns {Promise<object>} Result with:
 *   - allowed: boolean - whether the request is allowed
 *   - tracked: boolean - whether the tracker successfully recorded this
 *   - used: number - credits used after this reservation
 *   - limit: number - the provider's limit
 *   - windowMs: number - the provider's window size
 *   - trackerError: boolean - true if the tracker was unavailable
 */
export async function reserveProviderCredits(provider, cost = 1, context = 'unknown') {
  const config = getProviderConfig(provider);
  if (!config) {
    // Unknown provider — allow through (fail open)
    console.warn(`[ProviderRateLimiter] Unknown provider: ${provider}, allowing request`);
    return { allowed: true, tracked: false, used: 0, limit: 0, windowMs: 0 };
  }

  if (!Number.isInteger(cost) || cost < 1) {
    return { allowed: true, tracked: false, used: 0, limit: config.limit, windowMs: config.windowMs };
  }

  // Calculate the current window identifier
  const windowMs = config.windowMs;
  const window = Math.floor(Date.now() / windowMs);

  try {
    const { data, error } = await supabase.rpc('reserve_provider_credits', {
      p_provider: provider,
      p_window: window,
      p_cost: cost,
      p_limit: config.limit,
    });

    if (error) throw error;

    const row = Array.isArray(data) ? data[0] : data;
    const allowed = row?.allowed !== false;
    const used = row?.used_count ?? 0;

    // Log every tracker decision for audit
    logRequest({
      provider: `rate-limit-${provider}`,
      endpoint: 'reserve_provider_credits',
      method: 'RPC',
      status: allowed ? 200 : 429,
      duration: 0,
      extra: {
        event: 'credit_reservation',
        context,
        provider,
        window,
        windowMs,
        costRequested: cost,
        allowed,
        usedAfter: used,
        limit: config.limit,
      },
    });

    if (!allowed) {
      console.warn(
        `[ProviderRateLimiter] ${config.name} budget exhausted`,
        { provider, context, cost, used, limit: config.limit, windowMs }
      );
    }

    return {
      allowed,
      tracked: true,
      used,
      limit: config.limit,
      windowMs,
    };
  } catch (error) {
    // Log tracker failures so we can distinguish "no blocking" from "tracker down"
    logRequest({
      provider: `rate-limit-${provider}`,
      endpoint: 'reserve_provider_credits',
      method: 'RPC',
      status: 500,
      duration: 0,
      failure: true,
      extra: {
        event: 'credit_reservation_error',
        context,
        provider,
        window,
        windowMs,
        costRequested: cost,
        error: error.message,
        limit: config.limit,
      },
    });

    // FAIL OPEN: if tracker is unavailable, allow the request through
    // This preserves app functionality when Supabase is down
    console.warn(`[ProviderRateLimiter] ${config.name} tracker unavailable; allowing request:`, error.message);
    return {
      allowed: true,
      tracked: false,
      trackerError: true,
      used: 0,
      limit: config.limit,
      windowMs,
    };
  }
}

/**
 * Create a rate limit exceeded error for a provider.
 *
 * @param {string} provider - Provider identifier
 * @param {number} [cost=1] - Credits that were requested
 * @param {number} [used=0] - Current usage
 * @returns {Error} Error with rateLimited flag set
 */
export function providerBudgetError(provider, cost = 1, used = 0) {
  const config = getProviderConfig(provider);
  const name = config?.name || provider;
  const limit = config?.limit || 0;
  const windowSec = config ? config.windowMs / 1000 : 0;

  const error = new Error(
    `${name} rate limit exceeded (${used}/${limit} requests per ${windowSec}s window)`
  );
  error.rateLimited = true;
  error.provider = provider;
  error.creditBudget = true;
  error.creditCost = cost;
  error.creditUsed = used;
  error.creditLimit = limit;
  error.creditWindowMs = config?.windowMs || 0;
  return error;
}

/**
 * Check if a provider is currently rate limited.
 * This is a lightweight check that doesn't reserve credits.
 * Useful for pre-flight checks before expensive operations.
 *
 * @param {string} provider - Provider identifier
 * @returns {Promise<boolean>} True if the provider is rate limited
 */
export async function isProviderRateLimited(provider) {
  const config = getProviderConfig(provider);
  if (!config) return false;

  const window = Math.floor(Date.now() / config.windowMs);

  try {
    const { data, error } = await supabase
      .from('provider_rate_limit_buckets')
      .select('used')
      .eq('provider', provider)
      .eq('window', window)
      .maybeSingle();

    if (error) return false; // Fail open on errors
    if (!data) return false; // No usage recorded

    return data.used >= config.limit;
  } catch {
    return false; // Fail open on errors
  }
}

/**
 * Get current usage stats for a provider.
 *
 * @param {string} provider - Provider identifier
 * @returns {Promise<object|null>} Usage stats or null if unavailable
 */
export async function getProviderUsage(provider) {
  const config = getProviderConfig(provider);
  if (!config) return null;

  const window = Math.floor(Date.now() / config.windowMs);

  try {
    const { data, error } = await supabase
      .from('provider_rate_limit_buckets')
      .select('used, updated_at')
      .eq('provider', provider)
      .eq('window', window)
      .maybeSingle();

    if (error) return null;
    if (!data) return { used: 0, limit: config.limit, windowMs: config.windowMs, window };

    return {
      used: data.used,
      limit: config.limit,
      windowMs: config.windowMs,
      window,
      updatedAt: data.updated_at,
    };
  } catch {
    return null;
  }
}

/**
 * Clean up old rate limit buckets.
 * Keeps only the last N windows per provider.
 *
 * @param {string} [provider] - Specific provider to clean, or null for all
 * @param {number} [keepWindows=10] - Number of recent windows to keep
 * @returns {Promise<number>} Number of rows deleted
 */
export async function cleanupProviderBuckets(provider = null, keepWindows = 10) {
  try {
    const { data, error } = await supabase.rpc('cleanup_provider_rate_limit_buckets', {
      p_provider: provider,
      p_keep_windows: keepWindows,
    });

    if (error) throw error;
    return data || 0;
  } catch (error) {
    console.warn('[ProviderRateLimiter] Cleanup failed:', error.message);
    return 0;
  }
}

// ========================================================================
// Backward compatibility: re-export TwelveData-style functions
// for code that may reference them.
// ========================================================================

/**
 * @deprecated Use reserveProviderCredits('twelvedata', ...) instead.
 * Kept for backward compatibility with existing code.
 */
export async function reserveTwelveDataCredits(cost, context = 'unknown') {
  // TwelveData uses 8 credits per minute — map to the generalized system
  return reserveProviderCredits('twelvedata', cost, context);
}

/**
 * @deprecated Use providerBudgetError('twelvedata', ...) instead.
 * Kept for backward compatibility with existing code.
 */
export function twelveDataBudgetError(cost, used) {
  return providerBudgetError('twelvedata', cost, used);
}
