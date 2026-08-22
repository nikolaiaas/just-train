begin;

-- The review operation receives only the same bounded editorial values that
-- the administrator has already seen. It returns a checklist proposal and has
-- no content mutation or publication path.

create function private.is_valid_admin_draft_review_input(p_input_data jsonb)
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
    and jsonb_typeof(p_input_data -> 'wardrobeExamples') = 'array'
    and case when jsonb_typeof(p_input_data -> 'wardrobeExamples') = 'array'
      then jsonb_array_length(p_input_data -> 'wardrobeExamples') <= 6
      else false
    end
    and (
      p_input_data -> 'wardrobeExamples' = '[]'::jsonb
      or private.is_valid_admin_ai_output(
        'content.wardrobe_examples',
        jsonb_build_object(
          'reply', 'Garderobekontekst',
          'items', p_input_data -> 'wardrobeExamples'
        )
      )
    ),
    false
  );
$$;

revoke all on function private.is_valid_admin_draft_review_input(jsonb)
  from public, anon, authenticated, service_role;

comment on function private.is_valid_admin_draft_review_input(jsonb) is
  'Validates complete, bounded topic, goal, exercise, and optional wardrobe-example context for a non-mutating admin review.';

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

create or replace function public.prepare_admin_ai_job(
  p_operation_key text,
  p_client_request_id uuid,
  p_input_data jsonb
)
returns table (
  job_id uuid,
  job_status public.ai_job_status
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  selected_operation public.ai_operations%rowtype;
  selected_version public.ai_operation_versions%rowtype;
  selected_job public.ai_jobs%rowtype;
begin
  if caller_id is null or not (select private.is_admin()) then
    raise exception 'Content administrator access is required.'
      using errcode = '42501';
  end if;

  if p_client_request_id is null
    or p_client_request_id = '00000000-0000-0000-0000-000000000000'::uuid
  then
    raise exception 'The admin AI request is invalid.'
      using errcode = '22023';
  end if;

  select operation.*
  into selected_operation
  from public.ai_operations as operation
  where operation.operation_key = p_operation_key
    and operation.capability = 'structured_text';

  if selected_operation.id is null then
    raise exception 'The requested admin AI operation is unavailable.'
      using errcode = '55000';
  end if;

  perform profile.id
  from public.profiles as profile
  where profile.id = caller_id
  for update;

  if not found then
    raise exception 'The authenticated profile is missing.'
      using errcode = 'P0002';
  end if;

  select job.*
  into selected_job
  from public.ai_jobs as job
  where job.requested_by = caller_id
    and job.client_request_id = p_client_request_id;

  if selected_job.id is not null then
    if selected_job.operation_id is distinct from selected_operation.id
      or selected_job.input_data is distinct from p_input_data
      or selected_job.scope_kind is distinct from 'admin'
    then
      raise exception 'The request identity is already used for different work.'
        using errcode = '23505';
    end if;

    return query select selected_job.id, selected_job.status;
    return;
  end if;

  if selected_operation.active_version_id is null then
    raise exception 'The requested admin AI operation is unavailable.'
      using errcode = '55000';
  end if;

  select version.*
  into selected_version
  from public.ai_operation_versions as version
  where version.id = selected_operation.active_version_id
    and version.operation_id = selected_operation.id;

  if selected_version.id is null then
    raise exception 'The active admin AI version is unavailable.'
      using errcode = '55000';
  end if;

  if (
      p_operation_key = 'content.draft_review'
      and private.is_valid_admin_draft_review_input(p_input_data) is not true
    )
    or (
      p_operation_key <> 'content.draft_review'
      and private.is_valid_admin_ai_input(
        p_operation_key,
        p_input_data
      ) is not true
    )
    or private.admin_ai_contract_matches(
        selected_version.input_contract,
        p_input_data
      ) is not true
  then
    raise exception 'The admin AI request is invalid.'
      using errcode = '22023';
  end if;

  insert into public.ai_jobs (
    scope_kind,
    operation_id,
    operation_version_id,
    requested_by,
    client_request_id,
    status,
    max_attempts,
    max_cost_microusd,
    queued_at,
    input_data
  )
  values (
    'admin',
    selected_operation.id,
    selected_version.id,
    caller_id,
    p_client_request_id,
    'awaiting_upload',
    selected_version.max_attempts,
    selected_version.max_cost_microusd,
    now(),
    p_input_data
  )
  returning * into selected_job;

  return query select selected_job.id, selected_job.status;
end;
$$;

comment on function public.prepare_admin_ai_job(text, uuid, jsonb) is
  'Idempotently creates a bounded, version-pinned administrator AI proposal or review. It cannot alter or publish content.';

insert into public.ai_operations (
  id,
  operation_key,
  capability,
  description
)
values (
  'a1000000-0000-4000-8000-000000000006',
  'content.draft_review',
  'structured_text',
  'Reviews a bounded administrator topic draft and returns a non-mutating checklist. It cannot save, approve, or publish content.'
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
  'a2000000-0000-4000-8000-000000000007',
  'a1000000-0000-4000-8000-000000000006',
  1,
  'Du er Bare Træns danske gennemgangsassistent for voksne redaktører. Gennemgå kun den validerede, komplette kontekst for emne, mål, deløvelse og eventuelle syntetiske garderobeeksempler. Vurdér sammenhæng, tydelighed, realistisk sværhedsgrad og tid, måling, nødvendigt udstyr og konkret sikkerhed. Garderoben er valgfri og forslagene er ikke gemt. Returnér en kort opsummering, en status og note for hvert af de fire områder samt højst seks konkrete næste handlinger. Hold hver checklistenote på højst 350 tegn, hver næste handling på højst 200 tegn og reply helst på højst 800 tegn. Du må aldrig ændre felter, oprette eller gemme indhold, godkende, publicere eller hævde, at noget er blevet gemt eller publiceret. Medtag ingen persondata, diagnoser, brands, links eller køb. Svaret skal følge outputskemaet præcist.',
  'openrouter',
  'openai',
  'openai/gpt-5-mini',
  '{
    "max_tokens": 1800,
    "provider": {
      "only": ["openai"],
      "allow_fallbacks": false,
      "require_parameters": true
    }
  }'::jsonb,
  '{
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "message": {"type": "string", "minLength": 1, "maxLength": 1000},
      "topic": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "title": {"type": "string", "minLength": 1, "maxLength": 100},
          "description": {"type": "string", "minLength": 1, "maxLength": 500},
          "icon": {"type": "string", "minLength": 1, "maxLength": 16},
          "accentColor": {"type": "string", "minLength": 7, "maxLength": 7, "pattern": "^#[0-9A-Fa-f]{6}$"}
        },
        "required": ["title", "description", "icon", "accentColor"]
      },
      "goal": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "title": {"type": "string", "minLength": 1, "maxLength": 120},
          "summary": {"type": "string", "minLength": 1, "maxLength": 1000},
          "difficulty": {"type": "string", "enum": ["beginner", "intermediate", "advanced"]},
          "estimatedMinutes": {"type": "integer", "minimum": 1, "maximum": 180},
          "equipment": {
            "type": "array",
            "minItems": 0,
            "maxItems": 12,
            "items": {"type": "string", "minLength": 1, "maxLength": 80}
          }
        },
        "required": ["title", "summary", "difficulty", "estimatedMinutes", "equipment"]
      },
      "exercise": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "title": {"type": "string", "minLength": 1, "maxLength": 120},
          "instructions": {"type": "string", "minLength": 1, "maxLength": 1500},
          "measurement": {"type": "string", "enum": ["completion", "repetitions", "duration"]},
          "targetValue": {"type": ["integer", "null"], "minimum": 1, "maximum": 86400},
          "recommendedMinutes": {"type": "integer", "minimum": 1, "maximum": 180},
          "equipment": {
            "type": "array",
            "minItems": 0,
            "maxItems": 12,
            "items": {"type": "string", "minLength": 1, "maxLength": 80}
          },
          "safetyNote": {"type": "string", "minLength": 1, "maxLength": 1000}
        },
        "required": ["title", "instructions", "measurement", "targetValue", "recommendedMinutes", "equipment", "safetyNote"]
      },
      "wardrobeExamples": {
        "type": "array",
        "minItems": 0,
        "maxItems": 6,
        "items": {
          "anyOf": [
            {
              "type": "object",
              "additionalProperties": false,
              "properties": {
                "name": {"type": "string", "minLength": 1, "maxLength": 80},
                "icon": {"type": "string", "minLength": 1, "maxLength": 16},
                "category": {"type": "string", "enum": ["clothing", "equipment", "effect"]},
                "rarity": {"type": "string", "enum": ["common", "rare", "special"]},
                "points": {"type": "integer", "minimum": 1, "maximum": 1000},
                "unlockRule": {"type": "string", "enum": [""]},
                "reason": {"type": "string", "minLength": 1, "maxLength": 300}
              },
              "required": ["name", "icon", "category", "rarity", "points", "unlockRule", "reason"]
            },
            {
              "type": "object",
              "additionalProperties": false,
              "properties": {
                "name": {"type": "string", "minLength": 1, "maxLength": 80},
                "icon": {"type": "string", "minLength": 1, "maxLength": 16},
                "category": {"type": "string", "enum": ["clothing", "equipment", "effect"]},
                "rarity": {"type": "string", "enum": ["common", "rare", "special"]},
                "points": {"type": "integer", "enum": [0]},
                "unlockRule": {"type": "string", "minLength": 1, "maxLength": 200},
                "reason": {"type": "string", "minLength": 1, "maxLength": 300}
              },
              "required": ["name", "icon", "category", "rarity", "points", "unlockRule", "reason"]
            }
          ]
        }
      },
      "history": {
        "type": "array",
        "maxItems": 6,
        "items": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "role": {"type": "string", "enum": ["user", "assistant"]},
            "content": {"type": "string", "minLength": 1, "maxLength": 1800}
          },
          "required": ["role", "content"]
        }
      }
    },
    "required": ["message", "topic", "goal", "exercise", "wardrobeExamples", "history"]
  }'::jsonb,
  '{
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "reply": {"type": "string", "minLength": 1, "maxLength": 1500, "pattern": "^\\S(?:[\\s\\S]*\\S)?$"},
      "verdict": {"type": "string", "enum": ["ready_for_human_review", "needs_attention"]},
      "checklist": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "topic": {
            "type": "object",
            "additionalProperties": false,
            "properties": {
              "status": {"type": "string", "enum": ["ok", "attention"]},
              "note": {"type": "string", "minLength": 1, "maxLength": 500, "pattern": "^\\S(?:[\\s\\S]*\\S)?$"}
            },
            "required": ["status", "note"]
          },
          "goal": {
            "type": "object",
            "additionalProperties": false,
            "properties": {
              "status": {"type": "string", "enum": ["ok", "attention"]},
              "note": {"type": "string", "minLength": 1, "maxLength": 500, "pattern": "^\\S(?:[\\s\\S]*\\S)?$"}
            },
            "required": ["status", "note"]
          },
          "exercise": {
            "type": "object",
            "additionalProperties": false,
            "properties": {
              "status": {"type": "string", "enum": ["ok", "attention"]},
              "note": {"type": "string", "minLength": 1, "maxLength": 500, "pattern": "^\\S(?:[\\s\\S]*\\S)?$"}
            },
            "required": ["status", "note"]
          },
          "wardrobe": {
            "type": "object",
            "additionalProperties": false,
            "properties": {
              "status": {"type": "string", "enum": ["ok", "attention", "optional"]},
              "note": {"type": "string", "minLength": 1, "maxLength": 500, "pattern": "^\\S(?:[\\s\\S]*\\S)?$"}
            },
            "required": ["status", "note"]
          }
        },
        "required": ["topic", "goal", "exercise", "wardrobe"]
      },
      "nextActions": {
        "type": "array",
        "minItems": 0,
        "maxItems": 6,
        "items": {"type": "string", "minLength": 1, "maxLength": 300, "pattern": "^\\S(?:[\\s\\S]*\\S)?$"}
      }
    },
    "required": ["reply", "verdict", "checklist", "nextActions"]
  }'::jsonb,
  1,
  45000,
  20000
);

update public.ai_operations
set active_version_id = 'a2000000-0000-4000-8000-000000000007'
where operation_key = 'content.draft_review';

-- The provider test showed that the original topic prompt could produce a
-- structurally correct but too-long short description. Upgrade only an
-- untouched seeded version 1. A concurrently or previously published
-- administrator revision is authoritative and must never be overwritten or
-- rolled back to an unrelated version 2.
create function private.apply_seeded_topic_brief_length_guidance()
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  selected_operation_id uuid;
  selected_active_version_id uuid;
  selected_active_version_number integer;
  highest_version_number integer;
  inserted_version_id uuid := gen_random_uuid();
begin
  select
    operation.id,
    operation.active_version_id,
    active_version.version
  into
    selected_operation_id,
    selected_active_version_id,
    selected_active_version_number
  from public.ai_operations as operation
  join public.ai_operation_versions as active_version
    on active_version.id = operation.active_version_id
    and active_version.operation_id = operation.id
  where operation.operation_key = 'content.topic_brief'
  for update of operation;

  if not found then
    raise exception 'The seeded topic prompt is unavailable.'
      using errcode = '55000';
  end if;

  select max(existing.version)
  into highest_version_number
  from public.ai_operation_versions as existing
  where existing.operation_id = selected_operation_id;

  if selected_active_version_id is distinct from
      'a2000000-0000-4000-8000-000000000003'::uuid
    or selected_active_version_number is distinct from 1
    or highest_version_number is distinct from 1
  then
    return false;
  end if;

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
  select
    inserted_version_id,
    version.operation_id,
    2,
    version.prompt_template || ' Kort beskrivelse skal være højst 400 tegn inklusive mellemrum. Skriv helst 1-2 korte sætninger.',
    version.gateway,
    version.provider,
    version.model,
    version.request_options,
    version.input_contract,
    version.output_contract,
    version.max_attempts,
    version.timeout_ms,
    version.max_cost_microusd
  from public.ai_operation_versions as version
  where version.id = selected_active_version_id
    and version.operation_id = selected_operation_id;

  if not found then
    raise exception 'The seeded topic prompt changed during its upgrade.'
      using errcode = '40001';
  end if;

  update public.ai_operations
  set active_version_id = inserted_version_id
  where id = selected_operation_id
    and active_version_id = selected_active_version_id;

  if not found then
    raise exception 'The active topic prompt changed during its upgrade.'
      using errcode = '40001';
  end if;

  return true;
end;
$$;

revoke all on function private.apply_seeded_topic_brief_length_guidance()
  from public, anon, authenticated, service_role;

comment on function private.apply_seeded_topic_brief_length_guidance() is
  'Applies the tested topic-description guidance only to the untouched seeded v1 prompt; newer administrator versions are preserved.';

do $$
begin
  perform private.apply_seeded_topic_brief_length_guidance();
end;
$$;

commit;
