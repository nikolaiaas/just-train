begin;

-- AI wardrobe proposals now carry the same exclusive equipment position as
-- authored catalog items. Older operation versions and their pinned jobs stay
-- immutable; the active contracts are upgraded by appending new versions.

create function private.is_valid_admin_ai_wardrobe_items(
  p_items jsonb,
  p_minimum_items integer,
  p_maximum_items integer,
  p_allow_legacy_without_slot boolean
)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(
    p_minimum_items >= 0
    and p_maximum_items >= p_minimum_items
    and jsonb_typeof(p_items) = 'array'
    and case when jsonb_typeof(p_items) = 'array'
      then jsonb_array_length(p_items)
        between p_minimum_items and p_maximum_items
      else false
    end
    and not exists (
      select 1
      from jsonb_array_elements(
        case when jsonb_typeof(p_items) = 'array'
          then p_items else '[]'::jsonb end
      ) as item
      where
        jsonb_typeof(item) is distinct from 'object'
        or not (item ?& array[
          'name',
          'icon',
          'category',
          'rarity',
          'points',
          'unlockRule',
          'reason'
        ])
        or exists (
          select 1
          from jsonb_object_keys(
            case when jsonb_typeof(item) = 'object'
              then item else '{}'::jsonb end
          ) as item_key
          where item_key <> all (array[
            'name',
            'icon',
            'category',
            'rarity',
            'points',
            'unlockRule',
            'reason',
            'equipSlot'
          ])
        )
        or (
          not (item ? 'equipSlot')
          and not p_allow_legacy_without_slot
        )
        or (
          item ? 'equipSlot'
          and (
            jsonb_typeof(item -> 'equipSlot') is distinct from 'string'
            or item ->> 'equipSlot' not in (
              'head',
              'body',
              'held',
              'feet',
              'accessory'
            )
          )
        )
        or jsonb_typeof(item -> 'name') is distinct from 'string'
        or item ->> 'name' is distinct from btrim(item ->> 'name')
        or char_length(item ->> 'name') not between 1 and 80
        or jsonb_typeof(item -> 'icon') is distinct from 'string'
        or item ->> 'icon' is distinct from btrim(item ->> 'icon')
        or char_length(item ->> 'icon') not between 1 and 16
        or jsonb_typeof(item -> 'category') is distinct from 'string'
        or item ->> 'category' not in ('clothing', 'equipment', 'effect')
        or jsonb_typeof(item -> 'rarity') is distinct from 'string'
        or item ->> 'rarity' not in ('common', 'rare', 'special')
        or case
          when jsonb_typeof(item -> 'points') = 'number'
            and (item ->> 'points') ~ '^[0-9]{1,4}$'
          then
            (item ->> 'points')::integer not between 0 and 1000
            or not (
              (
                (item ->> 'points')::integer = 0
                and char_length(item ->> 'unlockRule') between 1 and 200
              )
              or (
                (item ->> 'points')::integer between 1 and 1000
                and item ->> 'unlockRule' = ''
              )
            )
          else true
        end
        or jsonb_typeof(item -> 'unlockRule') is distinct from 'string'
        or item ->> 'unlockRule' is distinct from btrim(item ->> 'unlockRule')
        or char_length(item ->> 'unlockRule') > 200
        or jsonb_typeof(item -> 'reason') is distinct from 'string'
        or item ->> 'reason' is distinct from btrim(item ->> 'reason')
        or char_length(item ->> 'reason') not between 1 and 300
    ),
    false
  );
$$;

revoke all on function private.is_valid_admin_ai_wardrobe_items(
  jsonb,
  integer,
  integer,
  boolean
) from public, anon, authenticated, service_role;

comment on function private.is_valid_admin_ai_wardrobe_items(
  jsonb,
  integer,
  integer,
  boolean
) is
  'Fail-closed validation for exact wardrobe proposal items, optionally accepting immutable pre-slot output versions.';

create function private.is_valid_admin_ai_wardrobe_output(
  p_output_data jsonb,
  p_allow_legacy_without_slot boolean
)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(
    jsonb_typeof(p_output_data) = 'object'
    and p_output_data ?& array['reply', 'items']
    and not exists (
      select 1
      from jsonb_object_keys(
        case when jsonb_typeof(p_output_data) = 'object'
          then p_output_data else '{}'::jsonb end
      ) as output_key
      where output_key <> all (array['reply', 'items'])
    )
    and jsonb_typeof(p_output_data -> 'reply') = 'string'
    and p_output_data ->> 'reply' = btrim(p_output_data ->> 'reply')
    and char_length(p_output_data ->> 'reply') between 1 and 1500
    and private.is_valid_admin_ai_wardrobe_items(
      p_output_data -> 'items',
      3,
      6,
      p_allow_legacy_without_slot
    ),
    false
  );
$$;

revoke all on function private.is_valid_admin_ai_wardrobe_output(
  jsonb,
  boolean
) from public, anon, authenticated, service_role;

comment on function private.is_valid_admin_ai_wardrobe_output(
  jsonb,
  boolean
) is
  'Validates a bounded wardrobe AI proposal without weakening its version-pinned JSON contract.';

create or replace function private.is_valid_admin_draft_review_input(
  p_input_data jsonb
)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(
    jsonb_typeof(p_input_data) = 'object'
    and p_input_data ?& array[
      'message',
      'topic',
      'goal',
      'exercise',
      'wardrobeExamples',
      'history'
    ]
    and not exists (
      select 1
      from jsonb_object_keys(
        case when jsonb_typeof(p_input_data) = 'object'
          then p_input_data else '{}'::jsonb end
      ) as input_key
      where input_key <> all (array[
        'message',
        'topic',
        'goal',
        'exercise',
        'wardrobeExamples',
        'history'
      ])
    )
    and private.is_valid_admin_ai_input(
      'content.topic_brief',
      jsonb_build_object(
        'message', p_input_data -> 'message',
        'draft', p_input_data -> 'topic',
        'history', p_input_data -> 'history'
      )
    )
    and private.is_valid_admin_ai_input(
      'content.goal_draft',
      jsonb_build_object(
        'message', p_input_data -> 'message',
        'topic', jsonb_build_object(
          'title', p_input_data #> '{topic,title}',
          'description', p_input_data #> '{topic,description}'
        ),
        'draft', p_input_data -> 'goal',
        'history', p_input_data -> 'history'
      )
    )
    and private.is_valid_admin_ai_input(
      'content.exercise_draft',
      jsonb_build_object(
        'message', p_input_data -> 'message',
        'topic', jsonb_build_object(
          'title', p_input_data #> '{topic,title}',
          'description', p_input_data #> '{topic,description}'
        ),
        'goal', p_input_data -> 'goal',
        'position', 1,
        'sequence', '[]'::jsonb,
        'draft', p_input_data -> 'exercise',
        'history', p_input_data -> 'history'
      )
    )
    and private.is_valid_admin_ai_wardrobe_items(
      p_input_data -> 'wardrobeExamples',
      0,
      6,
      true
    ),
    false
  );
$$;

revoke all on function private.is_valid_admin_draft_review_input(jsonb)
  from public, anon, authenticated, service_role;

comment on function private.is_valid_admin_draft_review_input(jsonb) is
  'Validates complete topic-draft review context, accepting both immutable legacy wardrobe items and slot-aware items before the pinned contract gate.';

create or replace function private.is_valid_admin_ai_output_invariants(
  p_operation_key text,
  p_output_data jsonb
)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(
    case
      when p_operation_key in (
        'content.goal_draft',
        'content.exercise_draft'
      )
        and p_output_data #> '{suggestion,equipment}' is not null
      then private.is_valid_admin_ai_string_array(
        p_output_data #> '{suggestion,equipment}',
        12,
        80
      )
      when p_operation_key = 'content.wardrobe_examples'
      then private.is_valid_admin_ai_wardrobe_output(
        p_output_data,
        true
      )
      when p_operation_key = 'content.draft_review'
      then private.is_valid_admin_ai_string_array(
        p_output_data -> 'nextActions',
        6,
        300
      )
      else true
    end,
    false
  );
$$;

revoke all on function private.is_valid_admin_ai_output_invariants(text, jsonb)
  from public, anon, authenticated, service_role;

create function private.add_admin_ai_wardrobe_slot_schema(
  p_contract jsonb,
  p_item_schema_path text[]
)
returns jsonb
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  equip_slot_path text[];
  required_path text[];
  required_fields jsonb;
  result jsonb := p_contract;
  slot_contract constant jsonb := '{
    "type":"string",
    "enum":["head","body","held","feet","accessory"]
  }'::jsonb;
begin
  if jsonb_typeof(result) <> 'object'
    or jsonb_typeof(result #> (p_item_schema_path || array['anyOf'])) <> 'array'
    or jsonb_array_length(
      result #> (p_item_schema_path || array['anyOf'])
    ) <> 2
  then
    raise exception 'The active wardrobe AI contract cannot be upgraded safely.'
      using errcode = '55000';
  end if;

  for branch_index in 0..1 loop
    equip_slot_path := p_item_schema_path || array[
      'anyOf',
      branch_index::text,
      'properties',
      'equipSlot'
    ];
    required_path := p_item_schema_path || array[
      'anyOf',
      branch_index::text,
      'required'
    ];
    required_fields := result #> required_path;

    if jsonb_typeof(required_fields) <> 'array' then
      raise exception 'The active wardrobe AI contract cannot be upgraded safely.'
        using errcode = '55000';
    end if;

    if result #> equip_slot_path is not null
      and result #> equip_slot_path is distinct from slot_contract
    then
      raise exception 'The active wardrobe AI slot contract is incompatible.'
        using errcode = '55000';
    end if;

    result := jsonb_set(result, equip_slot_path, slot_contract, true);

    if not (required_fields ? 'equipSlot') then
      result := jsonb_set(
        result,
        required_path,
        required_fields || '["equipSlot"]'::jsonb,
        false
      );
    end if;
  end loop;

  return result;
end;
$$;

revoke all on function private.add_admin_ai_wardrobe_slot_schema(
  jsonb,
  text[]
) from public, anon, authenticated, service_role;

comment on function private.add_admin_ai_wardrobe_slot_schema(jsonb, text[]) is
  'Adds the required exclusive wardrobe equipSlot enum to both reward-rule branches of a trusted operation contract.';

create function private.apply_admin_ai_wardrobe_slot_revision(
  p_operation_key text
)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  selected_operation public.ai_operations%rowtype;
  selected_version public.ai_operation_versions%rowtype;
  highest_version_number integer;
  next_input_contract jsonb;
  next_output_contract jsonb;
  prompt_suffix text;
  inserted_version_id uuid := gen_random_uuid();
begin
  if p_operation_key not in (
    'content.wardrobe_examples',
    'content.draft_review'
  ) then
    raise exception 'The requested wardrobe AI contract upgrade is invalid.'
      using errcode = '22023';
  end if;

  select operation.*
  into selected_operation
  from public.ai_operations as operation
  where operation.operation_key = p_operation_key
    and operation.capability = 'structured_text'
  for update;

  if selected_operation.id is null
    or selected_operation.active_version_id is null
  then
    raise exception 'The wardrobe AI operation is unavailable.'
      using errcode = '55000';
  end if;

  select version.*
  into selected_version
  from public.ai_operation_versions as version
  where version.id = selected_operation.active_version_id
    and version.operation_id = selected_operation.id;

  if selected_version.id is null then
    raise exception 'The active wardrobe AI version is unavailable.'
      using errcode = '55000';
  end if;

  next_input_contract := selected_version.input_contract;
  next_output_contract := selected_version.output_contract;

  if p_operation_key = 'content.wardrobe_examples' then
    next_output_contract := private.add_admin_ai_wardrobe_slot_schema(
      selected_version.output_contract,
      array['properties', 'items', 'items']
    );
    prompt_suffix := ' Angiv equipSlot for hvert forslag som præcis én af head, body, held, feet eller accessory. Et par sko er én samlet garderobeting i feet-positionen, aldrig to separate sko.';
  else
    next_input_contract := private.add_admin_ai_wardrobe_slot_schema(
      selected_version.input_contract,
      array['properties', 'wardrobeExamples', 'items']
    );
    prompt_suffix := ' Kontrollér også, at hvert garderobeeksempels equipSlot passer til den placering, hvor barnet kan bære tinget. Et par sko er én samlet ting i feet-positionen.';
  end if;

  if next_input_contract is not distinct from selected_version.input_contract
    and next_output_contract is not distinct from selected_version.output_contract
  then
    return false;
  end if;

  select max(version.version)
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
    selected_version.prompt_template || prompt_suffix,
    selected_version.gateway,
    selected_version.provider,
    selected_version.model,
    selected_version.request_options,
    next_input_contract,
    next_output_contract,
    selected_version.max_attempts,
    selected_version.timeout_ms,
    selected_version.max_cost_microusd
  );

  update public.ai_operations
  set active_version_id = inserted_version_id
  where id = selected_operation.id
    and active_version_id = selected_version.id;

  if not found then
    raise exception 'The active wardrobe AI version changed during its upgrade.'
      using errcode = '40001';
  end if;

  return true;
end;
$$;

revoke all on function private.apply_admin_ai_wardrobe_slot_revision(text)
  from public, anon, authenticated, service_role;

comment on function private.apply_admin_ai_wardrobe_slot_revision(text) is
  'Appends a slot-aware operation version while preserving all immutable prior versions and pinned jobs.';

do $$
begin
  perform private.apply_admin_ai_wardrobe_slot_revision(
    'content.wardrobe_examples'
  );
  perform private.apply_admin_ai_wardrobe_slot_revision(
    'content.draft_review'
  );
end;
$$;

commit;
