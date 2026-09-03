-- BetaTrader Phase 8 auth/profile follow-up
-- Run ONLY in Supabase project incciljsxgujwltugdcj.

alter table public.profiles
  add column if not exists first_name text,
  add column if not exists last_name text;

alter table public.profiles
  drop constraint if exists profiles_first_name_length,
  drop constraint if exists profiles_last_name_length;

alter table public.profiles
  add constraint profiles_first_name_length check (first_name is null or char_length(first_name) between 1 and 80),
  add constraint profiles_last_name_length check (last_name is null or char_length(last_name) between 1 and 80);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_first_name text := nullif(trim(new.raw_user_meta_data->>'first_name'), '');
  v_last_name text := nullif(trim(new.raw_user_meta_data->>'last_name'), '');
begin
  insert into public.profiles (
    user_id,
    first_name,
    last_name,
    display_name,
    avatar_initial
  )
  values (
    new.id,
    v_first_name,
    v_last_name,
    coalesce(nullif(concat_ws(' ', v_first_name, v_last_name), ''), nullif(trim(new.raw_user_meta_data->>'display_name'), '')),
    upper(left(coalesce(v_first_name, nullif(trim(new.raw_user_meta_data->>'display_name'), ''), 'T'), 1))
  )
  on conflict (user_id) do update set
    first_name = coalesce(profiles.first_name, excluded.first_name),
    last_name = coalesce(profiles.last_name, excluded.last_name),
    display_name = coalesce(profiles.display_name, excluded.display_name),
    avatar_initial = coalesce(profiles.avatar_initial, excluded.avatar_initial);

  return new;
end;
$$;

-- Trigger-only function: never expose it through REST RPC.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
