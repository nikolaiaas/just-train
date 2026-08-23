begin;

create type public.wardrobe_equip_slot as enum (
  'head',
  'body',
  'held',
  'feet',
  'accessory'
);

comment on type public.wardrobe_equip_slot is
  'Exclusive avatar equipment positions. A feet item represents one complete pair of shoes.';

-- Keep older installed clients working while the authoring form rolls out the
-- explicit slot picker. Their omitted value becomes the least specific slot;
-- current clients always send the administrator's deliberate choice.
alter table public.wardrobe_items
  add column equip_slot public.wardrobe_equip_slot not null default 'accessory';

comment on column public.wardrobe_items.equip_slot is
  'The single exclusive avatar position occupied while this item is equipped; feet means one pair, never one shoe.';

create or replace function private.guard_wardrobe_item_review_state()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.is_published then
    raise exception using
      errcode = '23514',
      message = 'Published wardrobe items are immutable.';
  end if;

  if new.name is distinct from old.name
    or new.icon is distinct from old.icon
    or new.category is distinct from old.category
    or new.equip_slot is distinct from old.equip_slot
    or new.rarity is distinct from old.rarity
    or new.points is distinct from old.points
    or new.unlock_rule is distinct from old.unlock_rule
    or new.editorial_note is distinct from old.editorial_note
    or new.sort_order is distinct from old.sort_order
  then
    new.editorial_status := 'draft';
  end if;

  return new;
end;
$$;

comment on function private.guard_wardrobe_item_review_state() is
  'Returns changed unpublished wardrobe content, including its equipment slot, to draft and makes published rows immutable.';

grant select (equip_slot)
  on public.wardrobe_items to anon, authenticated;
grant insert (equip_slot), update (equip_slot)
  on public.wardrobe_items to authenticated;
grant insert (equip_slot), update (equip_slot)
  on public.wardrobe_items to service_role;

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
  updated_at timestamptz
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
    item.name,
    item.icon,
    item.category,
    item.equip_slot,
    item.rarity,
    item.points,
    item.unlock_rule,
    item.editorial_note,
    item.editorial_status,
    item.sort_order,
    item.content_version,
    item.is_published,
    item.published_at,
    item.created_by,
    item.created_at,
    item.updated_at
  from public.wardrobe_items as item
  where item.topic_id = p_topic_id
    and not item.is_published
    and (
      p_wardrobe_item_id is null
      or item.id = p_wardrobe_item_id
    )
  order by item.sort_order, item.id;
end;
$$;

comment on function public.list_admin_wardrobe_item_drafts(uuid, uuid) is
  'Lists unpublished wardrobe drafts and their equipment slots for one topic, optionally narrowed to one item, for an authenticated administrator.';

revoke all on function public.list_admin_wardrobe_item_drafts(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.list_admin_wardrobe_item_drafts(uuid, uuid)
  to authenticated;

create table public.child_wardrobe_items (
  child_profile_id uuid not null
    references public.child_profiles (id) on delete cascade,
  wardrobe_item_id uuid not null
    references public.wardrobe_items (id) on delete cascade,
  equip_slot public.wardrobe_equip_slot not null default 'accessory',
  is_equipped boolean not null default false,
  acquired_at timestamptz not null default now(),
  equipped_at timestamptz,
  primary key (child_profile_id, wardrobe_item_id),
  constraint child_wardrobe_items_equipped_timestamp_matches_state check (
    (is_equipped and equipped_at is not null)
    or (not is_equipped and equipped_at is null)
  )
);

comment on table public.child_wardrobe_items is
  'Owned child wardrobe items and their current exclusive avatar-equipment state.';
comment on column public.child_wardrobe_items.equip_slot is
  'Trigger-owned snapshot of the catalog slot, used to enforce one equipped item per exclusive position.';

create unique index child_wardrobe_items_one_equipped_per_slot_idx
  on public.child_wardrobe_items (child_profile_id, equip_slot)
  where is_equipped;
create index child_wardrobe_items_catalog_item_idx
  on public.child_wardrobe_items (wardrobe_item_id, child_profile_id);

create function private.validate_child_wardrobe_item()
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
      or new.equip_slot is distinct from old.equip_slot
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
  'Pins owned items to an immutable published catalog slot and keeps equipped timestamps database-owned.';

revoke all on function private.validate_child_wardrobe_item()
  from public, anon, authenticated, service_role;

create trigger child_wardrobe_items_validate
before insert or update on public.child_wardrobe_items
for each row execute function private.validate_child_wardrobe_item();

alter table public.child_wardrobe_items enable row level security;

create policy "Family members can read child wardrobe items"
on public.child_wardrobe_items for select to authenticated
using ((select private.can_access_child(child_profile_id)));

revoke all on table public.child_wardrobe_items
  from anon, authenticated, service_role;
grant select on table public.child_wardrobe_items to authenticated;
grant select on table public.child_wardrobe_items to service_role;
grant insert (child_profile_id, wardrobe_item_id)
  on public.child_wardrobe_items to service_role;
grant update (is_equipped)
  on public.child_wardrobe_items to service_role;
grant delete on public.child_wardrobe_items to service_role;

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
  'Lists one active child''s owned wardrobe with catalog identity, including items whose topic was later unpublished.';

revoke all on function public.list_child_wardrobe(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.list_child_wardrobe(uuid)
  to authenticated;

create function public.set_child_wardrobe_item_equipped(
  p_child_profile_id uuid,
  p_wardrobe_item_id uuid,
  p_equipped boolean default true
)
returns table (
  child_profile_id uuid,
  wardrobe_item_id uuid,
  equip_slot public.wardrobe_equip_slot,
  is_equipped boolean,
  acquired_at timestamptz,
  equipped_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  target_slot public.wardrobe_equip_slot;
begin
  if (select auth.uid()) is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication is required.';
  end if;

  if p_child_profile_id is null
    or p_wardrobe_item_id is null
    or p_equipped is null
  then
    raise exception using
      errcode = '22023',
      message = 'Child, wardrobe item, and equipment state are required.';
  end if;

  if not (select private.can_access_child(p_child_profile_id)) then
    raise exception using
      errcode = '42501',
      message = 'The child is not available to this family member.';
  end if;

  -- Serializing on the child row makes two simultaneous choices deterministic;
  -- the partial unique index remains the final database invariant.
  perform 1
  from public.child_profiles as child
  where child.id = p_child_profile_id
    and child.is_active
  for update;

  if not found then
    raise exception using
      errcode = '22023',
      message = 'An active child is required.';
  end if;

  select inventory.equip_slot
  into target_slot
  from public.child_wardrobe_items as inventory
  where inventory.child_profile_id = p_child_profile_id
    and inventory.wardrobe_item_id = p_wardrobe_item_id
  for update;

  if target_slot is null then
    raise exception using
      errcode = '22023',
      message = 'The wardrobe item is not in this child''s wardrobe.';
  end if;

  if p_equipped then
    update public.child_wardrobe_items as inventory
    set is_equipped = false,
        equipped_at = null
    where inventory.child_profile_id = p_child_profile_id
      and inventory.equip_slot = target_slot
      and inventory.wardrobe_item_id <> p_wardrobe_item_id
      and inventory.is_equipped;
  end if;

  update public.child_wardrobe_items as inventory
  set is_equipped = p_equipped,
      equipped_at = case when p_equipped then now() else null end
  where inventory.child_profile_id = p_child_profile_id
    and inventory.wardrobe_item_id = p_wardrobe_item_id;

  return query
  select
    inventory.child_profile_id,
    inventory.wardrobe_item_id,
    inventory.equip_slot,
    inventory.is_equipped,
    inventory.acquired_at,
    inventory.equipped_at
  from public.child_wardrobe_items as inventory
  where inventory.child_profile_id = p_child_profile_id
    and inventory.wardrobe_item_id = p_wardrobe_item_id;
end;
$$;

comment on function public.set_child_wardrobe_item_equipped(uuid, uuid, boolean) is
  'Atomically equips or unequips one owned item, replacing any equipped item in the same exclusive slot.';

revoke all on function public.set_child_wardrobe_item_equipped(uuid, uuid, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.set_child_wardrobe_item_equipped(uuid, uuid, boolean)
  to authenticated;

commit;
