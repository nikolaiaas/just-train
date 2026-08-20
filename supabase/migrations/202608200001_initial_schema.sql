begin;

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated, service_role;

create function private.trigger_owned_child_profile_id_default()
returns uuid
language sql
immutable
parallel safe
set search_path = ''
as $$
  select null::uuid;
$$;

comment on function private.trigger_owned_child_profile_id_default() is
  'Marks trigger-owned attempt lineage optional to type generators while returning NULL so NOT NULL fails closed without the validator trigger.';

create type public.family_member_role as enum ('owner', 'caregiver');
create type public.child_goal_status as enum ('active', 'completed', 'archived');
create type public.exercise_measurement as enum ('completion', 'repetitions', 'duration');
create type public.exercise_difficulty as enum ('beginner', 'intermediate', 'advanced');
create type public.session_status as enum ('in_progress', 'completed', 'abandoned');
create type public.attempt_outcome as enum ('completed', 'partial', 'skipped');
create type public.progress_state as enum ('in_progress', 'completed');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null
    check (char_length(btrim(display_name)) between 1 and 80),
  avatar_url text,
  locale text not null default 'da-DK'
    check (locale ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.profiles.is_admin is
  'Privileged content-editor flag. Set only through trusted SQL or a service-role backend.';

create table public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.family_memberships (
  family_id uuid not null references public.families (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.family_member_role not null default 'caregiver',
  added_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (family_id, user_id)
);

create table public.child_profiles (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  display_name text not null
    check (char_length(btrim(display_name)) between 1 and 60),
  avatar_url text,
  avatar_seed text,
  preferences jsonb not null default '{}'::jsonb
    check (jsonb_typeof(preferences) = 'object'),
  is_active boolean not null default true,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.child_profiles is
  'Parent-owned child profiles. Direct child authentication is intentionally deferred.';

create table public.topics (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (char_length(btrim(title)) between 1 and 100),
  description text not null default '',
  icon text,
  accent_color text
    check (accent_color is null or accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  sort_order integer not null default 0 check (sort_order >= 0),
  content_version integer not null default 1 check (content_version > 0),
  is_published boolean not null default false,
  published_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.topics (id) on delete cascade,
  slug text not null unique
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  summary text not null default '',
  difficulty public.exercise_difficulty not null default 'beginner',
  estimated_minutes smallint
    check (estimated_minutes is null or estimated_minutes between 1 and 180),
  equipment text[] not null default '{}'::text[],
  hero_media_url text,
  sort_order integer not null default 0 check (sort_order >= 0),
  content_version integer not null default 1 check (content_version > 0),
  is_published boolean not null default false,
  published_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.goals (id) on delete cascade,
  slug text not null unique
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  instructions text not null default '',
  measurement public.exercise_measurement not null default 'completion',
  target_value integer,
  video_url text,
  sort_order integer not null default 0 check (sort_order >= 0),
  content_version integer not null default 1 check (content_version > 0),
  is_published boolean not null default false,
  published_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exercises_target_matches_measurement check (
    (measurement = 'completion' and target_value is null)
    or (measurement in ('repetitions', 'duration') and target_value > 0)
  ),
  unique (goal_id, sort_order)
);

create table public.child_goals (
  id uuid primary key default gen_random_uuid(),
  child_profile_id uuid not null references public.child_profiles (id) on delete cascade,
  goal_id uuid not null references public.goals (id) on delete restrict,
  status public.child_goal_status not null default 'active',
  selected_by uuid not null references public.profiles (id) on delete restrict,
  selected_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint child_goals_completion_time check (
    (status = 'completed' and completed_at is not null)
    or (status <> 'completed' and completed_at is null)
  ),
  unique (child_profile_id, goal_id)
);

create table public.exercise_sessions (
  id uuid primary key default gen_random_uuid(),
  child_goal_id uuid not null references public.child_goals (id) on delete cascade,
  started_by uuid not null references public.profiles (id) on delete restrict,
  status public.session_status not null default 'in_progress',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  notes text check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exercise_sessions_end_time check (
    (status = 'in_progress' and ended_at is null)
    or (status <> 'in_progress' and ended_at is not null)
  ),
  constraint exercise_sessions_time_order check (
    ended_at is null or ended_at >= started_at
  )
);

create table public.exercise_attempts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.exercise_sessions (id) on delete cascade,
  -- Filled by the validation trigger. Keeping this immutable lineage on the
  -- attempt lets progress repair itself even after a session is cascade-deleted.
  -- DEFAULT NULL makes the field optional in generated Insert types; the BEFORE
  -- trigger replaces it, while NOT NULL still fails closed if that trigger ever
  -- does not supply validated lineage.
  child_profile_id uuid not null
    default private.trigger_owned_child_profile_id_default()
    references public.child_profiles (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete restrict,
  attempt_number smallint not null check (attempt_number > 0),
  outcome public.attempt_outcome not null,
  repetitions integer check (repetitions is null or repetitions >= 0),
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  perceived_difficulty smallint
    check (perceived_difficulty is null or perceived_difficulty between 1 and 5),
  notes text check (notes is null or char_length(notes) <= 1000),
  recorded_by uuid not null references public.profiles (id) on delete restrict,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, exercise_id, attempt_number)
);

create table public.child_exercise_progress (
  child_profile_id uuid not null references public.child_profiles (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  state public.progress_state not null,
  attempts_count integer not null check (attempts_count > 0),
  completed_count integer not null check (
    completed_count >= 0 and completed_count <= attempts_count
  ),
  best_repetitions integer check (best_repetitions is null or best_repetitions >= 0),
  best_duration_ms integer check (best_duration_ms is null or best_duration_ms >= 0),
  latest_outcome public.attempt_outcome not null,
  last_attempted_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (child_profile_id, exercise_id)
);

comment on table public.child_exercise_progress is
  'Trigger-maintained read model. Clients receive SELECT only and never write aggregates directly.';

create index family_memberships_user_id_idx
  on public.family_memberships (user_id, family_id);
create index child_profiles_family_id_idx
  on public.child_profiles (family_id, is_active);
create index topics_published_order_idx
  on public.topics (is_published, sort_order);
create index goals_topic_published_order_idx
  on public.goals (topic_id, is_published, sort_order);
create index exercises_goal_published_order_idx
  on public.exercises (goal_id, is_published, sort_order);
create index child_goals_child_status_idx
  on public.child_goals (child_profile_id, status);
create index exercise_sessions_child_goal_started_idx
  on public.exercise_sessions (child_goal_id, started_at desc);
create index exercise_attempts_session_occurred_idx
  on public.exercise_attempts (session_id, occurred_at desc);
create index exercise_attempts_child_exercise_idx
  on public.exercise_attempts (child_profile_id, exercise_id, occurred_at desc);
create index child_exercise_progress_family_child_idx
  on public.child_exercise_progress (family_id, child_profile_id);

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create function private.set_publication_timestamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_published and (tg_op = 'INSERT' or not old.is_published) then
    new.published_at := coalesce(new.published_at, now());
  elsif not new.is_published then
    new.published_at := null;
  end if;
  return new;
end;
$$;

create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(split_part(new.email, '@', 1), ''),
      'Forælder'
    )
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

create function private.add_family_creator_as_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.family_memberships (family_id, user_id, role, added_by)
  values (new.id, new.created_by, 'owner', new.created_by);
  return new;
end;
$$;

create trigger add_family_creator_as_owner
after insert on public.families
for each row execute function private.add_family_creator_as_owner();

create function private.ensure_family_has_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  locked_family_id uuid;
  removes_owner boolean := false;
begin
  if old.role = 'owner' then
    if tg_op = 'DELETE' then
      removes_owner := true;
    elsif new.role <> 'owner' or new.family_id <> old.family_id then
      removes_owner := true;
    end if;
  end if;

  if removes_owner then
    -- Every owner removal/demotion for a family takes the same row lock. This
    -- serializes concurrent changes to different membership rows before the
    -- last-owner check is evaluated.
    select family.id
      into locked_family_id
    from public.families as family
    where family.id = old.family_id
    for update;

    -- The parent row is already absent during an intentional family cascade,
    -- so those trusted erasure cascades must be allowed to continue.
    if locked_family_id is not null and not exists (
      select 1
      from public.family_memberships
      where family_id = old.family_id
        and user_id <> old.user_id
        and role = 'owner'
    ) then
      raise exception 'A family must retain at least one owner.'
        using errcode = '23514';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger ensure_family_has_owner
before update or delete on public.family_memberships
for each row execute function private.ensure_family_has_owner();

create function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select p.is_admin
      from public.profiles as p
      where p.id = (select auth.uid())
    ),
    false
  );
$$;

create function private.is_family_member(target_family_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.family_memberships as membership
    where membership.family_id = target_family_id
      and membership.user_id = (select auth.uid())
  );
$$;

create function private.is_family_owner(target_family_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.family_memberships as membership
    where membership.family_id = target_family_id
      and membership.user_id = (select auth.uid())
      and membership.role = 'owner'
  );
$$;

create function private.shares_family(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.family_memberships as mine
    join public.family_memberships as theirs
      on theirs.family_id = mine.family_id
    where mine.user_id = (select auth.uid())
      and theirs.user_id = target_user_id
  );
$$;

create function private.can_access_child(target_child_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.child_profiles as child
    join public.family_memberships as membership
      on membership.family_id = child.family_id
    where child.id = target_child_profile_id
      and membership.user_id = (select auth.uid())
  );
$$;

create function private.can_access_child_goal(target_child_goal_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.child_goals as child_goal
    join public.child_profiles as child
      on child.id = child_goal.child_profile_id
    join public.family_memberships as membership
      on membership.family_id = child.family_id
    where child_goal.id = target_child_goal_id
      and membership.user_id = (select auth.uid())
  );
$$;

create function private.can_access_session(target_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.exercise_sessions as session
    join public.child_goals as child_goal
      on child_goal.id = session.child_goal_id
    join public.child_profiles as child
      on child.id = child_goal.child_profile_id
    join public.family_memberships as membership
      on membership.family_id = child.family_id
    where session.id = target_session_id
      and membership.user_id = (select auth.uid())
  );
$$;

revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function private.is_admin() to authenticated;
grant execute on function private.is_family_member(uuid) to authenticated;
grant execute on function private.is_family_owner(uuid) to authenticated;
grant execute on function private.shares_family(uuid) to authenticated;
grant execute on function private.can_access_child(uuid) to authenticated;
grant execute on function private.can_access_child_goal(uuid) to authenticated;
grant execute on function private.can_access_session(uuid) to authenticated;
grant execute on function private.trigger_owned_child_profile_id_default()
  to authenticated, service_role;

create function private.validate_child_goal_selection()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.goals as goal
    join public.topics as topic on topic.id = goal.topic_id
    where goal.id = new.goal_id
      and goal.is_published
      and topic.is_published
  ) then
    raise exception 'A child can only select a published goal in a published topic.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger validate_child_goal_selection
before insert or update of goal_id on public.child_goals
for each row execute function private.validate_child_goal_selection();

create function private.validate_session_start()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.child_goal_id is distinct from old.child_goal_id then
      raise exception 'A session cannot be moved to another child goal.'
        using errcode = '23514';
    end if;

    if old.status <> 'in_progress'
      and (new.status, new.ended_at) is distinct from (old.status, old.ended_at)
    then
      raise exception 'A completed or abandoned session cannot be reopened or retimed.'
        using errcode = '23514';
    end if;

    return new;
  end if;

  if new.status <> 'in_progress' then
    raise exception 'A new exercise session must start in progress.'
      using errcode = '23514';
  end if;

  if not exists (
    select 1
    from public.child_goals as child_goal
    where child_goal.id = new.child_goal_id
      and child_goal.status = 'active'
  ) then
    raise exception 'An exercise session requires an active child goal.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger validate_session_start
before insert or update on public.exercise_sessions
for each row execute function private.validate_session_start();

create function private.validate_attempt()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_child_profile_id uuid;
  selected_goal_id uuid;
  selected_session_status public.session_status;
  exercise_goal_id uuid;
  exercise_measurement public.exercise_measurement;
begin
  if tg_op = 'UPDATE'
    and (new.session_id, new.exercise_id)
      is distinct from (old.session_id, old.exercise_id)
  then
    raise exception 'Attempt session and exercise lineage is immutable.'
      using errcode = '23514';
  end if;

  select child_goal.child_profile_id, child_goal.goal_id, session.status
    into selected_child_profile_id, selected_goal_id, selected_session_status
  from public.exercise_sessions as session
  join public.child_goals as child_goal on child_goal.id = session.child_goal_id
  where session.id = new.session_id;

  if selected_child_profile_id is null then
    raise exception 'Attempt session does not exist.'
      using errcode = '23514';
  end if;

  if tg_op = 'INSERT' and selected_session_status <> 'in_progress' then
    raise exception 'An attempt can only be added to an in-progress session.'
      using errcode = '23514';
  end if;

  new.child_profile_id := selected_child_profile_id;

  select exercise.goal_id, exercise.measurement
    into exercise_goal_id, exercise_measurement
  from public.exercises as exercise
  where exercise.id = new.exercise_id;

  if selected_goal_id is null or exercise_goal_id is null
    or selected_goal_id <> exercise_goal_id
  then
    raise exception 'Attempt exercise does not belong to the session goal.'
      using errcode = '23514';
  end if;

  if new.outcome <> 'skipped' then
    if exercise_measurement = 'repetitions' and new.repetitions is null then
      raise exception 'A repetition exercise requires repetitions.'
        using errcode = '23514';
    elsif exercise_measurement = 'duration' and new.duration_ms is null then
      raise exception 'A duration exercise requires duration_ms.'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create trigger validate_attempt
before insert or update on public.exercise_attempts
for each row execute function private.validate_attempt();

create function private.refresh_child_exercise_progress(
  target_child_profile_id uuid,
  target_exercise_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_family_id uuid;
  aggregate_attempts integer;
  aggregate_completed integer;
  aggregate_best_repetitions integer;
  aggregate_best_duration_ms integer;
  aggregate_latest_outcome public.attempt_outcome;
  aggregate_last_attempted_at timestamptz;
begin
  -- Aggregate writers for one child/exercise key are serialized. The trigger
  -- function is VOLATILE, so the aggregate query runs after any waiter has
  -- acquired this transaction-scoped lock.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      target_child_profile_id::text || ':' || target_exercise_id::text,
      0
    )
  );

  select child.family_id
    into target_family_id
  from public.child_profiles as child
  where child.id = target_child_profile_id;

  if target_family_id is null then
    delete from public.child_exercise_progress
    where child_profile_id = target_child_profile_id
      and exercise_id = target_exercise_id;
    return;
  end if;

  select
    count(*)::integer,
    count(*) filter (where attempt.outcome = 'completed')::integer,
    max(attempt.repetitions),
    max(attempt.duration_ms),
    (array_agg(
      attempt.outcome
      order by attempt.occurred_at desc, attempt.created_at desc, attempt.id desc
    ))[1],
    max(attempt.occurred_at)
  into
    aggregate_attempts,
    aggregate_completed,
    aggregate_best_repetitions,
    aggregate_best_duration_ms,
    aggregate_latest_outcome,
    aggregate_last_attempted_at
  from public.exercise_attempts as attempt
  where attempt.child_profile_id = target_child_profile_id
    and attempt.exercise_id = target_exercise_id;

  if aggregate_attempts = 0 then
    delete from public.child_exercise_progress
    where child_profile_id = target_child_profile_id
      and exercise_id = target_exercise_id;
    return;
  end if;

  insert into public.child_exercise_progress (
    child_profile_id,
    exercise_id,
    family_id,
    state,
    attempts_count,
    completed_count,
    best_repetitions,
    best_duration_ms,
    latest_outcome,
    last_attempted_at,
    updated_at
  )
  values (
    target_child_profile_id,
    target_exercise_id,
    target_family_id,
    case
      when aggregate_completed > 0 then 'completed'::public.progress_state
      else 'in_progress'::public.progress_state
    end,
    aggregate_attempts,
    aggregate_completed,
    aggregate_best_repetitions,
    aggregate_best_duration_ms,
    aggregate_latest_outcome,
    aggregate_last_attempted_at,
    now()
  )
  on conflict (child_profile_id, exercise_id) do update
  set family_id = excluded.family_id,
      state = excluded.state,
      attempts_count = excluded.attempts_count,
      completed_count = excluded.completed_count,
      best_repetitions = excluded.best_repetitions,
      best_duration_ms = excluded.best_duration_ms,
      latest_outcome = excluded.latest_outcome,
      last_attempted_at = excluded.last_attempted_at,
      updated_at = excluded.updated_at;
end;
$$;

create function private.sync_child_exercise_progress()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform private.refresh_child_exercise_progress(
      old.child_profile_id,
      old.exercise_id
    );
    return old;
  end if;

  if tg_op = 'UPDATE' then
    perform private.refresh_child_exercise_progress(
      old.child_profile_id,
      old.exercise_id
    );
    if (new.child_profile_id, new.exercise_id)
      is distinct from (old.child_profile_id, old.exercise_id)
    then
      perform private.refresh_child_exercise_progress(
        new.child_profile_id,
        new.exercise_id
      );
    end if;
    return new;
  end if;

  perform private.refresh_child_exercise_progress(
    new.child_profile_id,
    new.exercise_id
  );
  return new;
end;
$$;

create trigger sync_child_exercise_progress
after insert or update or delete on public.exercise_attempts
for each row execute function private.sync_child_exercise_progress();

revoke all on function private.validate_child_goal_selection()
  from public, anon, authenticated;
revoke all on function private.validate_session_start()
  from public, anon, authenticated;
revoke all on function private.validate_attempt() from public, anon, authenticated;
revoke all on function private.refresh_child_exercise_progress(uuid, uuid)
  from public, anon, authenticated;
revoke all on function private.sync_child_exercise_progress()
  from public, anon, authenticated;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();
create trigger families_set_updated_at
before update on public.families
for each row execute function private.set_updated_at();
create trigger child_profiles_set_updated_at
before update on public.child_profiles
for each row execute function private.set_updated_at();
create trigger topics_set_updated_at
before update on public.topics
for each row execute function private.set_updated_at();
create trigger goals_set_updated_at
before update on public.goals
for each row execute function private.set_updated_at();
create trigger exercises_set_updated_at
before update on public.exercises
for each row execute function private.set_updated_at();
create trigger child_goals_set_updated_at
before update on public.child_goals
for each row execute function private.set_updated_at();
create trigger exercise_sessions_set_updated_at
before update on public.exercise_sessions
for each row execute function private.set_updated_at();
create trigger exercise_attempts_set_updated_at
before update on public.exercise_attempts
for each row execute function private.set_updated_at();

create trigger topics_set_published_at
before insert or update on public.topics
for each row execute function private.set_publication_timestamp();
create trigger goals_set_published_at
before insert or update on public.goals
for each row execute function private.set_publication_timestamp();
create trigger exercises_set_published_at
before insert or update on public.exercises
for each row execute function private.set_publication_timestamp();

alter table public.profiles enable row level security;
alter table public.families enable row level security;
alter table public.family_memberships enable row level security;
alter table public.child_profiles enable row level security;
alter table public.topics enable row level security;
alter table public.goals enable row level security;
alter table public.exercises enable row level security;
alter table public.child_goals enable row level security;
alter table public.exercise_sessions enable row level security;
alter table public.exercise_attempts enable row level security;
alter table public.child_exercise_progress enable row level security;

create policy "Family members can read one another's profiles"
on public.profiles for select to authenticated
using (
  id = (select auth.uid())
  or (select private.shares_family(id))
);

create policy "Users can update their own profile"
on public.profiles for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create policy "Members can read their families"
on public.families for select to authenticated
using ((select private.is_family_member(id)));

create policy "Users can create a family"
on public.families for insert to authenticated
with check (created_by = (select auth.uid()));

create policy "Owners can update their families"
on public.families for update to authenticated
using ((select private.is_family_owner(id)))
with check ((select private.is_family_owner(id)));

create policy "Owners can delete their families"
on public.families for delete to authenticated
using ((select private.is_family_owner(id)));

create policy "Members can read family memberships"
on public.family_memberships for select to authenticated
using ((select private.is_family_member(family_id)));

create policy "Owners can add family members"
on public.family_memberships for insert to authenticated
with check (
  (select private.is_family_owner(family_id))
  and added_by = (select auth.uid())
);

create policy "Owners can change family member roles"
on public.family_memberships for update to authenticated
using ((select private.is_family_owner(family_id)))
with check ((select private.is_family_owner(family_id)));

create policy "Owners can remove family members"
on public.family_memberships for delete to authenticated
using ((select private.is_family_owner(family_id)));

create policy "Members can read children in their family"
on public.child_profiles for select to authenticated
using ((select private.is_family_member(family_id)));

create policy "Members can create child profiles in their family"
on public.child_profiles for insert to authenticated
with check (
  (select private.is_family_member(family_id))
  and created_by = (select auth.uid())
);

create policy "Members can update child profiles in their family"
on public.child_profiles for update to authenticated
using ((select private.is_family_member(family_id)))
with check ((select private.is_family_member(family_id)));

create policy "Owners can delete child profiles in their family"
on public.child_profiles for delete to authenticated
using ((select private.is_family_owner(family_id)));

create policy "Anyone can read published topics"
on public.topics for select to anon, authenticated
using (is_published);

create policy "Admins can read all topics"
on public.topics for select to authenticated
using ((select private.is_admin()));

create policy "Admins can create topics"
on public.topics for insert to authenticated
with check ((select private.is_admin()));

create policy "Admins can update topics"
on public.topics for update to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy "Admins can delete topics"
on public.topics for delete to authenticated
using ((select private.is_admin()));

create policy "Anyone can read published goals"
on public.goals for select to anon, authenticated
using (
  is_published
  and exists (
    select 1 from public.topics as topic
    where topic.id = goals.topic_id and topic.is_published
  )
);

create policy "Admins can read all goals"
on public.goals for select to authenticated
using ((select private.is_admin()));

create policy "Admins can create goals"
on public.goals for insert to authenticated
with check ((select private.is_admin()));

create policy "Admins can update goals"
on public.goals for update to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy "Admins can delete goals"
on public.goals for delete to authenticated
using ((select private.is_admin()));

create policy "Anyone can read published exercises"
on public.exercises for select to anon, authenticated
using (
  is_published
  and exists (
    select 1
    from public.goals as goal
    join public.topics as topic on topic.id = goal.topic_id
    where goal.id = exercises.goal_id
      and goal.is_published
      and topic.is_published
  )
);

create policy "Admins can read all exercises"
on public.exercises for select to authenticated
using ((select private.is_admin()));

create policy "Admins can create exercises"
on public.exercises for insert to authenticated
with check ((select private.is_admin()));

create policy "Admins can update exercises"
on public.exercises for update to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy "Admins can delete exercises"
on public.exercises for delete to authenticated
using ((select private.is_admin()));

create policy "Family members can read child goals"
on public.child_goals for select to authenticated
using ((select private.can_access_child(child_profile_id)));

create policy "Family members can select goals for a child"
on public.child_goals for insert to authenticated
with check (
  (select private.can_access_child(child_profile_id))
  and selected_by = (select auth.uid())
);

create policy "Family members can update child goals"
on public.child_goals for update to authenticated
using ((select private.can_access_child(child_profile_id)))
with check ((select private.can_access_child(child_profile_id)));

create policy "Family members can read exercise sessions"
on public.exercise_sessions for select to authenticated
using ((select private.can_access_child_goal(child_goal_id)));

create policy "Family members can start exercise sessions"
on public.exercise_sessions for insert to authenticated
with check (
  (select private.can_access_child_goal(child_goal_id))
  and started_by = (select auth.uid())
);

create policy "Family members can update exercise sessions"
on public.exercise_sessions for update to authenticated
using ((select private.can_access_child_goal(child_goal_id)))
with check ((select private.can_access_child_goal(child_goal_id)));

create policy "Family members can read exercise attempts"
on public.exercise_attempts for select to authenticated
using ((select private.can_access_session(session_id)));

create policy "Family members can record exercise attempts"
on public.exercise_attempts for insert to authenticated
with check (
  (select private.can_access_session(session_id))
  and recorded_by = (select auth.uid())
);

create policy "Family members can read child exercise progress"
on public.child_exercise_progress for select to authenticated
using ((select private.is_family_member(family_id)));

revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (display_name, avatar_url, locale) on public.profiles to authenticated;

revoke all on table public.families from anon, authenticated;
grant select, insert, delete on table public.families to authenticated;
grant update (name) on public.families to authenticated;

revoke all on table public.family_memberships from anon, authenticated;
grant select, delete on table public.family_memberships to authenticated;
grant insert (family_id, user_id, role, added_by)
  on public.family_memberships to authenticated;
grant update (role) on public.family_memberships to authenticated;

revoke all on table public.child_profiles from anon, authenticated;
grant select, delete on table public.child_profiles to authenticated;
grant insert (
  family_id, display_name, avatar_url, avatar_seed, preferences, is_active, created_by
) on public.child_profiles to authenticated;
grant update (display_name, avatar_url, avatar_seed, preferences, is_active)
  on public.child_profiles to authenticated;

revoke all on table public.topics, public.goals, public.exercises
  from anon, authenticated;
grant select on table public.topics, public.goals, public.exercises
  to authenticated;
grant select (
  id,
  slug,
  title,
  description,
  icon,
  accent_color,
  sort_order,
  content_version,
  is_published,
  published_at,
  updated_at
) on public.topics to anon;
grant select (
  id,
  topic_id,
  slug,
  title,
  summary,
  difficulty,
  estimated_minutes,
  equipment,
  hero_media_url,
  sort_order,
  content_version,
  is_published,
  published_at,
  updated_at
) on public.goals to anon;
grant select (
  id,
  goal_id,
  slug,
  title,
  instructions,
  measurement,
  target_value,
  video_url,
  sort_order,
  content_version,
  is_published,
  published_at,
  updated_at
) on public.exercises to anon;
grant insert, update, delete on table public.topics, public.goals, public.exercises
  to authenticated;

revoke all on table public.child_goals from anon, authenticated;
grant select on table public.child_goals to authenticated;
grant insert (child_profile_id, goal_id, status, selected_by, selected_at, completed_at)
  on public.child_goals to authenticated;
grant update (status, completed_at) on public.child_goals to authenticated;

revoke all on table public.exercise_sessions from anon, authenticated;
grant select on table public.exercise_sessions to authenticated;
grant insert (child_goal_id, started_by, status, started_at, ended_at, notes)
  on public.exercise_sessions to authenticated;
grant update (status, ended_at, notes) on public.exercise_sessions to authenticated;

revoke all on table public.exercise_attempts from anon, authenticated;
grant select on table public.exercise_attempts to authenticated;
grant insert (
  session_id,
  exercise_id,
  attempt_number,
  outcome,
  repetitions,
  duration_ms,
  perceived_difficulty,
  notes,
  recorded_by,
  occurred_at
) on public.exercise_attempts to authenticated;

revoke all on table public.child_exercise_progress from anon, authenticated;
grant select on table public.child_exercise_progress to authenticated;

-- The service role bypasses RLS, but it still receives only the object and
-- column privileges needed by trusted API/admin workflows. Derived progress
-- and immutable training history have no direct service-role write grants.
revoke all on table
  public.profiles,
  public.families,
  public.family_memberships,
  public.child_profiles,
  public.topics,
  public.goals,
  public.exercises,
  public.child_goals,
  public.exercise_sessions,
  public.exercise_attempts,
  public.child_exercise_progress
from service_role;

grant select on table
  public.profiles,
  public.families,
  public.family_memberships,
  public.child_profiles,
  public.topics,
  public.goals,
  public.exercises,
  public.child_goals,
  public.exercise_sessions,
  public.exercise_attempts,
  public.child_exercise_progress
to service_role;

grant update (display_name, avatar_url, locale, is_admin)
  on public.profiles to service_role;

grant insert (name, created_by) on public.families to service_role;
grant update (name) on public.families to service_role;
grant delete on public.families to service_role;

grant insert (family_id, user_id, role, added_by)
  on public.family_memberships to service_role;
grant update (role) on public.family_memberships to service_role;
grant delete on public.family_memberships to service_role;

grant insert (
  family_id, display_name, avatar_url, avatar_seed, preferences, is_active, created_by
) on public.child_profiles to service_role;
grant update (display_name, avatar_url, avatar_seed, preferences, is_active)
  on public.child_profiles to service_role;
grant delete on public.child_profiles to service_role;

grant insert (
  slug,
  title,
  description,
  icon,
  accent_color,
  sort_order,
  content_version,
  is_published,
  created_by
) on public.topics to service_role;
grant update (
  slug,
  title,
  description,
  icon,
  accent_color,
  sort_order,
  content_version,
  is_published
) on public.topics to service_role;
grant delete on public.topics to service_role;

grant insert (
  topic_id,
  slug,
  title,
  summary,
  difficulty,
  estimated_minutes,
  equipment,
  hero_media_url,
  sort_order,
  content_version,
  is_published,
  created_by
) on public.goals to service_role;
grant update (
  topic_id,
  slug,
  title,
  summary,
  difficulty,
  estimated_minutes,
  equipment,
  hero_media_url,
  sort_order,
  content_version,
  is_published
) on public.goals to service_role;
grant delete on public.goals to service_role;

grant insert (
  goal_id,
  slug,
  title,
  instructions,
  measurement,
  target_value,
  video_url,
  sort_order,
  content_version,
  is_published,
  created_by
) on public.exercises to service_role;
grant update (
  goal_id,
  slug,
  title,
  instructions,
  measurement,
  target_value,
  video_url,
  sort_order,
  content_version,
  is_published
) on public.exercises to service_role;
grant delete on public.exercises to service_role;

grant insert (child_profile_id, goal_id, status, selected_by, selected_at, completed_at)
  on public.child_goals to service_role;
grant update (status, completed_at) on public.child_goals to service_role;

grant insert (child_goal_id, started_by, status, started_at, ended_at, notes)
  on public.exercise_sessions to service_role;
grant update (status, ended_at, notes) on public.exercise_sessions to service_role;

grant insert (
  session_id,
  exercise_id,
  attempt_number,
  outcome,
  repetitions,
  duration_ms,
  perceived_difficulty,
  notes,
  recorded_by,
  occurred_at
) on public.exercise_attempts to service_role;

comment on schema private is
  'Non-API helper functions for RLS and trigger-maintained invariants.';
comment on function private.is_admin() is
  'RLS helper. Admin status cannot be changed through authenticated client grants.';
comment on function private.is_family_member(uuid) is
  'RLS helper evaluated against auth.uid(). The service role bypasses RLS and must stay server-side.';

commit;
