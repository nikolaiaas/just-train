begin;

create type public.wardrobe_item_category as enum (
  'clothing',
  'equipment',
  'effect'
);

create type public.wardrobe_item_rarity as enum (
  'common',
  'rare',
  'special'
);

create type public.wardrobe_editorial_status as enum (
  'draft',
  'approved',
  'rejected'
);

create table public.wardrobe_items (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.topics (id) on delete cascade,
  name text not null,
  icon text not null,
  category public.wardrobe_item_category not null,
  rarity public.wardrobe_item_rarity not null default 'common',
  points integer,
  unlock_rule text,
  editorial_note text,
  editorial_status public.wardrobe_editorial_status not null default 'draft',
  sort_order integer not null default 0 check (sort_order >= 0),
  content_version integer not null default 1 check (content_version > 0),
  is_published boolean not null default false,
  published_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wardrobe_items_name_is_bounded check (
    name = btrim(name)
    and char_length(name) between 1 and 80
    and name !~ '[[:cntrl:]]'
  ),
  constraint wardrobe_items_icon_is_bounded check (
    icon = btrim(icon)
    and char_length(icon) between 1 and 16
    and icon !~ '[[:cntrl:]]'
  ),
  constraint wardrobe_items_points_are_bounded check (
    points is null or points between 1 and 1000
  ),
  constraint wardrobe_items_unlock_rule_is_bounded check (
    unlock_rule is null
    or (
      unlock_rule = btrim(unlock_rule, E' \t\n\r')
      and char_length(unlock_rule) between 1 and 200
      and position(E'\r' in unlock_rule) = 0
      and translate(unlock_rule, E'\n\r\t', '') !~ '[[:cntrl:]]'
    )
  ),
  constraint wardrobe_items_unlock_method_is_exclusive check (
    (points is not null and unlock_rule is null)
    or (points is null and unlock_rule is not null)
  ),
  constraint wardrobe_items_editorial_note_is_bounded check (
    editorial_note is null
    or (
      editorial_note = btrim(editorial_note, E' \t\n\r')
      and char_length(editorial_note) between 1 and 500
      and position(E'\r' in editorial_note) = 0
      and translate(editorial_note, E'\n\r\t', '') !~ '[[:cntrl:]]'
    )
  ),
  constraint wardrobe_items_publication_is_approved check (
    not is_published or editorial_status = 'approved'
  )
);

comment on table public.wardrobe_items is
  'Topic-specific wardrobe rewards reviewed by an administrator before publication.';
comment on column public.wardrobe_items.points is
  'Positive point price. NULL when the item is unlocked by a named rule instead.';
comment on column public.wardrobe_items.unlock_rule is
  'Human-readable unlock condition. NULL when the item has a point price instead.';
comment on column public.wardrobe_items.editorial_note is
  'Optional bounded note for the administrator reviewing the item.';

create index wardrobe_items_topic_sort_idx
  on public.wardrobe_items (topic_id, sort_order, id);
create index wardrobe_items_public_topic_sort_idx
  on public.wardrobe_items (topic_id, sort_order, id)
  where is_published and editorial_status = 'approved';
create index wardrobe_items_editorial_queue_idx
  on public.wardrobe_items (editorial_status, updated_at desc)
  where not is_published;

create trigger wardrobe_items_set_updated_at
before update on public.wardrobe_items
for each row execute function private.set_updated_at();

create trigger wardrobe_items_set_published_at
before insert or update on public.wardrobe_items
for each row execute function private.set_publication_timestamp();

create function private.guard_wardrobe_item_review_state()
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
  'Returns changed unpublished wardrobe content to draft and makes published rows immutable.';

revoke all on function private.guard_wardrobe_item_review_state()
  from public, anon, authenticated, service_role;

create trigger wardrobe_items_guard_review_state
before update on public.wardrobe_items
for each row execute function private.guard_wardrobe_item_review_state();

alter table public.wardrobe_items enable row level security;

create policy "Anonymous users can read published wardrobe items"
on public.wardrobe_items for select to anon
using (
  is_published
  and editorial_status = 'approved'
  and exists (
    select 1
    from public.topics as topic
    where topic.id = wardrobe_items.topic_id
      and topic.is_published
  )
);

create policy "Authenticated users can read available wardrobe items"
on public.wardrobe_items for select to authenticated
using (
  (select private.is_admin())
  or (
    is_published
    and editorial_status = 'approved'
    and exists (
      select 1
      from public.topics as topic
      where topic.id = wardrobe_items.topic_id
        and topic.is_published
    )
  )
);

create policy "Admins can create wardrobe items"
on public.wardrobe_items for insert to authenticated
with check (
  (select private.is_admin())
  and created_by = (select auth.uid())
  and editorial_status = 'draft'
  and content_version = 1
  and not is_published
);

create policy "Admins can update wardrobe items"
on public.wardrobe_items for update to authenticated
using (
  (select private.is_admin())
  and not is_published
)
with check (
  (select private.is_admin())
  and not is_published
);

create policy "Admins can delete wardrobe items"
on public.wardrobe_items for delete to authenticated
using (
  (select private.is_admin())
  and not is_published
);

revoke all on table public.wardrobe_items from anon, authenticated, service_role;

grant select (
  id,
  topic_id,
  name,
  icon,
  category,
  rarity,
  points,
  unlock_rule,
  sort_order,
  content_version,
  is_published,
  published_at,
  updated_at
) on public.wardrobe_items to anon, authenticated;

grant insert (
  id,
  topic_id,
  name,
  icon,
  category,
  rarity,
  points,
  unlock_rule,
  editorial_note,
  sort_order,
  created_by
) on public.wardrobe_items to authenticated;
grant update (
  name,
  icon,
  category,
  rarity,
  points,
  unlock_rule,
  editorial_note,
  editorial_status,
  sort_order
) on public.wardrobe_items to authenticated;
grant delete on public.wardrobe_items to authenticated;

grant select on table public.wardrobe_items to service_role;
grant insert (
  id,
  topic_id,
  name,
  icon,
  category,
  rarity,
  points,
  unlock_rule,
  editorial_note,
  editorial_status,
  sort_order,
  content_version,
  is_published,
  created_by
) on public.wardrobe_items to service_role;
grant update (
  topic_id,
  name,
  icon,
  category,
  rarity,
  points,
  unlock_rule,
  editorial_note,
  editorial_status,
  sort_order,
  content_version,
  is_published
) on public.wardrobe_items to service_role;
grant delete on public.wardrobe_items to service_role;

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
  'Lists unpublished wardrobe drafts for one topic, optionally narrowed to one item, for an authenticated administrator.';

revoke all on function public.list_admin_wardrobe_item_drafts(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.list_admin_wardrobe_item_drafts(uuid, uuid)
  to authenticated;

commit;
