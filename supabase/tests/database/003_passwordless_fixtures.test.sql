begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(5);

select is(
  (
    select count(*)::integer
    from auth.users
    where id in (
      '10000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000003'
    )
  ),
  3,
  'all three synthetic Auth users exist'
);

select is(
  (
    select count(*)::integer
    from auth.users
    where id in (
      '10000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000003'
    )
      and encrypted_password is null
  ),
  3,
  'synthetic Auth users have no password hashes'
);

select is(
  (
    select count(*)::integer
    from auth.users
    where id in (
      '10000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000003'
    )
      and email_confirmed_at is not null
  ),
  3,
  'synthetic Auth users are ready to request passwordless sign-in emails'
);

select is(
  (
    select count(*)::integer
    from auth.identities
    where user_id in (
      '10000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000003'
    )
      and provider = 'email'
  ),
  3,
  'each synthetic Auth user retains an email identity'
);

select results_eq(
  $$
    select display_name
    from public.profiles
    where id in (
      '10000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000003'
    )
    order by id
  $$,
  $$
    values
      ('Demo Forælder'::text),
      ('Anden Demo Forælder'::text),
      ('Demo Redaktør'::text)
  $$,
  'the Auth trigger still creates all three application profiles'
);

select * from finish();
rollback;
