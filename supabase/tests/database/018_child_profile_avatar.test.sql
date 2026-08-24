begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(35);

select has_column(
  'public',
  'child_profiles',
  'avatar_media_asset_id',
  'child profiles can point to one durable private avatar asset'
);
select ok(
  (
    select is_nullable = 'YES'
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'child_profiles'
      and column_name = 'avatar_media_asset_id'
  ),
  'the profile-asset pointer is additive and nullable for older clients'
);
select ok(
  exists (
    select 1
    from pg_constraint as constraint_record
    where constraint_record.conname = 'media_assets_id_family_child_key'
      and constraint_record.contype = 'u'
  ),
  'media assets expose one declarative family-and-child lineage key'
);
select ok(
  exists (
    select 1
    from pg_constraint as constraint_record
    where constraint_record.conname = 'child_profiles_avatar_media_child_fkey'
      and constraint_record.contype = 'f'
  ),
  'the profile pointer cannot drift across a family or sibling'
);
select ok(
  not has_column_privilege(
    'authenticated',
    'public.child_profiles',
    'avatar_media_asset_id',
    'insert'
  )
  and not has_column_privilege(
    'authenticated',
    'public.child_profiles',
    'avatar_media_asset_id',
    'update'
  ),
  'family clients cannot write the profile pointer directly'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.set_child_profile_avatar_from_ai_job(uuid,uuid,uuid)',
    'execute'
  ),
  true,
  'authenticated family sessions can use the guarded promotion RPC'
);
select is(
  has_function_privilege(
    'anon',
    'public.set_child_profile_avatar_from_ai_job(uuid,uuid,uuid)',
    'execute'
  ),
  false,
  'anonymous sessions cannot promote a child profile image'
);
select is(
  has_function_privilege(
    'service_role',
    'public.set_child_profile_avatar_from_ai_job(uuid,uuid,uuid)',
    'execute'
  ),
  false,
  'the profile-image transition is not a general worker capability'
);

insert into public.child_profiles (
  id,
  family_id,
  display_name,
  avatar_seed,
  created_by
)
values (
  '30000000-0000-4000-8000-000000000003',
  '20000000-0000-4000-8000-000000000001',
  'Syntetisk Søskende',
  'preset-star',
  '10000000-0000-4000-8000-000000000001'
);

insert into public.ai_operations (
  id,
  operation_key,
  capability,
  description
)
values (
  'af100000-0000-4000-8000-000000000001',
  'portrait.not_profile',
  'image_transform',
  'Synthetic wrong-operation fixture.'
);

insert into public.ai_operation_versions (
  id,
  operation_id,
  version,
  prompt_template,
  gateway,
  provider,
  model,
  request_options,
  input_contract,
  output_contract,
  max_attempts,
  timeout_ms,
  max_cost_microusd
)
values (
  'af200000-0000-4000-8000-000000000001',
  'af100000-0000-4000-8000-000000000001',
  1,
  'Create a synthetic image that must never become a profile image.',
  'openrouter',
  'openai',
  'openai/gpt-image-2',
  '{}'::jsonb,
  '{}'::jsonb,
  '{}'::jsonb,
  1,
  120000,
  250000
);

update public.ai_operations
set active_version_id = 'af200000-0000-4000-8000-000000000001'
where id = 'af100000-0000-4000-8000-000000000001';

insert into public.media_assets (
  id,
  family_id,
  child_profile_id,
  subject_kind,
  asset_role,
  status,
  storage_object_path,
  mime_type,
  byte_size,
  sha256_hex,
  delete_after,
  created_by
)
values
  (
    'bf400000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'child',
    'reference_input',
    'ready',
    '20000000-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000001/bf300000-0000-4000-8000-000000000001/input.jpg',
    'image/jpeg',
    1024,
    repeat('1', 64),
    now() + interval '24 hours',
    '10000000-0000-4000-8000-000000000001'
  ),
  (
    'bf400000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'child',
    'generated_output',
    'ready',
    '20000000-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000001/bf300000-0000-4000-8000-000000000001/output.png',
    'image/png',
    2048,
    repeat('2', 64),
    now() + interval '30 days',
    '10000000-0000-4000-8000-000000000001'
  ),
  (
    'bf400000-0000-4000-8000-000000000003',
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'child',
    'generated_output',
    'ready',
    '20000000-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000001/bf300000-0000-4000-8000-000000000002/output.png',
    'image/png',
    2048,
    repeat('3', 64),
    now() + interval '30 days',
    '10000000-0000-4000-8000-000000000001'
  ),
  (
    'bf400000-0000-4000-8000-000000000004',
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'child',
    'generated_output',
    'ready',
    '20000000-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000001/bf300000-0000-4000-8000-000000000003/output.png',
    'image/png',
    2048,
    repeat('4', 64),
    now() + interval '30 days',
    '10000000-0000-4000-8000-000000000001'
  ),
  (
    'bf400000-0000-4000-8000-000000000005',
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'child',
    'generated_output',
    'pending',
    '20000000-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000001/bf300000-0000-4000-8000-000000000004/output.png',
    'image/png',
    null,
    null,
    now() + interval '30 days',
    '10000000-0000-4000-8000-000000000001'
  ),
  (
    'bf400000-0000-4000-8000-000000000006',
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000003',
    'child',
    'generated_output',
    'ready',
    '20000000-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000001/bf300000-0000-4000-8000-000000000005/output.png',
    'image/png',
    2048,
    repeat('6', 64),
    now() + interval '30 days',
    '10000000-0000-4000-8000-000000000001'
  ),
  (
    'bf400000-0000-4000-8000-000000000007',
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'child',
    'generated_output',
    'ready',
    '20000000-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000001/bf300000-0000-4000-8000-000000000006/output.png',
    'image/png',
    2048,
    repeat('7', 64),
    now() + interval '30 days',
    '10000000-0000-4000-8000-000000000001'
  ),
  (
    'bf400000-0000-4000-8000-000000000008',
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'child',
    'generated_output',
    'ready',
    '20000000-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000001/bf300000-0000-4000-8000-000000000007/output.jpg',
    'image/jpeg',
    2048,
    repeat('8', 64),
    now() + interval '30 days',
    '10000000-0000-4000-8000-000000000001'
  );

insert into public.ai_jobs (
  id,
  family_id,
  child_profile_id,
  subject_kind,
  operation_id,
  operation_version_id,
  requested_by,
  client_request_id,
  status,
  attempt_count,
  max_attempts,
  max_cost_microusd,
  completed_at
)
values
  (
    'bf300000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'child',
    'a1000000-0000-4000-8000-000000000001',
    'a2000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    'bf500000-0000-4000-8000-000000000001',
    'succeeded',
    1,
    1,
    250000,
    now()
  ),
  (
    'bf300000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'child',
    'a1000000-0000-4000-8000-000000000001',
    'a2000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    'bf500000-0000-4000-8000-000000000002',
    'succeeded',
    1,
    1,
    250000,
    now()
  ),
  (
    'bf300000-0000-4000-8000-000000000003',
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'child',
    'af100000-0000-4000-8000-000000000001',
    'af200000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'bf500000-0000-4000-8000-000000000003',
    'succeeded',
    1,
    1,
    250000,
    now()
  ),
  (
    'bf300000-0000-4000-8000-000000000004',
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'child',
    'a1000000-0000-4000-8000-000000000001',
    'a2000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    'bf500000-0000-4000-8000-000000000004',
    'processing',
    1,
    1,
    250000,
    null
  ),
  (
    'bf300000-0000-4000-8000-000000000005',
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000003',
    'child',
    'a1000000-0000-4000-8000-000000000001',
    'a2000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    'bf500000-0000-4000-8000-000000000005',
    'succeeded',
    1,
    1,
    250000,
    now()
  ),
  (
    'bf300000-0000-4000-8000-000000000006',
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'child',
    'a1000000-0000-4000-8000-000000000001',
    'a2000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    'bf500000-0000-4000-8000-000000000006',
    'succeeded',
    1,
    1,
    250000,
    now()
  ),
  (
    'bf300000-0000-4000-8000-000000000007',
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'child',
    'a1000000-0000-4000-8000-000000000001',
    'a2000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    'bf500000-0000-4000-8000-000000000007',
    'succeeded',
    1,
    1,
    250000,
    now()
  );

insert into public.ai_job_media (
  job_id,
  media_asset_id,
  family_id,
  slot,
  ordinal
)
values
  (
    'bf300000-0000-4000-8000-000000000001',
    'bf400000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'reference_image',
    0
  ),
  (
    'bf300000-0000-4000-8000-000000000001',
    'bf400000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000001',
    'generated_image',
    0
  ),
  (
    'bf300000-0000-4000-8000-000000000002',
    'bf400000-0000-4000-8000-000000000003',
    '20000000-0000-4000-8000-000000000001',
    'generated_image',
    0
  ),
  (
    'bf300000-0000-4000-8000-000000000003',
    'bf400000-0000-4000-8000-000000000004',
    '20000000-0000-4000-8000-000000000001',
    'generated_image',
    0
  ),
  (
    'bf300000-0000-4000-8000-000000000004',
    'bf400000-0000-4000-8000-000000000005',
    '20000000-0000-4000-8000-000000000001',
    'generated_image',
    0
  ),
  (
    'bf300000-0000-4000-8000-000000000005',
    'bf400000-0000-4000-8000-000000000006',
    '20000000-0000-4000-8000-000000000001',
    'generated_image',
    0
  ),
  (
    'bf300000-0000-4000-8000-000000000006',
    'bf400000-0000-4000-8000-000000000007',
    '20000000-0000-4000-8000-000000000001',
    'generated_image',
    0
  ),
  (
    'bf300000-0000-4000-8000-000000000007',
    'bf400000-0000-4000-8000-000000000008',
    '20000000-0000-4000-8000-000000000001',
    'generated_image',
    0
  );

insert into storage.objects (bucket_id, name, owner_id, metadata)
select
  asset.storage_bucket,
  asset.storage_object_path,
  asset.created_by::text,
  jsonb_build_object(
    'size', asset.byte_size,
    'mimetype', asset.mime_type
  )
from public.media_assets as asset
where asset.id in (
  'bf400000-0000-4000-8000-000000000001',
  'bf400000-0000-4000-8000-000000000002',
  'bf400000-0000-4000-8000-000000000003',
  'bf400000-0000-4000-8000-000000000004',
  'bf400000-0000-4000-8000-000000000005',
  'bf400000-0000-4000-8000-000000000006',
  'bf400000-0000-4000-8000-000000000008'
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
      child_profile_id,
      avatar_media_asset_id,
      previous_avatar_media_asset_id,
      changed
    from public.set_child_profile_avatar_from_ai_job(
      '30000000-0000-4000-8000-000000000001',
      'bf300000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001'
    )
  $$,
  $$
    values (
      '30000000-0000-4000-8000-000000000001'::uuid,
      'bf400000-0000-4000-8000-000000000002'::uuid,
      null::uuid,
      true
    )
  $$,
  'a family member promotes one exact completed portrait output'
);
select is(
  (
    select avatar_media_asset_id
    from public.child_profiles
    where id = '30000000-0000-4000-8000-000000000001'
  ),
  'bf400000-0000-4000-8000-000000000002'::uuid,
  'the selected output becomes the durable child-profile pointer'
);
select is(
  (
    select delete_after
    from public.media_assets
    where id = 'bf400000-0000-4000-8000-000000000002'
  ),
  null::timestamptz,
  'the active profile output has no automatic deletion deadline'
);

-- Inspect the hidden input deadline as the trusted test role. Family RLS must
-- continue to hide this source asset, which is asserted immediately below.
reset role;
select is(
  (
    select delete_after
    from public.media_assets
    where id = 'bf400000-0000-4000-8000-000000000001'
  ),
  now() + interval '24 hours',
  'promoting the output does not extend the source-photo deadline'
);
set local role authenticated;

select is(
  (
    select count(*)::integer
    from storage.objects
    where name like '%bf300000-0000-4000-8000-000000000001/output.png'
  ),
  1,
  'the family can read its ready private profile output'
);
select is(
  (
    select count(*)::integer
    from storage.objects
    where name like '%bf300000-0000-4000-8000-000000000001/input.jpg'
  ),
  0,
  'the family still cannot read the private source photo'
);
select results_eq(
  $$
    select previous_avatar_media_asset_id, changed
    from public.set_child_profile_avatar_from_ai_job(
      '30000000-0000-4000-8000-000000000001',
      'bf300000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001'
    )
  $$,
  $$ values (null::uuid, false) $$,
  'promoting the already active output is idempotent'
);
select results_eq(
  $$
    select
      avatar_media_asset_id,
      previous_avatar_media_asset_id,
      changed
    from public.set_child_profile_avatar_from_ai_job(
      '30000000-0000-4000-8000-000000000001',
      'bf300000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000001'
    )
  $$,
  $$
    values (
      'bf400000-0000-4000-8000-000000000003'::uuid,
      'bf400000-0000-4000-8000-000000000002'::uuid,
      true
    )
  $$,
  'a later completed portrait atomically replaces the current profile output'
);
select is(
  (
    select avatar_media_asset_id
    from public.child_profiles
    where id = '30000000-0000-4000-8000-000000000001'
  ),
  'bf400000-0000-4000-8000-000000000003'::uuid,
  'replacement leaves exactly one current profile asset'
);
select is(
  (
    select delete_after
    from public.media_assets
    where id = 'bf400000-0000-4000-8000-000000000003'
  ),
  null::timestamptz,
  'the replacement output becomes retained'
);
select is(
  (
    select delete_after
    from public.media_assets
    where id = 'bf400000-0000-4000-8000-000000000002'
  ),
  now() + interval '30 days',
  'the replaced output receives a fresh deletion deadline'
);
select throws_ok(
  $$
    update public.child_profiles
    set avatar_media_asset_id = 'bf400000-0000-4000-8000-000000000002'
    where id = '30000000-0000-4000-8000-000000000001'
  $$,
  '42501',
  null,
  'a family client cannot bypass the promotion RPC with a direct update'
);
select throws_ok(
  $$
    select *
    from public.set_child_profile_avatar_from_ai_job(
      '30000000-0000-4000-8000-000000000001',
      'bf300000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000002'
    )
  $$,
  '28000',
  'The authenticated account changed before the profile image update.',
  'a changed session cannot promote an output'
);
select throws_ok(
  $$
    select *
    from public.set_child_profile_avatar_from_ai_job(
      '30000000-0000-4000-8000-000000000001',
      'bf300000-0000-4000-8000-000000000004',
      '10000000-0000-4000-8000-000000000001'
    )
  $$,
  'P0002',
  'The completed portrait result is unavailable.',
  'a processing job cannot become the profile image'
);
select throws_ok(
  $$
    select *
    from public.set_child_profile_avatar_from_ai_job(
      '30000000-0000-4000-8000-000000000001',
      'bf300000-0000-4000-8000-000000000003',
      '10000000-0000-4000-8000-000000000001'
    )
  $$,
  'P0002',
  'The completed portrait result is unavailable.',
  'a different image operation cannot become the profile image'
);
select throws_ok(
  $$
    select *
    from public.set_child_profile_avatar_from_ai_job(
      '30000000-0000-4000-8000-000000000001',
      'bf300000-0000-4000-8000-000000000005',
      '10000000-0000-4000-8000-000000000001'
    )
  $$,
  'P0002',
  'The completed portrait result is unavailable.',
  'a sibling-linked portrait cannot become this child profile image'
);
select throws_ok(
  $$
    select *
    from public.set_child_profile_avatar_from_ai_job(
      '30000000-0000-4000-8000-000000000001',
      'bf300000-0000-4000-8000-000000000006',
      '10000000-0000-4000-8000-000000000001'
    )
  $$,
  'P0002',
  'The completed portrait result is unavailable.',
  'ready metadata without the exact private object cannot become the profile image'
);
select throws_ok(
  $$
    select *
    from public.set_child_profile_avatar_from_ai_job(
      '30000000-0000-4000-8000-000000000001',
      'bf300000-0000-4000-8000-000000000007',
      '10000000-0000-4000-8000-000000000001'
    )
  $$,
  'P0002',
  'The completed portrait result is unavailable.',
  'a non-PNG output cannot become the profile image'
);

reset role;

select throws_ok(
  $$
    update public.child_profiles
    set avatar_media_asset_id = 'bf400000-0000-4000-8000-000000000003'
    where id = '30000000-0000-4000-8000-000000000003'
  $$,
  '23503',
  null,
  'the composite foreign key rejects a same-family sibling asset even for trusted SQL'
);

update public.child_profiles
set is_active = false
where id = '30000000-0000-4000-8000-000000000003';

set local role authenticated;
select throws_ok(
  $$
    select *
    from public.set_child_profile_avatar_from_ai_job(
      '30000000-0000-4000-8000-000000000003',
      'bf300000-0000-4000-8000-000000000005',
      '10000000-0000-4000-8000-000000000001'
    )
  $$,
  '42501',
  'The active child profile is unavailable to this family.',
  'an inactive child profile cannot receive a new profile image'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  (
    select count(*)::integer
    from public.child_profiles
    where id = '30000000-0000-4000-8000-000000000001'
  ),
  0,
  'another family cannot read the child profile pointer'
);
select is(
  (
    select count(*)::integer
    from public.media_assets
    where id = 'bf400000-0000-4000-8000-000000000003'
  ),
  0,
  'another family cannot read the current avatar metadata'
);
select is(
  (
    select count(*)::integer
    from storage.objects
    where name like '%bf300000-0000-4000-8000-000000000002/output.png'
  ),
  0,
  'another family cannot read the private avatar object'
);
select throws_ok(
  $$
    select *
    from public.set_child_profile_avatar_from_ai_job(
      '30000000-0000-4000-8000-000000000001',
      'bf300000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000002'
    )
  $$,
  '42501',
  'The active child profile is unavailable to this family.',
  'another family cannot change the profile pointer'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  (
    select count(*)::integer
    from public.child_profiles
    where id = '30000000-0000-4000-8000-000000000001'
  ),
  0,
  'administrator status alone does not expose the child profile pointer'
);
select is(
  (
    select count(*)::integer
    from public.media_assets
    where id = 'bf400000-0000-4000-8000-000000000003'
  ),
  0,
  'administrator status alone does not expose private avatar metadata'
);
select throws_ok(
  $$
    select *
    from public.set_child_profile_avatar_from_ai_job(
      '30000000-0000-4000-8000-000000000001',
      'bf300000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000003'
    )
  $$,
  '42501',
  'The active child profile is unavailable to this family.',
  'administrator status alone cannot change a child profile image'
);

select * from finish();
rollback;
