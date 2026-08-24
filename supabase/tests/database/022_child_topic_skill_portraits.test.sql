begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(56);

create temporary table portrait_claims (
  label text primary key,
  job_id uuid not null,
  attempt_number smallint not null,
  output_asset_id uuid not null,
  input_images jsonb not null,
  prompt_template text not null
);
grant select, insert on portrait_claims to authenticated, service_role;

create temporary table prepared_portrait_jobs (
  label text primary key,
  job_id uuid
);
grant select, insert on prepared_portrait_jobs to authenticated, service_role;

select has_table(
  'public',
  'child_topic_portraits',
  'one durable child/topic portrait pointer separates base from current look'
);
select has_table(
  'public',
  'child_topic_portrait_renders',
  'portrait render lineage is append-only data'
);
select has_table(
  'private',
  'child_topic_portrait_job_items',
  'trusted wardrobe input snapshots remain private'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.prepare_child_topic_base_portrait(uuid,uuid,uuid,uuid,uuid)',
    'execute'
  )
  and has_function_privilege(
    'authenticated',
    'public.set_child_topic_wardrobe_item_equipped_and_prepare_render(uuid,uuid,uuid,uuid,boolean,uuid,uuid)',
    'execute'
  )
  and has_function_privilege(
    'authenticated',
    'public.prepare_child_topic_wardrobe_render(uuid,uuid,uuid,uuid,uuid)',
    'execute'
  )
  and has_function_privilege(
    'authenticated',
    'public.get_child_topic_portrait(uuid,uuid,uuid,uuid)',
    'execute'
  )
  and has_function_privilege(
    'authenticated',
    'public.reconcile_child_topic_portrait_job_start(uuid,uuid)',
    'execute'
  ),
  'family clients receive only bounded identity-based portrait operations'
);
select ok(
  position(
    'for update' in lower(
      pg_get_functiondef(
        'public.prepare_child_topic_wardrobe_render(uuid,uuid,uuid,uuid,uuid)'::regprocedure
      )
    )
  ) < position(
    'select inventory.*' in lower(
      pg_get_functiondef(
        'public.prepare_child_topic_wardrobe_render(uuid,uuid,uuid,uuid,uuid)'::regprocedure
      )
    )
  ),
  'non-mutating wardrobe refresh serializes on the child before reading equipment'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.claim_child_topic_portrait_job_for_worker(uuid)',
    'execute'
  )
  and not has_function_privilege(
    'authenticated',
    'public.claim_child_topic_portrait_job_for_worker(uuid)',
    'execute'
  )
  and not has_function_privilege(
    'service_role',
    'private.claim_ai_media_job_for_worker_without_child_topic_portraits(uuid)',
    'execute'
  ),
  'only the service worker can claim through public guarded entry points'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'private.child_equipped_wardrobe_fingerprint(uuid)',
    'execute'
  )
  and not has_function_privilege(
    'service_role',
    'private.child_equipped_wardrobe_fingerprint(uuid)',
    'execute'
  )
  and not has_function_privilege(
    'authenticated',
    'private.uuid_array_has_unique_non_null_values(uuid[])',
    'execute'
  ),
  'private fingerprint and array helpers cannot be called as inventory oracles'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'public.child_topic_portraits',
    'insert'
  )
  and not has_table_privilege(
    'authenticated',
    'public.child_topic_portrait_renders',
    'update'
  )
  and not has_table_privilege(
    'authenticated',
    'private.child_topic_portrait_job_items',
    'select'
  ),
  'family clients cannot forge current pointers, history, or worker inputs'
);
select results_eq(
  $$
    select
      policy.schemaname::text collate "default",
      policy.tablename::text collate "default",
      policy.cmd::text collate "default",
      policy.roles
    from pg_policies as policy
    where policy.policyname in (
      'Family members can read current child topic portrait metadata',
      'Family members can read current child topic portrait bytes'
    )
    order by policy.schemaname, policy.tablename
  $$,
  $$
    values
      (
        'public'::text,
        'media_assets'::text,
        'SELECT'::text,
        array['authenticated']::name[]
      ),
      (
        'storage'::text,
        'objects'::text,
        'SELECT'::text,
        array['authenticated']::name[]
      )
  $$,
  'current base and derived metadata/bytes have explicit family read policies'
);
select results_eq(
  $$
    select
      operation.operation_key,
      version.gateway,
      version.provider,
      version.model,
      version.request_options #>> '{provider,allow_fallbacks}'
    from public.ai_operations as operation
    join public.ai_operation_versions as version
      on version.id = operation.active_version_id
    where operation.operation_key in (
      'portrait.child_topic_base',
      'portrait.child_topic_wardrobe'
    )
    order by operation.operation_key
  $$,
  $$
    values
      (
        'portrait.child_topic_base'::text,
        'openrouter'::text,
        'openai'::text,
        'openai/gpt-image-2'::text,
        'false'::text
      ),
      (
        'portrait.child_topic_wardrobe'::text,
        'openrouter'::text,
        'openai'::text,
        'openai/gpt-image-2'::text,
        'false'::text
      )
  $$,
  'provider, model, and no-fallback options are active server-owned versions'
);

-- Create one current private topic reference from synthetic bytes without
-- exercising the already-covered upload lifecycle.
insert into public.media_assets (
  id,
  family_id,
  child_profile_id,
  topic_id,
  subject_kind,
  asset_role,
  status,
  storage_object_path,
  mime_type,
  byte_size,
  sha256_hex,
  created_by
) values (
  'e1000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  'child',
  'reference_input',
  'ready',
  '20000000-0000-4000-8000-000000000001/children/30000000-0000-4000-8000-000000000001/topics/40000000-0000-4000-8000-000000000001/e1000000-0000-4000-8000-000000000001.png',
  'image/png',
  1024,
  repeat('a', 64),
  '10000000-0000-4000-8000-000000000001'
);
insert into storage.objects (bucket_id, name, owner_id, metadata)
select
  asset.storage_bucket,
  asset.storage_object_path,
  '10000000-0000-4000-8000-000000000001',
  '{"size":1024,"mimetype":"image/png"}'::jsonb
from public.media_assets as asset
where asset.id = 'e1000000-0000-4000-8000-000000000001';
insert into public.child_topic_reference_photos (
  child_profile_id,
  topic_id,
  family_id,
  media_asset_id,
  created_by
) values (
  '30000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001'
);
insert into public.family_memberships (family_id, user_id, role, added_by)
values (
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000003',
  'caregiver',
  '10000000-0000-4000-8000-000000000001'
)
on conflict (family_id, user_id) do nothing;

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

select throws_ok(
  $$
    select * from public.prepare_child_topic_base_portrait(
      '20000000-0000-4000-8000-000000000002',
      '30000000-0000-4000-8000-000000000002',
      '40000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      'c1000000-0000-4000-8000-000000000099'
    )
  $$,
  '42501',
  null,
  'a parent cannot prepare a base for another family child'
);
select results_eq(
  $$
    select
      source_reference_media_asset_id,
      job_status::text,
      created
    from public.prepare_child_topic_base_portrait(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      'c1000000-0000-4000-8000-000000000001'
    )
  $$,
  $$
    values (
      'e1000000-0000-4000-8000-000000000001'::uuid,
      'awaiting_upload'::text,
      true
    )
  $$,
  'the current topic photo reserves one immutable base job'
);
select results_eq(
  $$
    select job_id, created
    from public.prepare_child_topic_base_portrait(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      'c1000000-0000-4000-8000-000000000001'
    )
  $$,
  $$
    select job.id, false
    from public.ai_jobs as job
    where job.client_request_id = 'c1000000-0000-4000-8000-000000000001'
  $$,
  'an exact base reservation retry returns the same job'
);
select results_eq(
  $$
    select input_data ? 'prompt', input_data ? 'model', input_data ? 'provider'
    from public.ai_jobs
    where client_request_id = 'c1000000-0000-4000-8000-000000000001'
  $$,
  $$ values (false, false, false) $$,
  'the family request cannot persist prompt, model, or provider controls'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);
set local role authenticated;
select results_eq(
  $$
    select job_status::text, may_process
    from public.reconcile_child_topic_portrait_job_start(
      (
        select id from public.ai_jobs
        where client_request_id = 'c1000000-0000-4000-8000-000000000001'
      ),
      '10000000-0000-4000-8000-000000000003'
    )
  $$,
  $$ values ('awaiting_upload'::text, true) $$,
  'another current adult family member can reconcile a valid waiting portrait job'
);

reset role;
set local role service_role;

select is(
  (
    select count(*)::integer
    from public.claim_ai_media_job_for_worker(
      (
        select id from public.ai_jobs
        where client_request_id = 'c1000000-0000-4000-8000-000000000001'
      )
    )
  ),
  0,
  'the rollout compatibility claim leaves a new base waiting for the dedicated worker'
);
select results_eq(
  $$
    with claimed as (
      select *
      from public.claim_child_topic_portrait_job_for_worker(
        (
          select id from public.ai_jobs
          where client_request_id = 'c1000000-0000-4000-8000-000000000001'
        )
      )
    )
    select
      provider,
      model,
      jsonb_array_length(input_images),
      input_images -> 0 ->> 'role',
      prompt_template like '%Fodbold%'
    from claimed
  $$,
  $$
    values (
      'openai'::text,
      'openai/gpt-image-2'::text,
      1,
      'source_person'::text,
      true
    )
  $$,
  'the dedicated base claim expands trusted topic context and one source input'
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
    select job_status::text, may_process
    from public.reconcile_child_topic_portrait_job_start(
      (
        select id from public.ai_jobs
        where client_request_id = 'c1000000-0000-4000-8000-000000000001'
      ),
      '10000000-0000-4000-8000-000000000003'
    )
  $$,
  $$ values ('processing'::text, true) $$,
  'another current adult can trigger safe fresh-lease no-op or stale-lease recovery'
);
reset role;
set local role service_role;
select is(
  (
    select count(*)::integer
    from public.claim_child_topic_portrait_job_for_worker(
      (
        select id from public.ai_jobs
        where client_request_id = 'c1000000-0000-4000-8000-000000000001'
      )
    )
  ),
  0,
  'an active portrait lease cannot be claimed twice'
);

insert into storage.objects (bucket_id, name, metadata)
select
  asset.storage_bucket,
  asset.storage_object_path,
  '{"size":2048,"mimetype":"image/png"}'::jsonb
from public.ai_jobs as job
join public.child_topic_portrait_renders as render on render.job_id = job.id
join public.media_assets as asset on asset.id = render.output_media_asset_id
where job.client_request_id = 'c1000000-0000-4000-8000-000000000001';
select lives_ok(
  $$
    select public.complete_ai_media_job_for_worker(
      (
        select id from public.ai_jobs
        where client_request_id = 'c1000000-0000-4000-8000-000000000001'
      ),
      1::smallint,
      (
        select render.output_media_asset_id
        from public.ai_jobs as job
        join public.child_topic_portrait_renders as render on render.job_id = job.id
        where job.client_request_id = 'c1000000-0000-4000-8000-000000000001'
      ),
      2048,
      repeat('b', 64),
      'portrait-base-1',
      '{"images":1}'::jsonb,
      1000
    )
  $$,
  'the validated generated PNG completes through the existing narrow worker RPC'
);
select results_eq(
  $$
    select
      portrait.base_source_media_asset_id,
      portrait.base_media_asset_id,
      portrait.display_kind::text,
      portrait.display_media_asset_id = portrait.base_media_asset_id,
      render.promoted_as_current
    from public.child_topic_portraits as portrait
    join public.child_topic_portrait_renders as render
      on render.job_id = portrait.base_job_id
    where portrait.child_profile_id = '30000000-0000-4000-8000-000000000001'
      and portrait.topic_id = '40000000-0000-4000-8000-000000000001'
  $$,
  $$
    values (
      'e1000000-0000-4000-8000-000000000001'::uuid,
      (
        select render.output_media_asset_id
        from public.ai_jobs as job
        join public.child_topic_portrait_renders as render on render.job_id = job.id
        where job.client_request_id = 'c1000000-0000-4000-8000-000000000001'
      ),
      'base'::text,
      true,
      true
    )
  $$,
  'a successful base becomes both immutable input and zero-item current look'
);

-- Two synthetic catalogue items come from different published topics. A third
-- has valid metadata but deliberately lacks its Storage object.
reset role;
insert into public.topics (
  id, slug, title, description, sort_order, is_published, created_by
) values (
  '4a000000-0000-4000-8000-000000000001',
  'syntetisk-balance-portrait',
  'Syntetisk balance',
  'Kun testdata til global garderobe.',
  901,
  true,
  '10000000-0000-4000-8000-000000000003'
);
insert into public.wardrobe_items (
  id, topic_id, name, icon, description, image_path, category, equip_slot,
  rarity, points, editorial_status, sort_order, is_published, created_by
) values
  (
    'd1000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    'Syntetiske briller',
    '👓',
    'Runde testbriller.',
    'da000000-0000-4000-8000-000000000001/01.png',
    'clothing',
    'head',
    'common',
    10,
    'approved',
    901,
    true,
    '10000000-0000-4000-8000-000000000003'
  ),
  (
    'd2000000-0000-4000-8000-000000000001',
    '4a000000-0000-4000-8000-000000000001',
    'Syntetiske sko',
    '👟',
    'Et komplet par testsko.',
    'da000000-0000-4000-8000-000000000002/01.png',
    'clothing',
    'feet',
    'common',
    10,
    'approved',
    902,
    true,
    '10000000-0000-4000-8000-000000000003'
  ),
  (
    'd3000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    'Syntetisk medalje',
    '🏅',
    'Testtilbehør uden uploadede bytes.',
    'da000000-0000-4000-8000-000000000003/01.png',
    'effect',
    'accessory',
    'common',
    10,
    'approved',
    903,
    true,
    '10000000-0000-4000-8000-000000000003'
  ),
  (
    'd4000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    'Syntetisk kasket',
    '🧢',
    'En alternativ testgenstand til hovedet.',
    'da000000-0000-4000-8000-000000000004/01.png',
    'clothing',
    'head',
    'common',
    10,
    'approved',
    904,
    true,
    '10000000-0000-4000-8000-000000000003'
  );
insert into storage.objects (bucket_id, name, metadata) values
  (
    'wardrobe-images',
    'da000000-0000-4000-8000-000000000001/01.png',
    '{"size":1024,"mimetype":"image/png"}'::jsonb
  ),
  (
    'wardrobe-images',
    'da000000-0000-4000-8000-000000000002/01.png',
    '{"size":1024,"mimetype":"image/png"}'::jsonb
  ),
  (
    'wardrobe-images',
    'da000000-0000-4000-8000-000000000004/01.png',
    '{"size":1024,"mimetype":"image/png"}'::jsonb
  );
insert into public.child_wardrobe_items (child_profile_id, wardrobe_item_id)
values
  (
    '30000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000001'
  ),
  (
    '30000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001'
  ),
  (
    '30000000-0000-4000-8000-000000000001',
    'd3000000-0000-4000-8000-000000000001'
  ),
  (
    '30000000-0000-4000-8000-000000000001',
    'd4000000-0000-4000-8000-000000000001'
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
      render_mode,
      job_status::text,
      equipped_wardrobe_item_ids
    from public.set_child_topic_wardrobe_item_equipped_and_prepare_render(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      'd1000000-0000-4000-8000-000000000001',
      true,
      '10000000-0000-4000-8000-000000000001',
      'c1000000-0000-4000-8000-000000000002'
    )
  $$,
  $$
    values (
      'ai_job'::text,
      'awaiting_upload'::text,
      array['d1000000-0000-4000-8000-000000000001'::uuid]
    )
  $$,
  'equipping the first owned item snapshots the complete one-item set'
);

reset role;
set local role service_role;
insert into portrait_claims
select
  'older-look',
  job_id,
  attempt_number,
  output_asset_id,
  input_images,
  prompt_template
from public.claim_child_topic_portrait_job_for_worker(
  (
    select id from public.ai_jobs
    where client_request_id = 'c1000000-0000-4000-8000-000000000002'
  )
);
select results_eq(
  $$
    select
      jsonb_array_length(input_images),
      input_images -> 0 ->> 'role',
      input_images -> 1 ->> 'wardrobe_item_id'
    from portrait_claims where label = 'older-look'
  $$,
  $$
    values (
      2,
      'immutable_base_person'::text,
      'd1000000-0000-4000-8000-000000000001'::text
    )
  $$,
  'a wardrobe claim starts from the immutable base and then the catalogue item'
);

reset role;
set local role authenticated;
select is(
  (
    select has_live_equipment_render_attempt
    from public.get_child_topic_portrait(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001'
    )
  ),
  true,
  'exact current base, fingerprint, and item snapshot expose one durable render attempt'
);
select results_eq(
  $$
    select equipped_wardrobe_item_ids
    from public.set_child_topic_wardrobe_item_equipped_and_prepare_render(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      'd2000000-0000-4000-8000-000000000001',
      true,
      '10000000-0000-4000-8000-000000000001',
      'c1000000-0000-4000-8000-000000000003'
    )
  $$,
  $$
    values (
      array[
        'd1000000-0000-4000-8000-000000000001'::uuid,
        'd2000000-0000-4000-8000-000000000001'::uuid
      ]
    )
  $$,
  'the next render includes every equipped item globally, even from another topic'
);

reset role;
set local role service_role;
insert into portrait_claims
select
  'newer-look',
  job_id,
  attempt_number,
  output_asset_id,
  input_images,
  prompt_template
from public.claim_child_topic_portrait_job_for_worker(
  (
    select id from public.ai_jobs
    where client_request_id = 'c1000000-0000-4000-8000-000000000003'
  )
);
select results_eq(
  $$
    select
      jsonb_array_length(input_images),
      input_images -> 1 ->> 'equip_slot',
      input_images -> 2 ->> 'equip_slot',
      prompt_template like '%Syntetiske sko%'
    from portrait_claims where label = 'newer-look'
  $$,
  $$ values (3, 'head'::text, 'feet'::text, true) $$,
  'the trusted worker prompt and ordered references contain the full captured set'
);

-- Complete the older processing job after the newer job is already desired.
insert into storage.objects (bucket_id, name, metadata)
select
  asset.storage_bucket,
  asset.storage_object_path,
  '{"size":2048,"mimetype":"image/png"}'::jsonb
from portrait_claims as claim
join public.media_assets as asset on asset.id = claim.output_asset_id
where claim.label = 'older-look';
select lives_ok(
  $$
    select public.complete_ai_media_job_for_worker(
      (select job_id from portrait_claims where label = 'older-look'),
      (select attempt_number from portrait_claims where label = 'older-look'),
      (select output_asset_id from portrait_claims where label = 'older-look'),
      2048,
      repeat('c', 64),
      'portrait-old-look',
      '{"images":1}'::jsonb,
      1000
    )
  $$,
  'the older processing look may finish successfully as retained history'
);
select results_eq(
  $$
    select
      portrait.display_kind::text,
      portrait.display_media_asset_id = portrait.base_media_asset_id,
      render.promoted_as_current
    from public.child_topic_portraits as portrait
    join public.child_topic_portrait_renders as render
      on render.job_id = (select job_id from portrait_claims where label = 'older-look')
    where portrait.child_profile_id = '30000000-0000-4000-8000-000000000001'
      and portrait.topic_id = '40000000-0000-4000-8000-000000000001'
  $$,
  $$ values ('base'::text, true, false) $$,
  'a slower stale success remains history and cannot overwrite the newer desired set'
);

insert into storage.objects (bucket_id, name, metadata)
select
  asset.storage_bucket,
  asset.storage_object_path,
  '{"size":2048,"mimetype":"image/png"}'::jsonb
from portrait_claims as claim
join public.media_assets as asset on asset.id = claim.output_asset_id
where claim.label = 'newer-look';
select lives_ok(
  $$
    select public.complete_ai_media_job_for_worker(
      (select job_id from portrait_claims where label = 'newer-look'),
      (select attempt_number from portrait_claims where label = 'newer-look'),
      (select output_asset_id from portrait_claims where label = 'newer-look'),
      2048,
      repeat('d', 64),
      'portrait-new-look',
      '{"images":1}'::jsonb,
      1000
    )
  $$,
  'the latest complete look may finish and promote normally'
);
select results_eq(
  $$
    select
      portrait.display_kind::text,
      portrait.base_media_asset_id = base_render.output_media_asset_id,
      portrait.display_media_asset_id = new_render.output_media_asset_id,
      portrait.display_wardrobe_item_ids,
      new_render.promoted_as_current
    from public.child_topic_portraits as portrait
    join public.child_topic_portrait_renders as base_render
      on base_render.job_id = portrait.base_job_id
    join public.child_topic_portrait_renders as new_render
      on new_render.job_id = (select job_id from portrait_claims where label = 'newer-look')
    where portrait.child_profile_id = '30000000-0000-4000-8000-000000000001'
      and portrait.topic_id = '40000000-0000-4000-8000-000000000001'
  $$,
  $$
    values (
      'wardrobe'::text,
      true,
      true,
      array[
        'd1000000-0000-4000-8000-000000000001'::uuid,
        'd2000000-0000-4000-8000-000000000001'::uuid
      ],
      true
    )
  $$,
  'only the latest complete equipment snapshot becomes current and base stays immutable'
);

reset role;
set local role authenticated;
select results_eq(
  $$
    select
      is_equipped,
      render_mode,
      render_error_code,
      job_id,
      equipped_wardrobe_item_ids
    from public.set_child_topic_wardrobe_item_equipped_and_prepare_render(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      'd3000000-0000-4000-8000-000000000001',
      true,
      '10000000-0000-4000-8000-000000000001',
      'c1000000-0000-4000-8000-000000000004'
    )
  $$,
  $$
    values (
      true,
      'stale'::text,
      'catalogue_image_missing'::text,
      null::uuid,
      array[
        'd1000000-0000-4000-8000-000000000001'::uuid,
        'd2000000-0000-4000-8000-000000000001'::uuid,
        'd3000000-0000-4000-8000-000000000001'::uuid
      ]
    )
  $$,
  'a missing catalogue object keeps the equipment choice but creates no polling job'
);
select results_eq(
  $$
    select
      portrait.display_media_asset_id = new_render.output_media_asset_id,
      state.is_look_stale
    from public.child_topic_portraits as portrait
    join public.child_topic_portrait_renders as new_render
      on new_render.job_id = (select job_id from portrait_claims where label = 'newer-look')
    cross join public.get_child_topic_portrait(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001'
    ) as state
    where portrait.child_profile_id = '30000000-0000-4000-8000-000000000001'
      and portrait.topic_id = '40000000-0000-4000-8000-000000000001'
  $$,
  $$ values (true, true) $$,
  'preparation failure preserves the last successful look and reports it stale'
);

reset role;
update public.child_wardrobe_items
set is_equipped = false, equipped_at = null
where child_profile_id = '30000000-0000-4000-8000-000000000001';
set local role authenticated;
select results_eq(
  $$
    select render_mode, job_id, equipped_wardrobe_item_ids
    from public.prepare_child_topic_wardrobe_render(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      'c1000000-0000-4000-8000-000000000005'
    )
  $$,
  $$ values ('base'::text, null::uuid, '{}'::uuid[]) $$,
  'zero equipped items atomically select the base without a paid call'
);
select results_eq(
  $$
    select render_mode, created, job_id
    from public.prepare_child_topic_wardrobe_render(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      'c1000000-0000-4000-8000-000000000005'
    )
  $$,
  $$ values ('base'::text, false, null::uuid) $$,
  'the independent prepare operation is idempotent without a fake equipment mutation'
);
select results_eq(
  $$
    select display_kind::text, display_media_asset_id = base_media_asset_id
    from public.child_topic_portraits
    where child_profile_id = '30000000-0000-4000-8000-000000000001'
      and topic_id = '40000000-0000-4000-8000-000000000001'
  $$,
  $$ values ('base'::text, true) $$,
  'the zero-item current pointer is the immutable base itself'
);

-- Preflight changes after reservation must never spend provider work.
insert into prepared_portrait_jobs (label, job_id)
select 'first-head', job_id
from public.set_child_topic_wardrobe_item_equipped_and_prepare_render(
  '20000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001',
  true,
  '10000000-0000-4000-8000-000000000001',
  'c1000000-0000-4000-8000-000000000006'
);
insert into prepared_portrait_jobs (label, job_id)
select 'replacement-head', job_id
from public.set_child_topic_wardrobe_item_equipped_and_prepare_render(
  '20000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  'd4000000-0000-4000-8000-000000000001',
  true,
  '10000000-0000-4000-8000-000000000001',
  'c1000000-0000-4000-8000-000000000016'
);
select results_eq(
  $$
    select wardrobe_item_id, is_equipped
    from public.child_wardrobe_items
    where child_profile_id = '30000000-0000-4000-8000-000000000001'
      and wardrobe_item_id in (
        'd1000000-0000-4000-8000-000000000001',
        'd4000000-0000-4000-8000-000000000001'
      )
    order by wardrobe_item_id
  $$,
  $$
    values
      ('d1000000-0000-4000-8000-000000000001'::uuid, false),
      ('d4000000-0000-4000-8000-000000000001'::uuid, true)
  $$,
  'equipping a replacement in one slot atomically removes the prior head item'
);

-- Exercise future operation versions that permit a second attempt: an expired
-- processing lease must close its old attempt before any later preflight exit.
reset role;
set local role service_role;
insert into portrait_claims (
  label, job_id, attempt_number, output_asset_id, input_images, prompt_template
)
select
  'expired-look', job_id, attempt_number, output_asset_id, input_images,
  prompt_template
from public.claim_child_topic_portrait_job_for_worker(
  (
    select id from public.ai_jobs
    where client_request_id = 'c1000000-0000-4000-8000-000000000016'
  )
);
reset role;
-- Production versions are intentionally pinned to one attempt today. Widen
-- only this rolled-back test transaction to exercise the claim's forward-safe
-- lease recovery before a future operation version raises that limit.
alter table public.ai_jobs
  drop constraint ai_jobs_max_attempts_check;
alter table public.ai_jobs
  add constraint ai_jobs_max_attempts_check check (max_attempts between 1 and 2);
update public.ai_jobs
set max_attempts = 2,
    processing_started_at = now() - interval '8 minutes'
where client_request_id = 'c1000000-0000-4000-8000-000000000016';

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;
insert into prepared_portrait_jobs (label, job_id)
select 'waiting-unpublish', job_id
from public.prepare_child_topic_wardrobe_render(
  '20000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'c1000000-0000-4000-8000-000000000017'
);
reset role;
update public.topics
set is_published = false, published_at = null
where id = '40000000-0000-4000-8000-000000000001';
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);
set local role authenticated;
select results_eq(
  $$
    select job_status::text, may_process
    from public.reconcile_child_topic_portrait_job_start(
      (
        select id from public.ai_jobs
        where client_request_id = 'c1000000-0000-4000-8000-000000000017'
      ),
      '10000000-0000-4000-8000-000000000003'
    )
  $$,
  $$ values ('cancelled'::text, false) $$,
  'another adult reconciles an unplayable waiting portrait instead of receiving a deadlocking 404'
);
reset role;
set local role service_role;
select is(
  (
    select count(*)::integer
    from public.claim_child_topic_portrait_job_for_worker(
      (
        select id from public.ai_jobs
        where client_request_id = 'c1000000-0000-4000-8000-000000000017'
      )
    )
  ),
  0,
  'an unpublished topic is cancelled before a provider claim'
);
select results_eq(
  $$
    select job.status::text, asset.status::text, portrait.pending_job_id
    from public.ai_jobs as job
    join public.child_topic_portrait_renders as render on render.job_id = job.id
    join public.media_assets as asset on asset.id = render.output_media_asset_id
    join public.child_topic_portraits as portrait
      on portrait.child_profile_id = render.child_profile_id
      and portrait.topic_id = render.topic_id
    where job.client_request_id = 'c1000000-0000-4000-8000-000000000017'
  $$,
  $$ values ('cancelled'::text, 'failed'::text, null::uuid) $$,
  'topic preflight cancellation closes its pending output and pointer'
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
    select job_status::text, may_process
    from public.reconcile_child_topic_portrait_job_start(
      (
        select id from public.ai_jobs
        where client_request_id = 'c1000000-0000-4000-8000-000000000016'
      ),
      '10000000-0000-4000-8000-000000000003'
    )
  $$,
  $$ values ('processing'::text, true) $$,
  'another current adult can route an invalid processing lease through safe worker recovery'
);
reset role;
set local role service_role;
select is(
  (
    select count(*)::integer
    from public.claim_child_topic_portrait_job_for_worker(
      (
        select id from public.ai_jobs
        where client_request_id = 'c1000000-0000-4000-8000-000000000016'
      )
    )
  ),
  0,
  'an expired multi-attempt portrait lease exits before provider work when its snapshot is stale'
);
select results_eq(
  $$
    select job.status::text, attempt.status::text, asset.status::text
    from public.ai_jobs as job
    join private.ai_job_attempts as attempt
      on attempt.job_id = job.id and attempt.attempt_number = 1
    join public.child_topic_portrait_renders as render on render.job_id = job.id
    join public.media_assets as asset on asset.id = render.output_media_asset_id
    where job.client_request_id = 'c1000000-0000-4000-8000-000000000016'
  $$,
  $$ values ('cancelled'::text, 'outcome_unknown'::text, 'failed'::text) $$,
  'expired processing preflight closes the old attempt, job, and output instead of deadlocking'
);

reset role;
update public.topics
set is_published = true
where id = '40000000-0000-4000-8000-000000000001';
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;
insert into prepared_portrait_jobs (label, job_id)
select 'inactive-child', job_id
from public.prepare_child_topic_wardrobe_render(
  '20000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'c1000000-0000-4000-8000-000000000007'
);
reset role;
update public.child_profiles
set is_active = false
where id = '30000000-0000-4000-8000-000000000001';
set local role service_role;
select is(
  (
    select count(*)::integer
    from public.claim_child_topic_portrait_job_for_worker(
      (
        select id from public.ai_jobs
        where client_request_id = 'c1000000-0000-4000-8000-000000000007'
      )
    )
  ),
  0,
  'an inactive child is cancelled before a provider claim'
);
select is(
  (
    select status::text from public.ai_jobs
    where client_request_id = 'c1000000-0000-4000-8000-000000000007'
  ),
  'cancelled',
  'child preflight leaves no active AI job'
);

reset role;
update public.child_profiles
set is_active = true
where id = '30000000-0000-4000-8000-000000000001';
set local role authenticated;
insert into prepared_portrait_jobs (label, job_id)
select 'catalogue-removed', job_id
from public.prepare_child_topic_wardrobe_render(
  '20000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'c1000000-0000-4000-8000-000000000008'
);
reset role;
-- Move the synthetic object away from its trusted path inside this rolled-back
-- test transaction. This models bytes disappearing after reservation without
-- bypassing Storage's production deletion guard.
update storage.objects
set name = 'da000000-0000-4000-8000-000000000004/removed-after-reservation.png'
where bucket_id = 'wardrobe-images'
  and name = 'da000000-0000-4000-8000-000000000004/01.png';
set local role service_role;
select is(
  (
    select count(*)::integer
    from public.claim_child_topic_portrait_job_for_worker(
      (
        select id from public.ai_jobs
        where client_request_id = 'c1000000-0000-4000-8000-000000000008'
      )
    )
  ),
  0,
  'a catalogue object removed after reservation never reaches the provider'
);
select results_eq(
  $$
    select
      job.status::text,
      job.public_error_code,
      asset.status::text,
      portrait.pending_job_id
    from public.ai_jobs as job
    join public.child_topic_portrait_renders as render on render.job_id = job.id
    join public.media_assets as asset on asset.id = render.output_media_asset_id
    join public.child_topic_portraits as portrait
      on portrait.child_profile_id = render.child_profile_id
      and portrait.topic_id = render.topic_id
    where job.client_request_id = 'c1000000-0000-4000-8000-000000000008'
  $$,
  $$ values ('failed'::text, 'invalid_input_image'::text, 'failed'::text, null::uuid) $$,
  'claim-time catalogue failure is terminal and clears polling while preserving equipment'
);

-- Removing the raw topic photo does not invalidate the durable immutable base.
reset role;
insert into storage.objects (bucket_id, name, metadata) values (
  'wardrobe-images',
  'da000000-0000-4000-8000-000000000004/01.png',
  '{"size":1024,"mimetype":"image/png"}'::jsonb
);
delete from public.child_topic_reference_photos
where child_profile_id = '30000000-0000-4000-8000-000000000001'
  and topic_id = '40000000-0000-4000-8000-000000000001';
set local role authenticated;
insert into prepared_portrait_jobs (label, job_id)
select 'source-removed', job_id
from public.prepare_child_topic_wardrobe_render(
  '20000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'c1000000-0000-4000-8000-000000000009'
);
reset role;
set local role service_role;
select results_eq(
  $$
    select jsonb_array_length(input_images), input_images -> 0 ->> 'role'
    from public.claim_child_topic_portrait_job_for_worker(
      (
        select id from public.ai_jobs
        where client_request_id = 'c1000000-0000-4000-8000-000000000009'
      )
    )
  $$,
  $$ values (2, 'immutable_base_person'::text) $$,
  'the existing base remains usable after raw source-photo removal'
);
select lives_ok(
  $$
    select public.fail_ai_media_job_for_worker(
      (
        select id from public.ai_jobs
        where client_request_id = 'c1000000-0000-4000-8000-000000000009'
      ),
      1::smallint,
      'provider_unavailable',
      'synthetic_failure',
      null,
      '{}'::jsonb,
      null
    )
  $$,
  'a claimed wardrobe provider failure reaches a terminal retry-safe state'
);
select results_eq(
  $$
    select
      portrait.base_media_asset_id is not null,
      portrait.display_media_asset_id = portrait.base_media_asset_id,
      portrait.pending_job_id
    from public.child_topic_portraits as portrait
    where portrait.child_profile_id = '30000000-0000-4000-8000-000000000001'
      and portrait.topic_id = '40000000-0000-4000-8000-000000000001'
  $$,
  $$ values (true, true, null::uuid) $$,
  'a provider failure preserves both immutable base and last successful current look'
);
reset role;
set local role authenticated;
select is(
  (
    select has_live_equipment_render_attempt
    from public.get_child_topic_portrait(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001'
    )
  ),
  true,
  'a terminal exact-look failure remains a durable automatic-attempt guard'
);

-- A genuinely new current source marks the prior immutable base stale without
-- mutating or deleting its bytes.
reset role;
insert into public.media_assets (
  id, family_id, child_profile_id, topic_id, subject_kind, asset_role, status,
  storage_object_path, mime_type, byte_size, sha256_hex, created_by
) values (
  'e1000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  'child',
  'reference_input',
  'ready',
  '20000000-0000-4000-8000-000000000001/children/30000000-0000-4000-8000-000000000001/topics/40000000-0000-4000-8000-000000000001/e1000000-0000-4000-8000-000000000002.png',
  'image/png',
  1024,
  repeat('e', 64),
  '10000000-0000-4000-8000-000000000001'
);
insert into storage.objects (bucket_id, name, metadata)
select storage_bucket, storage_object_path, '{"size":1024,"mimetype":"image/png"}'::jsonb
from public.media_assets
where id = 'e1000000-0000-4000-8000-000000000002';
insert into public.child_topic_reference_photos (
  child_profile_id, topic_id, family_id, media_asset_id, created_by
) values (
  '30000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001'
);
set local role authenticated;
select results_eq(
  $$
    select
      current_reference_media_asset_id,
      base_source_media_asset_id,
      is_base_stale,
      is_look_stale
    from public.get_child_topic_portrait(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001'
    )
  $$,
  $$
    values (
      'e1000000-0000-4000-8000-000000000002'::uuid,
      'e1000000-0000-4000-8000-000000000001'::uuid,
      true,
      true
    )
  $$,
  'a replacement topic photo exposes stale/new-base state without rewriting the old base'
);

-- The compatibility wrapper excludes only the new portrait lineage. Existing
-- profile-avatar jobs must remain claimable throughout the rollout.
insert into prepared_portrait_jobs (label, job_id)
select 'legacy-avatar', job_id
from public.prepare_ai_media_job(
  'portrait.cartoon_3d',
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'c1000000-0000-4000-8000-000000000050',
  'child',
  'image/png',
  '30000000-0000-4000-8000-000000000001'
);
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);
set local role authenticated;
select is(
  (
    select count(*)::integer
    from public.reconcile_child_topic_portrait_job_start(
      (
        select id from public.ai_jobs
        where client_request_id = 'c1000000-0000-4000-8000-000000000050'
      ),
      '10000000-0000-4000-8000-000000000003'
    )
  ),
  0,
  'family reconciliation does not widen requester-only generic avatar starts'
);
reset role;
insert into storage.objects (bucket_id, name, metadata)
select
  asset.storage_bucket,
  asset.storage_object_path,
  '{"size":1024,"mimetype":"image/png"}'::jsonb
from public.ai_jobs as job
join public.ai_job_media as link
  on link.job_id = job.id
  and link.slot = 'reference_image'
  and link.ordinal = 0
join public.media_assets as asset on asset.id = link.media_asset_id
where job.client_request_id = 'c1000000-0000-4000-8000-000000000050';
set local role service_role;
select results_eq(
  $$
    select
      provider,
      model,
      prompt_template like 'Create a friendly stylized 3D cartoon version%'
    from public.claim_ai_media_job_for_worker(
      (
        select id from public.ai_jobs
        where client_request_id = 'c1000000-0000-4000-8000-000000000050'
      )
    )
  $$,
  $$ values ('openai'::text, 'openai/gpt-image-2'::text, true) $$,
  'the guarded generic claim still passes through a legacy profile-avatar job'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;
select is(
  (
    select count(*)::integer
    from public.child_topic_portraits
    where family_id = '20000000-0000-4000-8000-000000000001'
  ),
  0,
  'RLS hides child portrait pointers from another family'
);
select throws_ok(
  $$
    select * from public.get_child_topic_portrait(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000002'
    )
  $$,
  '42501',
  null,
  'the guarded read cannot cross a family boundary either'
);

-- Isolate admin deletion on a topic whose only remaining child activity is a
-- portrait pointer/job (its source pointer is removed first).
reset role;
insert into public.topics (
  id, slug, title, description, sort_order, is_published, created_by
) values (
  '4b000000-0000-4000-8000-000000000001',
  'syntetisk-portrait-delete',
  'Syntetisk portrait delete',
  'Kun til kontrolleret slettebeskyttelse.',
  902,
  true,
  '10000000-0000-4000-8000-000000000003'
);
insert into public.media_assets (
  id, family_id, child_profile_id, topic_id, subject_kind, asset_role, status,
  storage_object_path, mime_type, byte_size, sha256_hex, created_by
) values (
  'e2000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '4b000000-0000-4000-8000-000000000001',
  'child',
  'reference_input',
  'ready',
  '20000000-0000-4000-8000-000000000001/children/30000000-0000-4000-8000-000000000001/topics/4b000000-0000-4000-8000-000000000001/e2000000-0000-4000-8000-000000000001.png',
  'image/png',
  1024,
  repeat('f', 64),
  '10000000-0000-4000-8000-000000000001'
);
insert into storage.objects (bucket_id, name, metadata)
select storage_bucket, storage_object_path, '{"size":1024,"mimetype":"image/png"}'::jsonb
from public.media_assets
where id = 'e2000000-0000-4000-8000-000000000001';
insert into public.child_topic_reference_photos (
  child_profile_id, topic_id, family_id, media_asset_id, created_by
) values (
  '30000000-0000-4000-8000-000000000001',
  '4b000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'e2000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001'
);
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;
insert into prepared_portrait_jobs (label, job_id)
select 'delete-guard-base', job_id
from public.prepare_child_topic_base_portrait(
  '20000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '4b000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'c1000000-0000-4000-8000-000000000010'
);
reset role;
delete from public.child_topic_reference_photos
where topic_id = '4b000000-0000-4000-8000-000000000001';
update public.topics
set is_published = false, published_at = null
where id = '4b000000-0000-4000-8000-000000000001';
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);
set local role authenticated;
select throws_ok(
  $$
    select * from public.delete_admin_topic(
      '4b000000-0000-4000-8000-000000000001',
      (
        select updated_at from public.topics
        where id = '4b000000-0000-4000-8000-000000000001'
      )
    )
  $$,
  '23503',
  'The topic has child activity and cannot be deleted. Keep it unpublished instead.',
  'admin deletion reports the controlled child-activity outcome for portrait lineage'
);

select * from finish();
rollback;
