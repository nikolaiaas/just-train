begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(9);

select is(
  (
    select version.version
    from public.ai_operations as operation
    join public.ai_operation_versions as version
      on version.id = operation.active_version_id
      and version.operation_id = operation.id
    where operation.operation_key = 'portrait.cartoon_3d'
  ),
  3,
  'the background-removal portrait prompt is active as immutable version 3'
);

select results_eq(
  $$
    select version.prompt_template
    from public.ai_operations as operation
    join public.ai_operation_versions as version
      on version.id = operation.active_version_id
      and version.operation_id = operation.id
    where operation.operation_key = 'portrait.cartoon_3d'
  $$,
  $$
    values (
      'Create a friendly stylized 3D cartoon version of this person. Preserve their recognizable face, hairstyle, skin tone and distinctive features. Remove the original background completely. Show only the person, isolated with clean edges against a plain solid white background. Do not add scenery, props, other people, text, borders, frames, shadows or decorative elements.'::text
    )
  $$,
  'the active database prompt requires a person-only result without the source background'
);

select is(
  (
    select version.request_options ->> 'background'
    from public.ai_operations as operation
    join public.ai_operation_versions as version
      on version.id = operation.active_version_id
      and version.operation_id = operation.id
    where operation.operation_key = 'portrait.cartoon_3d'
  ),
  'opaque',
  'the prompt revision retains the provider-supported opaque output mode'
);

select results_eq(
  $$
    select version.gateway, version.provider, version.model
    from public.ai_operations as operation
    join public.ai_operation_versions as version
      on version.id = operation.active_version_id
      and version.operation_id = operation.id
    where operation.operation_key = 'portrait.cartoon_3d'
  $$,
  $$ values ('openrouter'::text, 'openai'::text, 'openai/gpt-image-2'::text) $$,
  'the prompt revision preserves the pinned provider route'
);

select is(
  (
    select active_version.request_options
    from public.ai_operations as operation
    join public.ai_operation_versions as active_version
      on active_version.id = operation.active_version_id
      and active_version.operation_id = operation.id
    where operation.operation_key = 'portrait.cartoon_3d'
  ),
  (
    select historical_version.request_options
    from public.ai_operation_versions as historical_version
    where historical_version.id = 'a2000000-0000-4000-8000-000000000002'
  ),
  'the prompt revision changes no provider request option'
);

select is(
  (
    select active_version.input_contract
    from public.ai_operations as operation
    join public.ai_operation_versions as active_version
      on active_version.id = operation.active_version_id
      and active_version.operation_id = operation.id
    where operation.operation_key = 'portrait.cartoon_3d'
  ),
  (
    select historical_version.input_contract
    from public.ai_operation_versions as historical_version
    where historical_version.id = 'a2000000-0000-4000-8000-000000000002'
  ),
  'the prompt revision preserves the selected-child input contract'
);

select is(
  (
    select active_version.output_contract
    from public.ai_operations as operation
    join public.ai_operation_versions as active_version
      on active_version.id = operation.active_version_id
      and active_version.operation_id = operation.id
    where operation.operation_key = 'portrait.cartoon_3d'
  ),
  (
    select historical_version.output_contract
    from public.ai_operation_versions as historical_version
    where historical_version.id = 'a2000000-0000-4000-8000-000000000002'
  ),
  'the prompt revision preserves the generated PNG output contract'
);

select results_eq(
  $$
    select prompt_template, request_options ->> 'background'
    from public.ai_operation_versions
    where id = 'a2000000-0000-4000-8000-000000000002'
  $$,
  $$
    values (
      'Create a friendly stylized 3D cartoon version of this person. Preserve their recognizable face, hairstyle, skin tone and distinctive features.'::text,
      'opaque'::text
    )
  $$,
  'immutable version 2 remains unchanged for already pinned jobs'
);

select is(
  (
    select count(*)::integer
    from public.ai_operation_versions as version
    join public.ai_operations as operation on operation.id = version.operation_id
    where operation.operation_key = 'portrait.cartoon_3d'
  ),
  3,
  'the operation retains its two historical versions plus the new prompt revision'
);

select * from finish();
rollback;
