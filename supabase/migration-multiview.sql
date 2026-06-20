-- A Due: multi-view calendar and pattern migration.
-- Safe to run once after the initial schema.

alter table public.daily_observations
  drop constraint if exists daily_observations_mood_check,
  drop constraint if exists daily_observations_libido_check,
  drop constraint if exists daily_observations_energy_check,
  drop constraint if exists daily_observations_irritability_check,
  drop constraint if exists daily_observations_pain_check;

alter table public.daily_observations
  add constraint daily_observations_mood_check check (mood between 0 and 10),
  add constraint daily_observations_libido_check check (libido between 0 and 10),
  add constraint daily_observations_energy_check check (energy between 0 and 10),
  add constraint daily_observations_irritability_check check (irritability between 0 and 10),
  add constraint daily_observations_pain_check check (pain between 0 and 10);

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

create index if not exists timeline_events_owner_date_idx
  on public.timeline_events (owner_id, event_date desc);

alter table public.timeline_events enable row level security;

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

drop trigger if exists timeline_events_set_updated_at on public.timeline_events;
create trigger timeline_events_set_updated_at
before update on public.timeline_events
for each row execute function public.set_updated_at();
