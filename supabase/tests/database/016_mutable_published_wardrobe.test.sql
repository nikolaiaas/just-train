begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(28);

select has_table(
  'private',
  'wardrobe_item_revisions',
  'published wardrobe edits have a private staging area'
);
select ok(
  not has_table_privilege(
    'anon',
    'private.wardrobe_item_revisions',
    'select'
  )
  and not has_table_privilege(
    'authenticated',
    'private.wardrobe_item_revisions',
    'select'
  )
  and not has_table_privilege(
    'service_role',
    'private.wardrobe_item_revisions',
    'select'
  ),
  'pending revisions cannot be read directly by any API role'
);
select has_function(
  'public',
  'save_admin_wardrobe_item_draft',
  array[
    'uuid',
    'uuid',
    'timestamp with time zone',
    'text',
    'text',
    'wardrobe_item_category',
    'wardrobe_equip_slot',
    'wardrobe_item_rarity',
    'integer',
    'text',
    'text',
    'integer'
  ],
  'wardrobe edits use one guarded save operation'
);
select has_function(
  'public',
  'decide_admin_wardrobe_item_draft',
  array['uuid', 'uuid', 'timestamp with time zone', 'wardrobe_editorial_status'],
  'wardrobe reviews use one guarded decision operation'
);
select ok(
  (
    select function.prosecdef
      and function.provolatile = 'v'
      and function.proconfig @> array['search_path=""']::text[]
    from pg_proc as function
    where function.oid =
      'public.save_admin_wardrobe_item_draft(uuid,uuid,timestamp with time zone,text,text,wardrobe_item_category,wardrobe_equip_slot,wardrobe_item_rarity,integer,text,text,integer)'::regprocedure
  ),
  'the wardrobe save is a volatile fixed-path security definer'
);
select ok(
  (
    select function.prosecdef
      and function.provolatile = 'v'
      and function.proconfig @> array['search_path=""']::text[]
    from pg_proc as function
    where function.oid =
      'public.decide_admin_wardrobe_item_draft(uuid,uuid,timestamp with time zone,wardrobe_editorial_status)'::regprocedure
  ),
  'the wardrobe review is a volatile fixed-path security definer'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.save_admin_wardrobe_item_draft(uuid,uuid,timestamp with time zone,text,text,wardrobe_item_category,wardrobe_equip_slot,wardrobe_item_rarity,integer,text,text,integer)',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'public.save_admin_wardrobe_item_draft(uuid,uuid,timestamp with time zone,text,text,wardrobe_item_category,wardrobe_equip_slot,wardrobe_item_rarity,integer,text,text,integer)',
    'execute'
  )
  and not has_function_privilege(
    'service_role',
    'public.save_admin_wardrobe_item_draft(uuid,uuid,timestamp with time zone,text,text,wardrobe_item_category,wardrobe_equip_slot,wardrobe_item_rarity,integer,text,text,integer)',
    'execute'
  )
  and has_function_privilege(
    'authenticated',
    'public.decide_admin_wardrobe_item_draft(uuid,uuid,timestamp with time zone,wardrobe_editorial_status)',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'public.decide_admin_wardrobe_item_draft(uuid,uuid,timestamp with time zone,wardrobe_editorial_status)',
    'execute'
  )
  and not has_function_privilege(
    'service_role',
    'public.decide_admin_wardrobe_item_draft(uuid,uuid,timestamp with time zone,wardrobe_editorial_status)',
    'execute'
  ),
  'only authenticated callers may enter the guarded save and review operations'
);

insert into public.topics (
  id,
  slug,
  title,
  description,
  is_published,
  created_by,
  created_at,
  updated_at
)
values (
  'fb000000-0000-4000-8000-000000000001',
  'garderobe-revisionskontrol',
  'Garderobe revisionskontrol',
  'Et syntetisk publiceret emne med en ældre garderobeting.',
  true,
  '10000000-0000-4000-8000-000000000003',
  '2026-08-23 06:00:00+00',
  '2026-08-23 06:00:00+00'
);
insert into public.goals (
  id,
  topic_id,
  slug,
  title,
  sort_order,
  is_published,
  created_by,
  created_at,
  updated_at
)
values (
  'fb100000-0000-4000-8000-000000000001',
  'fb000000-0000-4000-8000-000000000001',
  'garderobe-maal',
  'Garderobemål',
  10,
  true,
  '10000000-0000-4000-8000-000000000003',
  '2026-08-23 06:01:00+00',
  '2026-08-23 06:01:00+00'
);
insert into public.exercises (
  id,
  goal_id,
  slug,
  title,
  sort_order,
  is_published,
  created_by,
  created_at,
  updated_at
)
values (
  'fb200000-0000-4000-8000-000000000001',
  'fb100000-0000-4000-8000-000000000001',
  'garderobe-deloevelse',
  'Garderobedeløvelse',
  10,
  true,
  '10000000-0000-4000-8000-000000000003',
  '2026-08-23 06:02:00+00',
  '2026-08-23 06:02:00+00'
);

-- The first row deliberately omits equip_slot, matching an item published
-- before equipment positions were authored explicitly.
insert into public.wardrobe_items (
  id,
  topic_id,
  name,
  icon,
  category,
  rarity,
  points,
  editorial_status,
  content_version,
  is_published,
  created_by,
  created_at,
  updated_at
)
values (
  'fb300000-0000-4000-8000-000000000001',
  'fb000000-0000-4000-8000-000000000001',
  'Ældre belønning',
  '🎁',
  'clothing',
  'rare',
  175,
  'approved',
  3,
  true,
  '10000000-0000-4000-8000-000000000003',
  '2026-08-23 06:03:00+00',
  '2026-08-23 06:03:00+00'
);
insert into public.wardrobe_items (
  id,
  topic_id,
  name,
  icon,
  category,
  equip_slot,
  rarity,
  points,
  editorial_status,
  is_published,
  created_by,
  created_at,
  updated_at
)
values (
  'fb300000-0000-4000-8000-000000000002',
  'fb000000-0000-4000-8000-000000000001',
  'Regnbuehjelm',
  '🪖',
  'clothing',
  'head',
  'common',
  100,
  'approved',
  true,
  '10000000-0000-4000-8000-000000000003',
  '2026-08-23 06:04:00+00',
  '2026-08-23 06:04:00+00'
);

select is(
  (
    select equip_slot::text
    from public.wardrobe_items
    where id = 'fb300000-0000-4000-8000-000000000001'
  ),
  'accessory',
  'a legacy published row initially carries the additive accessory default'
);

set local role service_role;
select lives_ok(
  $$
    insert into public.child_wardrobe_items (
      child_profile_id,
      wardrobe_item_id
    ) values
      (
        '30000000-0000-4000-8000-000000000001',
        'fb300000-0000-4000-8000-000000000001'
      ),
      (
        '30000000-0000-4000-8000-000000000001',
        'fb300000-0000-4000-8000-000000000002'
      )
  $$,
  'trusted reward code can grant both published items'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;
select results_eq(
  $$
    select equip_slot::text, is_equipped
    from public.set_child_wardrobe_item_equipped(
      '30000000-0000-4000-8000-000000000001',
      'fb300000-0000-4000-8000-000000000001',
      true
    )
  $$,
  $$ values ('accessory'::text, true) $$,
  'the child may already be wearing the legacy accessory'
);
select results_eq(
  $$
    select equip_slot::text, is_equipped
    from public.set_child_wardrobe_item_equipped(
      '30000000-0000-4000-8000-000000000001',
      'fb300000-0000-4000-8000-000000000002',
      true
    )
  $$,
  $$ values ('head'::text, true) $$,
  'the child may simultaneously wear an existing head item'
);
select throws_ok(
  $$
    select *
    from public.save_admin_wardrobe_item_draft(
      'fb300000-0000-4000-8000-000000000001',
      'fb000000-0000-4000-8000-000000000001',
      '2026-08-23 06:03:00+00',
      'Stjernehjelm',
      '🪖',
      'clothing',
      'head',
      'rare',
      175,
      null,
      'Rettet syntetisk eksempel.',
      10
    )
  $$,
  '42501',
  'Administrator access is required.',
  'a family member cannot stage a published catalog edit'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);
set local role authenticated;
select results_eq(
  $$
    select
      name,
      equip_slot::text,
      is_published,
      has_pending_revision,
      editorial_status::text,
      content_version
    from public.list_admin_wardrobe_item_drafts(
      'fb000000-0000-4000-8000-000000000001',
      'fb300000-0000-4000-8000-000000000001'
    )
  $$,
  $$
    values (
      'Ældre belønning'::text,
      'accessory'::text,
      true,
      false,
      'approved'::text,
      3
    )
  $$,
  'the editor loads the legacy published item as editable canonical content'
);
select results_eq(
  $$
    select id
    from public.save_admin_wardrobe_item_draft(
      'fb300000-0000-4000-8000-000000000001',
      'fb000000-0000-4000-8000-000000000001',
      '2026-08-23 06:03:00+00',
      'Stjernehjelm',
      '🪖',
      'clothing',
      'head',
      'rare',
      175,
      null,
      'Rettet syntetisk eksempel.',
      10
    )
  $$,
  $$ values ('fb300000-0000-4000-8000-000000000001'::uuid) $$,
  'an administrator can stage corrected content and equipment position'
);
select results_eq(
  $$
    select
      name,
      equip_slot::text,
      is_published,
      has_pending_revision,
      editorial_status::text,
      content_version
    from public.list_admin_wardrobe_item_drafts(
      'fb000000-0000-4000-8000-000000000001',
      'fb300000-0000-4000-8000-000000000001'
    )
  $$,
  $$
    values (
      'Stjernehjelm'::text,
      'head'::text,
      true,
      true,
      'draft'::text,
      3
    )
  $$,
  'the admin loader overlays the pending revision without faking publication'
);

reset role;
select results_eq(
  $$
    select name, equip_slot::text, content_version, editorial_status::text
    from public.wardrobe_items
    where id = 'fb300000-0000-4000-8000-000000000001'
  $$,
  $$
    values (
      'Ældre belønning'::text,
      'accessory'::text,
      3,
      'approved'::text
    )
  $$,
  'staging leaves the canonical published row unchanged'
);
select is(
  (
    select count(*)::integer
    from private.wardrobe_item_revisions
    where wardrobe_item_id = 'fb300000-0000-4000-8000-000000000001'
      and editorial_status = 'draft'
  ),
  1,
  'the pending draft is persisted privately'
);

set local role anon;
select results_eq(
  $$
    select name, equip_slot::text, content_version
    from public.wardrobe_items
    where id = 'fb300000-0000-4000-8000-000000000001'
  $$,
  $$ values ('Ældre belønning'::text, 'accessory'::text, 3) $$,
  'an unapproved staged edit is invisible to public catalog readers'
);

reset role;
set local role authenticated;
select results_eq(
  $$
    with changed as (
      update public.wardrobe_items
      set equip_slot = 'feet'
      where id = 'fb300000-0000-4000-8000-000000000001'
      returning 1
    )
    select count(*)::integer from changed
  $$,
  $$ values (0) $$,
  'row security prevents an administrator from bypassing the staged save operation'
);
select results_eq(
  $$
    select id
    from public.decide_admin_wardrobe_item_draft(
      'fb300000-0000-4000-8000-000000000001',
      'fb000000-0000-4000-8000-000000000001',
      (
        select updated_at
        from public.list_admin_wardrobe_item_drafts(
          'fb000000-0000-4000-8000-000000000001',
          'fb300000-0000-4000-8000-000000000001'
        )
      ),
      'approved'
    )
  $$,
  $$ values ('fb300000-0000-4000-8000-000000000001'::uuid) $$,
  'the staged correction can be explicitly approved'
);
select results_eq(
  $$
    select editorial_status::text, has_pending_revision, content_version
    from public.list_admin_wardrobe_item_drafts(
      'fb000000-0000-4000-8000-000000000001',
      'fb300000-0000-4000-8000-000000000001'
    )
  $$,
  $$ values ('approved'::text, true, 3) $$,
  'approval marks only the pending version and does not increment the live version'
);

reset role;
select results_eq(
  $$
    select name, equip_slot::text, content_version
    from public.wardrobe_items
    where id = 'fb300000-0000-4000-8000-000000000001'
  $$,
  $$ values ('Ældre belønning'::text, 'accessory'::text, 3) $$,
  'an approved correction remains private until topic publication'
);

set local role authenticated;
select results_eq(
  $$
    select changed, published_wardrobe_item_count
    from public.publish_admin_topic(
      'fb000000-0000-4000-8000-000000000001',
      (
        select updated_at
        from public.list_admin_wardrobe_item_drafts(
          'fb000000-0000-4000-8000-000000000001',
          'fb300000-0000-4000-8000-000000000001'
        )
      )
    )
  $$,
  $$ values (true, 1) $$,
  'topic publication atomically promotes the one approved revision'
);

reset role;
select results_eq(
  $$
    select
      name,
      equip_slot::text,
      content_version,
      editorial_status::text,
      is_published
    from public.wardrobe_items
    where id = 'fb300000-0000-4000-8000-000000000001'
  $$,
  $$
    values (
      'Stjernehjelm'::text,
      'head'::text,
      4,
      'approved'::text,
      true
    )
  $$,
  'publication installs the reviewed content as the next live version'
);
select is(
  (
    select count(*)::integer
    from private.wardrobe_item_revisions
    where wardrobe_item_id = 'fb300000-0000-4000-8000-000000000001'
  ),
  0,
  'the promoted revision no longer remains pending'
);
select results_eq(
  $$
    select wardrobe_item_id, equip_slot::text, is_equipped
    from public.child_wardrobe_items
    where child_profile_id = '30000000-0000-4000-8000-000000000001'
      and wardrobe_item_id in (
        'fb300000-0000-4000-8000-000000000001',
        'fb300000-0000-4000-8000-000000000002'
      )
    order by wardrobe_item_id
  $$,
  $$
    values
      (
        'fb300000-0000-4000-8000-000000000001'::uuid,
        'head'::text,
        false
      ),
      (
        'fb300000-0000-4000-8000-000000000002'::uuid,
        'head'::text,
        true
      )
  $$,
  'a slot correction unequips the revised item and preserves the existing head choice'
);

set local role anon;
select results_eq(
  $$
    select name, equip_slot::text, content_version
    from public.wardrobe_items
    where id = 'fb300000-0000-4000-8000-000000000001'
  $$,
  $$ values ('Stjernehjelm'::text, 'head'::text, 4) $$,
  'public catalog readers see the reviewed replacement after publication'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;
select results_eq(
  $$
    select wardrobe_item_id, equip_slot::text, catalog_equip_slot::text, is_equipped
    from public.list_child_wardrobe(
      '30000000-0000-4000-8000-000000000001'
    )
    where wardrobe_item_id in (
      'fb300000-0000-4000-8000-000000000001',
      'fb300000-0000-4000-8000-000000000002'
    )
    order by wardrobe_item_id
  $$,
  $$
    values
      (
        'fb300000-0000-4000-8000-000000000001'::uuid,
        'head'::text,
        'head'::text,
        false
      ),
      (
        'fb300000-0000-4000-8000-000000000002'::uuid,
        'head'::text,
        'head'::text,
        true
      )
  $$,
  'the family wardrobe API returns consistent catalog and inventory positions'
);

select * from finish();
rollback;
