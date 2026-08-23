begin;

-- Wardrobe art is synthetic, shared catalogue content rather than family
-- media. Keep it in a dedicated public-read bucket while reserving every
-- write for trusted worker code using the service role.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'wardrobe-images',
  'wardrobe-images',
  true,
  16777216,
  array['image/png']::text[]
)
on conflict (id) do update
set name = excluded.name,
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "Anyone can read public wardrobe images"
on storage.objects for select to public
using (bucket_id = 'wardrobe-images');

create function private.is_valid_wardrobe_item_image_path(p_image_path text)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(
    p_image_path = btrim(p_image_path)
    and char_length(p_image_path) between 43 and 43
    and p_image_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/(0[1-9]|1[0-6])\.png$',
    false
  );
$$;

revoke all on function private.is_valid_wardrobe_item_image_path(text)
  from public, anon, authenticated, service_role;
-- CHECK expressions run with the writer's privileges. These two trusted
-- writers need EXECUTE so otherwise-authorised inserts and updates can reach
-- the path constraint; table grants and RLS remain the authorisation boundary.
grant execute on function private.is_valid_wardrobe_item_image_path(text)
  to authenticated, service_role;

comment on function private.is_valid_wardrobe_item_image_path(text) is
  'Validates a canonical synthetic wardrobe crop path: one job UUID and row-major item number 01 through 16.';

alter table public.wardrobe_items
  add column description text,
  add column image_path text,
  add constraint wardrobe_items_description_is_bounded check (
    description is null
    or (
      description = btrim(description, E' \t\n\r')
      and char_length(description) between 1 and 240
      and position(E'\r' in description) = 0
      and translate(description, E'\n\r\t', '') !~ '[[:cntrl:]]'
    )
  ),
  add constraint wardrobe_items_image_path_is_valid check (
    image_path is null
    or private.is_valid_wardrobe_item_image_path(image_path)
  );

alter table private.wardrobe_item_revisions
  add column description text,
  add column image_path text,
  add constraint wardrobe_item_revisions_description_is_bounded check (
    description is null
    or (
      description = btrim(description, E' \t\n\r')
      and char_length(description) between 1 and 240
      and position(E'\r' in description) = 0
      and translate(description, E'\n\r\t', '') !~ '[[:cntrl:]]'
    )
  ),
  add constraint wardrobe_item_revisions_image_path_is_valid check (
    image_path is null
    or private.is_valid_wardrobe_item_image_path(image_path)
  );

comment on column public.wardrobe_items.description is
  'Optional child-facing description for a synthetic wardrobe reward.';
comment on column public.wardrobe_items.image_path is
  'Optional public wardrobe-images object path for one cropped catalogue item; icon remains the legacy fallback.';
comment on column private.wardrobe_item_revisions.description is
  'Pending child-facing description staged over an unchanged published item.';
comment on column private.wardrobe_item_revisions.image_path is
  'Pending crop path staged over an unchanged published item.';

grant select (description, image_path)
  on public.wardrobe_items to anon, authenticated;
grant insert (description, image_path), update (description, image_path)
  on public.wardrobe_items to authenticated;
grant insert (description, image_path), update (description, image_path)
  on public.wardrobe_items to service_role;

create or replace function private.guard_wardrobe_item_review_state()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  content_changed boolean :=
    new.name is distinct from old.name
    or new.icon is distinct from old.icon
    or new.description is distinct from old.description
    or new.image_path is distinct from old.image_path
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
  'Returns changed unpublished content, including image copy, to draft and permits a published replacement only as one approved version increment.';

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
  description text,
  image_path text,
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
    case when revision.wardrobe_item_id is null
      then item.description else revision.description end,
    case when revision.wardrobe_item_id is null
      then item.image_path else revision.image_path end,
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
  'Lists every wardrobe item for an administrator, overlaying pending text and image revisions without exposing them to child-facing readers.';

revoke all on function public.list_admin_wardrobe_item_drafts(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.list_admin_wardrobe_item_drafts(uuid, uuid)
  to authenticated;

create function public.save_admin_wardrobe_item_draft_with_image(
  p_wardrobe_item_id uuid,
  p_topic_id uuid,
  p_expected_updated_at timestamptz,
  p_name text,
  p_icon text,
  p_description text,
  p_image_path text,
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
      description,
      image_path,
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
      p_description,
      p_image_path,
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
        description = excluded.description,
        image_path = excluded.image_path,
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
        description = p_description,
        image_path = p_image_path,
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

comment on function public.save_admin_wardrobe_item_draft_with_image(
  uuid,
  uuid,
  timestamptz,
  text,
  text,
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
  'Saves an unpublished item with optional synthetic image copy or stages the complete replacement of a published item.';

revoke all on function public.save_admin_wardrobe_item_draft_with_image(
  uuid,
  uuid,
  timestamptz,
  text,
  text,
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
grant execute on function public.save_admin_wardrobe_item_draft_with_image(
  uuid,
  uuid,
  timestamptz,
  text,
  text,
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

-- Keep the installed legacy admin contract. A legacy edit preserves whichever
-- image and description are currently visible in the editor instead of
-- accidentally clearing them when it creates a pending revision.
create or replace function public.save_admin_wardrobe_item_draft(
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
  selected_description text;
  selected_image_path text;
begin
  select
    case when revision.wardrobe_item_id is null
      then item.description else revision.description end,
    case when revision.wardrobe_item_id is null
      then item.image_path else revision.image_path end
  into selected_description, selected_image_path
  from public.wardrobe_items as item
  left join private.wardrobe_item_revisions as revision
    on revision.wardrobe_item_id = item.id
  where item.id = p_wardrobe_item_id
    and item.topic_id = p_topic_id;

  return query
  select saved.id
  from public.save_admin_wardrobe_item_draft_with_image(
    p_wardrobe_item_id,
    p_topic_id,
    p_expected_updated_at,
    p_name,
    p_icon,
    selected_description,
    selected_image_path,
    p_category,
    p_equip_slot,
    p_rarity,
    p_points,
    p_unlock_rule,
    p_editorial_note,
    p_sort_order
  ) as saved;
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
  'Backward-compatible wardrobe save that preserves optional image copy authored by a newer client.';

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

drop function public.list_child_wardrobe(uuid);

create function public.list_child_wardrobe(
  p_child_profile_id uuid
)
returns table (
  child_profile_id uuid,
  wardrobe_item_id uuid,
  catalog_item_id uuid,
  topic_id uuid,
  name text,
  icon text,
  description text,
  image_path text,
  category public.wardrobe_item_category,
  equip_slot public.wardrobe_equip_slot,
  catalog_equip_slot public.wardrobe_equip_slot,
  rarity public.wardrobe_item_rarity,
  is_equipped boolean,
  acquired_at timestamptz,
  equipped_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication is required.';
  end if;

  if p_child_profile_id is null then
    raise exception using
      errcode = '22023',
      message = 'A child identifier is required.';
  end if;

  if not (select private.can_access_child(p_child_profile_id)) then
    raise exception using
      errcode = '42501',
      message = 'The child is not available to this family member.';
  end if;

  if not exists (
    select 1
    from public.child_profiles as child
    where child.id = p_child_profile_id
      and child.is_active
  ) then
    raise exception using
      errcode = '22023',
      message = 'An active child is required.';
  end if;

  return query
  select
    inventory.child_profile_id,
    inventory.wardrobe_item_id,
    item.id as catalog_item_id,
    item.topic_id,
    item.name,
    item.icon,
    item.description,
    item.image_path,
    item.category,
    inventory.equip_slot,
    item.equip_slot as catalog_equip_slot,
    item.rarity,
    inventory.is_equipped,
    inventory.acquired_at,
    inventory.equipped_at
  from public.child_wardrobe_items as inventory
  join public.wardrobe_items as item on item.id = inventory.wardrobe_item_id
  where inventory.child_profile_id = p_child_profile_id
  order by inventory.acquired_at, inventory.wardrobe_item_id;
end;
$$;

comment on function public.list_child_wardrobe(uuid) is
  'Lists one active child''s owned wardrobe with canonical image copy, including items whose topic was later unpublished.';

revoke all on function public.list_child_wardrobe(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.list_child_wardrobe(uuid)
  to authenticated;

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
        description = revision.description,
        image_path = revision.image_path,
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
  'Publishes one mutable topic tree and atomically promotes approved staged wardrobe copy and images while preserving unreviewed live content.';

revoke all on function public.publish_admin_topic(uuid, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.publish_admin_topic(uuid, timestamptz)
  to authenticated;

create function private.is_valid_wardrobe_grid_topic(p_topic jsonb)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(
    jsonb_typeof(p_topic) = 'object'
    and p_topic ?& array['title', 'description']
    and not exists (
      select 1
      from jsonb_object_keys(
        case when jsonb_typeof(p_topic) = 'object'
          then p_topic else '{}'::jsonb end
      ) as topic_key
      where topic_key <> all (array['title', 'description'])
    )
    and jsonb_typeof(p_topic -> 'title') = 'string'
    and p_topic ->> 'title' = btrim(p_topic ->> 'title')
    and char_length(p_topic ->> 'title') between 1 and 100
    and (p_topic ->> 'title') !~ '[[:cntrl:]]'
    and jsonb_typeof(p_topic -> 'description') = 'string'
    and p_topic ->> 'description' = btrim(
      p_topic ->> 'description',
      E' \t\n\r'
    )
    and char_length(p_topic ->> 'description') <= 500
    and position(E'\r' in p_topic ->> 'description') = 0
    and translate(
      p_topic ->> 'description',
      E'\n\r\t',
      ''
    ) !~ '[[:cntrl:]]',
    false
  );
$$;

create function private.is_valid_admin_wardrobe_grid_plan_input(
  p_input_data jsonb
)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(
    jsonb_typeof(p_input_data) = 'object'
    and p_input_data ?& array['message', 'topic', 'history']
    and not exists (
      select 1
      from jsonb_object_keys(
        case when jsonb_typeof(p_input_data) = 'object'
          then p_input_data else '{}'::jsonb end
      ) as input_key
      where input_key <> all (array['message', 'topic', 'history'])
    )
    and jsonb_typeof(p_input_data -> 'message') = 'string'
    and p_input_data ->> 'message' = btrim(
      p_input_data ->> 'message',
      E' \t\n\r'
    )
    and char_length(p_input_data ->> 'message') between 1 and 1000
    and position(E'\r' in p_input_data ->> 'message') = 0
    and translate(
      p_input_data ->> 'message',
      E'\n\r\t',
      ''
    ) !~ '[[:cntrl:]]'
    and private.is_valid_wardrobe_grid_topic(p_input_data -> 'topic')
    and private.is_valid_admin_ai_history(p_input_data -> 'history'),
    false
  );
$$;

create function private.is_valid_admin_wardrobe_grid_plan_items(
  p_items jsonb
)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(
    jsonb_typeof(p_items) = 'array'
    and case when jsonb_typeof(p_items) = 'array'
      then jsonb_array_length(p_items) = 16
      else false
    end
    and not exists (
      select 1
      from jsonb_array_elements(
        case when jsonb_typeof(p_items) = 'array'
          then p_items else '[]'::jsonb end
      ) with ordinality as entry(item, position)
      where
        jsonb_typeof(entry.item) is distinct from 'object'
        or not (entry.item ?& array[
          'ordinal',
          'name',
          'description',
          'visualDescription',
          'category',
          'equipSlot',
          'rarity',
          'points',
          'unlockRule',
          'reason'
        ])
        or exists (
          select 1
          from jsonb_object_keys(
            case when jsonb_typeof(entry.item) = 'object'
              then entry.item else '{}'::jsonb end
          ) as item_key
          where item_key <> all (array[
            'ordinal',
            'name',
            'description',
            'visualDescription',
            'category',
            'equipSlot',
            'rarity',
            'points',
            'unlockRule',
            'reason'
          ])
        )
        or not case
          when jsonb_typeof(entry.item -> 'ordinal') = 'number'
            and entry.item ->> 'ordinal' ~ '^([1-9]|1[0-6])$'
          then (entry.item ->> 'ordinal')::integer = entry.position
          else false
        end
        or jsonb_typeof(entry.item -> 'name') is distinct from 'string'
        or entry.item ->> 'name' is distinct from btrim(entry.item ->> 'name')
        or char_length(entry.item ->> 'name') not between 1 and 80
        or entry.item ->> 'name' ~ '[[:cntrl:]]'
        or jsonb_typeof(entry.item -> 'description') is distinct from 'string'
        or entry.item ->> 'description' is distinct from btrim(
          entry.item ->> 'description',
          E' \t\n\r'
        )
        or char_length(entry.item ->> 'description') not between 1 and 240
        or position(E'\r' in entry.item ->> 'description') > 0
        or translate(
          entry.item ->> 'description',
          E'\n\r\t',
          ''
        ) ~ '[[:cntrl:]]'
        or jsonb_typeof(entry.item -> 'visualDescription') is distinct from 'string'
        or entry.item ->> 'visualDescription' is distinct from btrim(
          entry.item ->> 'visualDescription',
          E' \t\n\r'
        )
        or char_length(entry.item ->> 'visualDescription') not between 1 and 500
        or position(E'\r' in entry.item ->> 'visualDescription') > 0
        or translate(
          entry.item ->> 'visualDescription',
          E'\n\r\t',
          ''
        ) ~ '[[:cntrl:]]'
        or jsonb_typeof(entry.item -> 'category') is distinct from 'string'
        or entry.item ->> 'category' not in ('clothing', 'equipment', 'effect')
        or jsonb_typeof(entry.item -> 'equipSlot') is distinct from 'string'
        or entry.item ->> 'equipSlot' not in (
          'head',
          'body',
          'held',
          'feet',
          'accessory'
        )
        or jsonb_typeof(entry.item -> 'rarity') is distinct from 'string'
        or entry.item ->> 'rarity' not in ('common', 'rare', 'special')
        or not case
          when jsonb_typeof(entry.item -> 'points') = 'number'
            and entry.item ->> 'points' ~ '^([0-9]{1,3}|1000)$'
          then (
            (
              (entry.item ->> 'points')::integer = 0
              and jsonb_typeof(entry.item -> 'unlockRule') = 'string'
              and entry.item ->> 'unlockRule' = btrim(
                entry.item ->> 'unlockRule',
                E' \t\n\r'
              )
              and char_length(entry.item ->> 'unlockRule') between 1 and 200
            )
            or (
              (entry.item ->> 'points')::integer between 1 and 1000
              and jsonb_typeof(entry.item -> 'unlockRule') = 'string'
              and entry.item ->> 'unlockRule' = ''
            )
          )
          else false
        end
        or jsonb_typeof(entry.item -> 'reason') is distinct from 'string'
        or entry.item ->> 'reason' is distinct from btrim(
          entry.item ->> 'reason',
          E' \t\n\r'
        )
        or char_length(entry.item ->> 'reason') not between 1 and 300
        or position(E'\r' in entry.item ->> 'reason') > 0
        or translate(
          entry.item ->> 'reason',
          E'\n\r\t',
          ''
        ) ~ '[[:cntrl:]]'
    ),
    false
  );
$$;

create function private.is_valid_admin_wardrobe_grid_plan_output(
  p_output_data jsonb
)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(
    jsonb_typeof(p_output_data) = 'object'
    and p_output_data ?& array['items']
    and not exists (
      select 1
      from jsonb_object_keys(
        case when jsonb_typeof(p_output_data) = 'object'
          then p_output_data else '{}'::jsonb end
      ) as output_key
      where output_key <> 'items'
    )
    and private.is_valid_admin_wardrobe_grid_plan_items(
      p_output_data -> 'items'
    ),
    false
  );
$$;

create function private.is_valid_admin_wardrobe_grid_image_items(
  p_items jsonb
)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(
    jsonb_typeof(p_items) = 'array'
    and case when jsonb_typeof(p_items) = 'array'
      then jsonb_array_length(p_items) = 16
      else false
    end
    and not exists (
      select 1
      from jsonb_array_elements(
        case when jsonb_typeof(p_items) = 'array'
          then p_items else '[]'::jsonb end
      ) with ordinality as entry(item, position)
      where
        jsonb_typeof(entry.item) is distinct from 'object'
        or not (entry.item ?& array[
          'ordinal',
          'name',
          'visualDescription',
          'equipSlot'
        ])
        or exists (
          select 1
          from jsonb_object_keys(
            case when jsonb_typeof(entry.item) = 'object'
              then entry.item else '{}'::jsonb end
          ) as item_key
          where item_key <> all (array[
            'ordinal',
            'name',
            'visualDescription',
            'equipSlot'
          ])
        )
        or not case
          when jsonb_typeof(entry.item -> 'ordinal') = 'number'
            and entry.item ->> 'ordinal' ~ '^([1-9]|1[0-6])$'
          then (entry.item ->> 'ordinal')::integer = entry.position
          else false
        end
        or jsonb_typeof(entry.item -> 'name') is distinct from 'string'
        or entry.item ->> 'name' is distinct from btrim(entry.item ->> 'name')
        or char_length(entry.item ->> 'name') not between 1 and 80
        or entry.item ->> 'name' ~ '[[:cntrl:]]'
        or jsonb_typeof(entry.item -> 'visualDescription') is distinct from 'string'
        or entry.item ->> 'visualDescription' is distinct from btrim(
          entry.item ->> 'visualDescription',
          E' \t\n\r'
        )
        or char_length(entry.item ->> 'visualDescription') not between 1 and 500
        or position(E'\r' in entry.item ->> 'visualDescription') > 0
        or translate(
          entry.item ->> 'visualDescription',
          E'\n\r\t',
          ''
        ) ~ '[[:cntrl:]]'
        or jsonb_typeof(entry.item -> 'equipSlot') is distinct from 'string'
        or entry.item ->> 'equipSlot' not in (
          'head',
          'body',
          'held',
          'feet',
          'accessory'
        )
    ),
    false
  );
$$;

create function private.is_valid_admin_wardrobe_grid_image_input(
  p_input_data jsonb
)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(
    jsonb_typeof(p_input_data) = 'object'
    and p_input_data ?& array['topic', 'items']
    and not exists (
      select 1
      from jsonb_object_keys(
        case when jsonb_typeof(p_input_data) = 'object'
          then p_input_data else '{}'::jsonb end
      ) as input_key
      where input_key <> all (array['topic', 'items'])
    )
    and private.is_valid_wardrobe_grid_topic(p_input_data -> 'topic')
    and private.is_valid_admin_wardrobe_grid_image_items(
      p_input_data -> 'items'
    ),
    false
  );
$$;

create function private.is_valid_admin_wardrobe_grid_image_output(
  p_output_data jsonb,
  p_expected_job_id uuid
)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(
    jsonb_typeof(p_output_data) = 'object'
    and p_output_data ?& array['sheetPath', 'items']
    and not exists (
      select 1
      from jsonb_object_keys(
        case when jsonb_typeof(p_output_data) = 'object'
          then p_output_data else '{}'::jsonb end
      ) as output_key
      where output_key <> all (array['sheetPath', 'items'])
    )
    and jsonb_typeof(p_output_data -> 'sheetPath') = 'string'
    and p_output_data ->> 'sheetPath'
      ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/sheet\.png$'
    and (
      p_expected_job_id is null
      or p_output_data ->> 'sheetPath' =
        p_expected_job_id::text || '/sheet.png'
    )
    and jsonb_typeof(p_output_data -> 'items') = 'array'
    and case when jsonb_typeof(p_output_data -> 'items') = 'array'
      then jsonb_array_length(p_output_data -> 'items') = 16
      else false
    end
    and not exists (
      select 1
      from jsonb_array_elements(
        case when jsonb_typeof(p_output_data -> 'items') = 'array'
          then p_output_data -> 'items' else '[]'::jsonb end
      ) with ordinality as entry(item, position)
      where
        jsonb_typeof(entry.item) is distinct from 'object'
        or not (entry.item ?& array['ordinal', 'imagePath'])
        or exists (
          select 1
          from jsonb_object_keys(
            case when jsonb_typeof(entry.item) = 'object'
              then entry.item else '{}'::jsonb end
          ) as item_key
          where item_key <> all (array['ordinal', 'imagePath'])
        )
        or not case
          when jsonb_typeof(entry.item -> 'ordinal') = 'number'
            and entry.item ->> 'ordinal' ~ '^([1-9]|1[0-6])$'
          then (entry.item ->> 'ordinal')::integer = entry.position
          else false
        end
        or jsonb_typeof(entry.item -> 'imagePath') is distinct from 'string'
        or entry.item ->> 'imagePath' is distinct from
          left(p_output_data ->> 'sheetPath', 37)
          || lpad(entry.position::text, 2, '0')
          || '.png'
    ),
    false
  );
$$;

revoke all on function private.is_valid_wardrobe_grid_topic(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function private.is_valid_admin_wardrobe_grid_plan_input(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function private.is_valid_admin_wardrobe_grid_plan_items(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function private.is_valid_admin_wardrobe_grid_plan_output(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function private.is_valid_admin_wardrobe_grid_image_items(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function private.is_valid_admin_wardrobe_grid_image_input(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function private.is_valid_admin_wardrobe_grid_image_output(jsonb, uuid)
  from public, anon, authenticated, service_role;

comment on function private.is_valid_admin_wardrobe_grid_plan_output(jsonb) is
  'Fail-closed validation for exactly sixteen row-major wardrobe specifications.';
comment on function private.is_valid_admin_wardrobe_grid_image_output(jsonb, uuid) is
  'Fail-closed validation for one job-owned 4x4 sheet path and sixteen row-major crop paths.';

create or replace function private.is_valid_admin_ai_output_invariants(
  p_operation_key text,
  p_output_data jsonb
)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(
    case
      when p_operation_key in (
        'content.goal_draft',
        'content.exercise_draft'
      )
        and p_output_data #> '{suggestion,equipment}' is not null
      then private.is_valid_admin_ai_string_array(
        p_output_data #> '{suggestion,equipment}',
        12,
        80
      )
      when p_operation_key = 'content.wardrobe_examples'
      then private.is_valid_admin_ai_wardrobe_output(
        p_output_data,
        true
      )
      when p_operation_key = 'content.draft_review'
      then private.is_valid_admin_ai_string_array(
        p_output_data -> 'nextActions',
        6,
        300
      )
      when p_operation_key = 'content.wardrobe_grid_plan'
      then private.is_valid_admin_wardrobe_grid_plan_output(p_output_data)
      when p_operation_key = 'content.wardrobe_grid_image'
      then private.is_valid_admin_wardrobe_grid_image_output(
        p_output_data,
        null
      )
      else true
    end,
    false
  );
$$;

revoke all on function private.is_valid_admin_ai_output_invariants(text, jsonb)
  from public, anon, authenticated, service_role;

insert into public.ai_operations (
  id,
  operation_key,
  capability,
  description
)
values
  (
    'a1000000-0000-4000-8000-000000000007',
    'content.wardrobe_grid_plan',
    'structured_text',
    'Creates exactly sixteen synthetic wardrobe specifications in row-major order for administrator review and later image generation.'
  ),
  (
    'a1000000-0000-4000-8000-000000000008',
    'content.wardrobe_grid_image',
    'image_generation',
    'Creates one synthetic square 4x4 wardrobe sheet and records its sixteen deterministic crop paths.'
  );

insert into public.ai_operation_versions (
  id,
  operation_id,
  version,
  prompt_template,
  gateway,
  provider,
  model,
  request_options,
  input_contract,
  output_contract,
  max_attempts,
  timeout_ms,
  max_cost_microusd
)
values
  (
    'a2000000-0000-4000-8000-000000000008',
    'a1000000-0000-4000-8000-000000000007',
    1,
    'Du er Bare Træns danske garderobeplanlægger for voksne redaktører. Følg redaktørens validerede besked og korte samtalehistorik inden for det validerede emnes titel og beskrivelse. Opret præcis 16 syntetiske, børnevenlige og brandfri garderobeting i rækkefølge 1 til 16. Hver ting skal have et kort navn, en offentlig dansk beskrivelse, en konkret visuel engelsk beskrivelse til billedmodellen, kategori, præcis én equipSlot, sjældenhed, enten pointpris eller oplåsningsregel samt en kort redaktionel begrundelse. Et feet-item er altid ét samlet par sko. Undgå personer, kroppe, ansigter, tekst, tal, logoer, links, brands, våben og persondata. Returnér kun objektet med items, og følg outputskemaet præcist.',
    'openrouter',
    'openai',
    'openai/gpt-5-mini',
    $json$
      {
        "max_tokens": 4096,
        "provider": {
          "only": ["openai"],
          "allow_fallbacks": false,
          "require_parameters": true
        }
      }
    $json$::jsonb,
    $json$
      {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "message": {"type": "string", "minLength": 1, "maxLength": 1000},
          "topic": {
            "type": "object",
            "additionalProperties": false,
            "properties": {
              "title": {"type": "string", "minLength": 1, "maxLength": 100},
              "description": {"type": "string", "minLength": 0, "maxLength": 500}
            },
            "required": ["title", "description"]
          },
          "history": {
            "type": "array",
            "maxItems": 6,
            "items": {
              "type": "object",
              "additionalProperties": false,
              "properties": {
                "role": {"type": "string", "enum": ["user", "assistant"]},
                "content": {"type": "string", "minLength": 1, "maxLength": 1800}
              },
              "required": ["role", "content"]
            }
          }
        },
        "required": ["message", "topic", "history"]
      }
    $json$::jsonb,
    $json$
      {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "items": {
            "type": "array",
            "minItems": 16,
            "maxItems": 16,
            "items": {
              "type": "object",
              "additionalProperties": false,
              "properties": {
                "ordinal": {"type": "integer", "minimum": 1, "maximum": 16},
                "name": {"type": "string", "minLength": 1, "maxLength": 80},
                "description": {"type": "string", "minLength": 1, "maxLength": 240},
                "visualDescription": {"type": "string", "minLength": 1, "maxLength": 500},
                "category": {"type": "string", "enum": ["clothing", "equipment", "effect"]},
                "equipSlot": {"type": "string", "enum": ["head", "body", "held", "feet", "accessory"]},
                "rarity": {"type": "string", "enum": ["common", "rare", "special"]},
                "points": {"type": "integer", "minimum": 0, "maximum": 1000},
                "unlockRule": {"type": "string", "minLength": 0, "maxLength": 200},
                "reason": {"type": "string", "minLength": 1, "maxLength": 300}
              },
              "required": [
                "ordinal",
                "name",
                "description",
                "visualDescription",
                "category",
                "equipSlot",
                "rarity",
                "points",
                "unlockRule",
                "reason"
              ]
            }
          }
        },
        "required": ["items"]
      }
    $json$::jsonb,
    1,
    90000,
    50000
  ),
  (
    'a2000000-0000-4000-8000-000000000009',
    'a1000000-0000-4000-8000-000000000008',
    1,
    'Create exactly sixteen separate wardrobe objects on one square 4x4 grid sheet in strict row-major order, using the supplied ordinal, name, visualDescription and equipSlot for cells 1 through 16. Show no text, numbers, labels, logos, brands, people, faces, bodies or body parts. Each cell must contain one centered, complete, consistent, friendly stylized 3D object on a clean simple background with generous padding. Keep every object fully inside its own equal cell with no overlap or bleed across cell boundaries. Keep lighting, camera angle, scale and rendering style consistent across all sixteen cells.',
    'openrouter',
    'openai',
    'openai/gpt-image-2',
    $json$
      {
        "n": 1,
        "aspect_ratio": "1:1",
        "background": "opaque",
        "quality": "low",
        "provider": {
          "only": ["openai"],
          "allow_fallbacks": false
        }
      }
    $json$::jsonb,
    $json$
      {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "topic": {
            "type": "object",
            "additionalProperties": false,
            "properties": {
              "title": {"type": "string", "minLength": 1, "maxLength": 100},
              "description": {"type": "string", "minLength": 0, "maxLength": 500}
            },
            "required": ["title", "description"]
          },
          "items": {
            "type": "array",
            "minItems": 16,
            "maxItems": 16,
            "items": {
              "type": "object",
              "additionalProperties": false,
              "properties": {
                "ordinal": {"type": "integer", "minimum": 1, "maximum": 16},
                "name": {"type": "string", "minLength": 1, "maxLength": 80},
                "visualDescription": {"type": "string", "minLength": 1, "maxLength": 500},
                "equipSlot": {"type": "string", "enum": ["head", "body", "held", "feet", "accessory"]}
              },
              "required": ["ordinal", "name", "visualDescription", "equipSlot"]
            }
          }
        },
        "required": ["topic", "items"]
      }
    $json$::jsonb,
    $json$
      {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "sheetPath": {
            "type": "string",
            "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/sheet\\.png$"
          },
          "items": {
            "type": "array",
            "minItems": 16,
            "maxItems": 16,
            "items": {
              "type": "object",
              "additionalProperties": false,
              "properties": {
                "ordinal": {"type": "integer", "minimum": 1, "maximum": 16},
                "imagePath": {
                  "type": "string",
                  "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/(0[1-9]|1[0-6])\\.png$"
                }
              },
              "required": ["ordinal", "imagePath"]
            }
          }
        },
        "required": ["sheetPath", "items"]
      }
    $json$::jsonb,
    1,
    120000,
    100000
  );

update public.ai_operations
set active_version_id = case operation_key
  when 'content.wardrobe_grid_plan'
    then 'a2000000-0000-4000-8000-000000000008'::uuid
  when 'content.wardrobe_grid_image'
    then 'a2000000-0000-4000-8000-000000000009'::uuid
end
where operation_key in (
  'content.wardrobe_grid_plan',
  'content.wardrobe_grid_image'
);

-- A complete generated grid may be saved as sixteen ordinary wardrobe drafts.
-- Append an immutable review contract revision instead of changing either
-- slot-aware legacy version or any job already pinned to one of them.
create or replace function private.is_valid_admin_draft_review_input(
  p_input_data jsonb
)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(
    jsonb_typeof(p_input_data) = 'object'
    and p_input_data ?& array[
      'message',
      'topic',
      'goal',
      'exercise',
      'wardrobeExamples',
      'history'
    ]
    and not exists (
      select 1
      from jsonb_object_keys(
        case when jsonb_typeof(p_input_data) = 'object'
          then p_input_data else '{}'::jsonb end
      ) as input_key
      where input_key <> all (array[
        'message',
        'topic',
        'goal',
        'exercise',
        'wardrobeExamples',
        'history'
      ])
    )
    and private.is_valid_admin_ai_input(
      'content.topic_brief',
      jsonb_build_object(
        'message', p_input_data -> 'message',
        'draft', p_input_data -> 'topic',
        'history', p_input_data -> 'history'
      )
    )
    and private.is_valid_admin_ai_input(
      'content.goal_draft',
      jsonb_build_object(
        'message', p_input_data -> 'message',
        'topic', jsonb_build_object(
          'title', p_input_data #> '{topic,title}',
          'description', p_input_data #> '{topic,description}'
        ),
        'draft', p_input_data -> 'goal',
        'history', p_input_data -> 'history'
      )
    )
    and private.is_valid_admin_ai_input(
      'content.exercise_draft',
      jsonb_build_object(
        'message', p_input_data -> 'message',
        'topic', jsonb_build_object(
          'title', p_input_data #> '{topic,title}',
          'description', p_input_data #> '{topic,description}'
        ),
        'goal', p_input_data -> 'goal',
        'position', 1,
        'sequence', '[]'::jsonb,
        'draft', p_input_data -> 'exercise',
        'history', p_input_data -> 'history'
      )
    )
    and private.is_valid_admin_ai_wardrobe_items(
      p_input_data -> 'wardrobeExamples',
      0,
      16,
      true
    ),
    false
  );
$$;

revoke all on function private.is_valid_admin_draft_review_input(jsonb)
  from public, anon, authenticated, service_role;

do $$
declare
  selected_operation public.ai_operations%rowtype;
  selected_version public.ai_operation_versions%rowtype;
  next_version integer;
  next_input_contract jsonb;
begin
  select operation.*
  into selected_operation
  from public.ai_operations as operation
  where operation.operation_key = 'content.draft_review'
    and operation.capability = 'structured_text'
  for update;

  if selected_operation.id is null
    or selected_operation.active_version_id is null
  then
    raise exception 'The draft-review AI operation is unavailable.'
      using errcode = '55000';
  end if;

  select version.*
  into selected_version
  from public.ai_operation_versions as version
  where version.id = selected_operation.active_version_id
    and version.operation_id = selected_operation.id;

  if selected_version.id is null
    or jsonb_typeof(
      selected_version.input_contract #>
        '{properties,wardrobeExamples,maxItems}'
    ) <> 'number'
  then
    raise exception 'The active draft-review contract cannot be expanded safely.'
      using errcode = '55000';
  end if;

  next_input_contract := jsonb_set(
    selected_version.input_contract,
    '{properties,wardrobeExamples,maxItems}',
    '16'::jsonb,
    false
  );

  select max(version.version) + 1
  into next_version
  from public.ai_operation_versions as version
  where version.operation_id = selected_operation.id;

  insert into public.ai_operation_versions (
    id,
    operation_id,
    version,
    prompt_template,
    gateway,
    provider,
    model,
    request_options,
    input_contract,
    output_contract,
    max_attempts,
    timeout_ms,
    max_cost_microusd
  )
  values (
    'a2000000-0000-4000-8000-000000000010',
    selected_operation.id,
    next_version,
    selected_version.prompt_template
      || ' Gennemgå op til 16 gemte garderobeting uden at springe nogen over.',
    selected_version.gateway,
    selected_version.provider,
    selected_version.model,
    selected_version.request_options,
    next_input_contract,
    selected_version.output_contract,
    selected_version.max_attempts,
    selected_version.timeout_ms,
    selected_version.max_cost_microusd
  );

  update public.ai_operations as operation
  set active_version_id = 'a2000000-0000-4000-8000-000000000010'
  where operation.id = selected_operation.id;
end;
$$;

create or replace function public.prepare_admin_ai_job(
  p_operation_key text,
  p_client_request_id uuid,
  p_input_data jsonb
)
returns table (
  job_id uuid,
  job_status public.ai_job_status
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  selected_operation public.ai_operations%rowtype;
  selected_version public.ai_operation_versions%rowtype;
  selected_job public.ai_jobs%rowtype;
  input_is_valid boolean := false;
begin
  if caller_id is null or not (select private.is_admin()) then
    raise exception 'Content administrator access is required.'
      using errcode = '42501';
  end if;

  if p_client_request_id is null
    or p_client_request_id = '00000000-0000-0000-0000-000000000000'::uuid
  then
    raise exception 'The admin AI request is invalid.'
      using errcode = '22023';
  end if;

  select operation.*
  into selected_operation
  from public.ai_operations as operation
  where operation.operation_key = p_operation_key
    and (
      (
        operation.capability = 'structured_text'
        and operation.operation_key in (
          'content.topic_brief',
          'content.wardrobe_examples',
          'content.goal_draft',
          'content.exercise_draft',
          'content.draft_review',
          'content.wardrobe_grid_plan'
        )
      )
      or (
        operation.capability = 'image_generation'
        and operation.operation_key = 'content.wardrobe_grid_image'
      )
    );

  if selected_operation.id is null then
    raise exception 'The requested admin AI operation is unavailable.'
      using errcode = '55000';
  end if;

  perform profile.id
  from public.profiles as profile
  where profile.id = caller_id
  for update;

  if not found then
    raise exception 'The authenticated profile is missing.'
      using errcode = 'P0002';
  end if;

  select job.*
  into selected_job
  from public.ai_jobs as job
  where job.requested_by = caller_id
    and job.client_request_id = p_client_request_id;

  if selected_job.id is not null then
    if selected_job.operation_id is distinct from selected_operation.id
      or selected_job.input_data is distinct from p_input_data
      or selected_job.scope_kind is distinct from 'admin'
    then
      raise exception 'The request identity is already used for different work.'
        using errcode = '23505';
    end if;

    return query select selected_job.id, selected_job.status;
    return;
  end if;

  if selected_operation.active_version_id is null then
    raise exception 'The requested admin AI operation is unavailable.'
      using errcode = '55000';
  end if;

  select version.*
  into selected_version
  from public.ai_operation_versions as version
  where version.id = selected_operation.active_version_id
    and version.operation_id = selected_operation.id;

  if selected_version.id is null then
    raise exception 'The active admin AI version is unavailable.'
      using errcode = '55000';
  end if;

  input_is_valid := case p_operation_key
    when 'content.draft_review' then
      private.is_valid_admin_draft_review_input(p_input_data)
    when 'content.wardrobe_grid_plan' then
      private.is_valid_admin_wardrobe_grid_plan_input(p_input_data)
    when 'content.wardrobe_grid_image' then
      private.is_valid_admin_wardrobe_grid_image_input(p_input_data)
    else private.is_valid_admin_ai_input(p_operation_key, p_input_data)
  end;

  if input_is_valid is not true
    or private.admin_ai_contract_matches(
      selected_version.input_contract,
      p_input_data
    ) is not true
  then
    raise exception 'The admin AI request is invalid.'
      using errcode = '22023';
  end if;

  insert into public.ai_jobs (
    scope_kind,
    operation_id,
    operation_version_id,
    requested_by,
    client_request_id,
    status,
    max_attempts,
    max_cost_microusd,
    queued_at,
    input_data
  )
  values (
    'admin',
    selected_operation.id,
    selected_version.id,
    caller_id,
    p_client_request_id,
    'awaiting_upload',
    selected_version.max_attempts,
    selected_version.max_cost_microusd,
    now(),
    p_input_data
  )
  returning * into selected_job;

  return query select selected_job.id, selected_job.status;
end;
$$;

revoke all on function public.prepare_admin_ai_job(text, uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.prepare_admin_ai_job(text, uuid, jsonb)
  to authenticated;

comment on function public.prepare_admin_ai_job(text, uuid, jsonb) is
  'Idempotently creates a bounded, version-pinned structured or wardrobe-grid administrator proposal. It cannot alter or publish content.';

drop function public.claim_admin_ai_job_for_worker(uuid);

create function public.claim_admin_ai_job_for_worker(p_job_id uuid)
returns table (
  job_id uuid,
  attempt_number smallint,
  operation_key text,
  capability text,
  gateway text,
  provider text,
  model text,
  prompt_template text,
  request_options jsonb,
  input_contract jsonb,
  output_contract jsonb,
  input_data jsonb,
  timeout_ms integer,
  max_cost_microusd bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_job public.ai_jobs%rowtype;
  selected_operation public.ai_operations%rowtype;
  selected_version public.ai_operation_versions%rowtype;
  next_attempt smallint;
begin
  select job.*
  into selected_job
  from public.ai_jobs as job
  where job.id = p_job_id
    and job.scope_kind = 'admin'
  for update;

  if selected_job.id is null
    or selected_job.status in ('succeeded', 'failed', 'cancelled')
  then
    return;
  end if;

  if selected_job.status = 'processing'
    and selected_job.processing_started_at > now() - interval '2 minutes'
  then
    return;
  end if;

  if selected_job.status = 'processing' then
    update public.ai_jobs
    set status = 'failed',
        public_error_code = 'provider_outcome_unknown',
        completed_at = now()
    where id = selected_job.id
      and status = 'processing';

    update private.ai_job_attempts as attempt
    set status = 'outcome_unknown',
        error_code = 'worker_lease_expired',
        completed_at = now()
    where attempt.job_id = selected_job.id
      and attempt.attempt_number = selected_job.attempt_count
      and attempt.status = 'processing';
    return;
  end if;

  if selected_job.status <> 'awaiting_upload'
    or selected_job.attempt_count >= selected_job.max_attempts
  then
    return;
  end if;

  select operation.*
  into selected_operation
  from public.ai_operations as operation
  where operation.id = selected_job.operation_id
    and (
      (
        operation.capability = 'structured_text'
        and operation.operation_key in (
          'content.topic_brief',
          'content.wardrobe_examples',
          'content.goal_draft',
          'content.exercise_draft',
          'content.draft_review',
          'content.wardrobe_grid_plan'
        )
      )
      or (
        operation.capability = 'image_generation'
        and operation.operation_key = 'content.wardrobe_grid_image'
      )
    );

  select version.*
  into selected_version
  from public.ai_operation_versions as version
  where version.id = selected_job.operation_version_id
    and version.operation_id = selected_job.operation_id;

  if selected_operation.id is null
    or selected_version.id is null
    or private.admin_ai_contract_matches(
      selected_version.input_contract,
      selected_job.input_data
    ) is not true
  then
    return;
  end if;

  next_attempt := selected_job.attempt_count + 1;

  update public.ai_jobs
  set status = 'processing',
      attempt_count = next_attempt,
      public_error_code = null,
      processing_started_at = now(),
      completed_at = null
  where id = selected_job.id;

  insert into private.ai_job_attempts (
    job_id,
    attempt_number,
    gateway,
    provider,
    model,
    status
  )
  values (
    selected_job.id,
    next_attempt,
    selected_version.gateway,
    selected_version.provider,
    selected_version.model,
    'processing'
  );

  return query
  select
    selected_job.id,
    next_attempt,
    selected_operation.operation_key,
    selected_operation.capability,
    selected_version.gateway,
    selected_version.provider,
    selected_version.model,
    selected_version.prompt_template,
    selected_version.request_options,
    selected_version.input_contract,
    selected_version.output_contract,
    selected_job.input_data,
    selected_version.timeout_ms,
    selected_version.max_cost_microusd;
end;
$$;

revoke all on function public.claim_admin_ai_job_for_worker(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_admin_ai_job_for_worker(uuid)
  to service_role;

comment on function public.claim_admin_ai_job_for_worker(uuid) is
  'Claims one bounded admin AI job and returns its pinned capability and immutable provider contract to trusted worker code.';

create or replace function public.complete_admin_ai_job_for_worker(
  p_job_id uuid,
  p_attempt_number smallint,
  p_output_data jsonb,
  p_provider_request_id text,
  p_usage jsonb,
  p_cost_microusd bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_operation_key text;
  selected_capability text;
  selected_output_contract jsonb;
  accumulated_cost_microusd bigint;
  stored_grid_object_count integer;
begin
  if p_attempt_number is null
    or p_attempt_number <> 1
    or p_usage is null
    or jsonb_typeof(p_usage) <> 'object'
    or p_cost_microusd is null
    or p_cost_microusd < 0
    or (p_provider_request_id is not null and char_length(p_provider_request_id) > 200)
  then
    raise exception 'The admin AI completion payload is invalid.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.ai_jobs as job
    join private.ai_job_attempts as attempt
      on attempt.job_id = job.id
      and attempt.attempt_number = p_attempt_number
      and attempt.status = 'succeeded'
    where job.id = p_job_id
      and job.status = 'succeeded'
      and job.output_data = p_output_data
  ) then
    return;
  end if;

  select
    operation.operation_key,
    operation.capability,
    version.output_contract
  into
    selected_operation_key,
    selected_capability,
    selected_output_contract
  from public.ai_jobs as job
  join public.ai_operations as operation on operation.id = job.operation_id
  join public.ai_operation_versions as version
    on version.id = job.operation_version_id
    and version.operation_id = job.operation_id
  where job.id = p_job_id
    and job.scope_kind = 'admin'
    and job.status = 'processing'
    and job.attempt_count = p_attempt_number
    and (
      (
        operation.capability = 'structured_text'
        and operation.operation_key in (
          'content.topic_brief',
          'content.wardrobe_examples',
          'content.goal_draft',
          'content.exercise_draft',
          'content.draft_review',
          'content.wardrobe_grid_plan'
        )
      )
      or (
        operation.capability = 'image_generation'
        and operation.operation_key = 'content.wardrobe_grid_image'
      )
    )
  for update of job;

  if selected_operation_key is null
    or private.admin_ai_contract_matches(
      selected_output_contract,
      p_output_data
    ) is not true
    or private.is_valid_admin_ai_output_invariants(
      selected_operation_key,
      p_output_data
    ) is not true
    or (
      selected_operation_key = 'content.wardrobe_grid_image'
      and private.is_valid_admin_wardrobe_grid_image_output(
        p_output_data,
        p_job_id
      ) is not true
    )
  then
    raise exception 'The structured admin AI result is invalid.'
      using errcode = '22023';
  end if;

  if selected_capability = 'image_generation' then
    select count(*)::integer
    into stored_grid_object_count
    from storage.objects as object
    where object.bucket_id = 'wardrobe-images'
      and object.metadata ->> 'mimetype' = 'image/png'
      and (
        object.name = p_output_data ->> 'sheetPath'
        or exists (
          select 1
          from jsonb_array_elements(p_output_data -> 'items') as item
          where item ->> 'imagePath' = object.name
        )
      );

    if stored_grid_object_count <> 17 then
      raise exception 'The exact wardrobe grid objects are missing or invalid.'
        using errcode = '22023';
    end if;
  end if;

  select coalesce(job.actual_cost_microusd, 0) + p_cost_microusd
  into accumulated_cost_microusd
  from public.ai_jobs as job
  where job.id = p_job_id
    and job.status = 'processing'
    and job.max_cost_microusd >=
      coalesce(job.actual_cost_microusd, 0) + p_cost_microusd;

  if accumulated_cost_microusd is null then
    raise exception 'The admin AI job exceeds its cost ceiling.'
      using errcode = '40001';
  end if;

  update public.ai_jobs
  set status = 'succeeded',
      output_data = p_output_data,
      actual_cost_microusd = accumulated_cost_microusd,
      public_error_code = null,
      completed_at = now()
  where id = p_job_id
    and status = 'processing'
    and attempt_count = p_attempt_number;

  if not found then
    raise exception 'The admin AI job is no longer owned by this worker.'
      using errcode = '40001';
  end if;

  update private.ai_job_attempts
  set status = 'succeeded',
      provider_request_id = left(p_provider_request_id, 200),
      usage = p_usage,
      cost_microusd = p_cost_microusd,
      completed_at = now()
  where job_id = p_job_id
    and attempt_number = p_attempt_number
    and status = 'processing';
end;
$$;

revoke all on function public.complete_admin_ai_job_for_worker(
  uuid,
  smallint,
  jsonb,
  text,
  jsonb,
  bigint
) from public, anon, authenticated, service_role;
grant execute on function public.complete_admin_ai_job_for_worker(
  uuid,
  smallint,
  jsonb,
  text,
  jsonb,
  bigint
) to service_role;

comment on function public.complete_admin_ai_job_for_worker(
  uuid,
  smallint,
  jsonb,
  text,
  jsonb,
  bigint
) is
  'Validates and persists bounded admin proposals; image-grid completion additionally proves all seventeen job-owned PNG objects exist.';

commit;
