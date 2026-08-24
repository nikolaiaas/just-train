begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(43);

select has_table(
  'public',
  'child_topic_enrollments',
  'selected children have explicit subject enrollment state'
);
select has_column(
  'public',
  'child_topic_enrollments',
  'status',
  'subject enrollment records active or left state'
);
select has_index(
  'public',
  'child_topic_enrollments',
  'child_topic_enrollments_child_status_idx',
  'child subject choices have a bounded current-state index'
);
select ok(
  (
    select table_class.relrowsecurity
    from pg_class as table_class
    join pg_namespace as namespace
      on namespace.oid = table_class.relnamespace
    where namespace.nspname = 'public'
      and table_class.relname = 'child_topic_enrollments'
  ),
  'child subject enrollment has row level security enabled'
);
select is(
  has_table_privilege(
    'authenticated',
    'public.child_topic_enrollments',
    'select'
  ),
  false,
  'family and administrator clients cannot browse enrollment rows directly'
);
select has_trigger(
  'public',
  'child_topic_enrollments',
  'child_topic_enrollments_set_updated_at',
  'subject enrollment timestamps are maintained by the database'
);
select has_trigger(
  'public',
  'child_goals',
  'sync_child_topic_enrollment_from_goal',
  'legacy goal selection keeps subject enrollment compatible'
);
select has_function(
  'public',
  'list_child_training_content_v2',
  array['uuid', 'uuid', 'uuid', 'uuid'],
  'the enrollment-aware published catalogue has one guarded reader'
);
select ok(
  (
    select function.prosecdef
      and function.provolatile = 's'
      and function.proconfig @> array['search_path=""']::text[]
    from pg_proc as function
    where function.oid =
      'public.list_child_training_content_v2(uuid,uuid,uuid,uuid)'::regprocedure
  ),
  'the enrollment-aware catalogue is a stable fixed-path security definer'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.list_child_training_content_v2(uuid,uuid,uuid,uuid)',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'public.list_child_training_content_v2(uuid,uuid,uuid,uuid)',
    'execute'
  )
  and not has_function_privilege(
    'service_role',
    'public.list_child_training_content_v2(uuid,uuid,uuid,uuid)',
    'execute'
  ),
  'only authenticated family clients can enter the new catalogue reader'
);
select has_function(
  'public',
  'set_child_training_enrollment',
  array['uuid', 'uuid', 'uuid', 'uuid', 'boolean', 'uuid'],
  'child subject and goal choices share one guarded mutation'
);
select ok(
  (
    select function.prosecdef
      and function.provolatile = 'v'
      and function.proconfig @> array['search_path=""']::text[]
    from pg_proc as function
    where function.oid =
      'public.set_child_training_enrollment(uuid,uuid,uuid,uuid,boolean,uuid)'::regprocedure
  ),
  'the child choice mutation is a volatile fixed-path security definer'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.set_child_training_enrollment(uuid,uuid,uuid,uuid,boolean,uuid)',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'public.set_child_training_enrollment(uuid,uuid,uuid,uuid,boolean,uuid)',
    'execute'
  )
  and not has_function_privilege(
    'service_role',
    'public.set_child_training_enrollment(uuid,uuid,uuid,uuid,boolean,uuid)',
    'execute'
  ),
  'only authenticated family clients can save child choices'
);
select results_eq(
  $$
    select child_profile_id, topic_id, status::text
    from public.child_topic_enrollments
    where child_profile_id = '30000000-0000-4000-8000-000000000001'
  $$,
  $$
    values (
      '30000000-0000-4000-8000-000000000001'::uuid,
      '40000000-0000-4000-8000-000000000001'::uuid,
      'active'::text
    )
  $$,
  'existing selected goals are backfilled as active subject choices'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  (
    select count(*)::integer
    from public.list_child_training_content_v2(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001'
    )
  ),
  3,
  'all published exercises remain visible without another approval gate'
);
select results_eq(
  $$
    select distinct topic_is_enrolled, goal_is_enrolled
    from public.list_child_training_content_v2(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001'
    )
  $$,
  $$ values (true, true) $$,
  'the selected child current subject and goal choices accompany the catalogue'
);
select results_eq(
  $$
    select exercise_id, progress_state::text, attempts_count
    from public.list_child_training_content_v2(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001'
    )
    where progress_state is not null
  $$,
  $$
    values (
      '60000000-0000-4000-8000-000000000002'::uuid,
      'completed'::text,
      2
    )
  $$,
  'enrollment-aware reads retain the existing child progress'
);
select throws_ok(
  $$
    select * from public.list_child_training_content_v2(
      '20000000-0000-4000-8000-000000000002',
      '30000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000001'
    )
  $$,
  '42501',
  null,
  'one family cannot read another child enrollment-aware catalogue'
);
select throws_ok(
  $$
    select * from public.list_child_training_content_v2(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000002'
    )
  $$,
  '28000',
  null,
  'catalogue loading fails closed when the signed-in account changes'
);
select throws_ok(
  $$
    select * from public.set_child_training_enrollment(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      null,
      true,
      '10000000-0000-4000-8000-000000000002'
    )
  $$,
  '28000',
  null,
  'saving a child choice fails closed when the signed-in account changes'
);
select results_eq(
  $$
    select topic_is_enrolled, goal_id, goal_is_enrolled, changed
    from public.set_child_training_enrollment(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      null,
      false,
      '10000000-0000-4000-8000-000000000001'
    )
  $$,
  $$ values (false, null::uuid, null::boolean, true) $$,
  'the child can leave a subject directly'
);
select is(
  (
    select status::text
    from public.child_goals
    where child_profile_id = '30000000-0000-4000-8000-000000000001'
      and goal_id = '50000000-0000-4000-8000-000000000001'
  ),
  'active',
  'leaving preserves the prior goal choice for a later rejoin'
);
select is(
  (
    select attempts_count
    from public.child_exercise_progress
    where child_profile_id = '30000000-0000-4000-8000-000000000001'
      and exercise_id = '60000000-0000-4000-8000-000000000002'
  ),
  2,
  'leaving a subject preserves prior exercise progress'
);
select results_eq(
  $$
    select distinct topic_is_enrolled, goal_is_enrolled
    from public.list_child_training_content_v2(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001'
    )
  $$,
  $$ values (false, false) $$,
  'a left subject makes its preserved goal choices currently inactive'
);
select results_eq(
  $$
    select topic_is_enrolled, changed
    from public.set_child_training_enrollment(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      null,
      false,
      '10000000-0000-4000-8000-000000000001'
    )
  $$,
  $$ values (false, false) $$,
  'leaving an already-left subject is idempotent'
);
select results_eq(
  $$
    select topic_is_enrolled, changed
    from public.set_child_training_enrollment(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      null,
      true,
      '10000000-0000-4000-8000-000000000001'
    )
  $$,
  $$ values (true, true) $$,
  'the child can rejoin the published subject directly'
);
select results_eq(
  $$
    select distinct topic_is_enrolled, goal_is_enrolled
    from public.list_child_training_content_v2(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001'
    )
  $$,
  $$ values (true, true) $$,
  'rejoining restores the prior goal choice without touching progress'
);
select results_eq(
  $$
    select topic_is_enrolled, changed
    from public.set_child_training_enrollment(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      null,
      true,
      '10000000-0000-4000-8000-000000000001'
    )
  $$,
  $$ values (true, false) $$,
  'joining an already-active subject is idempotent'
);
select results_eq(
  $$
    select topic_is_enrolled, goal_is_enrolled, changed
    from public.set_child_training_enrollment(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000001',
      false,
      '10000000-0000-4000-8000-000000000001'
    )
  $$,
  $$ values (true, false, true) $$,
  'the child can remove one goal while staying in the subject'
);
select is(
  (
    select status::text
    from public.child_goals
    where child_profile_id = '30000000-0000-4000-8000-000000000001'
      and goal_id = '50000000-0000-4000-8000-000000000001'
  ),
  'archived',
  'removing a goal archives only its current selection state'
);
select is(
  (
    select attempts_count
    from public.child_exercise_progress
    where child_profile_id = '30000000-0000-4000-8000-000000000001'
      and exercise_id = '60000000-0000-4000-8000-000000000002'
  ),
  2,
  'removing a goal retains its existing exercise progress'
);
select results_eq(
  $$
    select topic_is_enrolled, goal_is_enrolled, changed
    from public.set_child_training_enrollment(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000001',
      true,
      '10000000-0000-4000-8000-000000000001'
    )
  $$,
  $$ values (true, true, true) $$,
  'the child can select the goal again'
);
select is(
  (
    select count(*)::integer
    from public.child_goals
    where child_profile_id = '30000000-0000-4000-8000-000000000001'
      and goal_id = '50000000-0000-4000-8000-000000000001'
  ),
  1,
  'reselecting a goal reuses its durable enrollment row'
);
select throws_ok(
  $$
    select * from public.set_child_training_enrollment(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000002',
      true,
      '10000000-0000-4000-8000-000000000001'
    )
  $$,
  'P0002',
  'The selected goal does not belong to this subject.',
  'a child cannot mix subject and goal identifiers'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;

select results_eq(
  $$
    select distinct topic_is_enrolled, goal_is_enrolled
    from public.list_child_training_content_v2(
      '20000000-0000-4000-8000-000000000002',
      '30000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000002'
    )
  $$,
  $$ values (false, false) $$,
  'an unjoined child still sees every published subject and goal'
);
select lives_ok(
  $$
    insert into public.child_goals (
      child_profile_id,
      goal_id,
      status,
      selected_by,
      selected_at,
      completed_at
    ) values (
      '30000000-0000-4000-8000-000000000002',
      '50000000-0000-4000-8000-000000000001',
      'active',
      '10000000-0000-4000-8000-000000000002',
      now(),
      null
    )
  $$,
  'a legacy client can still select a published goal'
);
select results_eq(
  $$
    select distinct topic_is_enrolled, goal_is_enrolled
    from public.list_child_training_content_v2(
      '20000000-0000-4000-8000-000000000002',
      '30000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000002'
    )
  $$,
  $$ values (true, true) $$,
  'legacy goal selection automatically joins its subject'
);
select throws_ok(
  $$
    select * from public.set_child_training_enrollment(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      null,
      false,
      '10000000-0000-4000-8000-000000000002'
    )
  $$,
  '42501',
  null,
  'one family cannot change another child subject choices'
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
    select topic_is_enrolled, changed
    from public.set_child_training_enrollment(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      null,
      false,
      '10000000-0000-4000-8000-000000000001'
    )
  $$,
  $$ values (false, true) $$,
  'the child can leave before an administrator unpublishes the subject'
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

select throws_ok(
  $$
    select * from public.set_child_training_enrollment(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      null,
      true,
      '10000000-0000-4000-8000-000000000001'
    )
  $$,
  'P0002',
  'The published subject or goal is unavailable.',
  'a child cannot newly join content after an administrator unpublishes it'
);
select results_eq(
  $$
    select topic_is_enrolled, changed
    from public.set_child_training_enrollment(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      null,
      false,
      '10000000-0000-4000-8000-000000000001'
    )
  $$,
  $$ values (false, false) $$,
  'a child can still leave or retry leaving unpublished content'
);
select is(
  (
    select count(*)::integer
    from public.list_child_training_content_v2(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001'
    )
  ),
  0,
  'unpublished subjects remain under administrator publication control'
);
select is(
  (
    select attempts_count
    from public.child_exercise_progress
    where child_profile_id = '30000000-0000-4000-8000-000000000001'
      and exercise_id = '60000000-0000-4000-8000-000000000002'
  ),
  2,
  'leave, rejoin, goal changes, and unpublish all retain prior progress'
);

reset role;
select * from finish();
rollback;
