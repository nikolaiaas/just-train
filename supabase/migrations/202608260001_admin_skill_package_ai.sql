begin;

-- A skill package is an editorial proposal bound to one persisted topic. The
-- topic itself is still created independently; these operations never publish
-- or modify content until an administrator explicitly saves the reviewed
-- proposal through the transactional RPC below.

create function private.has_parent_framed_child_copy(p_copy text)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(
    lower(p_copy) ~ (
      '(^|[^[:alpha:]])((dit|jeres)[[:space:]]+barn|'
      || 'barnets|barnet|børnenes|børnene|'
      || '(som|kære)[[:space:]]+(forælder|forælderen|forældre|forældrene)|'
      || 'til[[:space:]]+forældrene)([^[:alpha:]]|$)'
    )
    or lower(p_copy) ~ (
      '(^|[.!?;:])[[:space:]]*('
      || '((et|hvert)[[:space:]]+)?barn|'
      || '((alle|nogle|andre|flere|mange|små|store)[[:space:]]+)?børn|'
      || '(en[[:space:]]+)?(forælder|forælderen)|'
      || '((dine|mine|sine|vores|jeres|deres)[[:space:]]+)?(forældre|forældrene)'
      || ')[[:space:]]+[[:alpha:]]+'
    ),
    false
  );
$$;

revoke all on function private.has_parent_framed_child_copy(text)
  from public, anon, authenticated, service_role;

comment on function private.has_parent_framed_child_copy(text) is
  'Rejects common adult-facing phrases in copy persisted for a child while allowing child-directed adult-help safety guidance.';

create function private.is_valid_admin_skill_ai_input(
  p_operation_key text,
  p_input_data jsonb
)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(
    case p_operation_key
      when 'content.skill_suggestions' then
        case when jsonb_typeof(p_input_data #> '{existingSkills}') = 'array'
          then jsonb_array_length(p_input_data #> '{existingSkills}') = (
            select count(distinct lower(skill ->> 'title'))
            from jsonb_array_elements(p_input_data #> '{existingSkills}') as skill
          )
          else false
        end
      when 'content.skill_package' then
        case when jsonb_typeof(p_input_data #> '{existingSkills}') = 'array'
          then jsonb_array_length(p_input_data #> '{existingSkills}') = (
            select count(distinct lower(skill ->> 'title'))
            from jsonb_array_elements(p_input_data #> '{existingSkills}') as skill
          )
          and jsonb_array_length(p_input_data #> '{existingSkills}') = (
            select count(distinct lower(skill ->> 'slug'))
            from jsonb_array_elements(p_input_data #> '{existingSkills}') as skill
          )
          else false
        end
      else false
    end,
    false
  );
$$;

revoke all on function private.is_valid_admin_skill_ai_input(text, jsonb)
  from public, anon, authenticated, service_role;

create function private.is_valid_admin_skill_ai_output(
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
    case p_operation_key
      when 'content.skill_suggestions' then
        jsonb_typeof(p_output_data -> 'skills') = 'array'
        and jsonb_array_length(p_output_data -> 'skills') between 3 and 8
        and not exists (
          select 1
          from jsonb_array_elements(p_output_data -> 'skills')
            with ordinality as entry(skill, position)
          where not case
            when jsonb_typeof(entry.skill -> 'ordinal') = 'number'
              and entry.skill ->> 'ordinal' ~ '^[1-8]$'
            then (entry.skill ->> 'ordinal')::integer = entry.position
            else false
          end
          or private.has_parent_framed_child_copy(
            entry.skill ->> 'childDescription'
          )
        )
        and jsonb_array_length(p_output_data -> 'skills') = (
          select count(distinct lower(skill ->> 'title'))
          from jsonb_array_elements(p_output_data -> 'skills') as skill
        )
        and jsonb_array_length(p_output_data -> 'skills') = (
          select count(distinct lower(skill ->> 'slug'))
          from jsonb_array_elements(p_output_data -> 'skills') as skill
        )
      when 'content.skill_package' then
        not private.has_parent_framed_child_copy(
          p_output_data #>> '{skill,childDescription}'
        )
        and private.is_valid_admin_ai_string_array(
          p_output_data #> '{skill,equipment}',
          12,
          80
        )
        and jsonb_typeof(p_output_data -> 'exercises') = 'array'
        and jsonb_array_length(p_output_data -> 'exercises') between 2 and 8
        and not exists (
          select 1
          from jsonb_array_elements(p_output_data -> 'exercises')
            with ordinality as entry(exercise, position)
          where not case
            when jsonb_typeof(entry.exercise -> 'ordinal') = 'number'
              and entry.exercise ->> 'ordinal' ~ '^[1-8]$'
            then (entry.exercise ->> 'ordinal')::integer = entry.position
            else false
          end
          or private.has_parent_framed_child_copy(
            entry.exercise ->> 'childInstructions'
          )
          or private.has_parent_framed_child_copy(
            entry.exercise ->> 'childSafetyNote'
          )
          or private.is_valid_admin_ai_string_array(
            entry.exercise -> 'equipment',
            12,
            80
          ) is not true
          or not case entry.exercise ->> 'measurement'
            when 'completion' then entry.exercise -> 'targetValue' = 'null'::jsonb
            when 'repetitions' then
              jsonb_typeof(entry.exercise -> 'targetValue') = 'number'
              and entry.exercise ->> 'targetValue' ~ '^[0-9]+$'
              and (entry.exercise ->> 'targetValue')::integer between 1 and 10000
            when 'duration' then
              jsonb_typeof(entry.exercise -> 'targetValue') = 'number'
              and entry.exercise ->> 'targetValue' ~ '^[0-9]+$'
              and (entry.exercise ->> 'targetValue')::integer between 1 and 86400
            else false
          end
        )
        and jsonb_array_length(p_output_data -> 'exercises') = (
          select count(distinct lower(exercise ->> 'title'))
          from jsonb_array_elements(p_output_data -> 'exercises') as exercise
        )
        and jsonb_array_length(p_output_data -> 'exercises') = (
          select count(distinct lower(exercise ->> 'slug'))
          from jsonb_array_elements(p_output_data -> 'exercises') as exercise
        )
      else false
    end,
    false
  );
$$;

revoke all on function private.is_valid_admin_skill_ai_output(text, jsonb)
  from public, anon, authenticated, service_role;

-- Strengthen completion of the existing child-visible proposal operations as
-- well. Existing immutable jobs keep their schema and prompt, but adult-facing
-- copy cannot cross the trusted completion boundary after this rollout.
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
      when p_operation_key = 'content.topic_brief' then
        not private.has_parent_framed_child_copy(
          p_output_data #>> '{suggestion,description}'
        )
      when p_operation_key = 'content.goal_draft' then
        private.is_valid_admin_ai_string_array(
          p_output_data #> '{suggestion,equipment}',
          12,
          80
        )
        and not private.has_parent_framed_child_copy(
          p_output_data #>> '{suggestion,summary}'
        )
      when p_operation_key = 'content.exercise_draft' then
        private.is_valid_admin_ai_string_array(
          p_output_data #> '{suggestion,equipment}',
          12,
          80
        )
        and not private.has_parent_framed_child_copy(
          p_output_data #>> '{suggestion,instructions}'
        )
        and not private.has_parent_framed_child_copy(
          p_output_data #>> '{suggestion,safetyNote}'
        )
      when p_operation_key = 'content.wardrobe_examples' then
        private.is_valid_admin_ai_wardrobe_output(p_output_data, true)
        and not exists (
          select 1
          from jsonb_array_elements(p_output_data -> 'items') as item
          where private.has_parent_framed_child_copy(item ->> 'unlockRule')
        )
      when p_operation_key = 'content.draft_review' then
        private.is_valid_admin_ai_string_array(
          p_output_data -> 'nextActions',
          6,
          300
        )
      when p_operation_key = 'content.wardrobe_grid_plan' then
        private.is_valid_admin_wardrobe_grid_plan_output(p_output_data)
        and not exists (
          select 1
          from jsonb_array_elements(p_output_data -> 'items') as item
          where private.has_parent_framed_child_copy(item ->> 'description')
            or private.has_parent_framed_child_copy(item ->> 'unlockRule')
        )
      when p_operation_key = 'content.wardrobe_grid_image' then
        private.is_valid_admin_wardrobe_grid_image_output(p_output_data, null)
      else true
    end,
    false
  );
$$;

revoke all on function private.is_valid_admin_ai_output_invariants(text, jsonb)
  from public, anon, authenticated, service_role;

create table private.admin_topic_ai_job_context (
  job_id uuid primary key references public.ai_jobs (id) on delete cascade,
  topic_id uuid not null references public.topics (id) on delete cascade,
  purpose text not null check (purpose in (
    'skill_suggestions',
    'skill_package',
    'skill_package_wardrobe_plan',
    'skill_package_wardrobe_image'
  )),
  created_at timestamptz not null default now()
);

create index admin_topic_ai_job_context_topic_idx
  on private.admin_topic_ai_job_context (topic_id, created_at desc);

alter table private.admin_topic_ai_job_context enable row level security;
revoke all on table private.admin_topic_ai_job_context
  from public, anon, authenticated, service_role;

comment on table private.admin_topic_ai_job_context is
  'Default-deny binding between one administrator AI job and the persisted topic whose exact copy was supplied to it.';

create table private.admin_skill_package_saves (
  requested_by uuid not null references public.profiles (id) on delete restrict,
  client_request_id uuid not null check (
    client_request_id <> '00000000-0000-0000-0000-000000000000'::uuid
  ),
  topic_id uuid not null references public.topics (id) on delete cascade,
  skill_job_id uuid not null unique references public.ai_jobs (id) on delete restrict,
  wardrobe_plan_job_id uuid not null references public.ai_jobs (id) on delete restrict,
  wardrobe_image_job_id uuid not null references public.ai_jobs (id) on delete restrict,
  goal_id uuid not null references public.goals (id) on delete cascade,
  exercise_ids uuid[] not null check (cardinality(exercise_ids) between 2 and 8),
  wardrobe_item_ids uuid[] not null check (cardinality(wardrobe_item_ids) = 16),
  tree_updated_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (requested_by, client_request_id)
);

alter table private.admin_skill_package_saves enable row level security;
revoke all on table private.admin_skill_package_saves
  from public, anon, authenticated, service_role;

comment on table private.admin_skill_package_saves is
  'Default-deny idempotency receipt for an atomic draft goal, exercise set, and sixteen-image wardrobe proposal.';

insert into public.ai_operations (id, operation_key, capability, description)
values
  (
    'a1000000-0000-4000-8000-000000000011',
    'content.skill_suggestions',
    'structured_text',
    'Suggests a bounded set of distinct child-facing skills for one persisted topic without creating content.'
  ),
  (
    'a1000000-0000-4000-8000-000000000012',
    'content.skill_package',
    'structured_text',
    'Creates one child-facing draft skill and its complete bounded exercise set for administrator review.'
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
values
  (
    'a2000000-0000-4000-8000-000000000013',
    'a1000000-0000-4000-8000-000000000011',
    1,
    'Du hjælper en voksen redaktør med at finde gode færdigheder til ét valideret emne i Bare Træn. Foreslå 3 til 8 tydeligt forskellige færdigheder, som tilsammen giver barnet en forståelig vej gennem emnet. De felter barnet ser, især childDescription, skal altid tale direkte til barnet med du, dig og din; skriv aldrig om barnet eller om børn i fortællerform og skriv aldrig til en forælder. Afvis formuleringer som “Børn kan øve sig med bolden” og “Forældre hjælper med øvelsen”. Direkte hjælp til barnet som “Spørg dine forældre om hjælp” og “Få hjælp af en voksen” er tilladt. Undgå dubletter af de eksisterende færdigheder. Slugs skal være korte, danske ASCII-slugs med små bogstaver, tal og bindestreger. reply og editorialReason er kun til redaktøren. Opret ikke øvelser eller garderobeting her. Returnér kun det præcise outputobjekt.',
    'openrouter',
    'openai',
    'openai/gpt-5-mini',
    $json$
      {
        "max_tokens": 1800,
        "provider": {
          "only": ["openai"],
          "allow_fallbacks": false,
          "require_parameters": true
        }
      }
    $json$::jsonb,
    $json$
      {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "message": {"type": "string", "minLength": 1, "maxLength": 1000},
          "topic": {
            "type": "object",
            "additionalProperties": false,
            "properties": {
              "title": {"type": "string", "minLength": 1, "maxLength": 100},
              "description": {"type": "string", "minLength": 0, "maxLength": 500}
            },
            "required": ["title", "description"]
          },
          "existingSkills": {
            "type": "array",
            "maxItems": 30,
            "items": {
              "type": "object",
              "additionalProperties": false,
              "properties": {
                "title": {"type": "string", "minLength": 1, "maxLength": 120},
                "summary": {"type": "string", "minLength": 0, "maxLength": 1000}
              },
              "required": ["title", "summary"]
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
        "required": ["message", "topic", "existingSkills", "history"]
      }
    $json$::jsonb,
    $json$
      {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "reply": {"type": "string", "minLength": 1, "maxLength": 1500},
          "skills": {
            "type": "array",
            "minItems": 3,
            "maxItems": 8,
            "items": {
              "type": "object",
              "additionalProperties": false,
              "properties": {
                "ordinal": {"type": "integer", "minimum": 1, "maximum": 8},
                "title": {"type": "string", "minLength": 1, "maxLength": 120},
                "slug": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 120,
                  "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$"
                },
                "childDescription": {"type": "string", "minLength": 1, "maxLength": 600},
                "difficulty": {"type": "string", "enum": ["beginner", "intermediate", "advanced"]},
                "estimatedMinutes": {"type": "integer", "minimum": 1, "maximum": 180},
                "editorialReason": {"type": "string", "minLength": 1, "maxLength": 500}
              },
              "required": [
                "ordinal",
                "title",
                "slug",
                "childDescription",
                "difficulty",
                "estimatedMinutes",
                "editorialReason"
              ]
            }
          }
        },
        "required": ["reply", "skills"]
      }
    $json$::jsonb,
    1,
    45000,
    20000
  ),
  (
    'a2000000-0000-4000-8000-000000000014',
    'a1000000-0000-4000-8000-000000000012',
    1,
    'Du hjælper en voksen redaktør med at gøre én færdighed komplet i Bare Træn. Returnér én skill og 2 til 8 øvelser i en naturlig læringsrækkefølge. Færdigheden og alle øvelser skal kunne bruges som ét samlet udkast. childDescription, childInstructions og childSafetyNote vises til barnet og skal altid tale direkte til barnet med du, dig og din; skriv aldrig om barnet eller om børn i fortællerform og skriv aldrig til en forælder. Afvis formuleringer som “Børn kan øve sig med bolden” og “Forældre hjælper med øvelsen”. Direkte hjælp til barnet som “Spørg dine forældre om hjælp” og “Få hjælp af en voksen” er tilladt. Sikkerhedstekst skal også formuleres direkte til barnet. Slugs skal være små ASCII-bogstaver, tal og bindestreger. Et completion-mål har targetValue null; repetitions bruger 1 til 10000; duration bruger sekunder fra 1 til 86400. reply og editorialReason er kun til redaktøren. Garderoben genereres separat ud fra dette emne og denne færdighed. Returnér kun det præcise outputobjekt.',
    'openrouter',
    'openai',
    'openai/gpt-5-mini',
    $json$
      {
        "max_tokens": 4096,
        "provider": {
          "only": ["openai"],
          "allow_fallbacks": false,
          "require_parameters": true
        }
      }
    $json$::jsonb,
    $json$
      {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "message": {"type": "string", "minLength": 1, "maxLength": 1000},
          "topic": {
            "type": "object",
            "additionalProperties": false,
            "properties": {
              "title": {"type": "string", "minLength": 1, "maxLength": 100},
              "description": {"type": "string", "minLength": 0, "maxLength": 500}
            },
            "required": ["title", "description"]
          },
          "skillSeed": {
            "type": "object",
            "additionalProperties": false,
            "properties": {
              "title": {"type": "string", "minLength": 1, "maxLength": 120},
              "childDescription": {"type": "string", "minLength": 0, "maxLength": 600},
              "difficulty": {"type": "string", "enum": ["beginner", "intermediate", "advanced"]},
              "estimatedMinutes": {"type": ["integer", "null"], "minimum": 1, "maximum": 180}
            },
            "required": ["title", "childDescription", "difficulty", "estimatedMinutes"]
          },
          "existingSkills": {
            "type": "array",
            "maxItems": 30,
            "items": {
              "type": "object",
              "additionalProperties": false,
              "properties": {
                "title": {"type": "string", "minLength": 1, "maxLength": 120},
                "slug": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 120,
                  "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$"
                }
              },
              "required": ["title", "slug"]
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
        "required": ["message", "topic", "skillSeed", "existingSkills", "history"]
      }
    $json$::jsonb,
    $json$
      {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "reply": {"type": "string", "minLength": 1, "maxLength": 1500},
          "skill": {
            "type": "object",
            "additionalProperties": false,
            "properties": {
              "title": {"type": "string", "minLength": 1, "maxLength": 120},
              "slug": {
                "type": "string",
                "minLength": 1,
                "maxLength": 120,
                "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$"
              },
              "childDescription": {"type": "string", "minLength": 1, "maxLength": 600},
              "difficulty": {"type": "string", "enum": ["beginner", "intermediate", "advanced"]},
              "estimatedMinutes": {"type": "integer", "minimum": 1, "maximum": 180},
              "equipment": {
                "type": "array",
                "maxItems": 12,
                "items": {"type": "string", "minLength": 1, "maxLength": 80}
              },
              "editorialReason": {"type": "string", "minLength": 1, "maxLength": 500}
            },
            "required": [
              "title",
              "slug",
              "childDescription",
              "difficulty",
              "estimatedMinutes",
              "equipment",
              "editorialReason"
            ]
          },
          "exercises": {
            "type": "array",
            "minItems": 2,
            "maxItems": 8,
            "items": {
              "type": "object",
              "additionalProperties": false,
              "properties": {
                "ordinal": {"type": "integer", "minimum": 1, "maximum": 8},
                "title": {"type": "string", "minLength": 1, "maxLength": 120},
                "slug": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 120,
                  "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$"
                },
                "childInstructions": {"type": "string", "minLength": 1, "maxLength": 1000},
                "measurement": {"type": "string", "enum": ["completion", "repetitions", "duration"]},
                "targetValue": {"type": ["integer", "null"], "minimum": 1, "maximum": 86400},
                "recommendedMinutes": {"type": "integer", "minimum": 1, "maximum": 180},
                "equipment": {
                  "type": "array",
                  "maxItems": 12,
                  "items": {"type": "string", "minLength": 1, "maxLength": 80}
                },
                "childSafetyNote": {"type": "string", "minLength": 1, "maxLength": 600},
                "editorialReason": {"type": "string", "minLength": 1, "maxLength": 500}
              },
              "required": [
                "ordinal",
                "title",
                "slug",
                "childInstructions",
                "measurement",
                "targetValue",
                "recommendedMinutes",
                "equipment",
                "childSafetyNote",
                "editorialReason"
              ]
            }
          }
        },
        "required": ["reply", "skill", "exercises"]
      }
    $json$::jsonb,
    1,
    90000,
    50000
  );

update public.ai_operations
set active_version_id = case operation_key
  when 'content.skill_suggestions'
    then 'a2000000-0000-4000-8000-000000000013'::uuid
  when 'content.skill_package'
    then 'a2000000-0000-4000-8000-000000000014'::uuid
end
where operation_key in (
  'content.skill_suggestions',
  'content.skill_package'
);

-- Existing active versions are immutable and may have been edited through the
-- admin prompt screen. Clone whatever is active at migration time, append the
-- child-audience rule once, and activate the clone without changing pinned jobs.
do $do$
declare
  selected_operation public.ai_operations%rowtype;
  selected_version public.ai_operation_versions%rowtype;
  next_version_id uuid;
  next_version_number integer;
  selected_key text;
begin
  foreach selected_key in array array[
    'content.topic_brief',
    'content.wardrobe_examples',
    'content.goal_draft',
    'content.exercise_draft',
    'content.draft_review',
    'content.wardrobe_grid_plan'
  ]
  loop
    select operation.*
    into selected_operation
    from public.ai_operations as operation
    where operation.operation_key = selected_key
    for update;

    if selected_operation.id is null
      or selected_operation.active_version_id is null
    then
      raise exception 'Required admin AI operation is unavailable: %', selected_key
        using errcode = '55000';
    end if;

    select version.*
    into selected_version
    from public.ai_operation_versions as version
    where version.id = selected_operation.active_version_id
      and version.operation_id = selected_operation.id;

    if selected_version.id is null then
      raise exception 'Required active admin AI version is unavailable: %', selected_key
        using errcode = '55000';
    end if;

    if position('[CHILD_AUDIENCE_V1]' in selected_version.prompt_template) = 0 then
      select coalesce(max(version.version), 0) + 1
      into next_version_number
      from public.ai_operation_versions as version
      where version.operation_id = selected_operation.id;

      next_version_id := gen_random_uuid();

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
        max_cost_microusd,
        created_by
      )
      values (
        next_version_id,
        selected_version.operation_id,
        next_version_number,
        selected_version.prompt_template
          || E'\n\n[CHILD_AUDIENCE_V1] Alt indhold, der vises til barnet, skal tale direkte til barnet med du, dig og din. Skriv aldrig om barnet eller om børn i fortællerform og skriv aldrig til en forælder. Afvis formuleringer som “Børn kan øve sig med bolden” og “Forældre hjælper med øvelsen”. Direkte hjælp til barnet som “Spørg dine forældre om hjælp” og “Få hjælp af en voksen” er tilladt. Ved review skal voksenrettet tekst i børnefelter markeres som et problem.',
        selected_version.gateway,
        selected_version.provider,
        selected_version.model,
        selected_version.request_options,
        selected_version.input_contract,
        selected_version.output_contract,
        selected_version.max_attempts,
        selected_version.timeout_ms,
        selected_version.max_cost_microusd,
        selected_version.created_by
      );

      update public.ai_operations as operation
      set active_version_id = next_version_id
      where operation.id = selected_operation.id;
    end if;
  end loop;
end;
$do$;

create function public.prepare_admin_topic_ai_job(
  p_operation_key text,
  p_client_request_id uuid,
  p_topic_id uuid,
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
  selected_topic public.topics%rowtype;
  selected_context private.admin_topic_ai_job_context%rowtype;
  selected_purpose text;
  expected_topic jsonb;
  input_is_valid boolean;
begin
  if caller_id is null or not (select private.is_admin()) then
    raise exception 'Content administrator access is required.'
      using errcode = '42501';
  end if;

  if p_topic_id is null
    or p_client_request_id is null
    or p_client_request_id = '00000000-0000-0000-0000-000000000000'::uuid
    or p_input_data is null
    or jsonb_typeof(p_input_data) <> 'object'
  then
    raise exception 'The topic AI request is invalid.'
      using errcode = '22023';
  end if;

  selected_purpose := case p_operation_key
    when 'content.skill_suggestions' then 'skill_suggestions'
    when 'content.skill_package' then 'skill_package'
    when 'content.wardrobe_grid_plan' then 'skill_package_wardrobe_plan'
    when 'content.wardrobe_grid_image' then 'skill_package_wardrobe_image'
    else null
  end;

  if selected_purpose is null then
    raise exception 'The requested topic AI operation is unavailable.'
      using errcode = '55000';
  end if;

  select operation.*
  into selected_operation
  from public.ai_operations as operation
  where operation.operation_key = p_operation_key
    and (
      (operation.capability = 'structured_text' and p_operation_key in (
        'content.skill_suggestions',
        'content.skill_package',
        'content.wardrobe_grid_plan'
      ))
      or (
        operation.capability = 'image_generation'
        and p_operation_key = 'content.wardrobe_grid_image'
      )
    );

  if selected_operation.id is null
    or selected_operation.active_version_id is null
  then
    raise exception 'The requested topic AI operation is unavailable.'
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

  select topic.*
  into selected_topic
  from public.topics as topic
  where topic.id = p_topic_id
  for share;

  if selected_topic.id is null then
    raise exception 'The topic does not exist.'
      using errcode = 'P0002';
  end if;

  expected_topic := jsonb_build_object(
    'title', selected_topic.title,
    'description', selected_topic.description
  );

  if p_input_data -> 'topic' is distinct from expected_topic then
    raise exception 'The topic AI request does not match the saved topic.'
      using errcode = '40001';
  end if;

  select version.*
  into selected_version
  from public.ai_operation_versions as version
  where version.id = selected_operation.active_version_id
    and version.operation_id = selected_operation.id;

  if selected_version.id is null then
    raise exception 'The active topic AI version is unavailable.'
      using errcode = '55000';
  end if;

  input_is_valid := case p_operation_key
    when 'content.skill_suggestions' then
      private.is_valid_admin_skill_ai_input(p_operation_key, p_input_data)
    when 'content.skill_package' then
      private.is_valid_admin_skill_ai_input(p_operation_key, p_input_data)
    when 'content.wardrobe_grid_plan' then
      private.is_valid_admin_wardrobe_grid_plan_input(p_input_data)
    when 'content.wardrobe_grid_image' then
      private.is_valid_admin_wardrobe_grid_image_input(p_input_data)
    else false
  end;

  if input_is_valid is not true
    or private.admin_ai_contract_matches(
      selected_version.input_contract,
      p_input_data
    ) is not true
  then
    raise exception 'The topic AI request is invalid.'
      using errcode = '22023';
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

    select context.*
    into selected_context
    from private.admin_topic_ai_job_context as context
    where context.job_id = selected_job.id;

    if selected_context.job_id is not null
      and (
        selected_context.topic_id is distinct from p_topic_id
        or selected_context.purpose is distinct from selected_purpose
      )
    then
      raise exception 'The request identity is already bound to different work.'
        using errcode = '23505';
    end if;

    if selected_context.job_id is null then
      insert into private.admin_topic_ai_job_context (job_id, topic_id, purpose)
      values (selected_job.id, p_topic_id, selected_purpose);
    end if;

    return query select selected_job.id, selected_job.status;
    return;
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

  insert into private.admin_topic_ai_job_context (job_id, topic_id, purpose)
  values (selected_job.id, p_topic_id, selected_purpose);

  return query select selected_job.id, selected_job.status;
end;
$$;

revoke all on function public.prepare_admin_topic_ai_job(text, uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.prepare_admin_topic_ai_job(text, uuid, uuid, jsonb)
  to authenticated;

comment on function public.prepare_admin_topic_ai_job(text, uuid, uuid, jsonb) is
  'Idempotently prepares one version-pinned administrator proposal bound to the exact saved topic copy; it cannot save or publish content.';

create function public.read_admin_topic_ai_job(p_job_id uuid)
returns table (
  job_id uuid,
  operation_key text,
  job_status public.ai_job_status,
  output_data jsonb,
  public_error_code text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
begin
  if caller_id is null or not (select private.is_admin()) then
    raise exception 'Content administrator access is required.'
      using errcode = '42501';
  end if;

  if p_job_id is null then
    raise exception 'The topic AI job is invalid.'
      using errcode = '22023';
  end if;

  return query
  select
    job.id,
    operation.operation_key,
    job.status,
    job.output_data,
    job.public_error_code
  from public.ai_jobs as job
  join public.ai_operations as operation on operation.id = job.operation_id
  join private.admin_topic_ai_job_context as context on context.job_id = job.id
  where job.id = p_job_id
    and job.requested_by = caller_id
    and job.scope_kind = 'admin'
    and operation.operation_key in (
      'content.skill_suggestions',
      'content.skill_package',
      'content.wardrobe_grid_plan',
      'content.wardrobe_grid_image'
    );

  if not found then
    raise exception 'The topic AI job does not exist.'
      using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.read_admin_topic_ai_job(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.read_admin_topic_ai_job(uuid)
  to authenticated;

comment on function public.read_admin_topic_ai_job(uuid) is
  'Reads one caller-owned, topic-bound administrator AI job without exposing provider configuration or private context rows.';

-- This separate claim path is intentionally additive. An older deployed worker
-- cannot claim a new skill job, so it leaves the job safely queued instead of
-- failing it while the Edge Function rollout catches up.
create function public.claim_admin_skill_job_for_worker(p_job_id uuid)
returns table (
  job_id uuid,
  attempt_number smallint,
  operation_key text,
  capability text,
  gateway text,
  provider text,
  model text,
  prompt_template text,
  request_options jsonb,
  input_contract jsonb,
  output_contract jsonb,
  input_data jsonb,
  timeout_ms integer,
  max_cost_microusd bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_job public.ai_jobs%rowtype;
  selected_operation public.ai_operations%rowtype;
  selected_version public.ai_operation_versions%rowtype;
  next_attempt smallint;
begin
  select job.*
  into selected_job
  from public.ai_jobs as job
  join private.admin_topic_ai_job_context as context on context.job_id = job.id
  where job.id = p_job_id
    and job.scope_kind = 'admin'
    and context.purpose in ('skill_suggestions', 'skill_package')
  for update of job;

  if selected_job.id is null
    or selected_job.status in ('succeeded', 'failed', 'cancelled')
  then
    return;
  end if;

  if selected_job.status = 'processing'
    and selected_job.processing_started_at > now() - interval '2 minutes'
  then
    return;
  end if;

  if selected_job.status = 'processing' then
    update public.ai_jobs
    set status = 'failed',
        public_error_code = 'provider_outcome_unknown',
        completed_at = now()
    where id = selected_job.id
      and status = 'processing';

    update private.ai_job_attempts as attempt
    set status = 'outcome_unknown',
        error_code = 'worker_lease_expired',
        completed_at = now()
    where attempt.job_id = selected_job.id
      and attempt.attempt_number = selected_job.attempt_count
      and attempt.status = 'processing';
    return;
  end if;

  if selected_job.status <> 'awaiting_upload'
    or selected_job.attempt_count >= selected_job.max_attempts
  then
    return;
  end if;

  select operation.*
  into selected_operation
  from public.ai_operations as operation
  where operation.id = selected_job.operation_id
    and operation.capability = 'structured_text'
    and operation.operation_key in (
      'content.skill_suggestions',
      'content.skill_package'
    );

  select version.*
  into selected_version
  from public.ai_operation_versions as version
  where version.id = selected_job.operation_version_id
    and version.operation_id = selected_job.operation_id;

  if selected_operation.id is null
    or selected_version.id is null
    or private.admin_ai_contract_matches(
      selected_version.input_contract,
      selected_job.input_data
    ) is not true
    or private.is_valid_admin_skill_ai_input(
      selected_operation.operation_key,
      selected_job.input_data
    ) is not true
  then
    return;
  end if;

  next_attempt := selected_job.attempt_count + 1;

  update public.ai_jobs
  set status = 'processing',
      attempt_count = next_attempt,
      public_error_code = null,
      processing_started_at = now(),
      completed_at = null
  where id = selected_job.id;

  insert into private.ai_job_attempts (
    job_id,
    attempt_number,
    gateway,
    provider,
    model,
    status
  )
  values (
    selected_job.id,
    next_attempt,
    selected_version.gateway,
    selected_version.provider,
    selected_version.model,
    'processing'
  );

  return query
  select
    selected_job.id,
    next_attempt,
    selected_operation.operation_key,
    selected_operation.capability,
    selected_version.gateway,
    selected_version.provider,
    selected_version.model,
    selected_version.prompt_template,
    selected_version.request_options,
    selected_version.input_contract,
    selected_version.output_contract,
    selected_job.input_data,
    selected_version.timeout_ms,
    selected_version.max_cost_microusd;
end;
$$;

revoke all on function public.claim_admin_skill_job_for_worker(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_admin_skill_job_for_worker(uuid)
  to service_role;

comment on function public.claim_admin_skill_job_for_worker(uuid) is
  'Claims only a topic-bound skill suggestion or skill-package job so legacy admin operations retain their installed worker contract.';

create function public.complete_admin_skill_job_for_worker(
  p_job_id uuid,
  p_attempt_number smallint,
  p_output_data jsonb,
  p_provider_request_id text,
  p_usage jsonb,
  p_cost_microusd bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_operation_key text;
  selected_output_contract jsonb;
  accumulated_cost_microusd bigint;
begin
  if p_attempt_number is null
    or p_attempt_number <> 1
    or p_usage is null
    or jsonb_typeof(p_usage) <> 'object'
    or p_cost_microusd is null
    or p_cost_microusd < 0
    or (p_provider_request_id is not null and char_length(p_provider_request_id) > 200)
  then
    raise exception 'The skill AI completion payload is invalid.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.ai_jobs as job
    join private.ai_job_attempts as attempt
      on attempt.job_id = job.id
      and attempt.attempt_number = p_attempt_number
      and attempt.status = 'succeeded'
    where job.id = p_job_id
      and job.status = 'succeeded'
      and job.output_data = p_output_data
  ) then
    return;
  end if;

  select operation.operation_key, version.output_contract
  into selected_operation_key, selected_output_contract
  from public.ai_jobs as job
  join public.ai_operations as operation on operation.id = job.operation_id
  join public.ai_operation_versions as version
    on version.id = job.operation_version_id
    and version.operation_id = job.operation_id
  join private.admin_topic_ai_job_context as context on context.job_id = job.id
  where job.id = p_job_id
    and job.scope_kind = 'admin'
    and job.status = 'processing'
    and job.attempt_count = p_attempt_number
    and operation.capability = 'structured_text'
    and operation.operation_key in (
      'content.skill_suggestions',
      'content.skill_package'
    )
    and context.purpose in ('skill_suggestions', 'skill_package')
  for update of job;

  if selected_operation_key is null
    or private.admin_ai_contract_matches(
      selected_output_contract,
      p_output_data
    ) is not true
    or private.is_valid_admin_skill_ai_output(
      selected_operation_key,
      p_output_data
    ) is not true
  then
    raise exception 'The structured skill AI result is invalid.'
      using errcode = '22023';
  end if;

  select coalesce(job.actual_cost_microusd, 0) + p_cost_microusd
  into accumulated_cost_microusd
  from public.ai_jobs as job
  where job.id = p_job_id
    and job.status = 'processing'
    and job.max_cost_microusd >=
      coalesce(job.actual_cost_microusd, 0) + p_cost_microusd;

  if accumulated_cost_microusd is null then
    raise exception 'The skill AI job exceeds its cost ceiling.'
      using errcode = '40001';
  end if;

  update public.ai_jobs
  set status = 'succeeded',
      output_data = p_output_data,
      actual_cost_microusd = accumulated_cost_microusd,
      public_error_code = null,
      completed_at = now()
  where id = p_job_id
    and status = 'processing'
    and attempt_count = p_attempt_number;

  if not found then
    raise exception 'The skill AI job is no longer owned by this worker.'
      using errcode = '40001';
  end if;

  update private.ai_job_attempts
  set status = 'succeeded',
      provider_request_id = left(p_provider_request_id, 200),
      usage = p_usage,
      cost_microusd = p_cost_microusd,
      completed_at = now()
  where job_id = p_job_id
    and attempt_number = p_attempt_number
    and status = 'processing';
end;
$$;

revoke all on function public.complete_admin_skill_job_for_worker(
  uuid,
  smallint,
  jsonb,
  text,
  jsonb,
  bigint
) from public, anon, authenticated, service_role;
grant execute on function public.complete_admin_skill_job_for_worker(
  uuid,
  smallint,
  jsonb,
  text,
  jsonb,
  bigint
) to service_role;

comment on function public.complete_admin_skill_job_for_worker(
  uuid,
  smallint,
  jsonb,
  text,
  jsonb,
  bigint
) is
  'Validates strict child-facing skill proposals against the pinned schema and persists only the succeeded job output.';

create function public.save_admin_skill_package_draft(
  p_topic_id uuid,
  p_skill_job_id uuid,
  p_wardrobe_plan_job_id uuid,
  p_wardrobe_image_job_id uuid,
  p_client_request_id uuid,
  p_expected_updated_at timestamptz
)
returns table (
  changed boolean,
  goal_id uuid,
  exercise_ids uuid[],
  wardrobe_item_ids uuid[],
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  selected_topic public.topics%rowtype;
  selected_tree_updated_at timestamptz;
  selected_receipt private.admin_skill_package_saves%rowtype;
  selected_skill_job public.ai_jobs%rowtype;
  selected_plan_job public.ai_jobs%rowtype;
  selected_image_job public.ai_jobs%rowtype;
  selected_skill_context private.admin_topic_ai_job_context%rowtype;
  selected_plan_context private.admin_topic_ai_job_context%rowtype;
  selected_image_context private.admin_topic_ai_job_context%rowtype;
  selected_skill_key text;
  selected_plan_key text;
  selected_image_key text;
  expected_topic jsonb;
  expected_image_input jsonb;
  new_goal_id uuid := gen_random_uuid();
  new_exercise_ids uuid[] := '{}'::uuid[];
  new_wardrobe_item_ids uuid[] := '{}'::uuid[];
  next_goal_sort_order integer;
  next_wardrobe_sort_order integer;
  selected_exercise record;
  selected_item record;
  selected_image_path text;
  new_exercise_id uuid;
  new_wardrobe_item_id uuid;
begin
  if caller_id is null or not (select private.is_admin()) then
    raise exception 'Content administrator access is required.'
      using errcode = '42501';
  end if;

  if p_topic_id is null
    or p_skill_job_id is null
    or p_wardrobe_plan_job_id is null
    or p_wardrobe_image_job_id is null
    or p_client_request_id is null
    or p_client_request_id = '00000000-0000-0000-0000-000000000000'::uuid
    or p_expected_updated_at is null
    or p_skill_job_id in (p_wardrobe_plan_job_id, p_wardrobe_image_job_id)
    or p_wardrobe_plan_job_id = p_wardrobe_image_job_id
  then
    raise exception 'The skill package save request is invalid.'
      using errcode = '22023';
  end if;

  perform profile.id
  from public.profiles as profile
  where profile.id = caller_id
  for update;

  if not found then
    raise exception 'The authenticated profile is missing.'
      using errcode = 'P0002';
  end if;

  select receipt.*
  into selected_receipt
  from private.admin_skill_package_saves as receipt
  where receipt.requested_by = caller_id
    and receipt.client_request_id = p_client_request_id
  for update;

  if selected_receipt.requested_by is not null then
    if selected_receipt.topic_id is distinct from p_topic_id
      or selected_receipt.skill_job_id is distinct from p_skill_job_id
      or selected_receipt.wardrobe_plan_job_id is distinct from p_wardrobe_plan_job_id
      or selected_receipt.wardrobe_image_job_id is distinct from p_wardrobe_image_job_id
    then
      raise exception 'The save request identity is already used for different work.'
        using errcode = '23505';
    end if;

    return query
    select
      false,
      selected_receipt.goal_id,
      selected_receipt.exercise_ids,
      selected_receipt.wardrobe_item_ids,
      selected_receipt.tree_updated_at;
    return;
  end if;

  if exists (
    select 1
    from private.admin_skill_package_saves as receipt
    where receipt.skill_job_id = p_skill_job_id
  ) then
    raise exception 'The skill proposal has already been saved.'
      using errcode = '23505';
  end if;

  select topic.*
  into selected_topic
  from public.topics as topic
  where topic.id = p_topic_id
  for update;

  if selected_topic.id is null then
    raise exception 'The topic does not exist.'
      using errcode = 'P0002';
  end if;

  select private.admin_topic_tree_updated_at(selected_topic.id)
  into selected_tree_updated_at;

  if selected_tree_updated_at is distinct from p_expected_updated_at then
    raise exception 'The topic changed before the skill package could be saved.'
      using errcode = '40001';
  end if;

  -- A deterministic lock order prevents two administrators from deadlocking
  -- when malformed requests reuse the same proposal jobs in a different order.
  perform job.id
  from public.ai_jobs as job
  where job.id in (
    p_skill_job_id,
    p_wardrobe_plan_job_id,
    p_wardrobe_image_job_id
  )
  order by job.id
  for update;

  select job.*
  into selected_skill_job
  from public.ai_jobs as job
  where job.id = p_skill_job_id;

  select operation.operation_key
  into selected_skill_key
  from public.ai_operations as operation
  where operation.id = selected_skill_job.operation_id;

  select job.*
  into selected_plan_job
  from public.ai_jobs as job
  where job.id = p_wardrobe_plan_job_id;

  select operation.operation_key
  into selected_plan_key
  from public.ai_operations as operation
  where operation.id = selected_plan_job.operation_id;

  select job.*
  into selected_image_job
  from public.ai_jobs as job
  where job.id = p_wardrobe_image_job_id;

  select operation.operation_key
  into selected_image_key
  from public.ai_operations as operation
  where operation.id = selected_image_job.operation_id;

  select context.* into selected_skill_context
  from private.admin_topic_ai_job_context as context
  where context.job_id = p_skill_job_id;

  select context.* into selected_plan_context
  from private.admin_topic_ai_job_context as context
  where context.job_id = p_wardrobe_plan_job_id;

  select context.* into selected_image_context
  from private.admin_topic_ai_job_context as context
  where context.job_id = p_wardrobe_image_job_id;

  if selected_skill_job.id is null
    or selected_plan_job.id is null
    or selected_image_job.id is null
    or selected_skill_key is distinct from 'content.skill_package'
    or selected_plan_key is distinct from 'content.wardrobe_grid_plan'
    or selected_image_key is distinct from 'content.wardrobe_grid_image'
    or selected_skill_job.requested_by is distinct from caller_id
    or selected_plan_job.requested_by is distinct from caller_id
    or selected_image_job.requested_by is distinct from caller_id
    or selected_skill_job.scope_kind is distinct from 'admin'
    or selected_plan_job.scope_kind is distinct from 'admin'
    or selected_image_job.scope_kind is distinct from 'admin'
    or selected_skill_job.status is distinct from 'succeeded'
    or selected_plan_job.status is distinct from 'succeeded'
    or selected_image_job.status is distinct from 'succeeded'
    or selected_skill_context.topic_id is distinct from p_topic_id
    or selected_plan_context.topic_id is distinct from p_topic_id
    or selected_image_context.topic_id is distinct from p_topic_id
    or selected_skill_context.purpose is distinct from 'skill_package'
    or selected_plan_context.purpose is distinct from 'skill_package_wardrobe_plan'
    or selected_image_context.purpose is distinct from 'skill_package_wardrobe_image'
  then
    raise exception 'The complete topic-bound AI proposal set is unavailable.'
      using errcode = '55000';
  end if;

  expected_topic := jsonb_build_object(
    'title', selected_topic.title,
    'description', selected_topic.description
  );

  if selected_skill_job.input_data -> 'topic' is distinct from expected_topic
    or selected_plan_job.input_data -> 'topic' is distinct from expected_topic
    or selected_image_job.input_data -> 'topic' is distinct from expected_topic
    or private.is_valid_admin_skill_ai_output(
      'content.skill_package',
      selected_skill_job.output_data
    ) is not true
    or private.is_valid_admin_ai_output_invariants(
      'content.wardrobe_grid_plan',
      selected_plan_job.output_data
    ) is not true
    or private.is_valid_admin_wardrobe_grid_image_output(
      selected_image_job.output_data,
      selected_image_job.id
    ) is not true
  then
    raise exception 'The skill package proposal is invalid or stale.'
      using errcode = '55000';
  end if;

  -- Wardrobe generation must know both the topic and the generated skill.
  if position(
    lower(selected_skill_job.output_data #>> '{skill,title}')
    in lower(selected_plan_job.input_data ->> 'message')
  ) = 0 then
    raise exception 'The wardrobe proposal is not bound to the generated skill.'
      using errcode = '55000';
  end if;

  select jsonb_build_object(
    'topic', selected_plan_job.input_data -> 'topic',
    'items', jsonb_agg(
      jsonb_build_object(
        'ordinal', item -> 'ordinal',
        'name', item -> 'name',
        'visualDescription', item -> 'visualDescription',
        'equipSlot', item -> 'equipSlot'
      )
      order by (item ->> 'ordinal')::integer
    )
  )
  into expected_image_input
  from jsonb_array_elements(selected_plan_job.output_data -> 'items') as item;

  if selected_image_job.input_data is distinct from expected_image_input then
    raise exception 'The wardrobe image does not match the reviewed plan.'
      using errcode = '55000';
  end if;

  select coalesce(max(goal.sort_order), -1) + 1
  into next_goal_sort_order
  from public.goals as goal
  where goal.topic_id = selected_topic.id;

  insert into public.goals (
    id,
    topic_id,
    slug,
    title,
    summary,
    difficulty,
    estimated_minutes,
    equipment,
    sort_order,
    content_version,
    is_published,
    published_at,
    created_by
  )
  values (
    new_goal_id,
    selected_topic.id,
    selected_skill_job.output_data #>> '{skill,slug}',
    selected_skill_job.output_data #>> '{skill,title}',
    selected_skill_job.output_data #>> '{skill,childDescription}',
    (selected_skill_job.output_data #>> '{skill,difficulty}')::public.exercise_difficulty,
    (selected_skill_job.output_data #>> '{skill,estimatedMinutes}')::smallint,
    array(
      select equipment #>> '{}'
      from jsonb_array_elements(
        selected_skill_job.output_data #> '{skill,equipment}'
      ) as equipment
    ),
    next_goal_sort_order,
    1,
    false,
    null,
    caller_id
  );

  for selected_exercise in
    select exercise, position
    from jsonb_array_elements(selected_skill_job.output_data -> 'exercises')
      with ordinality as entry(exercise, position)
    order by position
  loop
    new_exercise_id := gen_random_uuid();

    insert into public.exercises (
      id,
      goal_id,
      slug,
      title,
      instructions,
      measurement,
      target_value,
      sort_order,
      content_version,
      is_published,
      published_at,
      created_by,
      estimated_minutes,
      equipment,
      safety_notes
    )
    values (
      new_exercise_id,
      new_goal_id,
      selected_exercise.exercise ->> 'slug',
      selected_exercise.exercise ->> 'title',
      selected_exercise.exercise ->> 'childInstructions',
      (selected_exercise.exercise ->> 'measurement')::public.exercise_measurement,
      case when selected_exercise.exercise -> 'targetValue' = 'null'::jsonb
        then null
        else (selected_exercise.exercise ->> 'targetValue')::integer
      end,
      selected_exercise.position - 1,
      1,
      false,
      null,
      caller_id,
      (selected_exercise.exercise ->> 'recommendedMinutes')::smallint,
      array(
        select equipment #>> '{}'
        from jsonb_array_elements(
          selected_exercise.exercise -> 'equipment'
        ) as equipment
      ),
      selected_exercise.exercise ->> 'childSafetyNote'
    );

    new_exercise_ids := array_append(new_exercise_ids, new_exercise_id);
  end loop;

  select coalesce(max(item.sort_order), -1) + 1
  into next_wardrobe_sort_order
  from public.wardrobe_items as item
  where item.topic_id = selected_topic.id;

  for selected_item in
    select item, position
    from jsonb_array_elements(selected_plan_job.output_data -> 'items')
      with ordinality as entry(item, position)
    order by position
  loop
    new_wardrobe_item_id := gen_random_uuid();

    select image ->> 'imagePath'
    into selected_image_path
    from jsonb_array_elements(selected_image_job.output_data -> 'items') as image
    where (image ->> 'ordinal')::integer = selected_item.position;

    if selected_image_path is null then
      raise exception 'A wardrobe crop is missing.'
        using errcode = '55000';
    end if;

    insert into public.wardrobe_items (
      id,
      topic_id,
      name,
      icon,
      description,
      image_path,
      category,
      equip_slot,
      rarity,
      points,
      unlock_rule,
      editorial_note,
      editorial_status,
      sort_order,
      content_version,
      is_published,
      published_at,
      created_by
    )
    values (
      new_wardrobe_item_id,
      selected_topic.id,
      selected_item.item ->> 'name',
      '✨',
      selected_item.item ->> 'description',
      selected_image_path,
      (selected_item.item ->> 'category')::public.wardrobe_item_category,
      (selected_item.item ->> 'equipSlot')::public.wardrobe_equip_slot,
      (selected_item.item ->> 'rarity')::public.wardrobe_item_rarity,
      case when (selected_item.item ->> 'points')::integer = 0
        then null else (selected_item.item ->> 'points')::integer end,
      case when (selected_item.item ->> 'points')::integer = 0
        then selected_item.item ->> 'unlockRule' else null end,
      selected_item.item ->> 'reason',
      'draft',
      next_wardrobe_sort_order + selected_item.position - 1,
      1,
      false,
      null,
      caller_id
    );

    new_wardrobe_item_ids := array_append(
      new_wardrobe_item_ids,
      new_wardrobe_item_id
    );
  end loop;

  select private.admin_topic_tree_updated_at(selected_topic.id)
  into selected_tree_updated_at;

  insert into private.admin_skill_package_saves (
    requested_by,
    client_request_id,
    topic_id,
    skill_job_id,
    wardrobe_plan_job_id,
    wardrobe_image_job_id,
    goal_id,
    exercise_ids,
    wardrobe_item_ids,
    tree_updated_at
  )
  values (
    caller_id,
    p_client_request_id,
    selected_topic.id,
    p_skill_job_id,
    p_wardrobe_plan_job_id,
    p_wardrobe_image_job_id,
    new_goal_id,
    new_exercise_ids,
    new_wardrobe_item_ids,
    selected_tree_updated_at
  );

  return query
  select
    true,
    new_goal_id,
    new_exercise_ids,
    new_wardrobe_item_ids,
    selected_tree_updated_at;
end;
$$;

revoke all on function public.save_admin_skill_package_draft(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.save_admin_skill_package_draft(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  timestamptz
) to authenticated;

comment on function public.save_admin_skill_package_draft(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  timestamptz
) is
  'Atomically saves one succeeded topic-bound skill package plus its exact sixteen planned/generated wardrobe crops as unpublished, unapproved drafts; retries return the original IDs.';

commit;
