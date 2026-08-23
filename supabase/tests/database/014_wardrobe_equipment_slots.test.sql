begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(49);

select results_eq(
  $$
    select enumlabel::text collate "default"
    from pg_enum
    where enumtypid = 'public.wardrobe_equip_slot'::regtype
    order by enumsortorder
  $$,
  $$
    values
      ('head'::text),
      ('body'::text),
      ('held'::text),
      ('feet'::text),
      ('accessory'::text)
  $$,
  'wardrobe equipment positions are explicit and bounded'
);
select has_column(
  'public',
  'wardrobe_items',
  'equip_slot',
  'authored wardrobe items declare one equipment position'
);
select col_not_null(
  'public',
  'wardrobe_items',
  'equip_slot',
  'every catalog item has an equipment position'
);
select is(
  (
    select column_default
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'wardrobe_items'
      and column_name = 'equip_slot'
  ),
  '''accessory''::wardrobe_equip_slot',
  'older clients receive a safe additive default while explicit authoring rolls out'
);
select ok(
  has_column_privilege('anon', 'public.wardrobe_items', 'equip_slot', 'select')
  and has_column_privilege(
    'authenticated',
    'public.wardrobe_items',
    'equip_slot',
    'select'
  ),
  'published equipment positions are available to public wardrobe readers'
);
select ok(
  has_column_privilege(
    'authenticated',
    'public.wardrobe_items',
    'equip_slot',
    'insert'
  )
  and has_column_privilege(
    'authenticated',
    'public.wardrobe_items',
    'equip_slot',
    'update'
  ),
  'administrators can author and revise an unpublished equipment position'
);

select has_table(
  'public',
  'child_wardrobe_items',
  'child wardrobe ownership and equipment state have a persisted foundation'
);
select is(
  (
    select relation.relrowsecurity
    from pg_class as relation
    join pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'child_wardrobe_items'
  ),
  true,
  'row-level security protects child wardrobe state'
);
select results_eq(
  $$
    select policyname::text collate "default", cmd::text collate "default"
    from pg_policies
    where schemaname = 'public'
      and tablename = 'child_wardrobe_items'
    order by policyname
  $$,
  $$
    values (
      'Family members can read child wardrobe items'::text,
      'SELECT'::text
    )
  $$,
  'child wardrobe RLS exposes read-only state only to the child family'
);
select results_eq(
  $$
    select indexname::text collate "default"
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'child_wardrobe_items'
      and indexname <> 'child_wardrobe_items_pkey'
    order by indexname
  $$,
  $$
    values
      ('child_wardrobe_items_catalog_item_idx'::text),
      ('child_wardrobe_items_one_equipped_per_slot_idx'::text)
  $$,
  'inventory lookups and exclusive equipped positions have database indexes'
);
select ok(
  has_table_privilege('authenticated', 'public.child_wardrobe_items', 'select')
  and not has_table_privilege(
    'authenticated',
    'public.child_wardrobe_items',
    'insert'
  )
  and not has_table_privilege(
    'authenticated',
    'public.child_wardrobe_items',
    'update'
  )
  and not has_table_privilege(
    'authenticated',
    'public.child_wardrobe_items',
    'delete'
  ),
  'families read inventory but cannot forge ownership or direct equipment state'
);
select ok(
  has_table_privilege('service_role', 'public.child_wardrobe_items', 'select')
  and has_column_privilege(
    'service_role',
    'public.child_wardrobe_items',
    'child_profile_id',
    'insert'
  )
  and has_column_privilege(
    'service_role',
    'public.child_wardrobe_items',
    'is_equipped',
    'update'
  )
  and not has_column_privilege(
    'service_role',
    'public.child_wardrobe_items',
    'equip_slot',
    'update'
  ),
  'trusted reward code can grant and equip items without rewriting their slot'
);
select is(
  has_function_privilege(
    'anon',
    'public.set_child_wardrobe_item_equipped(uuid,uuid,boolean)',
    'execute'
  ),
  false,
  'anonymous callers cannot use the equipment mutation'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.set_child_wardrobe_item_equipped(uuid,uuid,boolean)',
    'execute'
  ),
  true,
  'authenticated family clients can use the guarded equipment mutation'
);
select is(
  has_function_privilege(
    'service_role',
    'public.set_child_wardrobe_item_equipped(uuid,uuid,boolean)',
    'execute'
  ),
  false,
  'the family equipment mutation is not a service-role back door'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.list_child_wardrobe(uuid)',
    'execute'
  )
  and has_function_privilege(
    'authenticated',
    'public.list_child_wardrobe(uuid)',
    'execute'
  )
  and not has_function_privilege(
    'service_role',
    'public.list_child_wardrobe(uuid)',
    'execute'
  ),
  'only authenticated family clients can call the guarded wardrobe listing'
);
select ok(
  (
    select
      function.prosecdef
      and function.provolatile = 'v'
      and function.proconfig @> array['search_path=""']::text[]
    from pg_proc as function
    join pg_namespace as namespace on namespace.oid = function.pronamespace
    where namespace.nspname = 'public'
      and function.proname = 'set_child_wardrobe_item_equipped'
      and function.pronargs = 3
  ),
  'the equipment mutation is a fixed-path volatile definer function'
);
select ok(
  not has_function_privilege(
    'anon',
    'private.validate_child_wardrobe_item()',
    'execute'
  )
  and not has_function_privilege(
    'authenticated',
    'private.validate_child_wardrobe_item()',
    'execute'
  )
  and not has_function_privilege(
    'service_role',
    'private.validate_child_wardrobe_item()',
    'execute'
  ),
  'the inventory lineage validator runs only as an internal trigger'
);
select is(
  pg_get_function_result(
    'public.set_child_wardrobe_item_equipped(uuid,uuid,boolean)'::regprocedure
  ),
  'TABLE(child_profile_id uuid, wardrobe_item_id uuid, equip_slot wardrobe_equip_slot, is_equipped boolean, acquired_at timestamp with time zone, equipped_at timestamp with time zone)',
  'the mutation returns the complete client equipment-state contract'
);
select is(
  pg_get_function_result('public.list_child_wardrobe(uuid)'::regprocedure),
  'TABLE(child_profile_id uuid, wardrobe_item_id uuid, catalog_item_id uuid, topic_id uuid, name text, icon text, description text, image_path text, category wardrobe_item_category, equip_slot wardrobe_equip_slot, catalog_equip_slot wardrobe_equip_slot, rarity wardrobe_item_rarity, is_equipped boolean, acquired_at timestamp with time zone, equipped_at timestamp with time zone)',
  'the listing returns inventory and catalog identity for fail-closed clients'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);
set local role authenticated;

select lives_ok(
  $$
    insert into public.wardrobe_items (
      id,
      topic_id,
      name,
      icon,
      category,
      equip_slot,
      points,
      created_by
    ) values (
      'f0000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      'Kladdehjelm',
      '🪖',
      'clothing',
      'head',
      100,
      '10000000-0000-4000-8000-000000000003'
    )
  $$,
  'an administrator can explicitly author a head item'
);
select results_eq(
  $$
    select equip_slot::text
    from public.list_admin_wardrobe_item_drafts(
      '40000000-0000-4000-8000-000000000001',
      'f0000000-0000-4000-8000-000000000001'
    )
  $$,
  $$ values ('head'::text) $$,
  'the administrator draft API returns the authored position'
);
select lives_ok(
  $$
    update public.wardrobe_items
    set editorial_status = 'approved'
    where id = 'f0000000-0000-4000-8000-000000000001';
    update public.wardrobe_items
    set equip_slot = 'body'
    where id = 'f0000000-0000-4000-8000-000000000001'
  $$,
  'an unpublished reviewed item can move to another position'
);
select is(
  (
    select editorial_status::text
    from public.list_admin_wardrobe_item_drafts(
      '40000000-0000-4000-8000-000000000001',
      'f0000000-0000-4000-8000-000000000001'
    )
  ),
  'draft',
  'changing the equipment position requires a new editorial review'
);
select lives_ok(
  $$
    insert into public.wardrobe_items (
      id, topic_id, name, icon, category, points, created_by
    ) values (
      'f0000000-0000-4000-8000-000000000002',
      '40000000-0000-4000-8000-000000000001',
      'Gammelt klientforslag',
      '🎁',
      'effect',
      75,
      '10000000-0000-4000-8000-000000000003'
    )
  $$,
  'an older authoring client can still create a draft while clients overlap'
);
select is(
  (
    select equip_slot::text
    from public.list_admin_wardrobe_item_drafts(
      '40000000-0000-4000-8000-000000000001',
      'f0000000-0000-4000-8000-000000000002'
    )
  ),
  'accessory',
  'an omitted legacy position receives the compatibility default'
);

reset role;
set local role service_role;

select lives_ok(
  $$
    insert into public.wardrobe_items (
      id,
      topic_id,
      name,
      icon,
      category,
      equip_slot,
      points,
      editorial_status,
      is_published
    ) values
      (
        'f1000000-0000-4000-8000-000000000001',
        '40000000-0000-4000-8000-000000000001',
        'Stjernesko',
        '👟',
        'clothing',
        'feet',
        100,
        'approved',
        true
      ),
      (
        'f1000000-0000-4000-8000-000000000002',
        '40000000-0000-4000-8000-000000000001',
        'Regnbuesko',
        '🥾',
        'clothing',
        'feet',
        150,
        'approved',
        true
      ),
      (
        'f1000000-0000-4000-8000-000000000003',
        '40000000-0000-4000-8000-000000000001',
        'Månehjelm',
        '🪖',
        'clothing',
        'head',
        200,
        'approved',
        true
      ),
      (
        'f1000000-0000-4000-8000-000000000004',
        '40000000-0000-4000-8000-000000000001',
        'Tryllestav',
        '🪄',
        'equipment',
        'held',
        250,
        'approved',
        true
      )
  $$,
  'trusted publication creates wearable items in explicit positions'
);
select throws_ok(
  $$
    insert into public.child_wardrobe_items (
      child_profile_id, wardrobe_item_id
    ) values (
      '30000000-0000-4000-8000-000000000001',
      'f0000000-0000-4000-8000-000000000001'
    )
  $$,
  '23514',
  'A child can only own an approved published wardrobe item from a published topic.',
  'trusted reward code cannot grant an unpublished draft'
);
select lives_ok(
  $$
    insert into public.child_wardrobe_items (
      child_profile_id, wardrobe_item_id
    ) values
      (
        '30000000-0000-4000-8000-000000000001',
        'f1000000-0000-4000-8000-000000000001'
      ),
      (
        '30000000-0000-4000-8000-000000000001',
        'f1000000-0000-4000-8000-000000000002'
      ),
      (
        '30000000-0000-4000-8000-000000000001',
        'f1000000-0000-4000-8000-000000000003'
      ),
      (
        '30000000-0000-4000-8000-000000000002',
        'f1000000-0000-4000-8000-000000000004'
      )
  $$,
  'trusted reward code can grant published items without choosing a slot itself'
);
select results_eq(
  $$
    select wardrobe_item_id, equip_slot::text, is_equipped, equipped_at
    from public.child_wardrobe_items
    where wardrobe_item_id::text like 'f1000000-%'
    order by child_profile_id, wardrobe_item_id
  $$,
  $$
    values
      (
        'f1000000-0000-4000-8000-000000000001'::uuid,
        'feet'::text,
        false,
        null::timestamptz
      ),
      (
        'f1000000-0000-4000-8000-000000000002'::uuid,
        'feet'::text,
        false,
        null::timestamptz
      ),
      (
        'f1000000-0000-4000-8000-000000000003'::uuid,
        'head'::text,
        false,
        null::timestamptz
      ),
      (
        'f1000000-0000-4000-8000-000000000004'::uuid,
        'held'::text,
        false,
        null::timestamptz
      )
  $$,
  'inventory snapshots the catalog position and starts unequipped'
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
    from public.child_wardrobe_items
    where wardrobe_item_id::text like 'f1000000-%'
  ),
  3,
  'a parent sees the three synthetic items granted to the selected family child'
);
select results_eq(
  $$
    select
      wardrobe_item_id,
      catalog_item_id,
      name,
      equip_slot::text,
      catalog_equip_slot::text
    from public.list_child_wardrobe(
      '30000000-0000-4000-8000-000000000001'
    )
    where wardrobe_item_id::text like 'f1000000-%'
    order by wardrobe_item_id
  $$,
  $$
    values
      (
        'f1000000-0000-4000-8000-000000000001'::uuid,
        'f1000000-0000-4000-8000-000000000001'::uuid,
        'Stjernesko'::text,
        'feet'::text,
        'feet'::text
      ),
      (
        'f1000000-0000-4000-8000-000000000002'::uuid,
        'f1000000-0000-4000-8000-000000000002'::uuid,
        'Regnbuesko'::text,
        'feet'::text,
        'feet'::text
      ),
      (
        'f1000000-0000-4000-8000-000000000003'::uuid,
        'f1000000-0000-4000-8000-000000000003'::uuid,
        'Månehjelm'::text,
        'head'::text,
        'head'::text
      )
  $$,
  'the guarded listing returns matching inventory and catalog identities'
);
select throws_ok(
  $$
    insert into public.child_wardrobe_items (
      child_profile_id, wardrobe_item_id
    ) values (
      '30000000-0000-4000-8000-000000000001',
      'f1000000-0000-4000-8000-000000000004'
    )
  $$,
  '42501',
  null,
  'a family client cannot grant itself a wardrobe item'
);
select throws_ok(
  $$
    update public.child_wardrobe_items
    set is_equipped = true
    where wardrobe_item_id = 'f1000000-0000-4000-8000-000000000001'
  $$,
  '42501',
  null,
  'a family client cannot bypass the atomic equipment mutation'
);
select results_eq(
  $$
    select equip_slot::text, is_equipped, (equipped_at is not null)
    from public.set_child_wardrobe_item_equipped(
      '30000000-0000-4000-8000-000000000001',
      'f1000000-0000-4000-8000-000000000001',
      true
    )
  $$,
  $$ values ('feet'::text, true, true) $$,
  'equipping one pair of shoes occupies the complete feet position'
);
select results_eq(
  $$
    select equip_slot::text, is_equipped
    from public.set_child_wardrobe_item_equipped(
      '30000000-0000-4000-8000-000000000001',
      'f1000000-0000-4000-8000-000000000002',
      true
    )
  $$,
  $$ values ('feet'::text, true) $$,
  'choosing another pair of shoes atomically replaces the first pair'
);
select results_eq(
  $$
    select wardrobe_item_id, is_equipped
    from public.child_wardrobe_items
    where equip_slot = 'feet'
      and wardrobe_item_id::text like 'f1000000-%'
    order by wardrobe_item_id
  $$,
  $$
    values
      ('f1000000-0000-4000-8000-000000000001'::uuid, false),
      ('f1000000-0000-4000-8000-000000000002'::uuid, true)
  $$,
  'at most one owned item remains active in the exclusive feet position'
);
select results_eq(
  $$
    select equip_slot::text, is_equipped
    from public.set_child_wardrobe_item_equipped(
      '30000000-0000-4000-8000-000000000001',
      'f1000000-0000-4000-8000-000000000003',
      true
    )
  $$,
  $$ values ('head'::text, true) $$,
  'an item in a different position can be equipped at the same time'
);
select is(
  (
    select count(*)::integer
    from public.child_wardrobe_items
    where is_equipped
  ),
  2,
  'one head item and one feet item can be active together'
);
select results_eq(
  $$
    select equip_slot::text, is_equipped, equipped_at
    from public.set_child_wardrobe_item_equipped(
      '30000000-0000-4000-8000-000000000001',
      'f1000000-0000-4000-8000-000000000002',
      false
    )
  $$,
  $$ values ('feet'::text, false, null::timestamptz) $$,
  'a child can remove the currently equipped pair of shoes'
);
select is(
  (
    select count(*)::integer
    from public.child_wardrobe_items
    where equip_slot = 'feet'
      and is_equipped
  ),
  0,
  'unequipping clears the exclusive feet position'
);
select throws_ok(
  $$
    select *
    from public.set_child_wardrobe_item_equipped(
      '30000000-0000-4000-8000-000000000001',
      'f1000000-0000-4000-8000-000000000004',
      true
    )
  $$,
  '22023',
  'The wardrobe item is not in this child''s wardrobe.',
  'a family cannot equip a catalog item the child does not own'
);
select throws_ok(
  $$
    select *
    from public.set_child_wardrobe_item_equipped(
      '30000000-0000-4000-8000-000000000002',
      'f1000000-0000-4000-8000-000000000004',
      true
    )
  $$,
  '42501',
  'The child is not available to this family member.',
  'the equipment mutation cannot cross the family boundary'
);
select throws_ok(
  $$
    select *
    from public.list_child_wardrobe(
      '30000000-0000-4000-8000-000000000002'
    )
  $$,
  '42501',
  'The child is not available to this family member.',
  'the guarded wardrobe listing cannot cross the family boundary'
);

reset role;
update public.topics
set is_published = false
where id = '40000000-0000-4000-8000-000000000001';
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;
select is(
  (
    select count(*)::integer
    from public.list_child_wardrobe(
      '30000000-0000-4000-8000-000000000001'
    )
    where wardrobe_item_id::text like 'f1000000-%'
  ),
  3,
  'owned wardrobe items stay visible if their topic is later unpublished'
);

reset role;
update public.topics
set is_published = true
where id = '40000000-0000-4000-8000-000000000001';

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;
select results_eq(
  $$
    select wardrobe_item_id, equip_slot::text
    from public.child_wardrobe_items
  $$,
  $$
    values (
      'f1000000-0000-4000-8000-000000000004'::uuid,
      'held'::text
    )
  $$,
  'the second family sees only its own child held item'
);

reset role;
set local role anon;
select throws_ok(
  $$ select * from public.child_wardrobe_items $$,
  '42501',
  null,
  'anonymous clients cannot read any child wardrobe state'
);
select throws_ok(
  $$
    select *
    from public.list_child_wardrobe(
      '30000000-0000-4000-8000-000000000001'
    )
  $$,
  '42501',
  null,
  'anonymous clients cannot call the guarded wardrobe listing'
);

reset role;
update public.child_wardrobe_items
set is_equipped = true
where child_profile_id = '30000000-0000-4000-8000-000000000001'
  and wardrobe_item_id = 'f1000000-0000-4000-8000-000000000001';
select throws_ok(
  $$
    update public.child_wardrobe_items
    set is_equipped = true
    where child_profile_id = '30000000-0000-4000-8000-000000000001'
      and wardrobe_item_id = 'f1000000-0000-4000-8000-000000000002'
  $$,
  '23505',
  null,
  'the database unique invariant rejects two active pairs of shoes even outside the RPC'
);

select * from finish();
rollback;
