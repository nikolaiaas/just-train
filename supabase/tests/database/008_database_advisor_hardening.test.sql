begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(15);

select ok(
  coalesce(
    (
      select
        not has_function_privilege('anon', function.oid, 'execute')
        and not has_function_privilege(
          'authenticated',
          function.oid,
          'execute'
        )
        and not has_function_privilege(
          'service_role',
          function.oid,
          'execute'
        )
      from pg_proc as function
      join pg_namespace as namespace on namespace.oid = function.pronamespace
      where namespace.nspname = 'public'
        and function.proname = 'rls_auto_enable'
        and function.pronargs = 0
    ),
    true
  ),
  'the optional auto-RLS event-trigger function has no client execute grant'
);

select is(
  (
    select count(*)::integer
    from pg_proc as function
    join pg_namespace as namespace on namespace.oid = function.pronamespace
    where namespace.nspname = 'public'
      and function.oid in (
        'public.complete_parent_onboarding(text,text)'::regprocedure,
        'public.create_child_profile(uuid,uuid,uuid,text,text,text,boolean)'::regprocedure
      )
      and function.prosecdef
      and function.proconfig @> array['search_path=""']::text[]
      and has_function_privilege(
        'authenticated',
        function.oid,
        'execute'
      )
      and not has_function_privilege('anon', function.oid, 'execute')
  ),
  2,
  'the two onboarding RPCs retain fixed-path authenticated-only definer access'
);

select is(
  (
    select count(*)::integer
    from pg_proc as function
    join pg_namespace as namespace on namespace.oid = function.pronamespace
    where namespace.nspname = 'public'
      and function.oid in (
        'public.publish_ai_operation_version(text,text,uuid)'::regprocedure,
        'public.prepare_ai_media_job(text,uuid,uuid,uuid,public.media_subject_kind,text,uuid)'::regprocedure
      )
      and function.prosecdef
      and function.proconfig @> array['search_path=""']::text[]
      and has_function_privilege(
        'authenticated',
        function.oid,
        'execute'
      )
      and not has_function_privilege('anon', function.oid, 'execute')
  ),
  2,
  'the two AI product RPCs retain fixed-path authenticated-only definer access'
);

select is(
  (
    select count(*)::integer
    from pg_policies as policy
    where policy.schemaname = 'public'
      and policy.tablename in ('topics', 'goals', 'exercises')
      and policy.cmd = 'SELECT'
      and policy.permissive = 'PERMISSIVE'
      and policy.roles @> array['anon'::name]
  ),
  3,
  'each content table has one anonymous permissive read policy'
);

select is(
  (
    select count(*)::integer
    from pg_policies as policy
    where policy.schemaname = 'public'
      and policy.tablename in ('topics', 'goals', 'exercises')
      and policy.cmd = 'SELECT'
      and policy.permissive = 'PERMISSIVE'
      and policy.roles @> array['authenticated'::name]
  ),
  3,
  'each content table has one authenticated permissive read policy'
);

set local role anon;
select is(
  (select count(*)::integer from public.topics),
  1,
  'anonymous users still see only the published topic'
);
select is(
  (select count(*)::integer from public.goals),
  1,
  'anonymous users still see only a goal with a published topic'
);
select is(
  (select count(*)::integer from public.exercises),
  3,
  'anonymous users still see only exercises in the published content chain'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;
select is(
  (select count(*)::integer from public.topics),
  1,
  'an authenticated parent still sees only the published topic'
);
select is(
  (select count(*)::integer from public.goals),
  1,
  'an authenticated parent still sees only the published goal chain'
);
select is(
  (select count(*)::integer from public.exercises),
  3,
  'an authenticated parent still sees only the published exercise chain'
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
  'the content admin still sees published and draft topics'
);
select is(
  (select count(*)::integer from public.goals),
  2,
  'the content admin still sees published and draft goals'
);
select is(
  (select count(*)::integer from public.exercises),
  3,
  'the content admin still sees every exercise'
);

reset role;

select is(
  (
    select count(*)::integer
    from pg_policies as policy
    where policy.schemaname = 'public'
      and policy.tablename in ('topics', 'goals', 'exercises')
      and policy.cmd = 'SELECT'
  ),
  6,
  'the content read boundary is represented by six role-specific policies'
);

select * from finish();
rollback;
