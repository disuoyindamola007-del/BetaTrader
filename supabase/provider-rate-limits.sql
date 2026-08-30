-- ========================================================================
-- Generalized shared rate limiter for ALL providers
-- Replaces per-provider in-memory rate limiting with Supabase-backed tracking
-- that coordinates across ALL Vercel serverless instances and ALL users.
--
-- Run once in the BetaTrader Supabase SQL editor.
-- ========================================================================

-- Table: one row per (provider, window) combination
-- Window is provider-specific:
--   - Kraken: 1-second windows
--   - CoinGecko: 1-minute windows
--   - Finnhub: 1-minute windows
--   - AlphaVantage: 1-minute windows
--   - TwelveData: already has its own table, but can use this too
create table if not exists public.provider_rate_limit_buckets (
  provider text not null,
  window bigint not null,
  used integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (provider, window)
);

-- Index for cleanup queries
create index if not exists idx_provider_rate_limit_buckets_provider
  on public.provider_rate_limit_buckets(provider);

alter table public.provider_rate_limit_buckets enable row level security;

-- ========================================================================
-- RPC: Atomically reserve credits for a provider within a time window.
-- Returns: allowed (bool), used_count (int), limit_value (int)
--
-- Parameters:
--   p_provider  - provider identifier (e.g. 'kraken', 'coingecko')
--   p_window    - time window identifier (e.g. floor(epoch_seconds / window_size))
--   p_cost      - number of credits to reserve (usually 1)
--   p_limit     - max credits allowed in this window
-- ========================================================================
create or replace function public.reserve_provider_credits(
  p_provider text,
  p_window bigint,
  p_cost integer,
  p_limit integer
)
returns table(allowed boolean, used_count integer, limit_value integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  next_used integer;
begin
  -- Validate inputs
  if p_cost < 1 then
    return query select true, 0, p_limit; -- no cost, always allow
  end if;

  if p_limit < 1 then
    return query select false, 0, 0; -- invalid limit, deny
  end if;

  -- Insert the window row if it doesn't exist (idempotent)
  insert into public.provider_rate_limit_buckets(provider, window, used)
  values (p_provider, p_window, 0)
  on conflict (provider, window) do nothing;

  -- Try to increment, but only if it won't exceed the limit
  update public.provider_rate_limit_buckets
  set used = used + p_cost, updated_at = now()
  where provider = p_provider
    and window = p_window
    and used + p_cost <= p_limit
  returning provider_rate_limit_buckets.used into next_used;

  -- If the update didn't match any row, we're over the limit
  if next_used is null then
    select b.used into next_used
    from public.provider_rate_limit_buckets b
    where b.provider = p_provider and b.window = p_window;

    return query select false, coalesce(next_used, 0), p_limit;
  end if;

  -- Success: credits reserved
  return query select true, next_used, p_limit;
end;
$$;

-- Grant execute to service_role (used by Vercel serverless functions)
revoke all on function public.reserve_provider_credits(text, bigint, integer, integer) from public, anon, authenticated;
grant execute on function public.reserve_provider_credits(text, bigint, integer, integer) to service_role;

-- ========================================================================
-- Cleanup: Remove old windows to prevent unbounded table growth.
-- Called periodically or can be run manually.
-- Keeps only the last N windows per provider.
-- ========================================================================
create or replace function public.cleanup_provider_rate_limit_buckets(
  p_provider text default null,
  p_keep_windows integer default 10
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  if p_provider is not null then
    delete from public.provider_rate_limit_buckets
    where provider = p_provider
      and window < (
        select min(window) from (
          select window from public.provider_rate_limit_buckets
          where provider = p_provider
          order by window desc
          limit p_keep_windows
        ) recent
      );
  else
    delete from public.provider_rate_limit_buckets
    where (provider, window) not in (
      select provider, window from (
        select provider, window,
               row_number() over (partition by provider order by window desc) as rn
        from public.provider_rate_limit_buckets
      ) ranked
      where ranked.rn <= p_keep_windows
    );
  end if;

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

grant execute on function public.cleanup_provider_rate_limit_buckets(text, integer) to service_role;

-- ========================================================================
-- Documented rate limits per provider (for reference):
--
-- Kraken Public API:      ~1 request/second per IP
--   -> window_size: 1000ms, limit: 1
--
-- CoinGecko Free Tier:    ~10-30 calls/minute (varies by endpoint)
--   -> window_size: 60000ms, limit: 10 (conservative)
--
-- Finnhub Free Tier:      ~30 calls/minute
--   -> window_size: 60000ms, limit: 30
--
-- AlphaVantage Free Tier:  5 calls/minute
--   -> window_size: 60000ms, limit: 5
--
-- Binance Public API:     ~1200 requests/minute (but blocked on Vercel)
--   -> Not wired in (blocked)
--
-- TwelveData Free Tier:    8 credits/minute (already tracked separately)
--   -> Can migrate to this system if desired
-- ========================================================================
