begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(41);

select has_column(
  'public',
  'exercise_attempts',
  'child_profile_id',
  'attempts retain immutable child lineage for cascade repair'
);
select col_not_null(
  'public',
  'exercise_attempts',
  'child_profile_id',
  'attempt child lineage cannot be null'
);
select ok(
  exists (
    select 1
    from pg_attribute as attribute
    join pg_class as relation on relation.oid = attribute.attrelid
    join pg_namespace as namespace on namespace.oid = relation.relnamespace
    join pg_attrdef as default_value
      on default_value.adrelid = relation.oid
      and default_value.adnum = attribute.attnum
    where namespace.nspname = 'public'
      and relation.relname = 'exercise_attempts'
      and attribute.attname = 'child_profile_id'
      and attribute.attnotnull
      and pg_get_expr(default_value.adbin, default_value.adrelid)
        = 'private.trigger_owned_child_profile_id_default()'
  ),
  'trigger-owned child lineage is optional to Insert typegen but remains NOT NULL'
);

alter table public.exercise_attempts disable trigger validate_attempt;
select throws_ok(
  $$
    insert into public.exercise_attempts (
      id,
      session_id,
      exercise_id,
      attempt_number,
      outcome,
      repetitions,
      recorded_by
    )
    values (
      '90000000-0000-4000-8000-000000000097',
      '80000000-0000-4000-8000-000000000001',
      '60000000-0000-4000-8000-000000000002',
      97,
      'partial',
      1,
      '10000000-0000-4000-8000-000000000001'
    )
  $$,
  '23502',
  null,
  'NOT NULL rejects omitted lineage if the validator trigger is unavailable'
);
alter table public.exercise_attempts enable trigger validate_attempt;

select ok(
  lower(
    pg_get_functiondef(
      'private.refresh_child_exercise_progress(uuid,uuid)'::regprocedure
    )
  ) like '%pg_advisory_xact_lock%',
  'progress recomputation takes a transaction-scoped advisory lock'
);
select ok(
  lower(
    pg_get_functiondef('private.ensure_family_has_owner()'::regprocedure)
  ) like '%for update%',
  'last-owner checks lock the family row before checking memberships'
);

select is(
  has_column_privilege('anon', 'public.topics', 'created_by', 'select'),
  false,
  'anonymous clients cannot read topic creator UUIDs'
);
select is(
  has_column_privilege('anon', 'public.goals', 'created_by', 'select'),
  false,
  'anonymous clients cannot read goal creator UUIDs'
);
select is(
  has_column_privilege('anon', 'public.exercises', 'created_by', 'select'),
  false,
  'anonymous clients cannot read exercise creator UUIDs'
);
select is(
  has_column_privilege('authenticated', 'public.topics', 'created_by', 'select'),
  true,
  'authenticated content admins retain creator audit access'
);

set local role anon;
select throws_ok(
  $$ select created_by from public.topics $$,
  '42501',
  null,
  'anonymous SQL cannot select topic creator UUIDs'
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
    select created_by
    from public.topics
    where slug = 'gymnastik'
  $$,
  $$ values ('10000000-0000-4000-8000-000000000003'::uuid) $$,
  'the content admin can read creator audit data for a draft'
);
reset role;

select is(
  (
    select count(*)::integer
    from unnest(
      array[
        'public.profiles',
        'public.families',
        'public.family_memberships',
        'public.child_profiles',
        'public.topics',
        'public.goals',
        'public.exercises',
        'public.child_goals',
        'public.exercise_sessions',
        'public.exercise_attempts',
        'public.child_exercise_progress',
        'public.ai_operations',
        'public.ai_operation_versions',
        'public.media_assets',
        'public.ai_jobs',
        'public.ai_job_media'
      ]
    ) as relation_name
    where has_table_privilege('service_role', relation_name, 'select')
  ),
  16,
  'service_role can read every application table'
);
select is(
  has_column_privilege('service_role', 'public.profiles', 'is_admin', 'update'),
  true,
  'service_role can provision content admins'
);
select is(
  has_column_privilege(
    'service_role',
    'public.exercise_attempts',
    'session_id',
    'insert'
  ),
  true,
  'service_role can record an attempt through validated inserts'
);
select is(
  has_table_privilege('service_role', 'public.exercise_attempts', 'delete'),
  false,
  'service_role cannot directly delete immutable attempts'
);
select is(
  has_table_privilege('service_role', 'public.exercise_attempts', 'update'),
  false,
  'service_role cannot directly rewrite immutable attempts'
);
select is(
  has_table_privilege('service_role', 'public.child_exercise_progress', 'insert'),
  false,
  'service_role cannot insert derived progress'
);
select is(
  has_table_privilege('service_role', 'public.child_exercise_progress', 'update'),
  false,
  'service_role cannot overwrite derived progress'
);
select is(
  has_table_privilege('service_role', 'public.families', 'delete'),
  true,
  'service_role can run a trusted family-erasure workflow'
);
select is(
  has_table_privilege('service_role', 'public.exercise_sessions', 'delete'),
  false,
  'service_role cannot delete an individual history session'
);
select is(
  has_table_privilege('service_role', 'public.child_goals', 'delete'),
  false,
  'service_role cannot delete an individual selected-goal history'
);

select is(
  has_table_privilege('authenticated', 'public.child_goals', 'delete'),
  false,
  'authenticated clients archive rather than delete selected goals'
);
select is(
  has_table_privilege('authenticated', 'public.exercise_sessions', 'delete'),
  false,
  'authenticated clients cannot delete history sessions'
);
select is(
  has_table_privilege('authenticated', 'public.exercise_attempts', 'delete'),
  false,
  'authenticated clients cannot delete attempts'
);
select is(
  has_table_privilege('authenticated', 'public.exercise_attempts', 'update'),
  false,
  'authenticated clients cannot rewrite attempts'
);

select throws_ok(
  $$
    insert into public.child_goals (
      id,
      child_profile_id,
      goal_id,
      selected_by
    )
    values (
      '70000000-0000-4000-8000-000000000099',
      '30000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000001'
    )
  $$,
  '23514',
  'A child can only select a published goal in a published topic.',
  'a child cannot select an unpublished goal'
);

update public.child_goals
set status = 'completed',
    completed_at = '2026-02-01 10:00:00+00'
where id = '70000000-0000-4000-8000-000000000001';

select throws_ok(
  $$
    insert into public.exercise_sessions (
      id,
      child_goal_id,
      started_by
    )
    values (
      '80000000-0000-4000-8000-000000000099',
      '70000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001'
    )
  $$,
  '23514',
  'An exercise session requires an active child goal.',
  'a completed child goal cannot start a new session'
);

update public.child_goals
set status = 'active',
    completed_at = null
where id = '70000000-0000-4000-8000-000000000001';

select throws_ok(
  $$
    insert into public.exercise_sessions (
      id,
      child_goal_id,
      started_by,
      status,
      started_at,
      ended_at
    )
    values (
      '80000000-0000-4000-8000-000000000098',
      '70000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      'completed',
      '2026-02-01 11:00:00+00',
      '2026-02-01 11:05:00+00'
    )
  $$,
  '23514',
  'A new exercise session must start in progress.',
  'a session cannot be inserted directly as completed'
);
select throws_ok(
  $$
    update public.exercise_sessions
    set status = 'in_progress', ended_at = null
    where id = '80000000-0000-4000-8000-000000000001'
  $$,
  '23514',
  'A completed or abandoned session cannot be reopened or retimed.',
  'a completed session cannot be reopened to accept more attempts'
);

select throws_ok(
  $$
    insert into public.exercise_attempts (
      id,
      session_id,
      exercise_id,
      attempt_number,
      outcome,
      repetitions,
      recorded_by
    )
    values (
      '90000000-0000-4000-8000-000000000099',
      '80000000-0000-4000-8000-000000000001',
      '60000000-0000-4000-8000-000000000002',
      3,
      'partial',
      2,
      '10000000-0000-4000-8000-000000000001'
    )
  $$,
  '23514',
  'An attempt can only be added to an in-progress session.',
  'a completed session cannot receive another attempt'
);

select throws_ok(
  $$
    delete from public.family_memberships
    where family_id = '20000000-0000-4000-8000-000000000002'
      and user_id = '10000000-0000-4000-8000-000000000002'
  $$,
  '23514',
  'A family must retain at least one owner.',
  'the sole family owner cannot be removed'
);

insert into public.family_memberships (family_id, user_id, role, added_by)
values (
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  'owner',
  '10000000-0000-4000-8000-000000000001'
);

select lives_ok(
  $$
    delete from public.family_memberships
    where family_id = '20000000-0000-4000-8000-000000000001'
      and user_id = '10000000-0000-4000-8000-000000000001'
  $$,
  'one of two serialized family owners can be removed'
);
select throws_ok(
  $$
    update public.family_memberships
    set role = 'caregiver'
    where family_id = '20000000-0000-4000-8000-000000000001'
      and user_id = '10000000-0000-4000-8000-000000000002'
  $$,
  '23514',
  'A family must retain at least one owner.',
  'the remaining family owner cannot be demoted'
);

insert into public.exercise_sessions (
  id,
  child_goal_id,
  started_by,
  status,
  started_at
)
values (
  '80000000-0000-4000-8000-000000000002',
  '70000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  'in_progress',
  '2026-02-02 10:00:00+00'
);

insert into public.exercise_attempts (
  id,
  session_id,
  exercise_id,
  attempt_number,
  outcome,
  repetitions,
  recorded_by,
  occurred_at
)
values (
  '90000000-0000-4000-8000-000000000003',
  '80000000-0000-4000-8000-000000000002',
  '60000000-0000-4000-8000-000000000002',
  1,
  'partial',
  4,
  '10000000-0000-4000-8000-000000000002',
  '2026-02-02 10:04:00+00'
);

select is(
  (
    select attempts_count
    from public.child_exercise_progress
    where child_profile_id = '30000000-0000-4000-8000-000000000001'
      and exercise_id = '60000000-0000-4000-8000-000000000002'
  ),
  3,
  'progress includes attempts from a second session'
);
select lives_ok(
  $$
    delete from public.exercise_sessions
    where id = '80000000-0000-4000-8000-000000000002'
  $$,
  'a trusted session cascade can remove its attempts'
);
select results_eq(
  $$
    select attempts_count, completed_count, best_repetitions
    from public.child_exercise_progress
    where child_profile_id = '30000000-0000-4000-8000-000000000001'
      and exercise_id = '60000000-0000-4000-8000-000000000002'
  $$,
  $$ values (2, 1, 5) $$,
  'session cascade recomputes progress from remaining attempts'
);
select lives_ok(
  $$
    delete from public.child_goals
    where id = '70000000-0000-4000-8000-000000000001'
  $$,
  'a trusted selected-goal cascade can remove its sessions'
);
select is(
  (
    select count(*)::integer
    from public.child_exercise_progress
    where child_profile_id = '30000000-0000-4000-8000-000000000001'
  ),
  0,
  'selected-goal cascade leaves no stale progress rows'
);

set local role service_role;
select lives_ok(
  $$
    delete from public.families
    where id = '20000000-0000-4000-8000-000000000002'
  $$,
  'service_role can execute the explicit family-erasure workflow'
);
select is(
  (
    select count(*)::integer
    from public.child_profiles
    where family_id = '20000000-0000-4000-8000-000000000002'
  ),
  0,
  'service-role family erasure cascades to its synthetic child data'
);
reset role;

select * from finish();
rollback;
