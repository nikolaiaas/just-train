begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(30);

select has_table('public', 'profiles', 'profiles table exists');
select has_table('public', 'families', 'families table exists');
select has_table('public', 'family_memberships', 'family_memberships table exists');
select has_table('public', 'child_profiles', 'child_profiles table exists');
select has_table('public', 'topics', 'topics table exists');
select has_table('public', 'goals', 'goals table exists');
select has_table('public', 'exercises', 'exercises table exists');
select has_table('public', 'child_goals', 'child_goals table exists');
select has_table('public', 'exercise_sessions', 'exercise_sessions table exists');
select has_table('public', 'exercise_attempts', 'exercise_attempts table exists');
select has_table(
  'public',
  'child_exercise_progress',
  'child_exercise_progress table exists'
);
select has_table('public', 'ai_operations', 'AI operations table exists');
select has_table(
  'public',
  'ai_operation_versions',
  'AI operation versions table exists'
);
select has_table('public', 'media_assets', 'media assets table exists');
select has_table('public', 'ai_jobs', 'AI jobs table exists');
select has_table('public', 'ai_job_media', 'AI job media table exists');

select is(
  (
    select count(*)::integer
    from pg_class as relation
    join pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname in (
        'profiles',
        'families',
        'family_memberships',
        'child_profiles',
        'topics',
        'goals',
        'exercises',
        'child_goals',
        'exercise_sessions',
        'exercise_attempts',
        'child_exercise_progress',
        'ai_operations',
        'ai_operation_versions',
        'media_assets',
        'ai_jobs',
        'ai_job_media'
      )
      and relation.relrowsecurity
  ),
  16,
  'RLS is enabled on every API-facing table'
);

select is(
  has_table_privilege('anon', 'public.families', 'select'),
  false,
  'anonymous clients have no table privilege on family data'
);
select is(
  has_column_privilege('authenticated', 'public.profiles', 'is_admin', 'update'),
  false,
  'authenticated clients cannot promote themselves to admin'
);

set local role anon;

select is(
  (select count(*)::integer from public.topics),
  1,
  'anonymous clients see only the published topic'
);
select is(
  (select count(*)::integer from public.goals),
  1,
  'anonymous clients see only goals in a published topic'
);
select is(
  (select count(*)::integer from public.exercises),
  3,
  'anonymous clients see published exercises in a published goal'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  (select string_agg(display_name, ',' order by display_name) from public.child_profiles),
  'Demo Barn',
  'the first parent sees only children in the first family'
);
select is(
  (select count(*)::integer from public.exercise_sessions),
  1,
  'the first parent can read the family exercise session'
);
select is(
  (select count(*)::integer from public.exercise_attempts),
  2,
  'the first parent can read attempts from the family session'
);
select results_eq(
  $$
    select attempts_count, completed_count, best_repetitions, state::text
    from public.child_exercise_progress
  $$,
  $$ values (2, 1, 5, 'completed'::text) $$,
  'progress is derived from the two synthetic attempts'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;

select results_eq(
  $$ select display_name from public.child_profiles order by display_name $$,
  $$ values ('Andet Demo Barn'::text) $$,
  'the second parent sees only children in the second family'
);
select is(
  (select count(*)::integer from public.exercise_sessions),
  0,
  'the second parent cannot read the first family session'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  (select count(*)::integer from public.topics),
  2,
  'the content admin can read published and draft topics'
);
select lives_ok(
  $$
    update public.topics
    set description = 'Temporary pgTAP edit'
    where id = '40000000-0000-4000-8000-000000000002'
  $$,
  'the content admin can update draft content'
);

reset role;
select * from finish();
rollback;
