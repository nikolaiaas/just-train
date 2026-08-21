begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(76);

select has_table(
  'private',
  'child_profile_consents',
  'private child-profile consent records exist'
);
select has_column(
  'private',
  'child_profile_consents',
  'child_profile_id',
  'consent records identify only the child row'
);
select has_column(
  'private',
  'child_profile_consents',
  'family_id',
  'consent records retain family lineage'
);
select has_column(
  'private',
  'child_profile_consents',
  'creation_request_id',
  'consent records carry the idempotency key'
);
select has_column(
  'private',
  'child_profile_consents',
  'notice_version',
  'consent records carry the exact notice version'
);
select has_column(
  'private',
  'child_profile_consents',
  'granted_by',
  'consent records attribute the authenticated adult'
);
select has_column(
  'private',
  'child_profile_consents',
  'granted_at',
  'consent records use a server timestamp'
);
select col_not_null(
  'private',
  'child_profile_consents',
  'creation_request_id',
  'the idempotency key cannot be null'
);
select ok(
  (
    select relation.relrowsecurity
    from pg_class as relation
    join pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'private'
      and relation.relname = 'child_profile_consents'
  ),
  'private consent records retain a default-deny RLS boundary'
);
select ok(
  exists (
    select 1
    from pg_constraint as constraint_record
    where constraint_record.conname = 'child_profile_consents_child_family_fkey'
      and constraint_record.contype = 'f'
  ),
  'consent child and family lineage is protected by a composite foreign key'
);
select ok(
  exists (
    select 1
    from pg_constraint as constraint_record
    join pg_class as relation on relation.oid = constraint_record.conrelid
    join pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'private'
      and relation.relname = 'child_profile_consents'
      and constraint_record.contype = 'u'
      and pg_get_constraintdef(constraint_record.oid)
        = 'UNIQUE (granted_by, creation_request_id)'
  ),
  'one caller-scoped request id can create only one child'
);
select has_trigger(
  'public',
  'child_profiles',
  'enforce_active_child_limit',
  'child profiles enforce the active-family limit for every writer'
);
select has_function(
  'private',
  'assert_child_profile_creation_preconditions',
  array[]::text[],
  'hosted deployment has an explicit child-data compatibility preflight'
);
select has_function(
  'public',
  'create_child_profile',
  array['uuid', 'uuid', 'uuid', 'text', 'text', 'text', 'boolean'],
  'consent-gated child creation RPC exists'
);
select is(
  (
    select procedure.prosecdef
    from pg_proc as procedure
    where procedure.oid =
      'public.create_child_profile(uuid,uuid,uuid,text,text,text,boolean)'::regprocedure
  ),
  true,
  'child creation uses its narrow trigger-compatible security boundary'
);
select is(
  (
    select procedure.proconfig
    from pg_proc as procedure
    where procedure.oid =
      'public.create_child_profile(uuid,uuid,uuid,text,text,text,boolean)'::regprocedure
  ),
  array['search_path=""']::text[],
  'the privileged child-creation RPC has an empty search path'
);
select is(
  (
    select pg_get_userbyid(procedure.proowner)
    from pg_proc as procedure
    where procedure.oid =
      'public.create_child_profile(uuid,uuid,uuid,text,text,text,boolean)'::regprocedure
  ),
  'postgres',
  'the child-creation RPC is owned by the trusted migration role'
);
select ok(
  lower(
    pg_get_functiondef(
      'public.create_child_profile(uuid,uuid,uuid,text,text,text,boolean)'::regprocedure
    )
  ) like '%from public.profiles as profile%for update%',
  'caller-scoped retry requests serialize on the adult profile'
);
select ok(
  lower(
    pg_get_functiondef(
      'public.create_child_profile(uuid,uuid,uuid,text,text,text,boolean)'::regprocedure
    )
  ) like '%from public.families as family%for no key update;%',
  'child creation locks the target family in its own statement'
);
select ok(
  lower(
    pg_get_functiondef(
      'public.create_child_profile(uuid,uuid,uuid,text,text,text,boolean)'::regprocedure
    )
  ) not like '%join public.family_memberships%',
  'the family lock cannot authorize from a stale membership join snapshot'
);
select ok(
  strpos(
    lower(
      pg_get_functiondef(
        'public.create_child_profile(uuid,uuid,uuid,text,text,text,boolean)'::regprocedure
      )
    ),
    'from public.families as family'
  ) < strpos(
    lower(
      pg_get_functiondef(
        'public.create_child_profile(uuid,uuid,uuid,text,text,text,boolean)'::regprocedure
      )
    ),
    'from public.family_memberships as membership'
  ),
  'owner membership is re-read after the family lock statement'
);
select ok(
  strpos(
    lower(
      pg_get_functiondef(
        'public.create_child_profile(uuid,uuid,uuid,text,text,text,boolean)'::regprocedure
      )
    ),
    'caller_id is distinct from p_expected_user_id'
  ) < strpos(
    lower(
      pg_get_functiondef(
        'public.create_child_profile(uuid,uuid,uuid,text,text,text,boolean)'::regprocedure
      )
    ),
    'from public.families as family'
  ),
  'the expected account is checked before any family mutation boundary'
);
select ok(
  lower(
    pg_get_functiondef('private.enforce_active_child_limit()'::regprocedure)
  ) like '%from public.families as family%for no key update%',
  'the active-child trigger serializes its family count'
);
select is(
  (
    select procedure.prosecdef
    from pg_proc as procedure
    where procedure.oid =
      'private.enforce_active_child_limit()'::regprocedure
  ),
  true,
  'the active-child trigger can take its family lock independent of client grants'
);
select is(
  (
    select procedure.proconfig
    from pg_proc as procedure
    where procedure.oid =
      'private.enforce_active_child_limit()'::regprocedure
  ),
  array['search_path=""']::text[],
  'the privileged active-child trigger has an empty search path'
);
select is(
  (
    select pg_get_userbyid(procedure.proowner)
    from pg_proc as procedure
    where procedure.oid =
      'private.enforce_active_child_limit()'::regprocedure
  ),
  'postgres',
  'the active-child trigger is owned by the trusted migration role'
);
select is(
  has_function_privilege(
    'authenticated',
    'private.assert_child_profile_creation_preconditions()',
    'execute'
  ),
  false,
  'authenticated clients cannot run the hosted-data preflight'
);
select is(
  has_function_privilege(
    'anon',
    'public.create_child_profile(uuid,uuid,uuid,text,text,text,boolean)',
    'execute'
  ),
  false,
  'anonymous clients cannot execute child creation'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.create_child_profile(uuid,uuid,uuid,text,text,text,boolean)',
    'execute'
  ),
  true,
  'authenticated clients can execute child creation'
);
select is(
  has_any_column_privilege(
    'authenticated',
    'public.child_profiles',
    'insert'
  ),
  false,
  'authenticated clients cannot bypass the RPC with a direct child insert'
);
select is(
  has_column_privilege(
    'authenticated',
    'public.child_profiles',
    'avatar_url',
    'update'
  ),
  false,
  'authenticated clients cannot attach an arbitrary child avatar URL'
);
select is(
  has_column_privilege(
    'authenticated',
    'public.child_profiles',
    'avatar_seed',
    'update'
  ),
  false,
  'authenticated clients cannot bypass the preset avatar allowlist'
);
select is(
  has_column_privilege(
    'authenticated',
    'public.child_profiles',
    'preferences',
    'update'
  ),
  false,
  'authenticated clients cannot inject unvalidated child preferences'
);
select is(
  has_column_privilege(
    'authenticated',
    'public.child_profiles',
    'is_active',
    'update'
  ),
  false,
  'authenticated clients cannot bypass the limit by directly reactivating a child'
);
select is(
  has_column_privilege(
    'authenticated',
    'public.child_profiles',
    'display_name',
    'update'
  ),
  true,
  'the existing family-scoped display-name edit remains available'
);
select is(
  has_table_privilege(
    'authenticated',
    'private.child_profile_consents',
    'select'
  ),
  false,
  'authenticated clients cannot browse private consent evidence'
);
select is(
  has_table_privilege(
    'authenticated',
    'private.child_profile_consents',
    'insert'
  ),
  false,
  'authenticated clients cannot forge private consent evidence'
);
select is(
  has_table_privilege(
    'authenticated',
    'private.child_profile_consents',
    'update'
  ),
  false,
  'authenticated clients cannot rewrite private consent evidence'
);
select is(
  has_table_privilege(
    'authenticated',
    'private.child_profile_consents',
    'delete'
  ),
  false,
  'authenticated clients cannot delete private consent evidence directly'
);
select is(
  has_table_privilege(
    'service_role',
    'private.child_profile_consents',
    'select'
  ),
  true,
  'trusted service workflows can read consent evidence'
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
      family_id,
      display_name,
      avatar_seed,
      is_active,
      consent_version,
      created
    from public.create_child_profile(
      '20000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      'd1000000-0000-4000-8000-000000000001',
      '  Nyt Demo Barn  ',
      'preset-star',
      'child-profile-pilot-v1',
      true
    )
  $$,
  $$
    values (
      '20000000-0000-4000-8000-000000000001'::uuid,
      'Nyt Demo Barn'::text,
      'preset-star'::text,
      true,
      'child-profile-pilot-v1'::text,
      true
    )
  $$,
  'an owner creates one trimmed preset-only child profile with consent'
);

reset role;
select results_eq(
  $$
    select
      child.family_id,
      child.display_name,
      child.avatar_url,
      child.avatar_seed,
      child.preferences,
      child.is_active,
      child.created_by
    from private.child_profile_consents as consent
    join public.child_profiles as child
      on child.id = consent.child_profile_id
      and child.family_id = consent.family_id
    where consent.creation_request_id =
      'd1000000-0000-4000-8000-000000000001'
  $$,
  $$
    values (
      '20000000-0000-4000-8000-000000000001'::uuid,
      'Nyt Demo Barn'::text,
      null::text,
      'preset-star'::text,
      '{}'::jsonb,
      true,
      '10000000-0000-4000-8000-000000000001'::uuid
    )
  $$,
  'the RPC derives ownership and stores no child photo or extra preferences'
);
select results_eq(
  $$
    select family_id, notice_version, granted_by, granted_at is not null
    from private.child_profile_consents
    where creation_request_id =
      'd1000000-0000-4000-8000-000000000001'
  $$,
  $$
    values (
      '20000000-0000-4000-8000-000000000001'::uuid,
      'child-profile-pilot-v1'::text,
      '10000000-0000-4000-8000-000000000001'::uuid,
      true
    )
  $$,
  'consent records the exact notice, caller, family, and server time'
);
select is(
  (
    select count(*)::integer
    from auth.users as auth_user
    join private.child_profile_consents as consent
      on consent.child_profile_id = auth_user.id
    where consent.creation_request_id =
      'd1000000-0000-4000-8000-000000000001'
  ),
  0,
  'child creation never creates a child Auth user'
);

set local role authenticated;
select results_eq(
  $$
    select child_profile_id, created
    from public.create_child_profile(
      '20000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      'd1000000-0000-4000-8000-000000000001',
      'Nyt Demo Barn',
      'preset-star',
      'child-profile-pilot-v1',
      true
    )
  $$,
  $$
    select child.id, false
    from public.child_profiles as child
    where child.family_id = '20000000-0000-4000-8000-000000000001'
      and child.display_name = 'Nyt Demo Barn'
  $$,
  'a retry returns the original child instead of creating a duplicate'
);
reset role;
select is(
  (
    select count(*)::integer
    from private.child_profile_consents
    where granted_by = '10000000-0000-4000-8000-000000000001'
      and creation_request_id =
        'd1000000-0000-4000-8000-000000000001'
  ),
  1,
  'a retried logical request retains one immutable consent record'
);

set local role authenticated;
select throws_ok(
  $$
    select * from public.create_child_profile(
      '20000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      'd1000000-0000-4000-8000-000000000001',
      'Et andet navn',
      'preset-star',
      'child-profile-pilot-v1',
      true
    )
  $$,
  '22023',
  'A creation request id cannot be reused with different input.',
  'a request id cannot be reused with changed child data'
);
select throws_ok(
  $$
    select * from public.create_child_profile(
      '20000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      'd1000000-0000-4000-8000-000000000002',
      '   ',
      'preset-star',
      'child-profile-pilot-v1',
      true
    )
  $$,
  '22023',
  'Child display name must contain between 1 and 60 characters.',
  'blank child names are rejected before any write'
);
select throws_ok(
  $$
    select * from public.create_child_profile(
      '20000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      'd1000000-0000-4000-8000-000000000003',
      E'Demo\nBarn',
      'preset-star',
      'child-profile-pilot-v1',
      true
    )
  $$,
  '22023',
  'Child display name must contain between 1 and 60 characters.',
  'control characters are rejected in child names'
);
select throws_ok(
  $$
    select * from public.create_child_profile(
      '20000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      'd1000000-0000-4000-8000-000000000004',
      repeat('x', 61),
      'preset-star',
      'child-profile-pilot-v1',
      true
    )
  $$,
  '22023',
  'Child display name must contain between 1 and 60 characters.',
  'overlong child names are rejected'
);
select throws_ok(
  $$
    select * from public.create_child_profile(
      '20000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      'd1000000-0000-4000-8000-000000000005',
      'Demo Barn',
      'demo-hero-green',
      'child-profile-pilot-v1',
      true
    )
  $$,
  '22023',
  'The selected preset avatar is invalid.',
  'legacy seeds stay readable but cannot be chosen for a new child'
);
select throws_ok(
  $$
    select * from public.create_child_profile(
      '20000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      'd1000000-0000-4000-8000-000000000006',
      'Demo Barn',
      'preset-rocket',
      'child-profile-pilot-v1',
      false
    )
  $$,
  '22023',
  'The child-profile notice must be accepted.',
  'child creation fails closed without explicit consent'
);
select throws_ok(
  $$
    select * from public.create_child_profile(
      '20000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      'd1000000-0000-4000-8000-000000000007',
      'Demo Barn',
      'preset-rocket',
      'child-profile-pilot-v0',
      true
    )
  $$,
  '22023',
  'The child-profile notice version is invalid.',
  'a stale client cannot submit another consent notice version'
);
select throws_ok(
  $$
    select * from public.create_child_profile(
      '20000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      '00000000-0000-0000-0000-000000000000',
      'Demo Barn',
      'preset-rocket',
      'child-profile-pilot-v1',
      true
    )
  $$,
  '22023',
  'A non-zero creation request id is required.',
  'the nil id cannot disable idempotency'
);
select throws_ok(
  $$
    insert into public.child_profiles (
      family_id,
      display_name,
      avatar_seed,
      created_by
    ) values (
      '20000000-0000-4000-8000-000000000001',
      'Direkte Barn',
      'preset-star',
      '10000000-0000-4000-8000-000000000001'
    )
  $$,
  '42501',
  null,
  'authenticated clients cannot directly insert a child'
);
select throws_ok(
  $$
    update public.child_profiles
    set avatar_seed = 'preset-star'
    where id = '30000000-0000-4000-8000-000000000001'
  $$,
  '42501',
  null,
  'authenticated clients cannot directly change a child avatar seed'
);
select throws_ok(
  $$
    update public.child_profiles
    set display_name = E'Demo\nBarn'
    where id = '30000000-0000-4000-8000-000000000001'
  $$,
  '23514',
  null,
  'the table rejects control characters during later child-name edits'
);
select throws_ok(
  $$
    update public.child_profiles
    set display_name = '  Demo Barn  '
    where id = '30000000-0000-4000-8000-000000000001'
  $$,
  '23514',
  null,
  'the table rejects unnormalized child names during later edits'
);
select throws_ok(
  $$
    insert into private.child_profile_consents (
      child_profile_id,
      family_id,
      creation_request_id,
      notice_version,
      granted_by
    ) values (
      '30000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      'd1000000-0000-4000-8000-000000000090',
      'child-profile-pilot-v1',
      '10000000-0000-4000-8000-000000000001'
    )
  $$,
  '42501',
  null,
  'authenticated clients cannot forge consent evidence at runtime'
);
select throws_ok(
  $$
    update private.child_profile_consents
    set notice_version = 'child-profile-pilot-v1'
    where creation_request_id =
      'd1000000-0000-4000-8000-000000000001'
  $$,
  '42501',
  null,
  'authenticated clients cannot rewrite consent evidence at runtime'
);
select throws_ok(
  $$
    delete from private.child_profile_consents
    where creation_request_id =
      'd1000000-0000-4000-8000-000000000001'
  $$,
  '42501',
  null,
  'authenticated clients cannot delete consent evidence at runtime'
);

reset role;
select set_config('request.jwt.claims', '{}', true);
set local role authenticated;
select throws_ok(
  $$
    select * from public.create_child_profile(
      '20000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      'd1000000-0000-4000-8000-000000000008',
      'Demo Barn',
      'preset-rocket',
      'child-profile-pilot-v1',
      true
    )
  $$,
  '42501',
  'Authentication is required.',
  'a missing authenticated identity fails closed'
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
    select * from public.create_child_profile(
      '20000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000001',
      'd1000000-0000-4000-8000-000000000012',
      'Stale session',
      'preset-rocket',
      'child-profile-pilot-v1',
      true
    )
  $$,
  '28000',
  'The authenticated account changed before child creation.',
  'a switched account cannot submit a child request captured for the prior session'
);
select throws_ok(
  $$
    select * from public.create_child_profile(
      '20000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000002',
      'd1000000-0000-4000-8000-000000000009',
      'Anden families barn',
      'preset-rocket',
      'child-profile-pilot-v1',
      true
    )
  $$,
  '42501',
  'Family owner access is required.',
  'an owner cannot create a child in another family'
);
select is(
  (
    select count(*)::integer
    from public.child_profiles
    where display_name = 'Nyt Demo Barn'
  ),
  0,
  'another family cannot read the newly created child'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);
set local role authenticated;
select throws_ok(
  $$
    select * from public.create_child_profile(
      '20000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000003',
      'd1000000-0000-4000-8000-000000000010',
      'Administrators barn',
      'preset-rainbow',
      'child-profile-pilot-v1',
      true
    )
  $$,
  '42501',
  'Family owner access is required.',
  'content-admin status never grants child creation access'
);
select is(
  (
    select count(*)::integer
    from public.child_profiles
    where display_name = 'Nyt Demo Barn'
  ),
  0,
  'a content administrator cannot browse the newly created child'
);

reset role;
insert into public.family_memberships (family_id, user_id, role, added_by)
values (
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  'caregiver',
  '10000000-0000-4000-8000-000000000001'
);
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;
select throws_ok(
  $$
    select * from public.create_child_profile(
      '20000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000002',
      'd1000000-0000-4000-8000-000000000011',
      'Omsorgspersonens barn',
      'preset-sprout',
      'child-profile-pilot-v1',
      true
    )
  $$,
  '42501',
  'Family owner access is required.',
  'a caregiver cannot make the pilot owner-consent assertion'
);

reset role;
delete from public.family_memberships
where family_id = '20000000-0000-4000-8000-000000000001'
  and user_id = '10000000-0000-4000-8000-000000000002';

insert into public.child_profiles (
  id,
  family_id,
  display_name,
  avatar_seed,
  created_by
)
select
  (
    'a0000000-0000-4000-8000-' || lpad(number::text, 12, '0')
  )::uuid,
  '20000000-0000-4000-8000-000000000001'::uuid,
  'Grænse Barn ' || number,
  'preset-sprout',
  '10000000-0000-4000-8000-000000000001'::uuid
from generate_series(1, 8) as number;

select is(
  (
    select count(*)::integer
    from public.child_profiles
    where family_id = '20000000-0000-4000-8000-000000000001'
      and is_active
  ),
  10,
  'the family can retain up to ten active children'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;
select throws_ok(
  $$
    select * from public.create_child_profile(
      '20000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      'd1000000-0000-4000-8000-000000000099',
      'Barn Nummer Elleve',
      'preset-sprout',
      'child-profile-pilot-v1',
      true
    )
  $$,
  '54000',
  'A family can have at most 10 active child profiles.',
  'the eleventh active child is rejected by the serialized trigger'
);
select is(
  (
    select count(*)::integer
    from public.child_profiles
    where family_id = '20000000-0000-4000-8000-000000000001'
      and is_active
  ),
  10,
  'a rejected limit request leaves the child count unchanged'
);

reset role;
select is(
  (
    select count(*)::integer
    from private.child_profile_consents
    where creation_request_id =
      'd1000000-0000-4000-8000-000000000099'
  ),
  0,
  'a rejected limit request leaves no consent record'
);

set local role authenticated;
select results_eq(
  $$
    select display_name, created
    from public.create_child_profile(
      '20000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      'd1000000-0000-4000-8000-000000000001',
      'Nyt Demo Barn',
      'preset-star',
      'child-profile-pilot-v1',
      true
    )
  $$,
  $$ values ('Nyt Demo Barn'::text, false) $$,
  'an earlier successful request remains retryable at the family limit'
);
select is(
  (
    select count(*)::integer
    from public.child_profiles
    where avatar_seed = 'demo-hero-green'
  ),
  1,
  'legacy seed rows remain readable after the new preset gate'
);

reset role;
alter table public.child_profiles
  drop constraint child_profiles_display_name_normalized;
update public.child_profiles
set display_name = '  Legacy Demo Barn  '
where id = '30000000-0000-4000-8000-000000000001';
select throws_ok(
  $$ select private.assert_child_profile_creation_preconditions() $$,
  '23514',
  'Child-profile creation migration blocked: existing child names require review.',
  'the hosted preflight fails before silently rewriting a legacy child name'
);
update public.child_profiles
set display_name = 'Demo Barn'
where id = '30000000-0000-4000-8000-000000000001';
alter table public.child_profiles
  add constraint child_profiles_display_name_normalized check (
    display_name = btrim(display_name)
    and display_name !~ '[[:cntrl:]]'
  );

alter table public.child_profiles disable trigger enforce_active_child_limit;
insert into public.child_profiles (
  id,
  family_id,
  display_name,
  avatar_seed,
  created_by
) values (
  'b0000000-0000-4000-8000-000000000011',
  '20000000-0000-4000-8000-000000000001',
  'Eksisterende Barn Elleve',
  'demo-hero-green',
  '10000000-0000-4000-8000-000000000001'
);
select throws_ok(
  $$ select private.assert_child_profile_creation_preconditions() $$,
  '54000',
  'Child-profile creation migration blocked: a family exceeds the active-child limit.',
  'the hosted preflight refuses to choose which legacy child should be deactivated'
);
delete from public.child_profiles
where id = 'b0000000-0000-4000-8000-000000000011';
alter table public.child_profiles enable trigger enforce_active_child_limit;

select * from finish();
rollback;
