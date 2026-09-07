-- BetaTrader Phase 8 cloud foundation
-- Run this script ONLY in the BetaTrader Supabase project:
-- incciljsxgujwltugdcj
--
-- This migration is safe to re-run. It creates the Phase 8 user-owned
-- tables, profile fields, signup trigger, timestamps, RLS, and grants.
-- It does not modify the server-only market cache.

create extension if not exists pgcrypto;

-- -------------------------------------------------------------------------
-- Profiles
-- -------------------------------------------------------------------------
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  first_name text,
  last_name text,
  display_name text,
  avatar_initial text,
  timezone text not null default 'UTC',
  plan text not null default 'free' check (plan in ('free', 'pro', 'team')),
  notifications_enabled boolean not null default true,
  dark_mode boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists first_name text;
alter table public.profiles add column if not exists last_name text;
alter table public.profiles add column if not exists display_name text;
alter table public.profiles add column if not exists avatar_initial text;
alter table public.profiles add column if not exists timezone text not null default 'UTC';
alter table public.profiles add column if not exists plan text not null default 'free';
alter table public.profiles add column if not exists notifications_enabled boolean not null default true;
alter table public.profiles add column if not exists dark_mode boolean not null default true;
alter table public.profiles add column if not exists created_at timestamptz not null default now();
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

alter table public.profiles drop constraint if exists profiles_first_name_length;
alter table public.profiles drop constraint if exists profiles_last_name_length;
alter table public.profiles add constraint profiles_first_name_length
  check (first_name is null or char_length(first_name) between 1 and 80);
alter table public.profiles add constraint profiles_last_name_length
  check (last_name is null or char_length(last_name) between 1 and 80);

-- -------------------------------------------------------------------------
-- Favorites/watchlist
-- -------------------------------------------------------------------------
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

-- -------------------------------------------------------------------------
-- Journal trades
-- -------------------------------------------------------------------------
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
  on public.journal_trades(user_id, client_id)
  where client_id is not null;

-- -------------------------------------------------------------------------
-- Alerts
-- -------------------------------------------------------------------------
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

-- -------------------------------------------------------------------------
-- Notifications
-- -------------------------------------------------------------------------
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

-- A triggered alert is one event, even if multiple browser tabs or retries
-- attempt to persist it. Remove legacy duplicates before enforcing the key;
-- keep the earliest row so existing unread/read state is preserved.
delete from public.notifications duplicate
using public.notifications keeper
where duplicate.type = 'alert_triggered'
  and duplicate.source is not null
  and duplicate.user_id = keeper.user_id
  and duplicate.source = keeper.source
  and duplicate.id <> keeper.id
  and duplicate.created_at > keeper.created_at;

create unique index if not exists notifications_alert_source_unique
  on public.notifications(user_id, source)
  where type = 'alert_triggered' and source is not null;

-- -------------------------------------------------------------------------
-- Shared updated_at trigger
-- -------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists favorites_updated_at on public.favorites;
create trigger favorites_updated_at before update on public.favorites
for each row execute function public.set_updated_at();

drop trigger if exists journal_trades_updated_at on public.journal_trades;
create trigger journal_trades_updated_at before update on public.journal_trades
for each row execute function public.set_updated_at();

drop trigger if exists alerts_updated_at on public.alerts;
create trigger alerts_updated_at before update on public.alerts
for each row execute function public.set_updated_at();

-- -------------------------------------------------------------------------
-- Create a profile automatically for every new auth user.
-- -------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_first_name text := nullif(trim(new.raw_user_meta_data->>'first_name'), '');
  v_last_name text := nullif(trim(new.raw_user_meta_data->>'last_name'), '');
  v_display_name text := nullif(trim(new.raw_user_meta_data->>'display_name'), '');
begin
  insert into public.profiles (
    user_id, first_name, last_name, display_name, avatar_initial
  )
  values (
    new.id,
    v_first_name,
    v_last_name,
    coalesce(v_display_name, nullif(concat_ws(' ', v_first_name, v_last_name), '')),
    upper(left(coalesce(v_first_name, v_display_name, 'T'), 1))
  )
  on conflict (user_id) do update set
    first_name = coalesce(profiles.first_name, excluded.first_name),
    last_name = coalesce(profiles.last_name, excluded.last_name),
    display_name = coalesce(profiles.display_name, excluded.display_name),
    avatar_initial = coalesce(profiles.avatar_initial, excluded.avatar_initial);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- The signup function is trigger-only, never a public RPC.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- -------------------------------------------------------------------------
-- Row-level security: every user can access only their own rows.
-- -------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.favorites enable row level security;
alter table public.journal_trades enable row level security;
alter table public.alerts enable row level security;
alter table public.notifications enable row level security;

drop policy if exists profiles_owner_select on public.profiles;
create policy profiles_owner_select on public.profiles
for select using (auth.uid() = user_id);

drop policy if exists profiles_owner_update on public.profiles;
create policy profiles_owner_update on public.profiles
for update using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Recreate identical owner-only CRUD policies for each user-owned table.
do $$
declare
  table_name text;
begin
  foreach table_name in array array['favorites', 'journal_trades', 'alerts', 'notifications'] loop
    execute format('drop policy if exists %I_owner_select on public.%I', table_name, table_name);
    execute format('create policy %I_owner_select on public.%I for select using (auth.uid() = user_id)', table_name, table_name);

    execute format('drop policy if exists %I_owner_insert on public.%I', table_name, table_name);
    execute format('create policy %I_owner_insert on public.%I for insert with check (auth.uid() = user_id)', table_name, table_name);

    execute format('drop policy if exists %I_owner_update on public.%I', table_name, table_name);
    execute format('create policy %I_owner_update on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)', table_name, table_name);

    execute format('drop policy if exists %I_owner_delete on public.%I', table_name, table_name);
    execute format('create policy %I_owner_delete on public.%I for delete using (auth.uid() = user_id)', table_name, table_name);
  end loop;
end;
$$;

revoke all on public.profiles, public.favorites, public.journal_trades,
  public.alerts, public.notifications from anon;

grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.favorites, public.journal_trades,
  public.alerts, public.notifications to authenticated;

-- Verification queries: run these separately after the migration.
-- select table_name from information_schema.tables
-- where table_schema = 'public'
-- and table_name in ('profiles', 'favorites', 'journal_trades', 'alerts', 'notifications')
-- order by table_name;
--
-- select column_name from information_schema.columns
-- where table_schema = 'public' and table_name = 'profiles'
-- order by ordinal_position;
--
-- select schemaname, tablename, rowsecurity
-- from pg_tables
-- where schemaname = 'public'
-- and tablename in ('profiles', 'favorites', 'journal_trades', 'alerts', 'notifications');
