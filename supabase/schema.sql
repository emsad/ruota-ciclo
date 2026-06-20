-- A Due: personal cycle profile schema for Supabase.
-- Run this file once in the Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  label text not null default 'Profilo personale',
  cycle_length smallint not null default 28 check (cycle_length between 21 and 40),
  period_length smallint not null default 5 check (period_length between 1 and 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id)
);

create table if not exists public.cycle_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  start_date date not null,
  end_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, start_date),
  check (end_date is null or end_date >= start_date)
);

create table if not exists public.daily_observations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  observation_date date not null,
  mood smallint check (mood between 0 and 10),
  libido smallint check (libido between 0 and 10),
  energy smallint check (energy between 0 and 10),
  irritability smallint check (irritability between 0 and 10),
  pain smallint check (pain between 0 and 10),
  notes text,
  source text not null default 'manual' check (source in ('manual', 'import')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, observation_date)
);

create table if not exists public.timeline_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  event_date date not null,
  category text not null check (category in ('sex', 'conflict', 'other')),
  intensity smallint check (intensity between 1 and 10),
  details text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, event_date, category)
);

create index if not exists cycle_events_owner_date_idx
  on public.cycle_events (owner_id, start_date desc);

create index if not exists daily_observations_owner_date_idx
  on public.daily_observations (owner_id, observation_date desc);

create index if not exists timeline_events_owner_date_idx
  on public.timeline_events (owner_id, event_date desc);

alter table public.profiles enable row level security;
alter table public.cycle_events enable row level security;
alter table public.daily_observations enable row level security;
alter table public.timeline_events enable row level security;

drop policy if exists "Owner controls profile" on public.profiles;
create policy "Owner controls profile"
  on public.profiles
  for all
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists "Owner controls cycle events" on public.cycle_events;
create policy "Owner controls cycle events"
  on public.cycle_events
  for all
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check (
    (select auth.uid()) = owner_id
    and exists (
      select 1
      from public.profiles
      where profiles.id = profile_id
        and profiles.owner_id = (select auth.uid())
    )
  );

drop policy if exists "Owner controls observations" on public.daily_observations;
create policy "Owner controls observations"
  on public.daily_observations
  for all
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check (
    (select auth.uid()) = owner_id
    and exists (
      select 1
      from public.profiles
      where profiles.id = profile_id
        and profiles.owner_id = (select auth.uid())
    )
  );

drop policy if exists "Owner controls timeline events" on public.timeline_events;
create policy "Owner controls timeline events"
  on public.timeline_events
  for all
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check (
    (select auth.uid()) = owner_id
    and exists (
      select 1
      from public.profiles
      where profiles.id = profile_id
        and profiles.owner_id = (select auth.uid())
    )
  );

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists cycle_events_set_updated_at on public.cycle_events;
create trigger cycle_events_set_updated_at
before update on public.cycle_events
for each row execute function public.set_updated_at();

drop trigger if exists daily_observations_set_updated_at on public.daily_observations;
create trigger daily_observations_set_updated_at
before update on public.daily_observations
for each row execute function public.set_updated_at();

drop trigger if exists timeline_events_set_updated_at on public.timeline_events;
create trigger timeline_events_set_updated_at
before update on public.timeline_events
for each row execute function public.set_updated_at();
