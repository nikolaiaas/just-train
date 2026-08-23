begin;

-- Publication and permanent deletion are lifecycle transitions, not ordinary
-- editorial writes. Keep direct authenticated inserts limited to drafts, and
-- require the guarded security-definer functions below for every transition
-- that changes visibility or removes a topic-owned content tree.
drop policy "Admins can create topics" on public.topics;
drop policy "Admins can create goals" on public.goals;
drop policy "Admins can create exercises" on public.exercises;

create policy "Admins can create topics"
on public.topics for insert to authenticated
with check (
  (select private.is_admin())
  and created_by = (select auth.uid())
  and not is_published
  and published_at is null
);

create policy "Admins can create goals"
on public.goals for insert to authenticated
with check (
  (select private.is_admin())
  and created_by = (select auth.uid())
  and not is_published
  and published_at is null
);

create policy "Admins can create exercises"
on public.exercises for insert to authenticated
with check (
  (select private.is_admin())
  and created_by = (select auth.uid())
  and not is_published
  and published_at is null
);

drop policy "Admins can delete topics" on public.topics;
drop policy "Admins can delete goals" on public.goals;
drop policy "Admins can delete exercises" on public.exercises;

revoke update (is_published) on public.topics from authenticated;
revoke update (is_published) on public.goals from authenticated;
revoke update (is_published) on public.exercises from authenticated;
revoke delete on table
  public.topics,
  public.goals,
  public.exercises
from authenticated;

-- The lifecycle revision covers the complete mutable editorial tree. Without
-- this, a stale detail page could publish or delete after another editor had
-- changed a child goal, exercise, or wardrobe item without touching the root.
create function private.admin_topic_tree_updated_at(p_topic_id uuid)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select greatest(
    topic.updated_at,
    coalesce(
      (
        select max(goal.updated_at)
        from public.goals as goal
        where goal.topic_id = topic.id
      ),
      topic.updated_at
    ),
    coalesce(
      (
        select max(exercise.updated_at)
        from public.exercises as exercise
        join public.goals as goal on goal.id = exercise.goal_id
        where goal.topic_id = topic.id
      ),
      topic.updated_at
    ),
    coalesce(
      (
        select max(item.updated_at)
        from public.wardrobe_items as item
        where item.topic_id = topic.id
      ),
      topic.updated_at
    )
  )
  from public.topics as topic
  where topic.id = p_topic_id;
$$;

revoke all on function private.admin_topic_tree_updated_at(uuid)
  from public, anon, authenticated, service_role;

comment on function private.admin_topic_tree_updated_at(uuid) is
  'Returns the optimistic revision of a mutable topic and every owned editorial child.';

-- The private family app deliberately uses one mutable publication state,
-- rather than immutable content releases. Publishing makes the complete
-- current training tree visible in one transaction; only approved wardrobe
-- items are included.
create function public.publish_admin_topic(
  p_topic_id uuid,
  p_expected_updated_at timestamptz
)
returns table (
  id uuid,
  changed boolean,
  is_published boolean,
  published_at timestamptz,
  updated_at timestamptz,
  published_goal_count integer,
  published_exercise_count integer,
  published_wardrobe_item_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  selected_topic public.topics%rowtype;
  selected_goal_count integer;
  selected_exercise_count integer;
  selected_tree_updated_at timestamptz;
  changed_goal_count integer := 0;
  changed_exercise_count integer := 0;
  changed_wardrobe_item_count integer := 0;
begin
  if caller_id is null or not (select private.is_admin()) then
    raise exception using
      errcode = '42501',
      message = 'Administrator access is required.';
  end if;

  if p_topic_id is null or p_expected_updated_at is null then
    raise exception using
      errcode = '22023',
      message = 'A topic identifier and expected revision are required.';
  end if;

  select topic.*
    into selected_topic
  from public.topics as topic
  where topic.id = p_topic_id
  for update;

  if selected_topic.id is null then
    raise exception using
      errcode = 'P0002',
      message = 'The topic does not exist.';
  end if;

  perform goal.id
  from public.goals as goal
  where goal.topic_id = selected_topic.id
  order by goal.id
  for update;

  perform exercise.id
  from public.exercises as exercise
  join public.goals as goal on goal.id = exercise.goal_id
  where goal.topic_id = selected_topic.id
  order by exercise.id
  for update of exercise;

  perform item.id
  from public.wardrobe_items as item
  where item.topic_id = selected_topic.id
  order by item.id
  for update;

  select private.admin_topic_tree_updated_at(selected_topic.id)
    into selected_tree_updated_at;

  if selected_tree_updated_at is distinct from p_expected_updated_at then
    raise exception using
      errcode = '40001',
      message = 'The topic changed before it could be published.';
  end if;

  select count(*)::integer
    into selected_goal_count
  from public.goals as goal
  where goal.topic_id = selected_topic.id;

  select count(*)::integer
    into selected_exercise_count
  from public.exercises as exercise
  join public.goals as goal on goal.id = exercise.goal_id
  where goal.topic_id = selected_topic.id;

  if selected_goal_count = 0
    or selected_exercise_count = 0
    or exists (
      select 1
      from public.goals as goal
      where goal.topic_id = selected_topic.id
        and not exists (
          select 1
          from public.exercises as exercise
          where exercise.goal_id = goal.id
        )
    )
  then
    raise exception using
      errcode = '23514',
      message = 'Every topic goal needs at least one exercise before publication.';
  end if;

  update public.goals as goal
  set is_published = true
  where goal.topic_id = selected_topic.id
    and not goal.is_published;
  get diagnostics changed_goal_count = row_count;

  update public.exercises as exercise
  set is_published = true
  from public.goals as goal
  where goal.id = exercise.goal_id
    and goal.topic_id = selected_topic.id
    and not exercise.is_published;
  get diagnostics changed_exercise_count = row_count;

  update public.wardrobe_items as item
  set is_published = true
  where item.topic_id = selected_topic.id
    and item.editorial_status = 'approved'
    and not item.is_published;
  get diagnostics changed_wardrobe_item_count = row_count;

  if not selected_topic.is_published
    or changed_goal_count > 0
    or changed_exercise_count > 0
    or changed_wardrobe_item_count > 0
  then
    update public.topics as topic
    set is_published = true
    where topic.id = selected_topic.id
    returning topic.* into selected_topic;

    select private.admin_topic_tree_updated_at(selected_topic.id)
      into selected_tree_updated_at;

    return query
    select
      selected_topic.id,
      true,
      selected_topic.is_published,
      selected_topic.published_at,
      selected_tree_updated_at,
      changed_goal_count,
      changed_exercise_count,
      changed_wardrobe_item_count;
    return;
  end if;

  return query
  select
    selected_topic.id,
    false,
    selected_topic.is_published,
    selected_topic.published_at,
    selected_tree_updated_at,
    0,
    0,
    0;
end;
$$;

comment on function public.publish_admin_topic(uuid, timestamptz) is
  'Publishes one mutable topic tree for an administrator, including every goal and exercise plus approved wardrobe items.';

revoke all on function public.publish_admin_topic(uuid, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.publish_admin_topic(uuid, timestamptz)
  to authenticated;

-- Topic publication is the visibility boundary for its whole content tree.
-- Unpublishing only the root deliberately preserves each goal, exercise, and
-- wardrobe item's own reviewed publication state, so a later republish does
-- not silently rewrite editorial decisions.
create function public.unpublish_admin_topic(
  p_topic_id uuid,
  p_expected_updated_at timestamptz
)
returns table (
  id uuid,
  changed boolean,
  is_published boolean,
  published_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  selected_topic public.topics%rowtype;
  selected_tree_updated_at timestamptz;
begin
  if caller_id is null or not (select private.is_admin()) then
    raise exception using
      errcode = '42501',
      message = 'Administrator access is required.';
  end if;

  if p_topic_id is null or p_expected_updated_at is null then
    raise exception using
      errcode = '22023',
      message = 'A topic identifier and expected revision are required.';
  end if;

  select topic.*
    into selected_topic
  from public.topics as topic
  where topic.id = p_topic_id
  for update;

  if selected_topic.id is null then
    raise exception using
      errcode = 'P0002',
      message = 'The topic does not exist.';
  end if;

  -- A retry after a successful but interrupted response is a safe no-op even
  -- though the first call advanced updated_at.
  if not selected_topic.is_published then
    select private.admin_topic_tree_updated_at(selected_topic.id)
      into selected_tree_updated_at;

    return query
    select
      selected_topic.id,
      false,
      selected_topic.is_published,
      selected_topic.published_at,
      selected_tree_updated_at;
    return;
  end if;

  perform goal.id
  from public.goals as goal
  where goal.topic_id = selected_topic.id
  order by goal.id
  for update;

  perform exercise.id
  from public.exercises as exercise
  join public.goals as goal on goal.id = exercise.goal_id
  where goal.topic_id = selected_topic.id
  order by exercise.id
  for update of exercise;

  perform item.id
  from public.wardrobe_items as item
  where item.topic_id = selected_topic.id
  order by item.id
  for update;

  select private.admin_topic_tree_updated_at(selected_topic.id)
    into selected_tree_updated_at;

  if selected_tree_updated_at is distinct from p_expected_updated_at then
    raise exception using
      errcode = '40001',
      message = 'The topic changed before it could be unpublished.';
  end if;

  update public.topics as topic
  set is_published = false
  where topic.id = selected_topic.id
  returning topic.* into selected_topic;

  select private.admin_topic_tree_updated_at(selected_topic.id)
    into selected_tree_updated_at;

  return query
  select
    selected_topic.id,
    true,
    selected_topic.is_published,
    selected_topic.published_at,
    selected_tree_updated_at;
end;
$$;

comment on function public.unpublish_admin_topic(uuid, timestamptz) is
  'Optimistically unpublishes one topic for an administrator while preserving child content review/publication states. An already-unpublished retry is a no-op.';

revoke all on function public.unpublish_admin_topic(uuid, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.unpublish_admin_topic(uuid, timestamptz)
  to authenticated;

-- Permanent topic deletion is intentionally a separate operation. It removes
-- the topic-owned editorial tree through the existing ON DELETE CASCADE keys,
-- but never destroys a family's enrolment, attempt, or progress history.
create function public.delete_admin_topic(
  p_topic_id uuid,
  p_expected_updated_at timestamptz
)
returns table (
  id uuid,
  deleted_goal_count integer,
  deleted_exercise_count integer,
  deleted_wardrobe_item_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  selected_topic public.topics%rowtype;
  selected_goal_count integer;
  selected_exercise_count integer;
  selected_wardrobe_item_count integer;
  selected_tree_updated_at timestamptz;
  has_child_wardrobe_items boolean := false;
begin
  if caller_id is null or not (select private.is_admin()) then
    raise exception using
      errcode = '42501',
      message = 'Administrator access is required.';
  end if;

  if p_topic_id is null or p_expected_updated_at is null then
    raise exception using
      errcode = '22023',
      message = 'A topic identifier and expected revision are required.';
  end if;

  select topic.*
    into selected_topic
  from public.topics as topic
  where topic.id = p_topic_id
  for update;

  if selected_topic.id is null then
    raise exception using
      errcode = 'P0002',
      message = 'The topic does not exist.';
  end if;

  if selected_topic.is_published then
    raise exception using
      errcode = '55000',
      message = 'The topic must be unpublished before it can be deleted.';
  end if;

  -- Lock the complete set of goals before checking usage. This cooperates with
  -- the foreign keys and makes a concurrent child enrolment serialize with the
  -- destructive operation instead of slipping between the check and delete.
  perform goal.id
  from public.goals as goal
  where goal.topic_id = selected_topic.id
  order by goal.id
  for update;

  perform exercise.id
  from public.exercises as exercise
  join public.goals as goal on goal.id = exercise.goal_id
  where goal.topic_id = selected_topic.id
  order by exercise.id
  for update of exercise;

  perform item.id
  from public.wardrobe_items as item
  where item.topic_id = selected_topic.id
  order by item.id
  for update;

  select private.admin_topic_tree_updated_at(selected_topic.id)
    into selected_tree_updated_at;

  if selected_tree_updated_at is distinct from p_expected_updated_at then
    raise exception using
      errcode = '40001',
      message = 'The topic changed before it could be deleted.';
  end if;

  -- The child inventory table is introduced by a later additive migration in
  -- the same release. Resolve it conditionally so this lifecycle migration is
  -- independently deployable, while preserving owned items once that table is
  -- available.
  if to_regclass('public.child_wardrobe_items') is not null then
    execute $query$
      select exists (
        select 1
        from public.child_wardrobe_items as inventory
        join public.wardrobe_items as item
          on item.id = inventory.wardrobe_item_id
        where item.topic_id = $1
      )
    $query$
    into has_child_wardrobe_items
    using selected_topic.id;
  end if;

  if has_child_wardrobe_items or exists (
    select 1
    from public.child_goals as child_goal
    join public.goals as goal on goal.id = child_goal.goal_id
    where goal.topic_id = selected_topic.id
  ) or exists (
    select 1
    from public.exercise_attempts as attempt
    join public.exercises as exercise on exercise.id = attempt.exercise_id
    join public.goals as goal on goal.id = exercise.goal_id
    where goal.topic_id = selected_topic.id
  ) or exists (
    select 1
    from public.child_exercise_progress as progress
    join public.exercises as exercise on exercise.id = progress.exercise_id
    join public.goals as goal on goal.id = exercise.goal_id
    where goal.topic_id = selected_topic.id
  ) then
    raise exception using
      errcode = '23503',
      message = 'The topic has child activity and cannot be deleted. Keep it unpublished instead.';
  end if;

  select count(*)::integer
    into selected_goal_count
  from public.goals as goal
  where goal.topic_id = selected_topic.id;

  select count(*)::integer
    into selected_exercise_count
  from public.exercises as exercise
  join public.goals as goal on goal.id = exercise.goal_id
  where goal.topic_id = selected_topic.id;

  select count(*)::integer
    into selected_wardrobe_item_count
  from public.wardrobe_items as item
  where item.topic_id = selected_topic.id;

  delete from public.topics as topic
  where topic.id = selected_topic.id;

  return query
  select
    selected_topic.id,
    selected_goal_count,
    selected_exercise_count,
    selected_wardrobe_item_count;
end;
$$;

comment on function public.delete_admin_topic(uuid, timestamptz) is
  'Optimistically deletes one unpublished topic and its topic-owned goals, exercises, and wardrobe items, while refusing to delete family activity.';

revoke all on function public.delete_admin_topic(uuid, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.delete_admin_topic(uuid, timestamptz)
  to authenticated;

commit;
