begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(77);

select has_table(
  'public',
  'wardrobe_items',
  'topic-specific wardrobe items have a persisted catalog'
);
select results_eq(
  $$
    select column_name::text collate "default"
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'wardrobe_items'
    order by ordinal_position
  $$,
  $$
    values
      ('id'::text),
      ('topic_id'::text),
      ('name'::text),
      ('icon'::text),
      ('category'::text),
      ('rarity'::text),
      ('points'::text),
      ('unlock_rule'::text),
      ('editorial_note'::text),
      ('editorial_status'::text),
      ('sort_order'::text),
      ('content_version'::text),
      ('is_published'::text),
      ('published_at'::text),
      ('created_by'::text),
      ('created_at'::text),
      ('updated_at'::text),
      ('equip_slot'::text)
  $$,
  'the wardrobe catalog exposes only its reviewed content and audit fields'
);
select results_eq(
  $$
    select enumlabel::text collate "default"
    from pg_enum
    where enumtypid = 'public.wardrobe_item_category'::regtype
    order by enumsortorder
  $$,
  $$ values ('clothing'::text), ('equipment'::text), ('effect'::text) $$,
  'wardrobe categories match the bounded AI proposal contract'
);
select results_eq(
  $$
    select enumlabel::text collate "default"
    from pg_enum
    where enumtypid = 'public.wardrobe_item_rarity'::regtype
    order by enumsortorder
  $$,
  $$ values ('common'::text), ('rare'::text), ('special'::text) $$,
  'wardrobe rarities match the bounded AI proposal contract'
);
select results_eq(
  $$
    select enumlabel::text collate "default"
    from pg_enum
    where enumtypid = 'public.wardrobe_editorial_status'::regtype
    order by enumsortorder
  $$,
  $$ values ('draft'::text), ('approved'::text), ('rejected'::text) $$,
  'wardrobe items have explicit draft, approved, and rejected decisions'
);
select ok(
  (
    select column_default like '%gen_random_uuid%'
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'wardrobe_items'
      and column_name = 'id'
  ),
  'wardrobe item identifiers are generated UUIDs by default'
);
select ok(
  exists (
    select 1
    from pg_constraint as constraint_record
    join pg_class as relation on relation.oid = constraint_record.conrelid
    join pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'wardrobe_items'
      and constraint_record.conname = 'wardrobe_items_topic_id_fkey'
      and constraint_record.confdeltype = 'c'
  ),
  'deleting a topic cascades to its wardrobe items'
);
select is(
  (
    select relation.relrowsecurity
    from pg_class as relation
    join pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'wardrobe_items'
  ),
  true,
  'row-level security is enabled for wardrobe items'
);
select results_eq(
  $$
    select
      policyname::text collate "default",
      cmd::text collate "default"
    from pg_policies
    where schemaname = 'public'
      and tablename = 'wardrobe_items'
    order by policyname
  $$,
  $$
    values
      ('Admins can create wardrobe items'::text, 'INSERT'::text),
      ('Admins can delete wardrobe items'::text, 'DELETE'::text),
      ('Admins can update wardrobe items'::text, 'UPDATE'::text),
      ('Anonymous users can read published wardrobe items'::text, 'SELECT'::text),
      ('Authenticated users can read available wardrobe items'::text, 'SELECT'::text)
  $$,
  'wardrobe policies separate public reading from administrator management'
);
select results_eq(
  $$
    select indexname::text collate "default"
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'wardrobe_items'
      and indexname <> 'wardrobe_items_pkey'
    order by indexname
  $$,
  $$
    values
      ('wardrobe_items_created_by_idx'::text),
      ('wardrobe_items_editorial_queue_idx'::text),
      ('wardrobe_items_public_topic_sort_idx'::text),
      ('wardrobe_items_topic_sort_idx'::text)
  $$,
  'wardrobe indexes cover provenance, topic ordering, public reads, and the review queue'
);
select ok(
  exists (
    select 1
    from pg_index as index_record
    join pg_class as index_relation
      on index_relation.oid = index_record.indexrelid
    where index_relation.relname = 'wardrobe_items_created_by_idx'
      and index_record.indpred is not null
      and pg_get_expr(index_record.indpred, index_record.indrelid)
        = '(created_by IS NOT NULL)'
  ),
  'the provenance index omits service-created rows without a creator'
);
select results_eq(
  $$
    select distinct trigger_name::text collate "default"
    from information_schema.triggers
    where event_object_schema = 'public'
      and event_object_table = 'wardrobe_items'
    order by trigger_name
  $$,
  $$
    values
      ('wardrobe_items_guard_review_state'::text),
      ('wardrobe_items_set_published_at'::text),
      ('wardrobe_items_set_updated_at'::text)
  $$,
  'wardrobe rows have review-state and timestamp triggers'
);
select ok(
  has_column_privilege('anon', 'public.wardrobe_items', 'name', 'select')
  and not has_column_privilege(
    'anon',
    'public.wardrobe_items',
    'editorial_note',
    'select'
  )
  and not has_table_privilege('anon', 'public.wardrobe_items', 'insert')
  and not has_table_privilege('anon', 'public.wardrobe_items', 'update')
  and not has_table_privilege('anon', 'public.wardrobe_items', 'delete'),
  'anonymous clients can read public item fields but not notes or mutations'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'public.wardrobe_items',
    'select'
  )
  and has_column_privilege(
    'authenticated',
    'public.wardrobe_items',
    'name',
    'select'
  )
  and has_column_privilege(
    'authenticated',
    'public.wardrobe_items',
    'updated_at',
    'select'
  )
  and not has_column_privilege(
    'authenticated',
    'public.wardrobe_items',
    'editorial_note',
    'select'
  )
  and not has_column_privilege(
    'authenticated',
    'public.wardrobe_items',
    'editorial_status',
    'select'
  )
  and not has_column_privilege(
    'authenticated',
    'public.wardrobe_items',
    'created_by',
    'select'
  )
  and not has_column_privilege(
    'authenticated',
    'public.wardrobe_items',
    'created_at',
    'select'
  ),
  'authenticated clients receive only the same public columns as anonymous clients'
);
select ok(
  has_column_privilege(
    'authenticated',
    'public.wardrobe_items',
    'topic_id',
    'insert'
  )
  and has_column_privilege(
    'authenticated',
    'public.wardrobe_items',
    'created_by',
    'insert'
  )
  and not has_column_privilege(
    'authenticated',
    'public.wardrobe_items',
    'editorial_status',
    'insert'
  )
  and not has_column_privilege(
    'authenticated',
    'public.wardrobe_items',
    'content_version',
    'insert'
  )
  and not has_column_privilege(
    'authenticated',
    'public.wardrobe_items',
    'is_published',
    'insert'
  ),
  'direct administrator inserts provide lineage but cannot bypass database-owned review defaults'
);
select ok(
  has_column_privilege(
    'authenticated',
    'public.wardrobe_items',
    'editorial_status',
    'update'
  )
  and not has_column_privilege(
    'authenticated',
    'public.wardrobe_items',
    'topic_id',
    'update'
  )
  and not has_column_privilege(
    'authenticated',
    'public.wardrobe_items',
    'created_by',
    'update'
  )
  and not has_column_privilege(
    'authenticated',
    'public.wardrobe_items',
    'content_version',
    'update'
  )
  and not has_column_privilege(
    'authenticated',
    'public.wardrobe_items',
    'is_published',
    'update'
  ),
  'direct administrator updates cannot move lineage, versions, or publication state'
);
select ok(
  has_table_privilege('service_role', 'public.wardrobe_items', 'select')
  and has_column_privilege(
    'service_role',
    'public.wardrobe_items',
    'editorial_status',
    'update'
  )
  and has_column_privilege(
    'service_role',
    'public.wardrobe_items',
    'is_published',
    'update'
  )
  and not has_column_privilege(
    'service_role',
    'public.wardrobe_items',
    'updated_at',
    'update'
  )
  and has_table_privilege('service_role', 'public.wardrobe_items', 'delete'),
  'trusted server code retains bounded publication capability and trigger-owned timestamps'
);
select ok(
  not has_function_privilege(
    'anon',
    'private.guard_wardrobe_item_review_state()',
    'execute'
  )
  and not has_function_privilege(
    'authenticated',
    'private.guard_wardrobe_item_review_state()',
    'execute'
  )
  and not has_function_privilege(
    'service_role',
    'private.guard_wardrobe_item_review_state()',
    'execute'
  ),
  'the review guard can run only as an internal trigger'
);
select ok(
  (
    select
      function.prosecdef
      and function.provolatile = 's'
      and function.proconfig @> array['search_path=""']::text[]
      and has_function_privilege(
        'authenticated',
        function.oid,
        'execute'
      )
      and not has_function_privilege('anon', function.oid, 'execute')
      and not has_function_privilege('service_role', function.oid, 'execute')
    from pg_proc as function
    join pg_namespace as namespace on namespace.oid = function.pronamespace
    where namespace.nspname = 'public'
      and function.proname = 'list_admin_wardrobe_item_drafts'
      and function.pronargs = 2
  ),
  'the admin draft reader is a fixed-path stable definer function with authenticated-only execute access'
);
select is(
  pg_get_function_result(
    'public.list_admin_wardrobe_item_drafts(uuid,uuid)'::regprocedure
  ),
  'TABLE(id uuid, topic_id uuid, name text, icon text, category wardrobe_item_category, equip_slot wardrobe_equip_slot, rarity wardrobe_item_rarity, points integer, unlock_rule text, editorial_note text, editorial_status wardrobe_editorial_status, sort_order integer, content_version integer, is_published boolean, published_at timestamp with time zone, created_by uuid, created_at timestamp with time zone, updated_at timestamp with time zone, has_pending_revision boolean)',
  'the admin draft reader returns the complete generated-client wardrobe row shape'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);
set local role authenticated;

select throws_ok(
  $$
    insert into public.wardrobe_items (
      id, topic_id, name, icon, category, points, created_by
    ) values (
      'e0000000-0000-4000-8000-000000000099',
      '40000000-0000-4000-8000-000000000001',
      'Forkert ophav',
      '❌',
      'effect',
      100,
      '10000000-0000-4000-8000-000000000001'
    )
  $$,
  '42501',
  null,
  'an administrator cannot attribute a wardrobe item to another profile'
);
select throws_ok(
  $$
    insert into public.wardrobe_items (
      topic_id,
      name,
      icon,
      category,
      points,
      editorial_status,
      created_by
    ) values (
      '40000000-0000-4000-8000-000000000001',
      'Forhåndsgodkendt',
      '❌',
      'effect',
      100,
      'approved',
      '10000000-0000-4000-8000-000000000003'
    )
  $$,
  '42501',
  null,
  'a direct administrator insert cannot create a pre-approved item'
);
select throws_ok(
  $$
    insert into public.wardrobe_items (
      topic_id, name, icon, category, points, is_published, created_by
    ) values (
      '40000000-0000-4000-8000-000000000001',
      'Forhåndspubliceret',
      '❌',
      'effect',
      100,
      true,
      '10000000-0000-4000-8000-000000000003'
    )
  $$,
  '42501',
  null,
  'a direct administrator insert cannot choose publication state'
);
select throws_ok(
  $$
    insert into public.wardrobe_items (
      topic_id, name, icon, category, points, content_version, created_by
    ) values (
      '40000000-0000-4000-8000-000000000001',
      'Forkert version',
      '❌',
      'effect',
      100,
      2,
      '10000000-0000-4000-8000-000000000003'
    )
  $$,
  '42501',
  null,
  'a direct administrator insert cannot choose a content version'
);
select lives_ok(
  $$
    insert into public.wardrobe_items (
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
    ) values
      (
        'e0000000-0000-4000-8000-000000000001',
        '40000000-0000-4000-8000-000000000001',
        'Stjernestøvler',
        '⭐',
        'clothing',
        'common',
        100,
        null,
        'Et syntetisk AI-forslag til menneskelig gennemgang.',
        10,
        '10000000-0000-4000-8000-000000000003'
      ),
      (
        'e0000000-0000-4000-8000-000000000002',
        '40000000-0000-4000-8000-000000000001',
        'Balancekrone',
        '👑',
        'clothing',
        'special',
        null,
        'Gennemfør det første mål',
        'Gennemgået uden brand eller køb.',
        20,
        '10000000-0000-4000-8000-000000000003'
      ),
      (
        'e0000000-0000-4000-8000-000000000003',
        '40000000-0000-4000-8000-000000000002',
        'Kladdeeffekt',
        '✨',
        'effect',
        'rare',
        250,
        null,
        null,
        10,
        '10000000-0000-4000-8000-000000000003'
      ),
      (
        'e0000000-0000-4000-8000-000000000004',
        '40000000-0000-4000-8000-000000000001',
        'Afvist kappe',
        '🦸',
        'clothing',
        'rare',
        300,
        null,
        'Passer ikke til det valgte emne.',
        30,
        '10000000-0000-4000-8000-000000000003'
      ),
      (
        'e0000000-0000-4000-8000-000000000005',
        '40000000-0000-4000-8000-000000000001',
        'Regnbuespor',
        '🌈',
        'effect',
        'rare',
        250,
        null,
        null,
        40,
        '10000000-0000-4000-8000-000000000003'
      )
  $$,
  'an administrator can persist valid point and rule item drafts'
);
select is(
  (
    select count(*)::integer
    from (
      select *
      from public.list_admin_wardrobe_item_drafts(
        '40000000-0000-4000-8000-000000000001'
      )
      union all
      select *
      from public.list_admin_wardrobe_item_drafts(
        '40000000-0000-4000-8000-000000000002'
      )
    ) as item
    where id::text like 'e0000000-%'
      and editorial_status = 'draft'
      and not is_published
      and published_at is null
      and content_version = 1
  ),
  5,
  'direct inserts always use database-owned draft, version, and publication defaults'
);
select results_eq(
  $$
    select
      id,
      name,
      editorial_note,
      editorial_status::text,
      created_by
    from public.list_admin_wardrobe_item_drafts(
      '40000000-0000-4000-8000-000000000001'
    )
    where id::text like 'e0000000-%'
    order by sort_order, id
  $$,
  $$
    values
      (
        'e0000000-0000-4000-8000-000000000001'::uuid,
        'Stjernestøvler'::text,
        'Et syntetisk AI-forslag til menneskelig gennemgang.'::text,
        'draft'::text,
        '10000000-0000-4000-8000-000000000003'::uuid
      ),
      (
        'e0000000-0000-4000-8000-000000000002'::uuid,
        'Balancekrone'::text,
        'Gennemgået uden brand eller køb.'::text,
        'draft'::text,
        '10000000-0000-4000-8000-000000000003'::uuid
      ),
      (
        'e0000000-0000-4000-8000-000000000004'::uuid,
        'Afvist kappe'::text,
        'Passer ikke til det valgte emne.'::text,
        'draft'::text,
        '10000000-0000-4000-8000-000000000003'::uuid
      ),
      (
        'e0000000-0000-4000-8000-000000000005'::uuid,
        'Regnbuespor'::text,
        null::text,
        'draft'::text,
        '10000000-0000-4000-8000-000000000003'::uuid
      )
  $$,
  'an administrator can list full unpublished drafts for exactly one topic in deterministic order'
);
select results_eq(
  $$
    select id, topic_id, name, editorial_note, editorial_status::text
    from public.list_admin_wardrobe_item_drafts(
      '40000000-0000-4000-8000-000000000001',
      'e0000000-0000-4000-8000-000000000002'
    )
  $$,
  $$
    values (
      'e0000000-0000-4000-8000-000000000002'::uuid,
      '40000000-0000-4000-8000-000000000001'::uuid,
      'Balancekrone'::text,
      'Gennemgået uden brand eller køb.'::text,
      'draft'::text
    )
  $$,
  'the administrator RPC can safely narrow one topic to one draft item'
);
select is(
  (
    select count(*)::integer
    from public.list_admin_wardrobe_item_drafts(
      '40000000-0000-4000-8000-000000000002',
      'e0000000-0000-4000-8000-000000000002'
    )
  ),
  0,
  'the optional item identifier cannot cross its requested topic boundary'
);
select throws_ok(
  $$ select * from public.list_admin_wardrobe_item_drafts(null) $$,
  '22023',
  'A topic identifier is required.',
  'the administrator RPC rejects a missing topic boundary'
);

select throws_ok(
  $$
    insert into public.wardrobe_items (
      topic_id, name, icon, category, points, unlock_rule, created_by
    ) values (
      '40000000-0000-4000-8000-000000000001',
      'To priser',
      '🎁',
      'equipment',
      100,
      'Gennemfør et mål',
      '10000000-0000-4000-8000-000000000003'
    )
  $$,
  '23514',
  null,
  'an item cannot have both a point price and an unlock rule'
);
select throws_ok(
  $$
    insert into public.wardrobe_items (
      topic_id, name, icon, category, created_by
    ) values (
      '40000000-0000-4000-8000-000000000001',
      'Ingen pris',
      '🎁',
      'equipment',
      '10000000-0000-4000-8000-000000000003'
    )
  $$,
  '23514',
  null,
  'an item must have either a point price or an unlock rule'
);
select throws_ok(
  $$
    insert into public.wardrobe_items (
      topic_id, name, icon, category, points, created_by
    ) values (
      '40000000-0000-4000-8000-000000000001',
      'Gratis pris',
      '🎁',
      'equipment',
      0,
      '10000000-0000-4000-8000-000000000003'
    )
  $$,
  '23514',
  null,
  'zero is represented as a null point price plus an unlock rule, never as a stored price'
);
select throws_ok(
  $$
    insert into public.wardrobe_items (
      topic_id, name, icon, category, unlock_rule, created_by
    ) values (
      '40000000-0000-4000-8000-000000000001',
      'Tom regel',
      '🎁',
      'equipment',
      '',
      '10000000-0000-4000-8000-000000000003'
    )
  $$,
  '23514',
  null,
  'an unlock rule cannot be empty'
);
select throws_ok(
  $$ update public.wardrobe_items set name = repeat('n', 81)
     where id = 'e0000000-0000-4000-8000-000000000001' $$,
  '23514',
  null,
  'wardrobe names share the AI proposal eighty-character ceiling'
);
select throws_ok(
  $$ update public.wardrobe_items set icon = ' ⭐'
     where id = 'e0000000-0000-4000-8000-000000000001' $$,
  '23514',
  null,
  'wardrobe icons must already be trimmed'
);
select throws_ok(
  $$ update public.wardrobe_items set points = null, unlock_rule = repeat('r', 201)
     where id = 'e0000000-0000-4000-8000-000000000001' $$,
  '23514',
  null,
  'unlock rules share the AI proposal two-hundred-character ceiling'
);
select throws_ok(
  $$ update public.wardrobe_items set editorial_note = ''
     where id = 'e0000000-0000-4000-8000-000000000001' $$,
  '23514',
  null,
  'an absent editorial note is stored as null instead of an empty string'
);
select throws_ok(
  $$ update public.wardrobe_items set editorial_note = repeat('n', 501)
     where id = 'e0000000-0000-4000-8000-000000000001' $$,
  '23514',
  null,
  'editorial notes are bounded to five hundred characters'
);
select throws_ok(
  $$ update public.wardrobe_items set sort_order = -1
     where id = 'e0000000-0000-4000-8000-000000000001' $$,
  '23514',
  null,
  'wardrobe ordering cannot be negative'
);

select lives_ok(
  $$
    update public.wardrobe_items
    set editorial_status = case id
      when 'e0000000-0000-4000-8000-000000000004'
        then 'rejected'::public.wardrobe_editorial_status
      else 'approved'::public.wardrobe_editorial_status
    end
    where id in (
      'e0000000-0000-4000-8000-000000000002',
      'e0000000-0000-4000-8000-000000000003',
      'e0000000-0000-4000-8000-000000000004',
      'e0000000-0000-4000-8000-000000000005'
    )
  $$,
  'status-only review decisions are allowed on unpublished item drafts'
);
select results_eq(
  $$
    select editorial_status::text, count(*)::integer
    from (
      select *
      from public.list_admin_wardrobe_item_drafts(
        '40000000-0000-4000-8000-000000000001'
      )
      union all
      select *
      from public.list_admin_wardrobe_item_drafts(
        '40000000-0000-4000-8000-000000000002'
      )
    ) as item
    where id::text like 'e0000000-%'
    group by editorial_status
    order by editorial_status::text
  $$,
  $$ values ('approved'::text, 3), ('draft'::text, 1), ('rejected'::text, 1) $$,
  'status-only decisions remain exactly as chosen'
);
select lives_ok(
  $$
    update public.wardrobe_items
    set name = 'Regnbuespor med glimt'
    where id = 'e0000000-0000-4000-8000-000000000005'
  $$,
  'approved unpublished content remains editable'
);
select is(
  (
    select editorial_status::text
    from public.list_admin_wardrobe_item_drafts(
      '40000000-0000-4000-8000-000000000001',
      'e0000000-0000-4000-8000-000000000005'
    )
  ),
  'draft',
  'a real content change automatically returns an approved item to draft'
);
select lives_ok(
  $$
    update public.wardrobe_items
    set editorial_status = 'approved'
    where id = 'e0000000-0000-4000-8000-000000000005'
  $$,
  'an administrator can explicitly review the changed content again'
);
select is(
  (
    select editorial_status::text
    from public.list_admin_wardrobe_item_drafts(
      '40000000-0000-4000-8000-000000000001',
      'e0000000-0000-4000-8000-000000000005'
    )
  ),
  'approved',
  'a status-only decision is not overwritten by the content-change guard'
);
select lives_ok(
  $$
    update public.wardrobe_items
    set name = 'Regnbuespor med glimt'
    where id = 'e0000000-0000-4000-8000-000000000005'
  $$,
  'writing an unchanged content value remains a valid no-op'
);
select is(
  (
    select editorial_status::text
    from public.list_admin_wardrobe_item_drafts(
      '40000000-0000-4000-8000-000000000001',
      'e0000000-0000-4000-8000-000000000005'
    )
  ),
  'approved',
  'an unchanged content value does not discard the review decision'
);

select throws_ok(
  $$ update public.wardrobe_items set created_by = '10000000-0000-4000-8000-000000000001'
     where id = 'e0000000-0000-4000-8000-000000000001' $$,
  '42501',
  null,
  'wardrobe provenance is immutable for direct administrator writes'
);
select throws_ok(
  $$ update public.wardrobe_items set topic_id = '40000000-0000-4000-8000-000000000002'
     where id = 'e0000000-0000-4000-8000-000000000001' $$,
  '42501',
  null,
  'a direct administrator update cannot move an item to another topic'
);
select throws_ok(
  $$ update public.wardrobe_items set content_version = 2
     where id = 'e0000000-0000-4000-8000-000000000001' $$,
  '42501',
  null,
  'a direct administrator update cannot rewrite content version lineage'
);
select throws_ok(
  $$ update public.wardrobe_items set is_published = true
     where id = 'e0000000-0000-4000-8000-000000000001' $$,
  '42501',
  null,
  'a direct administrator update cannot publish an item'
);

reset role;
set local session_replication_role = replica;
update public.wardrobe_items
set updated_at = '2026-01-01 00:00:00+00'
where id = 'e0000000-0000-4000-8000-000000000001';
set local session_replication_role = origin;
set local role authenticated;
update public.wardrobe_items
set name = 'Stjernestøvler med glimt'
where id = 'e0000000-0000-4000-8000-000000000001';
select ok(
  (
    select updated_at > '2026-01-01 00:00:00+00'::timestamptz
    from public.wardrobe_items
    where id = 'e0000000-0000-4000-8000-000000000001'
  ),
  'editing an unpublished wardrobe item advances its updated timestamp'
);
select lives_ok(
  $$
    update public.wardrobe_items
    set editorial_status = 'approved'
    where id = 'e0000000-0000-4000-8000-000000000001'
  $$,
  'the changed first item can pass explicit review'
);
select throws_ok(
  $$ update public.wardrobe_items set is_published = true
     where id = 'e0000000-0000-4000-8000-000000000001' $$,
  '42501',
  null,
  'publication remains unavailable to direct authenticated writes after approval'
);

reset role;
set local role service_role;
select lives_ok(
  $$
    update public.wardrobe_items
    set is_published = true
    where id in (
      'e0000000-0000-4000-8000-000000000001',
      'e0000000-0000-4000-8000-000000000002',
      'e0000000-0000-4000-8000-000000000003'
    )
  $$,
  'trusted server code can publish already approved items for a future atomic workflow'
);
select is(
  (
    select count(*)::integer
    from public.wardrobe_items
    where id::text like 'e0000000-%'
      and is_published
      and editorial_status = 'approved'
      and published_at is not null
  ),
  3,
  'published wardrobe items are approved and receive publication timestamps'
);
select throws_ok(
  $$
    update public.wardrobe_items
    set name = 'For sen ændring'
    where id = 'e0000000-0000-4000-8000-000000000001'
  $$,
  '23514',
  'Published wardrobe items are immutable.',
  'the database rejects every later content update to a published item'
);
select throws_ok(
  $$
    update public.wardrobe_items
    set editorial_status = 'rejected'
    where id = 'e0000000-0000-4000-8000-000000000001'
  $$,
  '23514',
  'Published wardrobe items are immutable.',
  'the database also rejects later review changes to a published item'
);
select lives_ok(
  $$
    insert into public.wardrobe_items (
      id, topic_id, name, icon, category, points
    ) values (
      'e2000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      'Serviceting uden ophav',
      '🛠️',
      'equipment',
      75
    )
  $$,
  'trusted server code can create an attributable-when-known draft without inventing provenance'
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
    select id, created_by, editorial_status::text, is_published
    from public.list_admin_wardrobe_item_drafts(
      '40000000-0000-4000-8000-000000000001',
      'e2000000-0000-4000-8000-000000000001'
    )
  $$,
  $$
    values (
      'e2000000-0000-4000-8000-000000000001'::uuid,
      null::uuid,
      'draft'::text,
      false
    )
  $$,
  'the admin RPC preserves nullable service-side provenance without exposing it publicly'
);
select is(
  (
    select count(*)::integer
    from public.list_admin_wardrobe_item_drafts(
      '40000000-0000-4000-8000-000000000001',
      'e0000000-0000-4000-8000-000000000001'
    )
  ),
  1,
  'the admin editor can reopen an already-published item for a staged correction'
);
select lives_ok(
  $$ delete from public.wardrobe_items
     where id = 'e0000000-0000-4000-8000-000000000001' $$,
  'a direct administrator delete safely affects no published item rows'
);
select is(
  (
    select count(*)::integer
    from public.wardrobe_items
    where id = 'e0000000-0000-4000-8000-000000000001'
  ),
  1,
  'a published wardrobe item remains after a direct authenticated delete attempt'
);

reset role;
set local role anon;
select is(
  (
    select count(*)::integer
    from public.wardrobe_items
    where id::text like 'e0000000-%'
  ),
  2,
  'anonymous clients see only approved published items beneath a published topic'
);
select results_eq(
  $$
    select name, category::text, points, unlock_rule
    from public.wardrobe_items
    where id::text like 'e0000000-%'
    order by sort_order
  $$,
  $$
    values
      ('Stjernestøvler med glimt'::text, 'clothing'::text, 100, null::text),
      ('Balancekrone'::text, 'clothing'::text, null::integer, 'Gennemfør det første mål'::text)
  $$,
  'public item fields preserve both point-price and unlock-rule rewards'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated"}',
  true
);
set local role authenticated;
select throws_ok(
  $$
    select *
    from public.list_admin_wardrobe_item_drafts(
      '40000000-0000-4000-8000-000000000001'
    )
  $$,
  '42501',
  'Administrator access is required.',
  'the draft RPC rejects an authenticated request without a user identity'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;
select is(
  (
    select count(*)::integer
    from public.wardrobe_items
    where id::text like 'e0000000-%'
  ),
  2,
  'an authenticated parent sees the same published wardrobe catalog as an anonymous client'
);
select throws_ok(
  $$
    select *
    from public.list_admin_wardrobe_item_drafts(
      '40000000-0000-4000-8000-000000000001'
    )
  $$,
  '42501',
  'Administrator access is required.',
  'an authenticated parent cannot use the privileged wardrobe-draft reader'
);
select throws_ok(
  $$
    insert into public.wardrobe_items (
      topic_id, name, icon, category, points, created_by
    ) values (
      '40000000-0000-4000-8000-000000000001',
      'Forældrekladde',
      '❌',
      'effect',
      100,
      '10000000-0000-4000-8000-000000000001'
    )
  $$,
  '42501',
  null,
  'a parent cannot create wardrobe content despite the shared authenticated database role'
);
select lives_ok(
  $$ update public.wardrobe_items set name = 'Skjult ændring'
     where id = 'e0000000-0000-4000-8000-000000000004' $$,
  'a parent update safely affects no hidden draft rows instead of exposing them'
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
    select count(*)::integer, bool_and(name <> 'Skjult ændring')
    from public.wardrobe_items
    where id::text like 'e0000000-%'
  $$,
  $$ values (5, true) $$,
  'the administrator sees every item and the parent changed none of the hidden drafts'
);
select lives_ok(
  $$
    insert into public.topics (
      id, slug, title, description, created_by
    ) values (
      'e1000000-0000-4000-8000-000000000001',
      'garderobe-kaskade',
      'Garderobekaskade',
      'Et syntetisk emne til kontrol af oprydning.',
      '10000000-0000-4000-8000-000000000003'
    );
    insert into public.wardrobe_items (
      id, topic_id, name, icon, category, points, created_by
    ) values (
      'e1000000-0000-4000-8000-000000000002',
      'e1000000-0000-4000-8000-000000000001',
      'Midlertidig ting',
      '🧪',
      'equipment',
      100,
      '10000000-0000-4000-8000-000000000003'
    )
  $$,
  'an administrator can create a wardrobe item beneath a new topic'
);
select lives_ok(
  $$
    select *
    from public.delete_admin_topic(
      'e1000000-0000-4000-8000-000000000001',
      now()
    )
  $$,
  'an administrator can delete the disposable parent through the guarded lifecycle'
);
select is(
  (
    select count(*)::integer
    from public.wardrobe_items
    where id = 'e1000000-0000-4000-8000-000000000002'
  ),
  0,
  'deleting a topic removes its dependent wardrobe items'
);
select lives_ok(
  $$ delete from public.wardrobe_items
     where id = 'e0000000-0000-4000-8000-000000000004' $$,
  'an administrator can remove a rejected unpublished wardrobe item'
);
select is(
  (
    select count(*)::integer
    from public.wardrobe_items
    where id::text like 'e0000000-%'
  ),
  4,
  'only the explicitly deleted rejected item was removed from the test catalog'
);

reset role;
select * from finish();
rollback;
