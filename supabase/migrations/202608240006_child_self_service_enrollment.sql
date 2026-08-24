begin;

create type public.child_topic_enrollment_status as enum ('active', 'left');

create table public.child_topic_enrollments (
  id uuid primary key default gen_random_uuid(),
  child_profile_id uuid not null
    references public.child_profiles (id) on delete cascade,
  topic_id uuid not null references public.topics (id) on delete cascade,
  status public.child_topic_enrollment_status not null default 'active',
  last_changed_by uuid not null references public.profiles (id) on delete restrict,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint child_topic_enrollments_status_time check (
    (status = 'active' and left_at is null)
    or (
      status = 'left'
      and left_at is not null
      and left_at >= joined_at
    )
  ),
  unique (child_profile_id, topic_id)
);

comment on table public.child_topic_enrollments is
  'The selected child current subject choices. Kids Mode can join, leave, and rejoin published subjects without a separate adult approval step; training progress remains separate and durable.';

create index child_topic_enrollments_child_status_idx
on public.child_topic_enrollments (child_profile_id, status);

create trigger child_topic_enrollments_set_updated_at
before update on public.child_topic_enrollments
for each row execute function private.set_updated_at();

alter table public.child_topic_enrollments enable row level security;

-- Family clients use the guarded catalogue and mutation RPCs below. Keeping
-- the table itself ungranted also prevents a content administrator from
-- browsing child choices merely because that account has the admin role.
revoke all on table public.child_topic_enrollments
from public, anon, authenticated, service_role;

-- Existing selected goals become active subject choices. This is only a
-- current-state backfill; attempt/progress history remains authoritative and
-- is not rewritten.
insert into public.child_topic_enrollments (
  child_profile_id,
  topic_id,
  status,
  last_changed_by,
  joined_at,
  left_at,
  created_at,
  updated_at
)
select distinct on (child_goal.child_profile_id, goal.topic_id)
  child_goal.child_profile_id,
  goal.topic_id,
  'active'::public.child_topic_enrollment_status,
  child_goal.selected_by,
  child_goal.selected_at,
  null,
  child_goal.selected_at,
  child_goal.updated_at
from public.child_goals as child_goal
join public.goals as goal on goal.id = child_goal.goal_id
where child_goal.status <> 'archived'
order by
  child_goal.child_profile_id,
  goal.topic_id,
  child_goal.selected_at desc,
  child_goal.id desc;

-- Old installed clients create/reactivate child_goals when they save an
-- exercise. Mirror that action into subject enrollment so this additive
-- migration stays compatible while app releases overlap. Leaving a subject
-- does not archive its goals; rejoining therefore restores the same choices.
create function private.sync_child_topic_enrollment_from_goal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_topic_id uuid;
begin
  if new.status = 'archived' then
    return new;
  end if;

  select goal.topic_id
  into selected_topic_id
  from public.goals as goal
  join public.topics as topic on topic.id = goal.topic_id
  where goal.id = new.goal_id
    and goal.is_published
    and topic.is_published;

  if selected_topic_id is null then
    raise exception 'A child can only select a published goal in a published topic.'
      using errcode = '23514';
  end if;

  insert into public.child_topic_enrollments as enrollment (
    child_profile_id,
    topic_id,
    status,
    last_changed_by,
    joined_at,
    left_at
  ) values (
    new.child_profile_id,
    selected_topic_id,
    'active',
    new.selected_by,
    now(),
    null
  )
  on conflict on constraint
    child_topic_enrollments_child_profile_id_topic_id_key
  do update
  set status = 'active',
      last_changed_by = excluded.last_changed_by,
      joined_at = excluded.joined_at,
      left_at = null
  where enrollment.status = 'left';

  return new;
end;
$$;

revoke all on function private.sync_child_topic_enrollment_from_goal()
from public, anon, authenticated, service_role;

create trigger sync_child_topic_enrollment_from_goal
after insert or update of status on public.child_goals
for each row execute function private.sync_child_topic_enrollment_from_goal();

-- This is the enrollment-aware published catalogue. The original
-- list_child_training_content RPC remains unchanged for installed clients.
create function public.list_child_training_content_v2(
  p_family_id uuid,
  p_child_profile_id uuid,
  p_expected_user_id uuid,
  p_topic_id uuid default null
)
returns table (
  topic_id uuid,
  topic_slug text,
  topic_title text,
  topic_description text,
  topic_icon text,
  topic_accent_color text,
  topic_sort_order integer,
  topic_is_enrolled boolean,
  topic_enrolled_at timestamptz,
  goal_id uuid,
  goal_slug text,
  goal_title text,
  goal_summary text,
  goal_difficulty public.exercise_difficulty,
  goal_estimated_minutes smallint,
  goal_equipment text[],
  goal_hero_media_url text,
  goal_sort_order integer,
  goal_is_enrolled boolean,
  goal_enrolled_at timestamptz,
  exercise_id uuid,
  exercise_slug text,
  exercise_title text,
  exercise_instructions text,
  exercise_measurement public.exercise_measurement,
  exercise_target_value integer,
  exercise_estimated_minutes smallint,
  exercise_equipment text[],
  exercise_safety_notes text,
  exercise_video_url text,
  exercise_sort_order integer,
  progress_state public.progress_state,
  attempts_count integer,
  completed_count integer,
  best_repetitions integer,
  best_duration_ms integer,
  last_attempted_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  selected_child_family_id uuid;
  selected_child_active boolean;
begin
  if caller_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if caller_id is distinct from p_expected_user_id then
    raise exception 'The authenticated account changed before training content was loaded.'
      using errcode = '28000';
  end if;

  select child.family_id, child.is_active
  into selected_child_family_id, selected_child_active
  from public.child_profiles as child
  where child.id = p_child_profile_id;

  if selected_child_family_id is null
    or selected_child_family_id <> p_family_id
    or not selected_child_active
    or not (select private.is_family_member(p_family_id))
  then
    raise exception 'The active child is unavailable to this family.'
      using errcode = '42501';
  end if;

  return query
  select
    topic.id,
    topic.slug,
    topic.title,
    topic.description,
    topic.icon,
    topic.accent_color,
    topic.sort_order,
    coalesce(topic_enrollment.status = 'active', false),
    case
      when topic_enrollment.status = 'active' then topic_enrollment.joined_at
      else null
    end,
    goal.id,
    goal.slug,
    goal.title,
    goal.summary,
    goal.difficulty,
    goal.estimated_minutes,
    goal.equipment,
    goal.hero_media_url,
    goal.sort_order,
    case
      when goal.id is null then null
      else coalesce(
        topic_enrollment.status = 'active'
        and child_goal.status <> 'archived',
        false
      )
    end,
    case
      when topic_enrollment.status = 'active'
        and child_goal.status <> 'archived'
      then child_goal.selected_at
      else null
    end,
    exercise.id,
    exercise.slug,
    exercise.title,
    exercise.instructions,
    exercise.measurement,
    exercise.target_value,
    exercise.estimated_minutes,
    exercise.equipment,
    exercise.safety_notes,
    exercise.video_url,
    exercise.sort_order,
    progress.state,
    progress.attempts_count,
    progress.completed_count,
    progress.best_repetitions,
    progress.best_duration_ms,
    progress.last_attempted_at
  from public.topics as topic
  left join public.child_topic_enrollments as topic_enrollment
    on topic_enrollment.child_profile_id = p_child_profile_id
    and topic_enrollment.topic_id = topic.id
  left join public.goals as goal
    on goal.topic_id = topic.id
    and goal.is_published
  left join public.child_goals as child_goal
    on child_goal.child_profile_id = p_child_profile_id
    and child_goal.goal_id = goal.id
  left join public.exercises as exercise
    on exercise.goal_id = goal.id
    and exercise.is_published
  left join public.child_exercise_progress as progress
    on progress.child_profile_id = p_child_profile_id
    and progress.exercise_id = exercise.id
    and progress.family_id = p_family_id
  where topic.is_published
    and (p_topic_id is null or topic.id = p_topic_id)
  order by
    topic.sort_order,
    topic.id,
    goal.sort_order,
    goal.id,
    exercise.sort_order,
    exercise.id;
end;
$$;

revoke all on function public.list_child_training_content_v2(
  uuid, uuid, uuid, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.list_child_training_content_v2(
  uuid, uuid, uuid, uuid
) to authenticated;

comment on function public.list_child_training_content_v2(
  uuid, uuid, uuid, uuid
) is
  'Lists every published subject, goal, and exercise with the selected child current self-service enrollment and durable progress. Unjoined subjects stay visible and require no adult approval.';

create function public.set_child_training_enrollment(
  p_family_id uuid,
  p_child_profile_id uuid,
  p_topic_id uuid,
  p_goal_id uuid default null,
  p_enrolled boolean default null,
  p_expected_user_id uuid default null
)
returns table (
  topic_id uuid,
  topic_is_enrolled boolean,
  topic_enrolled_at timestamptz,
  goal_id uuid,
  goal_is_enrolled boolean,
  goal_enrolled_at timestamptz,
  changed boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  selected_child_family_id uuid;
  selected_child_active boolean;
  selected_goal_topic_id uuid;
  existing_topic_enrollment public.child_topic_enrollments%rowtype;
  existing_child_goal public.child_goals%rowtype;
  result_topic_enrollment public.child_topic_enrollments%rowtype;
  result_child_goal public.child_goals%rowtype;
  did_change boolean := false;
begin
  if caller_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if caller_id is distinct from p_expected_user_id then
    raise exception 'The authenticated account changed before the child choice was saved.'
      using errcode = '28000';
  end if;

  if p_family_id is null
    or p_child_profile_id is null
    or p_topic_id is null
    or p_enrolled is null
  then
    raise exception 'Family, child, subject, enrollment state, and account identifiers are required.'
      using errcode = '22023';
  end if;

  select child.family_id, child.is_active
  into selected_child_family_id, selected_child_active
  from public.child_profiles as child
  where child.id = p_child_profile_id
  for update;

  if selected_child_family_id is null
    or selected_child_family_id <> p_family_id
    or not selected_child_active
    or not (select private.is_family_member(p_family_id))
  then
    raise exception 'The active child is unavailable to this family.'
      using errcode = '42501';
  end if;

  if p_goal_id is not null then
    select goal.topic_id
    into selected_goal_topic_id
    from public.goals as goal
    where goal.id = p_goal_id;

    if selected_goal_topic_id is null
      or selected_goal_topic_id <> p_topic_id
    then
      raise exception 'The selected goal does not belong to this subject.'
        using errcode = 'P0002';
    end if;
  end if;

  if p_enrolled and not exists (
    select 1
    from public.topics as topic
    where topic.id = p_topic_id
      and topic.is_published
      and (
        p_goal_id is null
        or exists (
          select 1
          from public.goals as goal
          where goal.id = p_goal_id
            and goal.topic_id = topic.id
            and goal.is_published
        )
      )
  ) then
    raise exception 'The published subject or goal is unavailable.'
      using errcode = 'P0002';
  end if;

  select enrollment.*
  into existing_topic_enrollment
  from public.child_topic_enrollments as enrollment
  where enrollment.child_profile_id = p_child_profile_id
    and enrollment.topic_id = p_topic_id
  for update;

  if p_goal_id is null then
    if p_enrolled then
      if existing_topic_enrollment.id is null then
        insert into public.child_topic_enrollments (
          child_profile_id,
          topic_id,
          status,
          last_changed_by,
          joined_at,
          left_at
        ) values (
          p_child_profile_id,
          p_topic_id,
          'active',
          caller_id,
          now(),
          null
        )
        returning * into result_topic_enrollment;
        did_change := true;
      elsif existing_topic_enrollment.status = 'left' then
        update public.child_topic_enrollments as enrollment
        set status = 'active',
            last_changed_by = caller_id,
            joined_at = now(),
            left_at = null
        where enrollment.id = existing_topic_enrollment.id
        returning enrollment.* into result_topic_enrollment;
        did_change := true;
      else
        result_topic_enrollment := existing_topic_enrollment;
      end if;
    else
      if existing_topic_enrollment.status = 'active' then
        update public.child_topic_enrollments as enrollment
        set status = 'left',
            last_changed_by = caller_id,
            left_at = now()
        where enrollment.id = existing_topic_enrollment.id
        returning enrollment.* into result_topic_enrollment;
        did_change := true;
      else
        result_topic_enrollment := existing_topic_enrollment;
      end if;
    end if;
  else
    select child_goal.*
    into existing_child_goal
    from public.child_goals as child_goal
    where child_goal.child_profile_id = p_child_profile_id
      and child_goal.goal_id = p_goal_id
    for update;

    if p_enrolled then
      if existing_topic_enrollment.id is null then
        insert into public.child_topic_enrollments (
          child_profile_id,
          topic_id,
          status,
          last_changed_by,
          joined_at,
          left_at
        ) values (
          p_child_profile_id,
          p_topic_id,
          'active',
          caller_id,
          now(),
          null
        )
        returning * into result_topic_enrollment;
        did_change := true;
      elsif existing_topic_enrollment.status = 'left' then
        update public.child_topic_enrollments as enrollment
        set status = 'active',
            last_changed_by = caller_id,
            joined_at = now(),
            left_at = null
        where enrollment.id = existing_topic_enrollment.id
        returning enrollment.* into result_topic_enrollment;
        did_change := true;
      else
        result_topic_enrollment := existing_topic_enrollment;
      end if;

      if existing_child_goal.id is null then
        insert into public.child_goals (
          child_profile_id,
          goal_id,
          status,
          selected_by,
          selected_at,
          completed_at
        ) values (
          p_child_profile_id,
          p_goal_id,
          'active',
          caller_id,
          now(),
          null
        )
        returning * into result_child_goal;
        did_change := true;
      elsif existing_child_goal.status = 'archived' then
        update public.child_goals as child_goal
        set status = 'active',
            selected_by = caller_id,
            selected_at = now(),
            completed_at = null
        where child_goal.id = existing_child_goal.id
        returning child_goal.* into result_child_goal;
        did_change := true;
      else
        result_child_goal := existing_child_goal;
      end if;
    else
      result_topic_enrollment := existing_topic_enrollment;
      if existing_child_goal.id is not null
        and existing_child_goal.status <> 'archived'
      then
        update public.child_goals as child_goal
        set status = 'archived',
            completed_at = null
        where child_goal.id = existing_child_goal.id
        returning child_goal.* into result_child_goal;
        did_change := true;
      else
        result_child_goal := existing_child_goal;
      end if;
    end if;
  end if;

  -- The goal trigger may have created/reactivated the subject enrollment.
  select enrollment.*
  into result_topic_enrollment
  from public.child_topic_enrollments as enrollment
  where enrollment.child_profile_id = p_child_profile_id
    and enrollment.topic_id = p_topic_id;

  if p_goal_id is not null then
    select child_goal.*
    into result_child_goal
    from public.child_goals as child_goal
    where child_goal.child_profile_id = p_child_profile_id
      and child_goal.goal_id = p_goal_id;
  end if;

  return query select
    p_topic_id,
    coalesce(result_topic_enrollment.status = 'active', false),
    case
      when result_topic_enrollment.status = 'active'
      then result_topic_enrollment.joined_at
      else null
    end,
    p_goal_id,
    case
      when p_goal_id is null then null
      else coalesce(
        result_topic_enrollment.status = 'active'
        and result_child_goal.status <> 'archived',
        false
      )
    end,
    case
      when result_topic_enrollment.status = 'active'
        and result_child_goal.status <> 'archived'
      then result_child_goal.selected_at
      else null
    end,
    did_change;
end;
$$;

revoke all on function public.set_child_training_enrollment(
  uuid, uuid, uuid, uuid, boolean, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.set_child_training_enrollment(
  uuid, uuid, uuid, uuid, boolean, uuid
) to authenticated;

comment on function public.set_child_training_enrollment(
  uuid, uuid, uuid, uuid, boolean, uuid
) is
  'Lets the selected child join or leave a subject, or choose or remove one goal, using the family session only as authentication rather than an adult approval gate. Joining is limited to current published content; leaving preserves progress and prior subject goal choices.';

commit;
