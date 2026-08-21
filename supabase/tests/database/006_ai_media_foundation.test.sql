begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(79);

select has_table('public', 'ai_operations', 'AI operations exist');
select has_table(
  'public',
  'ai_operation_versions',
  'immutable AI operation versions exist'
);
select has_table('public', 'media_assets', 'private media metadata exists');
select has_table('public', 'ai_jobs', 'generic AI jobs exist');
select has_table(
  'public',
  'ai_job_media',
  'generic named job media links exist'
);
select has_table(
  'private',
  'ai_job_attempts',
  'worker-only AI attempt audit exists'
);
select results_eq(
  $$
    select prompt_template
    from public.ai_operation_versions
    where id = 'a2000000-0000-4000-8000-000000000002'
  $$,
  $$
    values (
      'Create a friendly stylized 3D cartoon version of this person. Preserve their recognizable face, hairstyle, skin tone and distinctive features.'::text
    )
  $$,
  'the requested initial cartoon prompt is stored exactly in the database'
);
select results_eq(
  $$
    select gateway, provider, model
    from public.ai_operation_versions
    where id = 'a2000000-0000-4000-8000-000000000002'
  $$,
  $$ values ('openrouter'::text, 'openai'::text, 'openai/gpt-image-2'::text) $$,
  'the active version pins GPT Image 2 to OpenAI through OpenRouter'
);
select is(
  (
    select request_options
    from public.ai_operation_versions
    where id = 'a2000000-0000-4000-8000-000000000002'
  ),
  '{
    "n": 1,
    "aspect_ratio": "1:1",
    "background": "opaque",
    "quality": "low",
    "provider": {
      "only": ["openai"],
      "allow_fallbacks": false
    }
  }'::jsonb,
  'the active image operation uses low-quality OpenAI generation without fallback'
);
select is(
  (
    select (request_options ->> 'n')::integer
    from public.ai_operation_versions
    where id = 'a2000000-0000-4000-8000-000000000002'
  ),
  1,
  'the first image operation can create only one output per request'
);
select is(
  (
    select max_attempts
    from public.ai_operation_versions
    where id = 'a2000000-0000-4000-8000-000000000002'
  ),
  1::smallint,
  'the first spike never retries a provider generation automatically'
);
select is(
  (
    select public
    from storage.buckets
    where id = 'ai-media-private'
  ),
  false,
  'AI media uses a private Storage bucket'
);
select is(
  (
    select file_size_limit
    from storage.buckets
    where id = 'ai-media-private'
  ),
  8388608::bigint,
  'the AI media bucket rejects files larger than eight MiB'
);
select results_eq(
  $$
    select unnest(allowed_mime_types)
    from storage.buckets
    where id = 'ai-media-private'
    order by 1
  $$,
  $$ values ('image/jpeg'::text), ('image/png'::text), ('image/webp'::text) $$,
  'the bucket accepts only the three reviewed still-image MIME types'
);

select throws_ok(
  $$
    update public.ai_operation_versions
    set prompt_template = 'Mutated prompt'
    where id = 'a2000000-0000-4000-8000-000000000001'
  $$,
  '55000',
  'AI operation versions are immutable; create and activate a new version.',
  'an existing prompt version cannot be rewritten'
);
select throws_ok(
  $$
    delete from public.ai_operation_versions
    where id = 'a2000000-0000-4000-8000-000000000001'
  $$,
  '55000',
  'AI operation versions are immutable; create and activate a new version.',
  'an existing prompt version cannot be deleted'
);

select is(
  has_table_privilege('authenticated', 'public.ai_jobs', 'insert'),
  false,
  'clients cannot insert AI jobs around the validation RPC'
);
select is(
  has_table_privilege('authenticated', 'public.media_assets', 'insert'),
  false,
  'clients cannot reserve arbitrary media metadata rows'
);
select is(
  has_table_privilege(
    'authenticated',
    'public.ai_operation_versions',
    'update'
  ),
  false,
  'clients cannot rewrite prompt versions directly'
);
select is(
  has_table_privilege('service_role', 'public.ai_jobs', 'update'),
  false,
  'the worker cannot bypass state transitions with direct job updates'
);
select is(
  has_table_privilege('service_role', 'public.media_assets', 'update'),
  false,
  'the worker cannot bypass state transitions with direct media updates'
);
select is(
  has_table_privilege('authenticated', 'private.ai_job_attempts', 'select'),
  false,
  'family clients cannot read worker attempt details'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.claim_ai_media_job_for_worker(uuid)',
    'execute'
  ),
  false,
  'family clients cannot claim worker jobs'
);
select is(
  has_function_privilege(
    'service_role',
    'public.claim_ai_media_job_for_worker(uuid)',
    'execute'
  ),
  true,
  'the server worker can use the narrow claim operation'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.complete_ai_media_job_for_worker(uuid,smallint,uuid,bigint,text,text,jsonb,bigint)',
    'execute'
  ),
  false,
  'family clients cannot forge worker completion'
);
select is(
  has_function_privilege(
    'service_role',
    'public.fail_ai_media_job_for_worker(uuid,smallint,text,text,text,jsonb,bigint)',
    'execute'
  ),
  true,
  'the worker can use the narrow audited failure transition'
);

update public.ai_operations
set active_version_id = 'a2000000-0000-4000-8000-000000000001'
where operation_key = 'portrait.cartoon_3d';

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

select throws_ok(
  $$
    select *
    from public.prepare_ai_media_job(
      'portrait.cartoon_3d',
      '20000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      'a3000000-0000-4000-8000-000000000096',
      'child',
      'image/jpeg',
      '30000000-0000-4000-8000-000000000001'
    )
  $$,
  '22023',
  'The media subject type is not supported by this operation.',
  'each immutable operation version enforces its declared subject contract'
);

reset role;
update public.ai_operations
set active_version_id = 'a2000000-0000-4000-8000-000000000002'
where operation_key = 'portrait.cartoon_3d';

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

select throws_ok(
  $$
    select *
    from public.prepare_ai_media_job(
      'portrait.cartoon_3d',
      '20000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      'a3000000-0000-4000-8000-000000000097',
      'adult_test',
      'image/webp',
      null
    )
  $$,
  '22023',
  'The input image type is not supported by this operation.',
  'the GPT Image 2 operation rejects unverified WebP before reserving an upload'
);

select results_eq(
  $$
    select created
    from public.prepare_ai_media_job(
      'portrait.cartoon_3d',
      '20000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      'a3000000-0000-4000-8000-000000000098',
      'adult_test',
      'image/jpeg',
      null
    )
  $$,
  $$ values (true) $$,
  'a family member can reserve an upload before an interrupted client flow'
);
select throws_ok(
  $$
    insert into storage.objects (
      bucket_id,
      name,
      owner_id,
      metadata
    )
    select
      'ai-media-private',
      format(
        '20000000-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000001/%s/input.jpg',
        job.id
      ),
      '10000000-0000-4000-8000-000000000001',
      '{"contentLength": 1024, "size": "1024x", "mimetype": "image/jpeg"}'::jsonb
    from public.ai_jobs as job
    where job.client_request_id = 'a3000000-0000-4000-8000-000000000098'
  $$,
  '42501',
  null,
  'malformed legacy size metadata cannot be hidden by a valid contentLength'
);
select throws_ok(
  $$
    insert into storage.objects (
      bucket_id,
      name,
      owner_id,
      metadata
    )
    select
      'ai-media-private',
      format(
        '20000000-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000001/%s/input.jpg',
        job.id
      ),
      '10000000-0000-4000-8000-000000000001',
      '{"contentLength": 1024, "size": 2048, "mimetype": "image/jpeg"}'::jsonb
    from public.ai_jobs as job
    where job.client_request_id = 'a3000000-0000-4000-8000-000000000098'
  $$,
  '42501',
  null,
  'conflicting Storage length metadata fails closed'
);
select lives_ok(
  $$
    insert into storage.objects (
      bucket_id,
      name,
      owner_id,
      metadata
    )
    select
      'ai-media-private',
      format(
        '20000000-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000001/%s/input.jpg',
        job.id
      ),
      '10000000-0000-4000-8000-000000000001',
      '{"size": 1024, "mimetype": "image/jpeg"}'::jsonb
    from public.ai_jobs as job
    where job.client_request_id = 'a3000000-0000-4000-8000-000000000098'
  $$,
  'the interrupted flow can occur after its exact private input upload'
);
select results_eq(
  $$
    select created
    from public.prepare_ai_media_job(
      'portrait.cartoon_3d',
      '20000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      'a3000000-0000-4000-8000-000000000001',
      'child',
      'image/jpeg',
      '30000000-0000-4000-8000-000000000001'
    )
  $$,
  $$ values (true) $$,
  'a new request can reserve a child-linked AI job after the interrupted flow'
);
select results_eq(
  $$
    select subject_kind::text, child_profile_id
    from public.ai_jobs
    where client_request_id = 'a3000000-0000-4000-8000-000000000001'
  $$,
  $$
    values (
      'child'::text,
      '30000000-0000-4000-8000-000000000001'::uuid
    )
  $$,
  'the family job is linked to the selected child profile'
);
select results_eq(
  $$
    select status::text, public_error_code
    from public.ai_jobs
    where client_request_id = 'a3000000-0000-4000-8000-000000000098'
  $$,
  $$ values ('cancelled'::text, 'request_superseded'::text) $$,
  'a new validated request cancels only the older unclaimed reservation'
);

reset role;
set local role service_role;

select is(
  (
    select count(*)::integer
    from public.ai_jobs as job
    join public.ai_job_media as link on link.job_id = job.id
    join public.media_assets as asset on asset.id = link.media_asset_id
    where job.client_request_id = 'a3000000-0000-4000-8000-000000000001'
      and asset.subject_kind = job.subject_kind
      and asset.child_profile_id is not distinct from job.child_profile_id
  ),
  2,
  'both private media slots inherit the selected child linkage'
);

select results_eq(
  $$
    select asset.asset_role::text, asset.status::text
    from public.ai_jobs as job
    join public.ai_job_media as link on link.job_id = job.id
    join public.media_assets as asset on asset.id = link.media_asset_id
    where job.client_request_id = 'a3000000-0000-4000-8000-000000000098'
    order by asset.asset_role
  $$,
  $$
    values
      ('reference_input'::text, 'failed'::text),
      ('generated_output'::text, 'failed'::text)
  $$,
  'superseding a reservation closes both private media slots to later upload'
);
select is(
  (
    select count(*)::integer
    from storage.objects as object
    join public.media_assets as asset
      on asset.storage_bucket = object.bucket_id
      and asset.storage_object_path = object.name
    join public.ai_job_media as link on link.media_asset_id = asset.id
    join public.ai_jobs as job on job.id = link.job_id
    where job.client_request_id = 'a3000000-0000-4000-8000-000000000098'
      and link.slot = 'reference_image'
  ),
  1,
  'already uploaded superseded bytes stay private and require the retention worker'
);
select is(
  (
    select count(*)::integer
    from public.claim_ai_media_job_for_worker(
      (
        select id
        from public.ai_jobs
        where client_request_id = 'a3000000-0000-4000-8000-000000000098'
      )
    )
  ),
  0,
  'a committed supersede prevents the worker from calling the provider'
);

reset role;
set local role authenticated;

select results_eq(
  $$
    select created
    from public.prepare_ai_media_job(
      'portrait.cartoon_3d',
      '20000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      'a3000000-0000-4000-8000-000000000001',
      'child',
      'image/jpeg',
      '30000000-0000-4000-8000-000000000001'
    )
  $$,
  $$ values (false) $$,
  'an exact child-linked retry returns the existing AI job'
);
select is(
  (
    select count(*)::integer
    from public.ai_jobs
    where client_request_id = 'a3000000-0000-4000-8000-000000000001'
  ),
  1,
  'an idempotent retry does not duplicate a billable job'
);
select is(
  (
    select count(*)::integer
    from public.media_assets
    where storage_object_path like '%/a3000000-%'
  ),
  0,
  'opaque media paths do not expose the client request id'
);
select is(
  (
    select count(*)::integer
    from public.ai_job_media
    where job_id = (
      select id
      from public.ai_jobs
      where client_request_id = 'a3000000-0000-4000-8000-000000000001'
    )
  ),
  0,
  'pending input and output links are not exposed to the family client'
);
select throws_ok(
  $$
    select *
    from public.prepare_ai_media_job(
      'portrait.cartoon_3d',
      '20000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      'a3000000-0000-4000-8000-000000000001',
      'synthetic',
      'image/jpeg',
      null
    )
  $$,
  '22023',
  'A client request id cannot be reused with different input.',
  'a request id cannot be reused with changed input'
);
select throws_ok(
  $$
    select *
    from public.prepare_ai_media_job(
      'portrait.cartoon_3d',
      '20000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      'a3000000-0000-4000-8000-000000000002',
      'child',
      'image/jpeg',
      null
    )
  $$,
  '22023',
  'A child photo must be linked to a child profile.',
  'a child-labelled request must identify its family child profile'
);
select throws_ok(
  $$
    select *
    from public.prepare_ai_media_job(
      'portrait.cartoon_3d',
      '20000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      'a3000000-0000-4000-8000-000000000003',
      'adult_test',
      'image/jpeg',
      '30000000-0000-4000-8000-000000000001'
    )
  $$,
  '22023',
  'Only child media can be linked to a child profile.',
  'adult and synthetic requests cannot be attached to a child profile'
);
select throws_ok(
  $$
    select *
    from public.prepare_ai_media_job(
      'portrait.cartoon_3d',
      '20000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      'a3000000-0000-4000-8000-000000000004',
      'child',
      'image/jpeg',
      '30000000-0000-4000-8000-000000000099'
    )
  $$,
  '42501',
  'The active child profile is unavailable to this family.',
  'a family cannot link media to an unavailable child profile'
);

select lives_ok(
  $$
    insert into storage.objects (
      bucket_id,
      name,
      owner_id,
      metadata
    )
    select
      'ai-media-private',
      format(
        '20000000-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000001/%s/input.jpg',
        job.id
      ),
      '10000000-0000-4000-8000-000000000001',
      '{"contentLength": 1024, "mimetype": "image/jpeg"}'::jsonb
    from public.ai_jobs as job
    where job.client_request_id = 'a3000000-0000-4000-8000-000000000001'
  $$,
  'the requester can upload the exact pre-reserved child input path through the current Storage preflight metadata'
);
select throws_ok(
  $$
    insert into storage.objects (bucket_id, name, owner_id, metadata)
    values (
      'ai-media-private',
      'unreserved/input.jpg',
      '10000000-0000-4000-8000-000000000001',
      '{"size": 1024}'::jsonb
    )
  $$,
  '42501',
  null,
  'the requester cannot upload an unreserved object'
);
select is(
  (select count(*)::integer from storage.objects),
  0,
  'even the requester cannot download the uploaded reference photo again'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  (select count(*)::integer from public.ai_jobs),
  0,
  'another family cannot read the first family AI job'
);
select is(
  (select count(*)::integer from public.media_assets),
  0,
  'another family cannot read the first family media metadata'
);
select is(
  (select count(*)::integer from storage.objects),
  0,
  'another family cannot read the first family private object'
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
    from public.ai_operations
    where operation_key = 'portrait.cartoon_3d'
  ),
  1,
  'a content admin can read the configured portrait operation'
);
select is(
  (select count(*)::integer from public.ai_jobs),
  0,
  'administrator status alone does not expose family AI jobs'
);
select results_eq(
  $$
    select version
    from public.publish_ai_operation_version(
      'portrait.cartoon_3d',
      'A reviewed replacement prompt.',
      'a2000000-0000-4000-8000-000000000002'
    )
  $$,
  $$ values (3) $$,
  'an admin can atomically publish a replacement prompt without an app release'
);
select is(
  (
    select version.version
    from public.ai_operation_versions as version
    join public.ai_operations as operation
      on operation.active_version_id = version.id
    where operation.operation_key = 'portrait.cartoon_3d'
  ),
  3,
  'the operation points to the newly published prompt version'
);
select throws_ok(
  $$
    select *
    from public.publish_ai_operation_version(
      'portrait.cartoon_3d',
      'A stale concurrent prompt.',
      'a2000000-0000-4000-8000-000000000002'
    )
  $$,
  '40001',
  'The active AI prompt changed before this version was published.',
  'stale prompt editing fails instead of overwriting a newer version'
);

reset role;
set local role service_role;

select is(
  (
    select count(*)::integer
    from public.ai_job_media
    where job_id = (
      select id
      from public.ai_jobs
      where client_request_id = 'a3000000-0000-4000-8000-000000000001'
    )
  ),
  2,
  'the worker sees the two internal named media slots'
);

select is(
  (
    select operation_version_id
    from public.ai_jobs
    where client_request_id = 'a3000000-0000-4000-8000-000000000001'
  ),
  'a2000000-0000-4000-8000-000000000002'::uuid,
  'an existing job remains pinned to the original prompt version'
);

select is(
  (
    select count(*)::integer
    from public.claim_ai_media_job_for_worker(
      (
        select id
        from public.ai_jobs
        where client_request_id = 'a3000000-0000-4000-8000-000000000001'
      )
    )
  ),
  1,
  'the worker can atomically claim a job after its reserved input exists'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

select throws_ok(
  $$
    select *
    from public.prepare_ai_media_job(
      'portrait.cartoon_3d',
      '20000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      'a3000000-0000-4000-8000-000000000097',
      'adult_test',
      'image/jpeg',
      null
    )
  $$,
  '55000',
  'Only one AI media job for this operation can be active at a time.',
  'a claimed provider job cannot be superseded by a new request'
);

reset role;
set local role service_role;

select results_eq(
  $$
    select status::text, attempt_count
    from public.ai_jobs
    where client_request_id = 'a3000000-0000-4000-8000-000000000001'
  $$,
  $$ values ('processing'::text, 1::smallint) $$,
  'the winning worker claim remains the only processing attempt'
);
select results_eq(
  $$
    select version.prompt_template
    from private.ai_job_attempts as attempt
    join public.ai_jobs as job on job.id = attempt.job_id
    join public.ai_operation_versions as version
      on version.id = job.operation_version_id
    where job.client_request_id = 'a3000000-0000-4000-8000-000000000001'
  $$,
  $$
    values (
      'Create a friendly stylized 3D cartoon version of this person. Preserve their recognizable face, hairstyle, skin tone and distinctive features.'::text
    )
  $$,
  'the claimed attempt resolves the prompt version frozen on the job'
);
select is(
  (
    select count(*)::integer
    from public.claim_ai_media_job_for_worker(
      (
        select id
        from public.ai_jobs
        where client_request_id = 'a3000000-0000-4000-8000-000000000001'
      )
    )
  ),
  0,
  'an active worker lease prevents an immediate duplicate provider request'
);
select throws_ok(
  $$
    select public.complete_ai_media_job_for_worker(
      (
        select id
        from public.ai_jobs
        where client_request_id = 'a3000000-0000-4000-8000-000000000001'
      ),
      1::smallint,
      (
        select link.media_asset_id
        from public.ai_jobs as job
        join public.ai_job_media as link
          on link.job_id = job.id
          and link.slot = 'generated_image'
        where job.client_request_id = 'a3000000-0000-4000-8000-000000000001'
      ),
      2048::bigint,
      repeat('a', 64),
      'generation-test-1',
      '{"total_tokens": 100}'::jsonb,
      40000::bigint
    )
  $$,
  '22023',
  'The exact generated output object is missing or invalid.',
  'a job cannot succeed before the exact private output object exists'
);
select lives_ok(
  $$
    insert into storage.objects (
      bucket_id,
      name,
      metadata
    )
    select
      asset.storage_bucket,
      asset.storage_object_path,
      '{"size": 2048, "mimetype": "image/png"}'::jsonb
    from public.ai_jobs as job
    join public.ai_job_media as link
      on link.job_id = job.id
      and link.slot = 'generated_image'
    join public.media_assets as asset on asset.id = link.media_asset_id
    where job.client_request_id = 'a3000000-0000-4000-8000-000000000001'
  $$,
  'the worker stores the exact reserved PNG before completion'
);
select lives_ok(
  $$
    select public.complete_ai_media_job_for_worker(
      (
        select id
        from public.ai_jobs
        where client_request_id = 'a3000000-0000-4000-8000-000000000001'
      ),
      1::smallint,
      (
        select link.media_asset_id
        from public.ai_jobs as job
        join public.ai_job_media as link
          on link.job_id = job.id
          and link.slot = 'generated_image'
        where job.client_request_id = 'a3000000-0000-4000-8000-000000000001'
      ),
      2048::bigint,
      repeat('a', 64),
      'generation-test-1',
      '{"total_tokens": 100}'::jsonb,
      40000::bigint
    )
  $$,
  'the worker completes the exact claimed attempt through a narrow RPC'
);
select lives_ok(
  $$
    select public.complete_ai_media_job_for_worker(
      (
        select id
        from public.ai_jobs
        where client_request_id = 'a3000000-0000-4000-8000-000000000001'
      ),
      1::smallint,
      (
        select link.media_asset_id
        from public.ai_jobs as job
        join public.ai_job_media as link
          on link.job_id = job.id
          and link.slot = 'generated_image'
        where job.client_request_id = 'a3000000-0000-4000-8000-000000000001'
      ),
      2048::bigint,
      repeat('a', 64),
      'generation-test-1',
      '{"total_tokens": 100}'::jsonb,
      40000::bigint
    )
  $$,
  'an uncertain completion retry is idempotent and cannot double-count cost'
);
select throws_ok(
  $$
    select public.complete_ai_media_job_for_worker(
      (
        select id
        from public.ai_jobs
        where client_request_id = 'a3000000-0000-4000-8000-000000000001'
      ),
      1::smallint,
      (
        select link.media_asset_id
        from public.ai_jobs as job
        join public.ai_job_media as link
          on link.job_id = job.id
          and link.slot = 'generated_image'
        where job.client_request_id = 'a3000000-0000-4000-8000-000000000001'
      ),
      null::bigint,
      repeat('a', 64),
      'generation-test-1',
      '{}'::jsonb,
      0::bigint
    )
  $$,
  '22023',
  'The worker completion payload is invalid.',
  'null completion evidence is rejected before the idempotent terminal check'
);
select results_eq(
  $$
    select status::text, actual_cost_microusd
    from public.ai_jobs
    where client_request_id = 'a3000000-0000-4000-8000-000000000001'
  $$,
  $$ values ('succeeded'::text, 40000::bigint) $$,
  'successful jobs retain a stable status and integer micro-dollar cost'
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
    select created
    from public.prepare_ai_media_job(
      'portrait.cartoon_3d',
      '20000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      'a3000000-0000-4000-8000-000000000003',
      'synthetic',
      'image/jpeg',
      null
    )
  $$,
  $$ values (true) $$,
  'a third job can exercise stale worker recovery'
);
select lives_ok(
  $$
    insert into storage.objects (bucket_id, name, owner_id, metadata)
    select
      'ai-media-private',
      format(
        '20000000-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000001/%s/input.jpg',
        job.id
      ),
      '10000000-0000-4000-8000-000000000001',
      '{"size": 1024, "mimetype": "image/jpeg"}'::jsonb
    from public.ai_jobs as job
    where job.client_request_id = 'a3000000-0000-4000-8000-000000000003'
  $$,
  'the stale-recovery job receives its exact reserved input'
);

reset role;
set local role service_role;

select is(
  (
    select count(*)::integer
    from public.claim_ai_media_job_for_worker(
      (
        select id
        from public.ai_jobs
        where client_request_id = 'a3000000-0000-4000-8000-000000000003'
      )
    )
  ),
  1,
  'the stale-recovery job starts with one claimed provider attempt'
);

reset role;
update public.ai_jobs
set processing_started_at = now() - interval '8 minutes'
where client_request_id = 'a3000000-0000-4000-8000-000000000003';
set local role service_role;

select is(
  (
    select count(*)::integer
    from public.claim_ai_media_job_for_worker(
      (
        select id
        from public.ai_jobs
        where client_request_id = 'a3000000-0000-4000-8000-000000000003'
      )
    )
  ),
  0,
  'an expired single-attempt lease is reconciled without a second provider call'
);
select results_eq(
  $$
    select
      job.status::text,
      job.public_error_code,
      attempt.status,
      attempt.error_code
    from public.ai_jobs as job
    join private.ai_job_attempts as attempt on attempt.job_id = job.id
    where job.client_request_id = 'a3000000-0000-4000-8000-000000000003'
  $$,
  $$
    values (
      'failed'::text,
      'provider_outcome_unknown'::text,
      'outcome_unknown'::text,
      'worker_lease_expired'::text
    )
  $$,
  'stale recovery closes the job and its unambiguous private attempt audit'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  (select count(*)::integer from public.media_assets),
  1,
  'the family sees only its completed output metadata'
);
select is(
  (select count(*)::integer from public.ai_job_media),
  1,
  'the family sees only its completed generated-output link'
);
select is(
  (select count(*)::integer from storage.objects),
  1,
  'the family can download only the ready output object'
);

reset role;
select * from finish();
rollback;
