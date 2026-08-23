begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(42);

select has_function(
  'public',
  'unpublish_admin_topic',
  array['uuid', 'timestamp with time zone'],
  'topic unpublishing is exposed as one guarded database operation'
);
select has_function(
  'public',
  'delete_admin_topic',
  array['uuid', 'timestamp with time zone'],
  'complete topic deletion is exposed as one guarded database operation'
);
select is(
  pg_get_function_result(
    'public.unpublish_admin_topic(uuid,timestamp with time zone)'::regprocedure
  ),
  'TABLE(id uuid, changed boolean, is_published boolean, published_at timestamp with time zone, updated_at timestamp with time zone)',
  'the unpublish result supplies the fresh optimistic revision'
);
select is(
  pg_get_function_result(
    'public.delete_admin_topic(uuid,timestamp with time zone)'::regprocedure
  ),
  'TABLE(id uuid, deleted_goal_count integer, deleted_exercise_count integer, deleted_wardrobe_item_count integer)',
  'the delete result reports every topic-owned content type removed'
);
select is(
  (
    select count(*)::integer
    from pg_proc as function
    join pg_namespace as namespace on namespace.oid = function.pronamespace
    where namespace.nspname = 'public'
      and function.proname in (
        'unpublish_admin_topic',
        'delete_admin_topic'
      )
      and function.prosecdef
      and function.provolatile = 'v'
      and function.proconfig @> array['search_path=""']::text[]
  ),
  2,
  'both lifecycle operations are volatile fixed-path security definers'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.unpublish_admin_topic(uuid,timestamp with time zone)',
    'execute'
  )
  and has_function_privilege(
    'authenticated',
    'public.delete_admin_topic(uuid,timestamp with time zone)',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'public.unpublish_admin_topic(uuid,timestamp with time zone)',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'public.delete_admin_topic(uuid,timestamp with time zone)',
    'execute'
  )
  and not has_function_privilege(
    'service_role',
    'public.unpublish_admin_topic(uuid,timestamp with time zone)',
    'execute'
  )
  and not has_function_privilege(
    'service_role',
    'public.delete_admin_topic(uuid,timestamp with time zone)',
    'execute'
  ),
  'only authenticated callers may enter the admin lifecycle functions'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

select throws_ok(
  $$
    select *
    from public.unpublish_admin_topic(
      '40000000-0000-4000-8000-000000000001',
      '2026-01-03 08:00:00+00'
    )
  $$,
  '42501',
  'Administrator access is required.',
  'a parent cannot unpublish a topic'
);
select throws_ok(
  $$
    select *
    from public.delete_admin_topic(
      '40000000-0000-4000-8000-000000000002',
      '2026-01-03 08:00:00+00'
    )
  $$,
  '42501',
  'Administrator access is required.',
  'a parent cannot delete a topic'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);
set local role authenticated;

select ok(
  not has_column_privilege(
    'authenticated',
    'public.topics',
    'is_published',
    'update'
  )
  and not has_column_privilege(
    'authenticated',
    'public.goals',
    'is_published',
    'update'
  )
  and not has_column_privilege(
    'authenticated',
    'public.exercises',
    'is_published',
    'update'
  )
  and not has_table_privilege(
    'authenticated',
    'public.topics',
    'delete'
  )
  and not has_table_privilege(
    'authenticated',
    'public.goals',
    'delete'
  )
  and not has_table_privilege(
    'authenticated',
    'public.exercises',
    'delete'
  )
  and has_column_privilege(
    'authenticated',
    'public.topics',
    'title',
    'update'
  )
  and has_column_privilege(
    'authenticated',
    'public.goals',
    'summary',
    'update'
  )
  and has_column_privilege(
    'authenticated',
    'public.exercises',
    'instructions',
    'update'
  ),
  'normal content stays editable while lifecycle columns and deletes are guarded'
);
select throws_ok(
  $$
    update public.topics
    set is_published = false
    where id = '40000000-0000-4000-8000-000000000001'
  $$,
  '42501',
  'permission denied for table topics',
  'an administrator cannot directly unpublish a topic'
);
select throws_ok(
  $$
    update public.goals
    set is_published = false
    where id = '50000000-0000-4000-8000-000000000001'
  $$,
  '42501',
  'permission denied for table goals',
  'an administrator cannot directly change goal publication'
);
select throws_ok(
  $$
    update public.exercises
    set is_published = false
    where id = '60000000-0000-4000-8000-000000000001'
  $$,
  '42501',
  'permission denied for table exercises',
  'an administrator cannot directly change exercise publication'
);
select throws_ok(
  $$
    delete from public.topics
    where id = '40000000-0000-4000-8000-000000000001'
  $$,
  '42501',
  'permission denied for table topics',
  'an administrator cannot bypass guarded topic deletion'
);
select throws_ok(
  $$
    delete from public.goals
    where id = '50000000-0000-4000-8000-000000000001'
  $$,
  '42501',
  'permission denied for table goals',
  'an administrator cannot directly delete a goal'
);
select throws_ok(
  $$
    delete from public.exercises
    where id = '60000000-0000-4000-8000-000000000001'
  $$,
  '42501',
  'permission denied for table exercises',
  'an administrator cannot directly delete an exercise'
);
select throws_ok(
  $$
    insert into public.topics (
      id,
      slug,
      title,
      is_published,
      created_by
    )
    values (
      'e0000000-0000-4000-8000-000000000001',
      'direkte-publiceret-emne',
      'Direkte publiceret emne',
      true,
      '10000000-0000-4000-8000-000000000003'
    )
  $$,
  '42501',
  'new row violates row-level security policy for table "topics"',
  'an administrator cannot insert a pre-published topic'
);
select throws_ok(
  $$
    insert into public.goals (
      id,
      topic_id,
      slug,
      title,
      is_published,
      created_by
    )
    values (
      'e1000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      'direkte-publiceret-maal',
      'Direkte publiceret mål',
      true,
      '10000000-0000-4000-8000-000000000003'
    )
  $$,
  '42501',
  'new row violates row-level security policy for table "goals"',
  'an administrator cannot insert a pre-published goal'
);
select throws_ok(
  $$
    insert into public.exercises (
      id,
      goal_id,
      slug,
      title,
      is_published,
      created_by
    )
    values (
      'e2000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000001',
      'direkte-publiceret-oevelse',
      'Direkte publiceret øvelse',
      true,
      '10000000-0000-4000-8000-000000000003'
    )
  $$,
  '42501',
  'new row violates row-level security policy for table "exercises"',
  'an administrator cannot insert a pre-published exercise'
);

select throws_ok(
  $$ select * from public.unpublish_admin_topic(null, now()) $$,
  '22023',
  'A topic identifier and expected revision are required.',
  'unpublishing requires a topic identifier'
);
select throws_ok(
  $$
    select *
    from public.delete_admin_topic(
      '40000000-0000-4000-8000-000000000002',
      null
    )
  $$,
  '22023',
  'A topic identifier and expected revision are required.',
  'deletion requires an expected revision'
);
select throws_ok(
  $$
    select *
    from public.unpublish_admin_topic(
      'f0000000-0000-4000-8000-000000000099',
      now()
    )
  $$,
  'P0002',
  'The topic does not exist.',
  'unpublishing reports a missing topic without leaking data'
);
select throws_ok(
  $$
    select *
    from public.delete_admin_topic(
      'f0000000-0000-4000-8000-000000000099',
      now()
    )
  $$,
  'P0002',
  'The topic does not exist.',
  'deletion reports a missing topic without leaking data'
);
select throws_ok(
  $$
    select *
    from public.unpublish_admin_topic(
      '40000000-0000-4000-8000-000000000001',
      '2025-01-01 00:00:00+00'
    )
  $$,
  '40001',
  'The topic changed before it could be unpublished.',
  'unpublishing rejects a stale published revision'
);

select results_eq(
  $$
    select id, changed, is_published, published_at is null
    from public.unpublish_admin_topic(
      '40000000-0000-4000-8000-000000000001',
      '2026-01-03 08:10:00+00'
    )
  $$,
  $$
    values (
      '40000000-0000-4000-8000-000000000001'::uuid,
      true,
      false,
      true
    )
  $$,
  'an administrator can unpublish the published topic atomically'
);
select results_eq(
  $$
    select is_published, published_at is null, updated_at > created_at
    from public.topics
    where id = '40000000-0000-4000-8000-000000000001'
  $$,
  $$ values (false, true, true) $$,
  'unpublishing clears the root publication timestamp and advances its revision'
);
select is(
  (
    select count(*)::integer
    from public.goals
    where topic_id = '40000000-0000-4000-8000-000000000001'
      and is_published
      and published_at is not null
  ),
  1,
  'unpublishing preserves the reviewed publication state of child goals'
);
select is(
  (
    select count(*)::integer
    from public.exercises as exercise
    join public.goals as goal on goal.id = exercise.goal_id
    where goal.topic_id = '40000000-0000-4000-8000-000000000001'
      and exercise.is_published
      and exercise.published_at is not null
  ),
  3,
  'unpublishing preserves the reviewed publication state of child exercises'
);

-- The content-administrator role intentionally cannot browse family data, so
-- verify preservation from the database-owner test context.
reset role;
select is(
  (
    select count(*)::integer
    from public.child_goals as child_goal
    join public.goals as goal on goal.id = child_goal.goal_id
    where goal.topic_id = '40000000-0000-4000-8000-000000000001'
  ),
  1,
  'unpublishing never removes an existing child enrolment'
);
set local role authenticated;
select is(
  (
    select changed
    from public.unpublish_admin_topic(
      '40000000-0000-4000-8000-000000000001',
      '2026-01-03 08:00:00+00'
    )
  ),
  false,
  'retrying an already-completed unpublish is an idempotent no-op'
);
select throws_ok(
  $$
    select *
    from public.delete_admin_topic(
      '40000000-0000-4000-8000-000000000001',
      (
        select updated_at
        from public.topics
        where id = '40000000-0000-4000-8000-000000000001'
      )
    )
  $$,
  '23503',
  'The topic has child activity and cannot be deleted. Keep it unpublished instead.',
  'permanent deletion refuses to destroy existing child activity'
);

reset role;
set local role anon;

select is(
  (
    select count(*)::integer
    from public.topics
    where id = '40000000-0000-4000-8000-000000000001'
  ),
  0,
  'anonymous discovery hides an unpublished topic'
);
select is(
  (
    select count(*)::integer
    from public.goals
    where topic_id = '40000000-0000-4000-8000-000000000001'
  ),
  0,
  'anonymous discovery hides goals beneath an unpublished topic'
);
select is(
  (
    select count(*)::integer
    from public.exercises
    where goal_id = '50000000-0000-4000-8000-000000000001'
  ),
  0,
  'anonymous discovery hides exercises beneath an unpublished topic'
);

reset role;

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
values
  (
    'f0000000-0000-4000-8000-000000000001',
    'sletbart-emne',
    'Sletbart emne',
    'Et syntetisk emne uden familieaktivitet.',
    false,
    '10000000-0000-4000-8000-000000000003',
    '2026-08-23 08:00:00+00',
    '2026-08-23 08:00:00+00'
  ),
  (
    'f0000000-0000-4000-8000-000000000002',
    'publiceret-sletningskontrol',
    'Publiceret sletningskontrol',
    'Et syntetisk publiceret emne.',
    true,
    '10000000-0000-4000-8000-000000000003',
    '2026-08-23 08:00:00+00',
    '2026-08-23 08:00:00+00'
  ),
  (
    'f0000000-0000-4000-8000-000000000003',
    'ejet-garderobe-kontrol',
    'Ejet garderobekontrol',
    'Et syntetisk publiceret emne med en optjent ting.',
    true,
    '10000000-0000-4000-8000-000000000003',
    '2026-08-23 08:00:00+00',
    '2026-08-23 08:00:00+00'
  );

insert into public.goals (
  id,
  topic_id,
  slug,
  title,
  created_by
)
values
  (
    'f1000000-0000-4000-8000-000000000001',
    'f0000000-0000-4000-8000-000000000001',
    'foerste-maal',
    'Første mål',
    '10000000-0000-4000-8000-000000000003'
  ),
  (
    'f1000000-0000-4000-8000-000000000002',
    'f0000000-0000-4000-8000-000000000001',
    'andet-maal',
    'Andet mål',
    '10000000-0000-4000-8000-000000000003'
  );

insert into public.exercises (
  id,
  goal_id,
  slug,
  title,
  sort_order,
  created_by
)
values
  (
    'f2000000-0000-4000-8000-000000000001',
    'f1000000-0000-4000-8000-000000000001',
    'foerste-oevelse',
    'Første øvelse',
    10,
    '10000000-0000-4000-8000-000000000003'
  ),
  (
    'f2000000-0000-4000-8000-000000000002',
    'f1000000-0000-4000-8000-000000000001',
    'anden-oevelse',
    'Anden øvelse',
    20,
    '10000000-0000-4000-8000-000000000003'
  ),
  (
    'f2000000-0000-4000-8000-000000000003',
    'f1000000-0000-4000-8000-000000000002',
    'tredje-oevelse',
    'Tredje øvelse',
    10,
    '10000000-0000-4000-8000-000000000003'
  );

insert into public.wardrobe_items (
  id,
  topic_id,
  name,
  icon,
  category,
  rarity,
  points,
  editorial_status,
  is_published,
  created_by
)
values
  (
    'f3000000-0000-4000-8000-000000000001',
    'f0000000-0000-4000-8000-000000000001',
    'Syntetisk hat',
    '🎩',
    'clothing',
    'common',
    100,
    'draft',
    false,
    '10000000-0000-4000-8000-000000000003'
  ),
  (
    'f3000000-0000-4000-8000-000000000002',
    'f0000000-0000-4000-8000-000000000001',
    'Syntetisk effekt',
    '✨',
    'effect',
    'rare',
    200,
    'approved',
    true,
    '10000000-0000-4000-8000-000000000003'
  ),
  (
    'f3000000-0000-4000-8000-000000000003',
    'f0000000-0000-4000-8000-000000000003',
    'Optjent syntetisk ting',
    '🎁',
    'clothing',
    'special',
    300,
    'approved',
    true,
    '10000000-0000-4000-8000-000000000003'
  );

insert into public.child_wardrobe_items (
  child_profile_id,
  wardrobe_item_id
)
values (
  '30000000-0000-4000-8000-000000000001',
  'f3000000-0000-4000-8000-000000000003'
);

reset role;
set local role authenticated;

select throws_ok(
  $$
    select *
    from public.delete_admin_topic(
      'f0000000-0000-4000-8000-000000000002',
      '2026-08-23 08:00:00+00'
    )
  $$,
  '55000',
  'The topic must be unpublished before it can be deleted.',
  'a published topic requires the explicit unpublish step before deletion'
);
select lives_ok(
  $$
    select *
    from public.unpublish_admin_topic(
      'f0000000-0000-4000-8000-000000000003',
      now()
    )
  $$,
  'an earned wardrobe item does not prevent the safe unpublish operation'
);
select throws_ok(
  $$
    select *
    from public.delete_admin_topic(
      'f0000000-0000-4000-8000-000000000003',
      (
        select updated_at
        from public.topics
        where id = 'f0000000-0000-4000-8000-000000000003'
      )
    )
  $$,
  '23503',
  'The topic has child activity and cannot be deleted. Keep it unpublished instead.',
  'permanent deletion preserves wardrobe items already owned by a child'
);
select throws_ok(
  $$
    select *
    from public.delete_admin_topic(
      'f0000000-0000-4000-8000-000000000001',
      '2025-01-01 00:00:00+00'
    )
  $$,
  '40001',
  'The topic changed before it could be deleted.',
  'deletion rejects a stale draft revision'
);
select results_eq(
  $$
    select
      id,
      deleted_goal_count,
      deleted_exercise_count,
      deleted_wardrobe_item_count
    from public.delete_admin_topic(
      'f0000000-0000-4000-8000-000000000001',
      now()
    )
  $$,
  $$
    values (
      'f0000000-0000-4000-8000-000000000001'::uuid,
      2,
      3,
      2
    )
  $$,
  'deletion reports the complete removed editorial tree'
);
select is(
  (
    select count(*)::integer
    from public.topics
    where id = 'f0000000-0000-4000-8000-000000000001'
  ),
  0,
  'the deleted topic row is gone'
);
select is(
  (
    select count(*)::integer
    from public.goals
    where id::text like 'f1000000-%'
  ),
  0,
  'topic deletion cascades to all owned goals'
);
select is(
  (
    select count(*)::integer
    from public.exercises
    where id::text like 'f2000000-%'
  ),
  0,
  'topic deletion cascades to all owned exercises'
);
select is(
  (
    select count(*)::integer
    from public.wardrobe_items
    where id in (
      'f3000000-0000-4000-8000-000000000001',
      'f3000000-0000-4000-8000-000000000002'
    )
  ),
  0,
  'topic deletion cascades to draft and published wardrobe content'
);

select * from finish();
rollback;
