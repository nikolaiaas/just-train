begin;

do $$
declare
  selected_operation public.ai_operations%rowtype;
  selected_version public.ai_operation_versions%rowtype;
  inserted_version_id uuid := gen_random_uuid();
  highest_version_number integer;
  next_prompt constant text := 'Create a friendly stylized 3D cartoon version of this person. Preserve their recognizable face, hairstyle, skin tone and distinctive features. Remove the original background completely. Show only the person, isolated with clean edges against a plain solid white background. Do not add scenery, props, other people, text, borders, frames, shadows or decorative elements.';
begin
  select operation.*
  into selected_operation
  from public.ai_operations as operation
  where operation.operation_key = 'portrait.cartoon_3d'
    and operation.capability = 'image_transform'
  for update;

  if selected_operation.id is null
    or selected_operation.active_version_id is null
  then
    raise exception 'The cartoon portrait operation is unavailable.'
      using errcode = '55000';
  end if;

  select version.*
  into selected_version
  from public.ai_operation_versions as version
  where version.id = selected_operation.active_version_id
    and version.operation_id = selected_operation.id;

  if selected_version.id is null
    or selected_version.gateway <> 'openrouter'
    or selected_version.provider <> 'openai'
    or selected_version.model <> 'openai/gpt-image-2'
    or selected_version.request_options ->> 'background' <> 'opaque'
    or not (
      selected_version.output_contract
      #> '{generated_image,mime_types}'
      @> '["image/png"]'::jsonb
    )
  then
    raise exception 'The active cartoon portrait configuration is unavailable.'
      using errcode = '55000';
  end if;

  select coalesce(max(version.version), 0)
  into highest_version_number
  from public.ai_operation_versions as version
  where version.operation_id = selected_operation.id;

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
    inserted_version_id,
    selected_operation.id,
    highest_version_number + 1,
    next_prompt,
    selected_version.gateway,
    selected_version.provider,
    selected_version.model,
    selected_version.request_options,
    selected_version.input_contract,
    selected_version.output_contract,
    selected_version.max_attempts,
    selected_version.timeout_ms,
    selected_version.max_cost_microusd
  );

  update public.ai_operations
  set active_version_id = inserted_version_id
  where id = selected_operation.id
    and active_version_id = selected_version.id;

  if not found then
    raise exception 'The active cartoon portrait version changed during its upgrade.'
      using errcode = '40001';
  end if;
end;
$$;

commit;
