begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(5);

insert into public.ai_operations (
  id,
  operation_key,
  capability,
  description
)
values (
  'b1000000-0000-4000-8000-000000000001',
  'portrait.storybook_2d',
  'image_transform',
  'Synthetic second operation used to verify generic AI job isolation.'
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
  'b2000000-0000-4000-8000-000000000001',
  'b1000000-0000-4000-8000-000000000001',
  1,
  'Create a friendly storybook portrait of this synthetic adult.',
  'openrouter',
  'openai',
  'openai/gpt-image-2',
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
  '{
    "reference_image": {
      "count": 1,
      "mime_types": ["image/jpeg"],
      "max_bytes": 8388608,
      "allowed_subject_kinds": ["adult_test"]
    }
  }'::jsonb,
  '{
    "generated_image": {
      "count": 1,
      "mime_types": ["image/png"]
    }
  }'::jsonb,
  1,
  120000,
  250000
);

update public.ai_operations
set active_version_id = 'b2000000-0000-4000-8000-000000000001'
where id = 'b1000000-0000-4000-8000-000000000001';

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
      'b3000000-0000-4000-8000-000000000001',
      'adult_test',
      'image/jpeg',
      null
    )
  $$,
  $$ values (true) $$,
  'the first operation can reserve its own private job'
);

select results_eq(
  $$
    select created
    from public.prepare_ai_media_job(
      'portrait.storybook_2d',
      '20000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      'b3000000-0000-4000-8000-000000000002',
      'adult_test',
      'image/jpeg',
      null
    )
  $$,
  $$ values (true) $$,
  'a second operation can reserve a separate job for the same family member'
);

select is(
  (
    select count(*)::integer
    from public.ai_jobs
    where requested_by = '10000000-0000-4000-8000-000000000001'
      and status = 'awaiting_upload'
  ),
  2,
  'different operations do not supersede or block each other'
);

select results_eq(
  $$
    select created
    from public.prepare_ai_media_job(
      'portrait.cartoon_3d',
      '20000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      'b3000000-0000-4000-8000-000000000003',
      'adult_test',
      'image/jpeg',
      null
    )
  $$,
  $$ values (true) $$,
  'a replacement request can supersede only its own operation reservation'
);

select results_eq(
  $$
    select client_request_id, status::text
    from public.ai_jobs
    where client_request_id in (
      'b3000000-0000-4000-8000-000000000001',
      'b3000000-0000-4000-8000-000000000002',
      'b3000000-0000-4000-8000-000000000003'
    )
    order by client_request_id
  $$,
  $$
    values
      ('b3000000-0000-4000-8000-000000000001'::uuid, 'cancelled'::text),
      ('b3000000-0000-4000-8000-000000000002'::uuid, 'awaiting_upload'::text),
      ('b3000000-0000-4000-8000-000000000003'::uuid, 'awaiting_upload'::text)
  $$,
  'superseding one operation preserves the other operation job'
);

select * from finish();

rollback;
