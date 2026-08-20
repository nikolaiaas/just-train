begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(18);

select has_function(
  'public',
  'complete_parent_onboarding',
  array['text', 'text'],
  'parent onboarding RPC exists'
);
select is(
  (
    select procedure.prosecdef
    from pg_proc as procedure
    where procedure.oid = 'public.complete_parent_onboarding(text,text)'::regprocedure
  ),
  true,
  'parent onboarding uses its narrow trigger-compatible security boundary'
);
select is(
  (
    select procedure.proconfig
    from pg_proc as procedure
    where procedure.oid = 'public.complete_parent_onboarding(text,text)'::regprocedure
  ),
  array['search_path=""']::text[],
  'the privileged onboarding RPC has an empty search path'
);
select is(
  (
    select pg_get_userbyid(procedure.proowner)
    from pg_proc as procedure
    where procedure.oid = 'public.complete_parent_onboarding(text,text)'::regprocedure
  ),
  'postgres',
  'the narrow onboarding RPC is owned by the trusted migration role'
);
select ok(
  lower(
    pg_get_functiondef('public.complete_parent_onboarding(text,text)'::regprocedure)
  ) like '%for update%',
  'concurrent first-family requests serialize on the caller profile'
);
select is(
  has_function_privilege(
    'anon',
    'public.complete_parent_onboarding(text,text)',
    'execute'
  ),
  false,
  'anonymous clients cannot execute parent onboarding'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.complete_parent_onboarding(text,text)',
    'execute'
  ),
  true,
  'authenticated clients can execute parent onboarding'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);
set local role authenticated;

select results_eq(
  $$
    select display_name, family_name, role::text, created
    from public.complete_parent_onboarding(
      '  Demo Voksen  ',
      '  Min Testfamilie  '
    )
  $$,
  $$ values ('Demo Voksen'::text, 'Min Testfamilie'::text, 'owner'::text, true) $$,
  'first onboarding trims names and creates an owned family'
);
select results_eq(
  $$
    select display_name
    from public.profiles
    where id = '10000000-0000-4000-8000-000000000003'
  $$,
  $$ values ('Demo Voksen'::text) $$,
  'onboarding updates only the caller profile name'
);
reset role;
select results_eq(
  $$
    select display_name
    from public.profiles
    where id = '10000000-0000-4000-8000-000000000001'
  $$,
  $$ values ('Demo Forælder'::text) $$,
  'the privileged RPC does not change another adult profile'
);
set local role authenticated;
select results_eq(
  $$
    select
      family.name,
      family.created_by,
      membership.user_id,
      membership.added_by,
      membership.role::text
    from public.family_memberships as membership
    join public.families as family on family.id = membership.family_id
    where membership.user_id = '10000000-0000-4000-8000-000000000003'
  $$,
  $$
    values (
      'Min Testfamilie'::text,
      '10000000-0000-4000-8000-000000000003'::uuid,
      '10000000-0000-4000-8000-000000000003'::uuid,
      '10000000-0000-4000-8000-000000000003'::uuid,
      'owner'::text
    )
  $$,
  'the family and owner membership are attributed only to the caller'
);
select results_eq(
  $$
    select first_call.family_id = second_call.family_id, second_call.created
    from public.complete_parent_onboarding(
      'Demo Voksen',
      'Min Testfamilie'
    ) as first_call
    cross join public.complete_parent_onboarding(
      'Demo Voksen',
      'Skal ikke overskrive'
    ) as second_call
  $$,
  $$ values (true, false) $$,
  'retries return the existing family instead of creating or renaming one'
);
select is(
  (
    select count(*)::integer
    from public.family_memberships
    where user_id = '10000000-0000-4000-8000-000000000003'
  ),
  1,
  'retries leave the caller with one first-family membership'
);
select throws_ok(
  $$ select * from public.complete_parent_onboarding('Demo Voksen', '   ') $$,
  '22023',
  'Family name must contain between 1 and 80 characters.',
  'blank family names are rejected before any write'
);
select throws_ok(
  $$ select * from public.complete_parent_onboarding(null, 'Min familie') $$,
  '22023',
  'Display name must contain between 1 and 80 characters.',
  'null display names are rejected before any write'
);
select throws_ok(
  $$ select * from public.complete_parent_onboarding('Demo Voksen', E'Min\nfamilie') $$,
  '22023',
  'Family name must contain between 1 and 80 characters.',
  'control characters in family names are rejected before any write'
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
    select family_id, family_name, role::text, created
    from public.complete_parent_onboarding(
      'Demo Forælder',
      'Må ikke oprette en ny familie'
    )
  $$,
  $$
    values (
      '20000000-0000-4000-8000-000000000001'::uuid,
      'Demo Familien'::text,
      'owner'::text,
      false
    )
  $$,
  'an existing parent receives only their own oldest family'
);

reset role;
select set_config('request.jwt.claims', '{}', true);
set local role authenticated;
select throws_ok(
  $$ select * from public.complete_parent_onboarding('Demo Voksen', 'Min familie') $$,
  '42501',
  'Authentication is required.',
  'a missing authenticated identity fails closed'
);

reset role;
select * from finish();
rollback;
