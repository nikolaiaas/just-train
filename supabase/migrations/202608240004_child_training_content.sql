begin;

-- Older clients can continue writing attempts without a request id. New
-- clients use this nullable lineage to make the guarded completion RPC safe to
-- retry after a timeout or app restart.
alter table public.exercise_attempts
add column client_request_id uuid;

create unique index exercise_attempts_recorder_request_idx
on public.exercise_attempts (recorded_by, client_request_id)
where client_request_id is not null;

comment on column public.exercise_attempts.client_request_id is
  'Optional client-generated UUID used by guarded training writes for retry-safe completion. Legacy attempt writers remain compatible.';

-- Return the current mutable publication tree as flat ordered rows. The API
-- client reconstructs the subject -> goal -> exercise hierarchy and computes
-- goal, subject, and overall summaries without introducing another stored
-- aggregate that could drift from child_exercise_progress.
create function public.list_child_training_content(
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
  goal_id uuid,
  goal_slug text,
  goal_title text,
  goal_summary text,
  goal_difficulty public.exercise_difficulty,
  goal_estimated_minutes smallint,
  goal_equipment text[],
  goal_hero_media_url text,
  goal_sort_order integer,
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
    goal.id,
    goal.slug,
    goal.title,
    goal.summary,
    goal.difficulty,
    goal.estimated_minutes,
    goal.equipment,
    goal.hero_media_url,
    goal.sort_order,
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
  left join public.goals as goal
    on goal.topic_id = topic.id
    and goal.is_published
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

revoke all on function public.list_child_training_content(
  uuid, uuid, uuid, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.list_child_training_content(
  uuid, uuid, uuid, uuid
) to authenticated;

comment on function public.list_child_training_content(
  uuid, uuid, uuid, uuid
) is
  'Lists the ordered published training tree and preserved exercise progress for one active child. An unpublished topic is immediately absent without deleting family progress.';

-- One explicit completion creates or reactivates the child goal, records one
-- completed session and attempt, and lets the existing trigger refresh the
-- durable progress read model. The advisory lock and unique index make a
-- repeated client request return the original result rather than train twice.
create function public.complete_child_training_exercise(
  p_family_id uuid,
  p_child_profile_id uuid,
  p_topic_id uuid,
  p_goal_id uuid,
  p_exercise_id uuid,
  p_client_request_id uuid,
  p_expected_user_id uuid,
  p_repetitions integer default null,
  p_duration_ms integer default null,
  p_perceived_difficulty smallint default null
)
returns table (
  attempt_id uuid,
  session_id uuid,
  child_profile_id uuid,
  topic_id uuid,
  goal_id uuid,
  exercise_id uuid,
  created boolean,
  completed_at timestamptz,
  repetitions integer,
  duration_ms integer,
  perceived_difficulty smallint,
  attempts_count integer,
  completed_count integer,
  best_repetitions integer,
  best_duration_ms integer,
  progress_state public.progress_state,
  last_attempted_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  selected_child_family_id uuid;
  selected_child_active boolean;
  selected_topic_id uuid;
  selected_goal_id uuid;
  selected_measurement public.exercise_measurement;
  selected_target_value integer;
  selected_child_goal_id uuid;
  selected_session_id uuid;
  selected_attempt_id uuid;
  selected_completed_at timestamptz;
  recorded_repetitions integer;
  recorded_duration_ms integer;
  existing record;
begin
  if caller_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if caller_id is distinct from p_expected_user_id then
    raise exception 'The authenticated account changed before training was saved.'
      using errcode = '28000';
  end if;

  if p_family_id is null
    or p_child_profile_id is null
    or p_topic_id is null
    or p_goal_id is null
    or p_exercise_id is null
    or p_client_request_id is null
  then
    raise exception 'Family, child, topic, goal, exercise, and request identifiers are required.'
      using errcode = '22023';
  end if;

  if p_client_request_id = '00000000-0000-0000-0000-000000000000'::uuid then
    raise exception 'The request identifier cannot be the nil UUID.'
      using errcode = '22023';
  end if;

  if p_perceived_difficulty is not null
    and p_perceived_difficulty not between 1 and 5
  then
    raise exception 'Perceived difficulty must be between 1 and 5.'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      caller_id::text || ':' || p_client_request_id::text,
      0
    )
  );

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

  select
    attempt.id as attempt_id,
    session.id as session_id,
    child_goal.child_profile_id,
    topic.id as topic_id,
    child_goal.goal_id,
    attempt.exercise_id,
    attempt.occurred_at as completed_at,
    attempt.repetitions,
    attempt.duration_ms,
    attempt.perceived_difficulty
  into existing
  from public.exercise_attempts as attempt
  join public.exercise_sessions as session on session.id = attempt.session_id
  join public.child_goals as child_goal on child_goal.id = session.child_goal_id
  join public.goals as goal on goal.id = child_goal.goal_id
  join public.topics as topic on topic.id = goal.topic_id
  join public.child_profiles as child on child.id = child_goal.child_profile_id
  where attempt.recorded_by = caller_id
    and attempt.client_request_id = p_client_request_id;

  if existing.attempt_id is not null then
    if existing.child_profile_id <> p_child_profile_id
      or existing.topic_id <> p_topic_id
      or existing.goal_id <> p_goal_id
      or existing.exercise_id <> p_exercise_id
      or existing.repetitions is distinct from p_repetitions
      or existing.duration_ms is distinct from p_duration_ms
      or existing.perceived_difficulty is distinct from p_perceived_difficulty
      or not exists (
        select 1
        from public.child_profiles as child
        where child.id = existing.child_profile_id
          and child.family_id = p_family_id
      )
    then
      raise exception 'The request identifier is already used for another training completion.'
        using errcode = '22023';
    end if;

    return query
    select
      existing.attempt_id,
      existing.session_id,
      existing.child_profile_id,
      existing.topic_id,
      existing.goal_id,
      existing.exercise_id,
      false,
      existing.completed_at,
      existing.repetitions,
      existing.duration_ms,
      existing.perceived_difficulty,
      progress.attempts_count,
      progress.completed_count,
      progress.best_repetitions,
      progress.best_duration_ms,
      progress.state,
      progress.last_attempted_at
    from public.child_exercise_progress as progress
    where progress.child_profile_id = existing.child_profile_id
      and progress.exercise_id = existing.exercise_id;
    return;
  end if;

  select
    topic.id,
    goal.id,
    exercise.measurement,
    exercise.target_value
  into
    selected_topic_id,
    selected_goal_id,
    selected_measurement,
    selected_target_value
  from public.exercises as exercise
  join public.goals as goal on goal.id = exercise.goal_id
  join public.topics as topic on topic.id = goal.topic_id
  where exercise.id = p_exercise_id
    and goal.id = p_goal_id
    and topic.id = p_topic_id
    and exercise.is_published
    and goal.is_published
    and topic.is_published;

  if selected_goal_id is null then
    raise exception 'The published exercise is unavailable.'
      using errcode = 'P0002';
  end if;

  if selected_measurement = 'completion' then
    if selected_target_value is not null then
      raise exception 'The published completion exercise has an invalid target.'
        using errcode = 'P0002';
    end if;
    if p_repetitions is not null or p_duration_ms is not null then
      raise exception 'A completion exercise does not accept a measured result.'
        using errcode = '22023';
    end if;
  elsif selected_measurement = 'repetitions' then
    if p_duration_ms is not null then
      raise exception 'A repetition exercise does not accept a duration.'
        using errcode = '22023';
    end if;
    if selected_target_value is null
      or selected_target_value not between 1 and 10000
    then
      raise exception 'The published exercise has an invalid repetition target.'
        using errcode = 'P0002';
    end if;
    if p_repetitions is null then
      raise exception 'A repetition result is required to complete this exercise.'
        using errcode = '22023';
    end if;
    recorded_repetitions := p_repetitions;
    if recorded_repetitions < selected_target_value then
      raise exception 'A completed repetition result must meet its target.'
        using errcode = '22023';
    end if;
  elsif selected_measurement = 'duration' then
    if p_repetitions is not null then
      raise exception 'A duration exercise does not accept repetitions.'
        using errcode = '22023';
    end if;
    if selected_target_value is null
      or selected_target_value not between 1 and 86400
    then
      raise exception 'The published exercise has an invalid duration target.'
        using errcode = 'P0002';
    end if;
    if p_duration_ms is null then
      raise exception 'A duration result is required to complete this exercise.'
        using errcode = '22023';
    end if;
    recorded_duration_ms := p_duration_ms;
    if recorded_duration_ms < selected_target_value * 1000 then
      raise exception 'A completed duration result must meet its target.'
        using errcode = '22023';
    end if;
  end if;

  insert into public.child_goals as saved_child_goal (
    child_profile_id,
    goal_id,
    status,
    selected_by,
    selected_at,
    completed_at
  )
  values (
    p_child_profile_id,
    selected_goal_id,
    'active',
    caller_id,
    now(),
    null
  )
  on conflict on constraint child_goals_child_profile_id_goal_id_key do update
  set status = excluded.status,
      completed_at = excluded.completed_at
  returning saved_child_goal.id into selected_child_goal_id;

  insert into public.exercise_sessions as saved_session (
    child_goal_id,
    started_by,
    status,
    started_at
  )
  values (
    selected_child_goal_id,
    caller_id,
    'in_progress',
    now()
  )
  returning saved_session.id into selected_session_id;

  insert into public.exercise_attempts as saved_attempt (
    session_id,
    exercise_id,
    client_request_id,
    attempt_number,
    outcome,
    repetitions,
    duration_ms,
    perceived_difficulty,
    recorded_by,
    occurred_at
  )
  values (
    selected_session_id,
    p_exercise_id,
    p_client_request_id,
    1,
    'completed',
    recorded_repetitions,
    recorded_duration_ms,
    p_perceived_difficulty,
    caller_id,
    now()
  )
  returning saved_attempt.id, saved_attempt.occurred_at
  into selected_attempt_id, selected_completed_at;

  update public.exercise_sessions as session
  set status = 'completed',
      ended_at = selected_completed_at
  where session.id = selected_session_id;

  return query
  select
    selected_attempt_id,
    selected_session_id,
    p_child_profile_id,
    selected_topic_id,
    selected_goal_id,
    p_exercise_id,
    true,
    selected_completed_at,
    recorded_repetitions,
    recorded_duration_ms,
    p_perceived_difficulty,
    progress.attempts_count,
    progress.completed_count,
    progress.best_repetitions,
    progress.best_duration_ms,
    progress.state,
    progress.last_attempted_at
  from public.child_exercise_progress as progress
  where progress.child_profile_id = p_child_profile_id
    and progress.exercise_id = p_exercise_id;
end;
$$;

revoke all on function public.complete_child_training_exercise(
  uuid, uuid, uuid, uuid, uuid, uuid, uuid, integer, integer, smallint
) from public, anon, authenticated, service_role;
grant execute on function public.complete_child_training_exercise(
  uuid, uuid, uuid, uuid, uuid, uuid, uuid, integer, integer, smallint
) to authenticated;

comment on function public.complete_child_training_exercise(
  uuid, uuid, uuid, uuid, uuid, uuid, uuid, integer, integer, smallint
) is
  'Retry-safely records one completed exercise and closes its session in the same transaction for an authenticated member of the selected active child family.';

commit;
