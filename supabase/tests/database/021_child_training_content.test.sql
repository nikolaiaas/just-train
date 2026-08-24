begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(42);

create temporary table first_training_completion
as select * from public.complete_child_training_exercise(
  null, null, null, null, null, null, null,
  null::integer, null::integer, null::smallint
) with no data;
create temporary table retried_training_completion
as select * from first_training_completion with no data;
create temporary table repetition_training_completion
as select * from first_training_completion with no data;
create temporary table duration_training_completion
as select * from first_training_completion with no data;
grant select, insert on
  first_training_completion,
  retried_training_completion,
  repetition_training_completion,
  duration_training_completion
to authenticated;

select has_column(
  'public',
  'exercise_attempts',
  'client_request_id',
  'training attempts can carry a retry-safe request identity'
);
select col_is_null(
  'public',
  'exercise_attempts',
  'client_request_id',
  'the request identity stays nullable for older clients'
);
select has_index(
  'public',
  'exercise_attempts',
  'exercise_attempts_recorder_request_idx',
  'one adult request identity can create at most one attempt'
);
select has_function(
  'public',
  'list_child_training_content',
  array['uuid', 'uuid', 'uuid', 'uuid'],
  'published child training has one bounded catalogue reader'
);
select ok(
  (
    select function.prosecdef
      and function.provolatile = 's'
      and function.proconfig @> array['search_path=""']::text[]
    from pg_proc as function
    where function.oid =
      'public.list_child_training_content(uuid,uuid,uuid,uuid)'::regprocedure
  ),
  'the catalogue reader is a stable fixed-path security definer'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.list_child_training_content(uuid,uuid,uuid,uuid)',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'public.list_child_training_content(uuid,uuid,uuid,uuid)',
    'execute'
  )
  and not has_function_privilege(
    'service_role',
    'public.list_child_training_content(uuid,uuid,uuid,uuid)',
    'execute'
  ),
  'only authenticated family clients can enter the catalogue reader'
);
select has_function(
  'public',
  'complete_child_training_exercise',
  array[
    'uuid',
    'uuid',
    'uuid',
    'uuid',
    'uuid',
    'uuid',
    'uuid',
    'integer',
    'integer',
    'smallint'
  ],
  'exercise completion has one guarded database operation'
);
select ok(
  (
    select function.prosecdef
      and function.provolatile = 'v'
      and function.proconfig @> array['search_path=""']::text[]
    from pg_proc as function
    where function.oid =
      'public.complete_child_training_exercise(uuid,uuid,uuid,uuid,uuid,uuid,uuid,integer,integer,smallint)'::regprocedure
  ),
  'exercise completion is a volatile fixed-path security definer'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.complete_child_training_exercise(uuid,uuid,uuid,uuid,uuid,uuid,uuid,integer,integer,smallint)',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'public.complete_child_training_exercise(uuid,uuid,uuid,uuid,uuid,uuid,uuid,integer,integer,smallint)',
    'execute'
  )
  and not has_function_privilege(
    'service_role',
    'public.complete_child_training_exercise(uuid,uuid,uuid,uuid,uuid,uuid,uuid,integer,integer,smallint)',
    'execute'
  ),
  'only authenticated family clients can enter exercise completion'
);
select is(
  has_column_privilege(
    'authenticated',
    'public.exercise_attempts',
    'client_request_id',
    'insert'
  ),
  false,
  'family clients cannot bypass the guarded retry identity write'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

select results_eq(
  $$
    select
      topic_id,
      goal_id,
      exercise_id,
      progress_state::text,
      attempts_count,
      completed_count
    from public.list_child_training_content(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001'
    )
    order by topic_sort_order, goal_sort_order, exercise_sort_order
  $$,
  $$
    values
      (
        '40000000-0000-4000-8000-000000000001'::uuid,
        '50000000-0000-4000-8000-000000000001'::uuid,
        '60000000-0000-4000-8000-000000000001'::uuid,
        null::text,
        null::integer,
        null::integer
      ),
      (
        '40000000-0000-4000-8000-000000000001'::uuid,
        '50000000-0000-4000-8000-000000000001'::uuid,
        '60000000-0000-4000-8000-000000000002'::uuid,
        'completed'::text,
        2,
        1
      ),
      (
        '40000000-0000-4000-8000-000000000001'::uuid,
        '50000000-0000-4000-8000-000000000001'::uuid,
        '60000000-0000-4000-8000-000000000003'::uuid,
        null::text,
        null::integer,
        null::integer
      )
  $$,
  'the real published tree is ordered and carries only this child progress'
);
select is(
  (
    select count(*)::integer
    from public.list_child_training_content(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001'
    )
  ),
  3,
  'one published topic can be loaded as its complete tree'
);
select is(
  (
    select count(*)::integer
    from public.list_child_training_content(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000002'
    )
  ),
  0,
  'an unpublished topic is absent from a direct child load'
);
select throws_ok(
  $$
    select * from public.list_child_training_content(
      '20000000-0000-4000-8000-000000000002',
      '30000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000001'
    )
  $$,
  '42501',
  null,
  'one parent cannot read training through another family child context'
);
select throws_ok(
  $$
    select * from public.list_child_training_content(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000002'
    )
  $$,
  '28000',
  null,
  'catalogue loading fails closed when the signed-in account changed'
);
select throws_ok(
  $$
    select * from public.complete_child_training_exercise(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000001',
      '60000000-0000-4000-8000-000000000002',
      'a1000000-0000-4000-8000-000000000007',
      '10000000-0000-4000-8000-000000000001'
    )
  $$,
  '22023',
  'A repetition result is required to complete this exercise.',
  'a repetition completion requires the measured repetition result'
);
select throws_ok(
  $$
    select * from public.complete_child_training_exercise(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000002',
      '60000000-0000-4000-8000-000000000002',
      'a1000000-0000-4000-8000-000000000006',
      '10000000-0000-4000-8000-000000000001'
    )
  $$,
  'P0002',
  'The published exercise is unavailable.',
  'a mixed topic-goal-exercise route cannot record completion'
);
select throws_ok(
  $$
    select * from public.complete_child_training_exercise(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000001',
      '60000000-0000-4000-8000-000000000001',
      '00000000-0000-0000-0000-000000000000',
      '10000000-0000-4000-8000-000000000001'
    )
  $$,
  '22023',
  'The request identifier cannot be the nil UUID.',
  'a nil retry identity is rejected at the database boundary'
);
select throws_ok(
  $$
    select * from public.complete_child_training_exercise(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000001',
      '60000000-0000-4000-8000-000000000002',
      'a1000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      4::integer
    )
  $$,
  '22023',
  'A completed repetition result must meet its target.',
  'a below-target repetition cannot silently become complete'
);

select lives_ok(
  $$
    insert into first_training_completion
    select * from public.complete_child_training_exercise(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000001',
      '60000000-0000-4000-8000-000000000001',
      'a1000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000001',
      null::integer,
      null::integer,
      3::smallint
    )
  $$,
  'a completion-only exercise can be saved transactionally'
);
select results_eq(
  $$
    select
      child_profile_id,
      topic_id,
      goal_id,
      exercise_id,
      created,
      repetitions,
      duration_ms,
      perceived_difficulty,
      attempts_count,
      completed_count,
      progress_state::text
    from first_training_completion
  $$,
  $$
    values (
      '30000000-0000-4000-8000-000000000001'::uuid,
      '40000000-0000-4000-8000-000000000001'::uuid,
      '50000000-0000-4000-8000-000000000001'::uuid,
      '60000000-0000-4000-8000-000000000001'::uuid,
      true,
      null::integer,
      null::integer,
      3::smallint,
      1,
      1,
      'completed'::text
    )
  $$,
  'completion returns its dynamic route ids and fresh progress'
);
select results_eq(
  $$
    select session.status::text, session.ended_at is not null
    from public.exercise_sessions as session
    join first_training_completion as result on result.session_id = session.id
  $$,
  $$ values ('completed'::text, true) $$,
  'the server-owned session is closed in the completion transaction'
);
select results_eq(
  $$
    select attempt.client_request_id, attempt.outcome::text
    from public.exercise_attempts as attempt
    join first_training_completion as result on result.attempt_id = attempt.id
  $$,
  $$
    values (
      'a1000000-0000-4000-8000-000000000002'::uuid,
      'completed'::text
    )
  $$,
  'the attempt owns the client retry identity'
);

select lives_ok(
  $$
    insert into retried_training_completion
    select * from public.complete_child_training_exercise(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000001',
      '60000000-0000-4000-8000-000000000001',
      'a1000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000001',
      null::integer,
      null::integer,
      3::smallint
    )
  $$,
  'a lost completion response can be retried'
);
select results_eq(
  $$
    select
      retry.attempt_id = original.attempt_id,
      retry.session_id = original.session_id,
      retry.created
    from retried_training_completion as retry
    cross join first_training_completion as original
  $$,
  $$ values (true, true, false) $$,
  'a retry returns the original attempt and session as an unchanged result'
);
select is(
  (
    select count(*)::integer
    from public.exercise_attempts as attempt
    where attempt.recorded_by = '10000000-0000-4000-8000-000000000001'
      and attempt.client_request_id =
        'a1000000-0000-4000-8000-000000000002'
  ),
  1,
  'a retry never records a second attempt'
);
select throws_ok(
  $$
    select * from public.complete_child_training_exercise(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000001',
      '60000000-0000-4000-8000-000000000001',
      'a1000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000001',
      null::integer,
      null::integer,
      4::smallint
    )
  $$,
  '22023',
  'The request identifier is already used for another training completion.',
  'a retry identity cannot silently return a different saved result'
);
select throws_ok(
  $$
    select * from public.complete_child_training_exercise(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000001',
      '60000000-0000-4000-8000-000000000002',
      'a1000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000001',
      null::integer,
      null::integer,
      3::smallint
    )
  $$,
  '22023',
  'The request identifier is already used for another training completion.',
  'one retry identity cannot be reused for another exercise'
);

select lives_ok(
  $$
    insert into repetition_training_completion
    select * from public.complete_child_training_exercise(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000001',
      '60000000-0000-4000-8000-000000000002',
      'a1000000-0000-4000-8000-000000000003',
      '10000000-0000-4000-8000-000000000001',
      5::integer
    )
  $$,
  'an explicit repetition result can complete its published target'
);
select results_eq(
  $$
    select
      repetitions,
      attempts_count,
      completed_count,
      best_repetitions,
      progress_state::text
    from repetition_training_completion
  $$,
  $$ values (5, 3, 2, 5, 'completed'::text) $$,
  'the repetition result and existing best are returned from durable progress'
);

reset role;
update public.exercises
set measurement = 'duration',
    target_value = 60
where id = '60000000-0000-4000-8000-000000000003';
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

select throws_ok(
  $$
    select * from public.complete_child_training_exercise(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000001',
      '60000000-0000-4000-8000-000000000003',
      'a1000000-0000-4000-8000-000000000008',
      '10000000-0000-4000-8000-000000000001'
    )
  $$,
  '22023',
  'A duration result is required to complete this exercise.',
  'a duration completion requires the measured duration result'
);
select lives_ok(
  $$
    insert into duration_training_completion
    select * from public.complete_child_training_exercise(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000001',
      '60000000-0000-4000-8000-000000000003',
      'a1000000-0000-4000-8000-000000000009',
      '10000000-0000-4000-8000-000000000001',
      null::integer,
      60000::integer,
      2::smallint
    )
  $$,
  'an explicit duration result can complete its published target'
);
select results_eq(
  $$
    select
      duration_ms,
      attempts_count,
      completed_count,
      best_duration_ms,
      progress_state::text
    from duration_training_completion
  $$,
  $$ values (60000, 1, 1, 60000, 'completed'::text) $$,
  'the measured duration and fresh durable progress are returned'
);
select results_eq(
  $$
    select exercise_id, progress_state::text
    from public.list_child_training_content(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001'
    )
    where progress_state = 'completed'
    order by exercise_sort_order
  $$,
  $$
    values
      ('60000000-0000-4000-8000-000000000001'::uuid, 'completed'::text),
      ('60000000-0000-4000-8000-000000000002'::uuid, 'completed'::text),
      ('60000000-0000-4000-8000-000000000003'::uuid, 'completed'::text)
  $$,
  'catalogue progress is derived from exercise attempts rather than child-goal status'
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
    from public.list_child_training_content(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001'
    )
  ),
  0,
  'unpublishing immediately removes a topic from the child catalogue'
);
select results_eq(
  $$
    select created, attempt_id
    from public.complete_child_training_exercise(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000001',
      '60000000-0000-4000-8000-000000000001',
      'a1000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000001',
      null::integer,
      null::integer,
      3::smallint
    )
  $$,
  $$ select false, attempt_id from first_training_completion $$,
  'a prior completion remains retryable after content is unpublished'
);
select throws_ok(
  $$
    select * from public.complete_child_training_exercise(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000001',
      '60000000-0000-4000-8000-000000000003',
      'a1000000-0000-4000-8000-000000000004',
      '10000000-0000-4000-8000-000000000001'
    )
  $$,
  'P0002',
  'The published exercise is unavailable.',
  'a new completion cannot start from unpublished content'
);
select is(
  (
    select count(*)::integer
    from public.child_exercise_progress
    where child_profile_id = '30000000-0000-4000-8000-000000000001'
      and state = 'completed'
  ),
  3,
  'unpublishing preserves the child progress rows'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;
select throws_ok(
  $$
    select * from public.complete_child_training_exercise(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000001',
      '60000000-0000-4000-8000-000000000001',
      'a1000000-0000-4000-8000-000000000005',
      '10000000-0000-4000-8000-000000000002'
    )
  $$,
  '42501',
  null,
  'another family cannot complete an exercise for this child'
);

reset role;
insert into public.topics (
  id,
  slug,
  title,
  description,
  sort_order,
  is_published,
  created_by
)
values
  (
    'a2000000-0000-4000-8000-000000000001',
    'syntetisk-tomt-emne',
    'Syntetisk tomt emne',
    'Bruges kun til at kontrollere en tolerant gammel indholdsrække.',
    80,
    true,
    '10000000-0000-4000-8000-000000000003'
  ),
  (
    'a2000000-0000-4000-8000-000000000002',
    'syntetisk-tomt-maal-emne',
    'Syntetisk emne med tomt mål',
    'Bruges kun til at kontrollere en tolerant gammel indholdsrække.',
    90,
    true,
    '10000000-0000-4000-8000-000000000003'
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
values (
  'a3000000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000002',
  'syntetisk-tomt-maal',
  'Syntetisk tomt mål',
  10,
  true,
  '10000000-0000-4000-8000-000000000003'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;
select results_eq(
  $$
    select goal_id, exercise_id, progress_state::text
    from public.list_child_training_content(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      'a2000000-0000-4000-8000-000000000001'
    )
  $$,
  $$ values (null::uuid, null::uuid, null::text) $$,
  'a legacy published topic with no goals is represented without invented children'
);
select results_eq(
  $$
    select goal_id, exercise_id, progress_state::text
    from public.list_child_training_content(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      'a2000000-0000-4000-8000-000000000002'
    )
  $$,
  $$
    values (
      'a3000000-0000-4000-8000-000000000001'::uuid,
      null::uuid,
      null::text
    )
  $$,
  'a legacy published goal with no exercises is represented without invented progress'
);
select is(
  (
    select count(*)::integer
    from public.exercise_attempts
    where client_request_id is null
  ),
  2,
  'legacy attempts remain readable without a client request id'
);

reset role;
select * from finish();
rollback;
