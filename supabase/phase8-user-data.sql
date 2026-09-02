-- BetaTrader Phase 8 user data schema
-- Run ONLY in Supabase project: incciljsxgujwltugdcj (BetaTrader).
-- This migration is intentionally separate from the server-only market cache.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_initial text,
  timezone text not null default 'UTC',
  plan text not null default 'free' check (plan in ('free', 'pro', 'team')),
  notifications_enabled boolean not null default true,
  dark_mode boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  category text,
  provider text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, symbol)
);

create table if not exists public.journal_trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  asset text not null,
  category text,
  provider text,
  direction text not null check (direction in ('long', 'short')),
  status text not null default 'closed' check (status in ('open', 'closed', 'cancelled')),
  entry numeric,
  exit numeric,
  stop_loss numeric,
  take_profit numeric,
  quantity numeric,
  capital numeric,
  leverage numeric,
  lot_type text,
  lot_size numeric,
  result text check (result is null or result in ('win', 'loss', 'breakeven', 'open')),
  pl numeric,
  traded_at timestamptz,
  timeframe text,
  emotion text,
  bias text,
  strategy text,
  notes text,
  client_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (entry is null or entry >= 0),
  check (exit is null or exit >= 0),
  check (quantity is null or quantity >= 0),
  check (capital is null or capital >= 0),
  check (leverage is null or leverage > 0),
  check (status <> 'closed' or exit is not null or pl is not null)
);
create unique index if not exists journal_trades_user_client_id
  on public.journal_trades(user_id, client_id) where client_id is not null;

create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  asset text not null,
  category text,
  provider text,
  type text not null default 'price' check (type in ('price')),
  condition text not null check (condition in ('above', 'below')),
  threshold numeric not null check (threshold >= 0),
  status text not null default 'active' check (status in ('active', 'triggered', 'disabled')),
  triggered_at timestamptz,
  notification_state text not null default 'pending' check (notification_state in ('pending', 'sent', 'read')),
  client_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, client_id)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null default 'system',
  title text not null,
  message text not null,
  source text,
  url text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
drop trigger if exists favorites_updated_at on public.favorites;
create trigger favorites_updated_at before update on public.favorites for each row execute function public.set_updated_at();
drop trigger if exists journal_trades_updated_at on public.journal_trades;
create trigger journal_trades_updated_at before update on public.journal_trades for each row execute function public.set_updated_at();
drop trigger if exists alerts_updated_at on public.alerts;
create trigger alerts_updated_at before update on public.alerts for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, display_name, avatar_initial)
  values (new.id, nullif(trim(new.raw_user_meta_data->>'display_name'), ''),
          upper(left(coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), 'T'), 1)))
  on conflict (user_id) do nothing;
  return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- This function is trigger-only; it must not be callable through public RPC.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

alter table public.profiles enable row level security;
alter table public.favorites enable row level security;
alter table public.journal_trades enable row level security;
alter table public.alerts enable row level security;
alter table public.notifications enable row level security;

drop policy if exists profiles_owner_select on public.profiles;
create policy profiles_owner_select on public.profiles for select using (auth.uid() = user_id);
drop policy if exists profiles_owner_update on public.profiles;
create policy profiles_owner_update on public.profiles for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Identical owner-only policies for every user-owned table.
do $$
declare t text; begin
  foreach t in array array['favorites','journal_trades','alerts','notifications'] loop
    execute format('drop policy if exists %I_owner_select on public.%I', t, t);
    execute format('create policy %I_owner_select on public.%I for select using (auth.uid() = user_id)', t, t);
    execute format('drop policy if exists %I_owner_insert on public.%I', t, t);
    execute format('create policy %I_owner_insert on public.%I for insert with check (auth.uid() = user_id)', t, t);
    execute format('drop policy if exists %I_owner_update on public.%I', t, t);
    execute format('create policy %I_owner_update on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)', t, t);
    execute format('drop policy if exists %I_owner_delete on public.%I', t, t);
    execute format('create policy %I_owner_delete on public.%I for delete using (auth.uid() = user_id)', t, t);
  end loop;
end $$;

revoke all on public.profiles, public.favorites, public.journal_trades, public.alerts, public.notifications from anon;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.favorites, public.journal_trades, public.alerts, public.notifications to authenticated;
