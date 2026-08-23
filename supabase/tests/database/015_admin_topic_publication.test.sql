begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(18);

select has_function(
  'public',
  'publish_admin_topic',
  array['uuid', 'timestamp with time zone'],
  'topic publication is exposed as one guarded database operation'
);
select is(
  pg_get_function_result(
    'public.publish_admin_topic(uuid,timestamp with time zone)'::regprocedure
  ),
  'TABLE(id uuid, changed boolean, is_published boolean, published_at timestamp with time zone, updated_at timestamp with time zone, published_goal_count integer, published_exercise_count integer, published_wardrobe_item_count integer)',
  'the publication result reports the fresh topic revision and changed content'
);
select ok(
  (
    select function.prosecdef
      and function.provolatile = 'v'
      and function.proconfig @> array['search_path=""']::text[]
    from pg_proc as function
    where function.oid =
      'public.publish_admin_topic(uuid,timestamp with time zone)'::regprocedure
  ),
  'publication is a volatile fixed-path security definer'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.publish_admin_topic(uuid,timestamp with time zone)',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'public.publish_admin_topic(uuid,timestamp with time zone)',
    'execute'
  )
  and not has_function_privilege(
    'service_role',
    'public.publish_admin_topic(uuid,timestamp with time zone)',
    'execute'
  ),
  'only authenticated callers may enter topic publication'
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
values
  (
    'f4000000-0000-4000-8000-000000000001',
    'publiceringskontrol',
    'Publiceringskontrol',
    'Et syntetisk emne med både gemt og allerede publiceret indhold.',
    false,
    '10000000-0000-4000-8000-000000000003',
    '2026-08-23 11:00:00+00',
    '2026-08-23 11:00:00+00'
  ),
  (
    'f4000000-0000-4000-8000-000000000002',
    'tom-publiceringskontrol',
    'Tom publiceringskontrol',
    'Et syntetisk emne uden mål eller deløvelser.',
    false,
    '10000000-0000-4000-8000-000000000003',
    '2026-08-23 11:00:00+00',
    '2026-08-23 11:00:00+00'
  );

insert into public.goals (
  id,
  topic_id,
  slug,
  title,
  sort_order,
  is_published,
  created_by
)
values
  (
    'f5000000-0000-4000-8000-000000000001',
    'f4000000-0000-4000-8000-000000000001',
    'gemt-maal',
    'Gemt mål',
    10,
    false,
    '10000000-0000-4000-8000-000000000003'
  ),
  (
    'f5000000-0000-4000-8000-000000000002',
    'f4000000-0000-4000-8000-000000000001',
    'publiceret-maal',
    'Allerede publiceret mål',
    20,
    true,
    '10000000-0000-4000-8000-000000000003'
  ),
  (
    'f5000000-0000-4000-8000-000000000090',
    'f4000000-0000-4000-8000-000000000002',
    'udfyldt-maal-uden-komplet-forloeb',
    'Udfyldt mål',
    10,
    false,
    '10000000-0000-4000-8000-000000000003'
  ),
  (
    'f5000000-0000-4000-8000-000000000091',
    'f4000000-0000-4000-8000-000000000002',
    'tomt-maal',
    'Tomt mål',
    20,
    false,
    '10000000-0000-4000-8000-000000000003'
  );

insert into public.exercises (
  id,
  goal_id,
  slug,
  title,
  sort_order,
  is_published,
  created_by
)
values
  (
    'f6000000-0000-4000-8000-000000000001',
    'f5000000-0000-4000-8000-000000000001',
    'gemt-deloevelse',
    'Gemt deløvelse',
    10,
    false,
    '10000000-0000-4000-8000-000000000003'
  ),
  (
    'f6000000-0000-4000-8000-000000000002',
    'f5000000-0000-4000-8000-000000000002',
    'publiceret-deloevelse',
    'Allerede publiceret deløvelse',
    10,
    true,
    '10000000-0000-4000-8000-000000000003'
  ),
  (
    'f6000000-0000-4000-8000-000000000090',
    'f5000000-0000-4000-8000-000000000090',
    'eksisterende-deloevelse',
    'Eksisterende deløvelse',
    10,
    false,
    '10000000-0000-4000-8000-000000000003'
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
  created_by
)
values
  (
    'f7000000-0000-4000-8000-000000000001',
    'f4000000-0000-4000-8000-000000000001',
    'Godkendt kasket',
    '🧢',
    'clothing',
    'head',
    'common',
    100,
    'approved',
    false,
    '10000000-0000-4000-8000-000000000003'
  ),
  (
    'f7000000-0000-4000-8000-000000000002',
    'f4000000-0000-4000-8000-000000000001',
    'Garderobekladde',
    '🎒',
    'equipment',
    'accessory',
    'rare',
    200,
    'draft',
    false,
    '10000000-0000-4000-8000-000000000003'
  ),
  (
    'f7000000-0000-4000-8000-000000000003',
    'f4000000-0000-4000-8000-000000000001',
    'Afvist effekt',
    '✨',
    'effect',
    'accessory',
    'special',
    300,
    'rejected',
    false,
    '10000000-0000-4000-8000-000000000003'
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
    from public.publish_admin_topic(
      'f4000000-0000-4000-8000-000000000001',
      '2026-08-23 11:00:00+00'
    )
  $$,
  '42501',
  'Administrator access is required.',
  'a parent cannot publish an admin topic'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);
set local role authenticated;

select throws_ok(
  $$ select * from public.publish_admin_topic(null, now()) $$,
  '22023',
  'A topic identifier and expected revision are required.',
  'publication requires a topic identifier'
);
select throws_ok(
  $$
    select *
    from public.publish_admin_topic(
      'f4000000-0000-4000-8000-000000000099',
      now()
    )
  $$,
  'P0002',
  'The topic does not exist.',
  'publication reports a missing topic without leaking data'
);
select throws_ok(
  $$
    select *
    from public.publish_admin_topic(
      'f4000000-0000-4000-8000-000000000001',
      '2025-01-01 00:00:00+00'
    )
  $$,
  '40001',
  'The topic changed before it could be published.',
  'publication rejects a stale revision'
);
select throws_ok(
  $$
    select *
    from public.publish_admin_topic(
      'f4000000-0000-4000-8000-000000000002',
      now()
    )
  $$,
  '23514',
  'Every topic goal needs at least one exercise before publication.',
  'a topic cannot publish while one of its goals has no exercise'
);

select results_eq(
  $$
    select
      id,
      changed,
      is_published,
      published_goal_count,
      published_exercise_count,
      published_wardrobe_item_count
    from public.publish_admin_topic(
      'f4000000-0000-4000-8000-000000000001',
      now()
    )
  $$,
  $$
    values (
      'f4000000-0000-4000-8000-000000000001'::uuid,
      true,
      true,
      1,
      1,
      1
    )
  $$,
  'publication reports each newly visible content type'
);
select results_eq(
  $$
    select is_published, published_at is not null, updated_at > created_at
    from public.topics
    where id = 'f4000000-0000-4000-8000-000000000001'
  $$,
  $$ values (true, true, true) $$,
  'publication makes the root visible and advances its revision'
);
select is(
  (
    select count(*)::integer
    from public.goals
    where topic_id = 'f4000000-0000-4000-8000-000000000001'
      and is_published
      and published_at is not null
  ),
  2,
  'publication makes every saved goal visible'
);
select is(
  (
    select count(*)::integer
    from public.exercises as exercise
    join public.goals as goal on goal.id = exercise.goal_id
    where goal.topic_id = 'f4000000-0000-4000-8000-000000000001'
      and exercise.is_published
      and exercise.published_at is not null
  ),
  2,
  'publication makes every saved exercise visible'
);

-- Editorial decisions are intentionally not directly selectable by the
-- authenticated client role. Inspect that internal state as the database
-- owner, then separately prove the public result through RLS below.
reset role;
select results_eq(
  $$
    select name, editorial_status::text, is_published
    from public.wardrobe_items
    where topic_id = 'f4000000-0000-4000-8000-000000000001'
    order by id
  $$,
  $$
    values
      ('Godkendt kasket'::text, 'approved'::text, true),
      ('Garderobekladde'::text, 'draft'::text, false),
      ('Afvist effekt'::text, 'rejected'::text, false)
  $$,
  'only approved wardrobe items follow the topic into publication'
);

reset role;
set local role anon;

select results_eq(
  $$
    select
      (select count(*)::integer from public.topics where id = 'f4000000-0000-4000-8000-000000000001'),
      (select count(*)::integer from public.goals where topic_id = 'f4000000-0000-4000-8000-000000000001'),
      (
        select count(*)::integer
        from public.exercises as exercise
        join public.goals as goal on goal.id = exercise.goal_id
        where goal.topic_id = 'f4000000-0000-4000-8000-000000000001'
      ),
      (select count(*)::integer from public.wardrobe_items where topic_id = 'f4000000-0000-4000-8000-000000000001')
  $$,
  $$ values (1, 2, 2, 1) $$,
  'anonymous discovery sees the published tree and only its approved wardrobe item'
);

reset role;
set local role authenticated;

select is(
  (
    select changed
    from public.publish_admin_topic(
      'f4000000-0000-4000-8000-000000000001',
      (
        select updated_at
        from public.topics
        where id = 'f4000000-0000-4000-8000-000000000001'
      )
    )
  ),
  false,
  'publishing an unchanged live topic is an idempotent no-op'
);

reset role;
insert into public.goals (
  id,
  topic_id,
  slug,
  title,
  sort_order,
  is_published,
  created_by
)
values (
  'f5000000-0000-4000-8000-000000000003',
  'f4000000-0000-4000-8000-000000000001',
  'nyt-gemt-maal',
  'Nyt gemt mål',
  30,
  false,
  '10000000-0000-4000-8000-000000000003'
);
insert into public.exercises (
  id,
  goal_id,
  slug,
  title,
  sort_order,
  is_published,
  created_by
)
values (
  'f6000000-0000-4000-8000-000000000003',
  'f5000000-0000-4000-8000-000000000003',
  'ny-gemt-deloevelse',
  'Ny gemt deløvelse',
  10,
  false,
  '10000000-0000-4000-8000-000000000003'
);

set local role authenticated;
select results_eq(
  $$
    select changed, published_goal_count, published_exercise_count
    from public.publish_admin_topic(
      'f4000000-0000-4000-8000-000000000001',
      (
        select updated_at
        from public.topics
        where id = 'f4000000-0000-4000-8000-000000000001'
      )
    )
  $$,
  $$ values (true, 1, 1) $$,
  'a live topic can publish newly added draft content without a release model'
);
select results_eq(
  $$
    select goal.is_published, exercise.is_published
    from public.goals as goal
    join public.exercises as exercise on exercise.goal_id = goal.id
    where goal.id = 'f5000000-0000-4000-8000-000000000003'
  $$,
  $$ values (true, true) $$,
  'the newly added goal and exercise become visible together'
);

select * from finish();
rollback;
