begin;

-- Published wardrobe rows remain the canonical child-visible version. Edits
-- are staged separately until an administrator approves them and republishes
-- the topic, so a partially edited hat or pair of shoes never leaks into play.
create table private.wardrobe_item_revisions (
  wardrobe_item_id uuid primary key
    references public.wardrobe_items (id) on delete cascade,
  name text not null,
  icon text not null,
  category public.wardrobe_item_category not null,
  equip_slot public.wardrobe_equip_slot not null,
  rarity public.wardrobe_item_rarity not null,
  points integer,
  unlock_rule text,
  editorial_note text,
  editorial_status public.wardrobe_editorial_status not null default 'draft',
  sort_order integer not null check (sort_order >= 0),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wardrobe_item_revisions_name_is_bounded check (
    name = btrim(name)
    and char_length(name) between 1 and 80
    and name !~ '[[:cntrl:]]'
  ),
  constraint wardrobe_item_revisions_icon_is_bounded check (
    icon = btrim(icon)
    and char_length(icon) between 1 and 16
    and icon !~ '[[:cntrl:]]'
  ),
  constraint wardrobe_item_revisions_points_are_bounded check (
    points is null or points between 1 and 1000
  ),
  constraint wardrobe_item_revisions_unlock_rule_is_bounded check (
    unlock_rule is null
    or (
      unlock_rule = btrim(unlock_rule, E' \t\n\r')
      and char_length(unlock_rule) between 1 and 200
      and position(E'\r' in unlock_rule) = 0
      and translate(unlock_rule, E'\n\r\t', '') !~ '[[:cntrl:]]'
    )
  ),
  constraint wardrobe_item_revisions_unlock_method_is_exclusive check (
    (points is not null and unlock_rule is null)
    or (points is null and unlock_rule is not null)
  ),
  constraint wardrobe_item_revisions_editorial_note_is_bounded check (
    editorial_note is null
    or (
      editorial_note = btrim(editorial_note, E' \t\n\r')
      and char_length(editorial_note) between 1 and 500
      and position(E'\r' in editorial_note) = 0
      and translate(editorial_note, E'\n\r\t', '') !~ '[[:cntrl:]]'
    )
  )
);

comment on table private.wardrobe_item_revisions is
  'One administrator-visible pending revision for a published wardrobe item; canonical child-visible content is unchanged until topic publication.';

create trigger wardrobe_item_revisions_set_updated_at
before update on private.wardrobe_item_revisions
for each row execute function private.set_updated_at();

revoke all on table private.wardrobe_item_revisions
  from public, anon, authenticated, service_role;

-- A published row may only change through the trusted publication operation,
-- which advances its version by exactly one and leaves it approved and live.
create or replace function private.guard_wardrobe_item_review_state()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  content_changed boolean :=
    new.name is distinct from old.name
    or new.icon is distinct from old.icon
    or new.category is distinct from old.category
    or new.equip_slot is distinct from old.equip_slot
    or new.rarity is distinct from old.rarity
    or new.points is distinct from old.points
    or new.unlock_rule is distinct from old.unlock_rule
    or new.editorial_note is distinct from old.editorial_note
    or new.sort_order is distinct from old.sort_order;
  protected_metadata_changed boolean :=
    new.topic_id is distinct from old.topic_id
    or new.editorial_status is distinct from old.editorial_status
    or new.content_version is distinct from old.content_version
    or new.is_published is distinct from old.is_published
    or new.published_at is distinct from old.published_at
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at;
begin
  if old.is_published then
    if content_changed
      and new.topic_id is not distinct from old.topic_id
      and new.is_published
      and new.published_at is not distinct from old.published_at
      and new.editorial_status = 'approved'
      and new.content_version = old.content_version + 1
      and new.created_by is not distinct from old.created_by
      and new.created_at is not distinct from old.created_at
    then
      return new;
    end if;

    if content_changed or protected_metadata_changed then
      raise exception using
        errcode = '23514',
        message = 'Published wardrobe items are immutable.';
    end if;
  elsif not old.is_published and content_changed then
    new.editorial_status := 'draft';
  end if;

  return new;
end;
$$;

comment on function private.guard_wardrobe_item_review_state() is
  'Returns changed unpublished content to draft and permits a published replacement only as one approved version increment.';

-- Publication may synchronize the slot snapshot only after the canonical
-- catalog row has changed. The revised item is unequipped first, preserving
-- the child''s existing choice in any newly occupied exclusive slot.
create or replace function private.validate_child_wardrobe_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  catalog_slot public.wardrobe_equip_slot;
begin
  if tg_op = 'UPDATE'
    and (
      new.child_profile_id is distinct from old.child_profile_id
      or new.wardrobe_item_id is distinct from old.wardrobe_item_id
      or new.acquired_at is distinct from old.acquired_at
    )
  then
    raise exception using
      errcode = '23514',
      message = 'Wardrobe inventory lineage is immutable.';
  end if;

  if tg_op = 'INSERT' then
    select item.equip_slot
    into catalog_slot
    from public.wardrobe_items as item
    join public.topics as topic on topic.id = item.topic_id
    where item.id = new.wardrobe_item_id
      and item.is_published
      and item.editorial_status = 'approved'
      and topic.is_published;

    if catalog_slot is null then
      raise exception using
        errcode = '23514',
        message = 'A child can only own an approved published wardrobe item from a published topic.';
    end if;
  elsif new.equip_slot is distinct from old.equip_slot then
    select item.equip_slot
    into catalog_slot
    from public.wardrobe_items as item
    where item.id = new.wardrobe_item_id;

    if catalog_slot is null or new.equip_slot is distinct from catalog_slot then
      raise exception using
        errcode = '23514',
        message = 'Wardrobe inventory slots must match the published catalog.';
    end if;

    new.is_equipped := false;
    new.equipped_at := null;
  else
    catalog_slot := old.equip_slot;
  end if;

  new.equip_slot := catalog_slot;

  if tg_op = 'INSERT' then
    new.is_equipped := false;
    new.equipped_at := null;
  elsif new.is_equipped then
    new.equipped_at := coalesce(new.equipped_at, now());
  else
    new.equipped_at := null;
  end if;

  return new;
end;
$$;

comment on function private.validate_child_wardrobe_item() is
  'Pins grants to published catalog slots, permits trusted publication synchronization, and keeps equipment timestamps database-owned.';

drop function public.list_admin_wardrobe_item_drafts(uuid, uuid);

create function public.list_admin_wardrobe_item_drafts(
  p_topic_id uuid,
  p_wardrobe_item_id uuid default null
)
returns table (
  id uuid,
  topic_id uuid,
  name text,
  icon text,
  category public.wardrobe_item_category,
  equip_slot public.wardrobe_equip_slot,
  rarity public.wardrobe_item_rarity,
  points integer,
  unlock_rule text,
  editorial_note text,
  editorial_status public.wardrobe_editorial_status,
  sort_order integer,
  content_version integer,
  is_published boolean,
  published_at timestamptz,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  has_pending_revision boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not (select private.is_admin()) then
    raise exception using
      errcode = '42501',
      message = 'Administrator access is required.';
  end if;

  if p_topic_id is null then
    raise exception using
      errcode = '22023',
      message = 'A topic identifier is required.';
  end if;

  return query
  select
    item.id,
    item.topic_id,
    coalesce(revision.name, item.name),
    coalesce(revision.icon, item.icon),
    coalesce(revision.category, item.category),
    coalesce(revision.equip_slot, item.equip_slot),
    coalesce(revision.rarity, item.rarity),
    case when revision.wardrobe_item_id is null
      then item.points else revision.points end,
    case when revision.wardrobe_item_id is null
      then item.unlock_rule else revision.unlock_rule end,
    case when revision.wardrobe_item_id is null
      then item.editorial_note else revision.editorial_note end,
    coalesce(revision.editorial_status, item.editorial_status),
    coalesce(revision.sort_order, item.sort_order),
    item.content_version,
    item.is_published,
    item.published_at,
    item.created_by,
    item.created_at,
    coalesce(revision.updated_at, item.updated_at),
    revision.wardrobe_item_id is not null
  from public.wardrobe_items as item
  left join private.wardrobe_item_revisions as revision
    on revision.wardrobe_item_id = item.id
  where item.topic_id = p_topic_id
    and (
      p_wardrobe_item_id is null
      or item.id = p_wardrobe_item_id
    )
  order by coalesce(revision.sort_order, item.sort_order), item.id;
end;
$$;

comment on function public.list_admin_wardrobe_item_drafts(uuid, uuid) is
  'Lists every wardrobe item for an administrator, overlaying a pending published-item revision without exposing it to child-facing catalog readers.';

revoke all on function public.list_admin_wardrobe_item_drafts(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.list_admin_wardrobe_item_drafts(uuid, uuid)
  to authenticated;

create function public.save_admin_wardrobe_item_draft(
  p_wardrobe_item_id uuid,
  p_topic_id uuid,
  p_expected_updated_at timestamptz,
  p_name text,
  p_icon text,
  p_category public.wardrobe_item_category,
  p_equip_slot public.wardrobe_equip_slot,
  p_rarity public.wardrobe_item_rarity,
  p_points integer,
  p_unlock_rule text,
  p_editorial_note text,
  p_sort_order integer
)
returns table (id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  selected_item public.wardrobe_items%rowtype;
  selected_revision private.wardrobe_item_revisions%rowtype;
  selected_updated_at timestamptz;
begin
  if caller_id is null or not (select private.is_admin()) then
    raise exception using
      errcode = '42501',
      message = 'Administrator access is required.';
  end if;

  if p_wardrobe_item_id is null
    or p_topic_id is null
    or p_expected_updated_at is null
  then
    raise exception using
      errcode = '22023',
      message = 'Wardrobe item, topic, and expected revision are required.';
  end if;

  select item.*
  into selected_item
  from public.wardrobe_items as item
  where item.id = p_wardrobe_item_id
    and item.topic_id = p_topic_id
  for update;

  if selected_item.id is null then
    raise exception using
      errcode = 'P0002',
      message = 'The wardrobe item does not exist.';
  end if;

  select revision.*
  into selected_revision
  from private.wardrobe_item_revisions as revision
  where revision.wardrobe_item_id = selected_item.id
  for update;

  selected_updated_at := coalesce(
    selected_revision.updated_at,
    selected_item.updated_at
  );

  if selected_updated_at is distinct from p_expected_updated_at then
    raise exception using
      errcode = '40001',
      message = 'The wardrobe item changed before it could be saved.';
  end if;

  if selected_item.is_published then
    insert into private.wardrobe_item_revisions (
      wardrobe_item_id,
      name,
      icon,
      category,
      equip_slot,
      rarity,
      points,
      unlock_rule,
      editorial_note,
      editorial_status,
      sort_order,
      created_by
    )
    values (
      selected_item.id,
      p_name,
      p_icon,
      p_category,
      p_equip_slot,
      p_rarity,
      p_points,
      p_unlock_rule,
      p_editorial_note,
      'draft',
      p_sort_order,
      caller_id
    )
    on conflict (wardrobe_item_id) do update
    set name = excluded.name,
        icon = excluded.icon,
        category = excluded.category,
        equip_slot = excluded.equip_slot,
        rarity = excluded.rarity,
        points = excluded.points,
        unlock_rule = excluded.unlock_rule,
        editorial_note = excluded.editorial_note,
        editorial_status = 'draft',
        sort_order = excluded.sort_order,
        created_by = caller_id;
  else
    update public.wardrobe_items as item
    set name = p_name,
        icon = p_icon,
        category = p_category,
        equip_slot = p_equip_slot,
        rarity = p_rarity,
        points = p_points,
        unlock_rule = p_unlock_rule,
        editorial_note = p_editorial_note,
        sort_order = p_sort_order
    where item.id = selected_item.id;
  end if;

  return query select selected_item.id;
end;
$$;

comment on function public.save_admin_wardrobe_item_draft(
  uuid,
  uuid,
  timestamptz,
  text,
  text,
  public.wardrobe_item_category,
  public.wardrobe_equip_slot,
  public.wardrobe_item_rarity,
  integer,
  text,
  text,
  integer
) is
  'Saves an unpublished item directly or stages a published-item revision while its approved canonical content remains live.';

revoke all on function public.save_admin_wardrobe_item_draft(
  uuid,
  uuid,
  timestamptz,
  text,
  text,
  public.wardrobe_item_category,
  public.wardrobe_equip_slot,
  public.wardrobe_item_rarity,
  integer,
  text,
  text,
  integer
) from public, anon, authenticated, service_role;
grant execute on function public.save_admin_wardrobe_item_draft(
  uuid,
  uuid,
  timestamptz,
  text,
  text,
  public.wardrobe_item_category,
  public.wardrobe_equip_slot,
  public.wardrobe_item_rarity,
  integer,
  text,
  text,
  integer
) to authenticated;

create function public.decide_admin_wardrobe_item_draft(
  p_wardrobe_item_id uuid,
  p_topic_id uuid,
  p_expected_updated_at timestamptz,
  p_decision public.wardrobe_editorial_status
)
returns table (id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  selected_item public.wardrobe_items%rowtype;
  selected_revision private.wardrobe_item_revisions%rowtype;
begin
  if caller_id is null or not (select private.is_admin()) then
    raise exception using
      errcode = '42501',
      message = 'Administrator access is required.';
  end if;

  if p_wardrobe_item_id is null
    or p_topic_id is null
    or p_expected_updated_at is null
    or p_decision not in ('approved', 'rejected')
  then
    raise exception using
      errcode = '22023',
      message = 'Wardrobe item, topic, expected revision, and review decision are required.';
  end if;

  select item.*
  into selected_item
  from public.wardrobe_items as item
  where item.id = p_wardrobe_item_id
    and item.topic_id = p_topic_id
  for update;

  if selected_item.id is null then
    raise exception using
      errcode = 'P0002',
      message = 'The wardrobe item does not exist.';
  end if;

  select revision.*
  into selected_revision
  from private.wardrobe_item_revisions as revision
  where revision.wardrobe_item_id = selected_item.id
  for update;

  if selected_item.is_published then
    if selected_revision.wardrobe_item_id is null then
      raise exception using
        errcode = '23514',
        message = 'A published wardrobe item needs a pending revision before review.';
    end if;

    if selected_revision.updated_at is distinct from p_expected_updated_at then
      raise exception using
        errcode = '40001',
        message = 'The wardrobe item changed before it could be reviewed.';
    end if;

    update private.wardrobe_item_revisions as revision
    set editorial_status = p_decision
    where revision.wardrobe_item_id = selected_item.id;
  else
    if selected_item.updated_at is distinct from p_expected_updated_at then
      raise exception using
        errcode = '40001',
        message = 'The wardrobe item changed before it could be reviewed.';
    end if;

    update public.wardrobe_items as item
    set editorial_status = p_decision
    where item.id = selected_item.id;
  end if;

  return query select selected_item.id;
end;
$$;

comment on function public.decide_admin_wardrobe_item_draft(
  uuid,
  uuid,
  timestamptz,
  public.wardrobe_editorial_status
) is
  'Reviews an unpublished wardrobe item or a staged published-item revision without changing live catalog content.';

revoke all on function public.decide_admin_wardrobe_item_draft(
  uuid,
  uuid,
  timestamptz,
  public.wardrobe_editorial_status
) from public, anon, authenticated, service_role;
grant execute on function public.decide_admin_wardrobe_item_draft(
  uuid,
  uuid,
  timestamptz,
  public.wardrobe_editorial_status
) to authenticated;

create or replace function private.admin_topic_tree_updated_at(p_topic_id uuid)
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
    ),
    coalesce(
      (
        select max(revision.updated_at)
        from private.wardrobe_item_revisions as revision
        join public.wardrobe_items as item
          on item.id = revision.wardrobe_item_id
        where item.topic_id = topic.id
      ),
      topic.updated_at
    )
  )
  from public.topics as topic
  where topic.id = p_topic_id;
$$;

comment on function private.admin_topic_tree_updated_at(uuid) is
  'Returns the optimistic revision of a mutable topic, its editorial children, and staged wardrobe revisions.';

create or replace function public.publish_admin_topic(
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
  approved_revision_count integer := 0;
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

  perform revision.wardrobe_item_id
  from private.wardrobe_item_revisions as revision
  join public.wardrobe_items as item
    on item.id = revision.wardrobe_item_id
  where item.topic_id = selected_topic.id
  order by revision.wardrobe_item_id
  for update of revision;

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

  select count(*)::integer
  into approved_revision_count
  from private.wardrobe_item_revisions as revision
  join public.wardrobe_items as item
    on item.id = revision.wardrobe_item_id
  where item.topic_id = selected_topic.id
    and item.is_published
    and revision.editorial_status = 'approved';

  if approved_revision_count > 0 then
    update public.wardrobe_items as item
    set name = revision.name,
        icon = revision.icon,
        category = revision.category,
        equip_slot = revision.equip_slot,
        rarity = revision.rarity,
        points = revision.points,
        unlock_rule = revision.unlock_rule,
        editorial_note = revision.editorial_note,
        editorial_status = 'approved',
        sort_order = revision.sort_order,
        content_version = item.content_version + 1
    from private.wardrobe_item_revisions as revision
    where revision.wardrobe_item_id = item.id
      and item.topic_id = selected_topic.id
      and item.is_published
      and revision.editorial_status = 'approved';

    update public.child_wardrobe_items as inventory
    set equip_slot = item.equip_slot,
        is_equipped = false,
        equipped_at = null
    from public.wardrobe_items as item
    join private.wardrobe_item_revisions as revision
      on revision.wardrobe_item_id = item.id
      and revision.editorial_status = 'approved'
    where inventory.wardrobe_item_id = item.id
      and item.topic_id = selected_topic.id
      and inventory.equip_slot is distinct from item.equip_slot;

    delete from private.wardrobe_item_revisions as revision
    using public.wardrobe_items as item
    where item.id = revision.wardrobe_item_id
      and item.topic_id = selected_topic.id
      and revision.editorial_status = 'approved';

    changed_wardrobe_item_count :=
      changed_wardrobe_item_count + approved_revision_count;
  end if;

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
  'Publishes one mutable topic tree and atomically promotes approved staged wardrobe revisions while preserving unreviewed live content.';

revoke all on function public.publish_admin_topic(uuid, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.publish_admin_topic(uuid, timestamptz)
  to authenticated;

commit;
