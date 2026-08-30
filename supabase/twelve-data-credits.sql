-- Run once in the BetaTrader Supabase SQL editor.
-- Atomic reservation shared by every Vercel instance and every TwelveData route.
create table if not exists public.twelvedata_credit_buckets (
  minute bigint primary key,
  used integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.twelvedata_credit_buckets enable row level security;

create or replace function public.reserve_twelvedata_credits(
  p_minute bigint,
  p_cost integer,
  p_limit integer default 8
)
returns table(allowed boolean, used integer, limit_value integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  next_used integer;
begin
  if p_cost < 1 or p_cost > p_limit then
    return query select false, 0, p_limit;
    return;
  end if;

  insert into public.twelvedata_credit_buckets(minute, used)
  values (p_minute, 0)
  on conflict (minute) do nothing;

  update public.twelvedata_credit_buckets
  set used = used + p_cost, updated_at = now()
  where minute = p_minute and used + p_cost <= p_limit
  returning twelvedata_credit_buckets.used into next_used;

  if next_used is null then
    select b.used into next_used
    from public.twelvedata_credit_buckets b
    where b.minute = p_minute;
    return query select false, next_used, p_limit;
  end if;

  return query select true, next_used, p_limit;
end;
$$;

revoke all on function public.reserve_twelvedata_credits(bigint, integer, integer) from public, anon, authenticated;
grant execute on function public.reserve_twelvedata_credits(bigint, integer, integer) to service_role;

-- Keep only a small history; the current and previous minute are sufficient.
delete from public.twelvedata_credit_buckets
where minute < floor(extract(epoch from now()) / 60)::bigint - 2;
