-- Workout Logbook cloud sync schema.
-- Run once in Supabase Dashboard > SQL Editor. Safe to re-run (idempotent).
-- DO NOT EDIT TABLES HERE after the first run ("create table if not exists" skips
-- existing tables). Later changes go in supabase/migrations/NNN_description.sql.
-- Every table: RLS on, policies scoped to auth.uid(), explicit grants to authenticated only.

-- ---------- shared trigger: server-side updated_at ----------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke execute on function public.set_updated_at() from public, anon, authenticated;

-- ---------- tables ----------
create table if not exists public.workouts (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id         uuid not null,
  name       text not null check (char_length(name) between 1 and 200),
  position   integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, id)
);

create table if not exists public.workout_items (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id         uuid not null,                       -- the app's item "uid"
  workout_id uuid not null,
  ex_id      text not null check (char_length(ex_id) between 1 and 200),
  sets       integer check (sets between 1 and 999999),
  reps       integer check (reps between 1 and 999999),
  weight     numeric(9,3) check (weight > 0 and weight < 1000000),     -- lb
  notes      text not null default '' check (char_length(notes) <= 2000),
  done_at    timestamptz,
  position   integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, id),
  foreign key (user_id, workout_id) references public.workouts (user_id, id) on delete cascade
);

create table if not exists public.cardio_items (
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id           uuid not null,
  ex_id        text not null check (char_length(ex_id) between 1 and 200),
  duration_sec bigint check (duration_sec between 1 and 3599999999),
  intensity    text check (intensity in ('Low', 'Medium', 'High')),
  heart_rate   integer check (heart_rate between 1 and 999999),
  calories     integer check (calories between 1 and 999999),
  distance     numeric(9,3) check (distance > 0 and distance < 1000000), -- mi
  notes        text not null default '' check (char_length(notes) <= 2000),
  done_at      timestamptz,
  position     integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  primary key (user_id, id)
);

create table if not exists public.custom_exercises (
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id                uuid not null,
  name              text not null check (char_length(name) between 1 and 200),
  equipment         text not null default '' check (char_length(equipment) <= 200),
  primary_muscles   text[] not null default '{}',
  secondary_muscles text[] not null default '{}',
  category          text check (category = 'cardio'),   -- null = strength
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  primary key (user_id, id)
);

-- History: one row per finished session, plus a snapshot row per exercise in it.
create table if not exists public.sessions (
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id           uuid not null,
  performed_at timestamptz not null,
  kind         text not null default 'workout' check (kind in ('workout', 'cardio')),
  workout_name text not null check (char_length(workout_name) <= 200),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  primary key (user_id, id)
);

create table if not exists public.session_items (
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id           uuid not null,
  session_id   uuid not null,
  name         text not null check (char_length(name) <= 200),   -- exercise name at the time
  sets         integer check (sets between 1 and 999999),
  reps         integer check (reps between 1 and 999999),
  weight       numeric(9,3) check (weight > 0 and weight < 1000000),
  duration_sec bigint check (duration_sec between 1 and 3599999999),
  intensity    text check (intensity in ('Low', 'Medium', 'High')),
  heart_rate   integer check (heart_rate between 1 and 999999),
  calories     integer check (calories between 1 and 999999),
  distance     numeric(9,3) check (distance > 0 and distance < 1000000),
  notes        text not null default '' check (char_length(notes) <= 2000),
  done         boolean not null default false,
  position     integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  primary key (user_id, id),
  foreign key (user_id, session_id) references public.sessions (user_id, id) on delete cascade
);

-- One row per user.
create table if not exists public.user_settings (
  user_id           uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  units             text not null default 'imperial' check (units in ('imperial', 'metric')),
  duration_format   text not null default 'words'    check (duration_format in ('words', 'clock')),
  active_workout_id uuid,
  updated_at        timestamptz not null default now()
);

-- ---------- indexes (sync pulls: "everything of mine changed since X") ----------
create index if not exists workouts_sync_idx         on public.workouts         (user_id, updated_at);
create index if not exists workout_items_sync_idx    on public.workout_items    (user_id, updated_at);
create index if not exists workout_items_parent_idx  on public.workout_items    (user_id, workout_id);
create index if not exists cardio_items_sync_idx     on public.cardio_items     (user_id, updated_at);
create index if not exists custom_exercises_sync_idx on public.custom_exercises (user_id, updated_at);
create index if not exists sessions_sync_idx         on public.sessions         (user_id, updated_at);
create index if not exists session_items_sync_idx    on public.session_items    (user_id, updated_at);
create index if not exists session_items_parent_idx  on public.session_items    (user_id, session_id);

-- ---------- triggers, RLS, policies, grants (same pattern for every table) ----------
do $$
declare
  t text;
begin
  foreach t in array array[
    'workouts', 'workout_items', 'cardio_items', 'custom_exercises',
    'sessions', 'session_items', 'user_settings'
  ] loop
    -- server-side updated_at
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format(
      'create trigger set_updated_at before insert or update on public.%I
         for each row execute function public.set_updated_at()', t);

    -- RLS on, and applied even to the table owner
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);

    -- policies: own rows only, authenticated only (anonymous sign-ins are authenticated)
    execute format('drop policy if exists "own rows: select" on public.%I', t);
    execute format('drop policy if exists "own rows: insert" on public.%I', t);
    execute format('drop policy if exists "own rows: update" on public.%I', t);
    execute format('drop policy if exists "own rows: delete" on public.%I', t);
    execute format('create policy "own rows: select" on public.%I for select to authenticated
                      using ((select auth.uid()) = user_id)', t);
    execute format('create policy "own rows: insert" on public.%I for insert to authenticated
                      with check ((select auth.uid()) = user_id)', t);
    execute format('create policy "own rows: update" on public.%I for update to authenticated
                      using ((select auth.uid()) = user_id)
                      with check ((select auth.uid()) = user_id)', t);
    execute format('create policy "own rows: delete" on public.%I for delete to authenticated
                      using ((select auth.uid()) = user_id)', t);

    -- grants: nothing for anon/public, full CRUD (still filtered by RLS) for authenticated
    execute format('revoke all on public.%I from public, anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end
$$;

-- ---------- RLS check (commented out; do not run as part of setup) ----------
-- In the SQL editor, simulate a signed-in user, then try to read/write as them:
--   begin;
--   set local role authenticated;
--   select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001"}', true);
--   insert into public.workouts (id, name) values (gen_random_uuid(), 'mine');            -- ok
--   insert into public.workouts (user_id, id, name)
--     values ('00000000-0000-0000-0000-000000000002', gen_random_uuid(), 'theirs');       -- must fail (RLS)
--   select count(*) from public.workouts;                                                  -- only your own rows
--   rollback;
-- (user_id references auth.users, so use real user ids from Authentication > Users.)
