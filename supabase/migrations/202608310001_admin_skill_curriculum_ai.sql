begin;

-- A curriculum job is deliberately separate from the existing one-skill job.
-- This keeps old clients and workers safe while the batch planner rolls out.

create function private.is_valid_admin_skill_curriculum_input(p_input_data jsonb)
returns boolean
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  selected_skill_count integer;
  selected_exercises_per_skill integer;
begin
  if p_input_data is null
    or jsonb_typeof(p_input_data) <> 'object'
    or jsonb_typeof(p_input_data -> 'existingSkills') <> 'array'
    or jsonb_typeof(p_input_data -> 'skillCount') <> 'number'
    or jsonb_typeof(p_input_data -> 'exercisesPerSkill') <> 'number'
    or p_input_data ->> 'skillCount' !~ '^[0-9]+$'
    or p_input_data ->> 'exercisesPerSkill' !~ '^[0-9]+$'
  then
    return false;
  end if;

  selected_skill_count := (p_input_data ->> 'skillCount')::integer;
  selected_exercises_per_skill :=
    (p_input_data ->> 'exercisesPerSkill')::integer;

  return selected_skill_count between 2 and 6
    and selected_exercises_per_skill between 2 and 8
    and selected_skill_count * selected_exercises_per_skill <= 32
    and jsonb_array_length(p_input_data -> 'existingSkills') = (
      select count(distinct lower(skill ->> 'title'))
      from jsonb_array_elements(p_input_data -> 'existingSkills') as skill
    )
    and jsonb_array_length(p_input_data -> 'existingSkills') = (
      select count(distinct lower(skill ->> 'slug'))
      from jsonb_array_elements(p_input_data -> 'existingSkills') as skill
    );
exception
  when others then
    return false;
end;
$$;

revoke all on function private.is_valid_admin_skill_curriculum_input(jsonb)
  from public, anon, authenticated, service_role;

create function private.is_valid_admin_skill_curriculum_output(
  p_output_data jsonb,
  p_skill_count integer,
  p_exercises_per_skill integer
)
returns boolean
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  selected_skill record;
  selected_exercise record;
begin
  if p_skill_count is null
    or p_exercises_per_skill is null
    or p_skill_count not between 2 and 6
    or p_exercises_per_skill not between 2 and 8
    or p_skill_count * p_exercises_per_skill > 32
    or jsonb_typeof(p_output_data) <> 'object'
    or jsonb_typeof(p_output_data -> 'skills') <> 'array'
    or jsonb_array_length(p_output_data -> 'skills') <> p_skill_count
  then
    return false;
  end if;

  for selected_skill in
    select skill, position
    from jsonb_array_elements(p_output_data -> 'skills')
      with ordinality as entry(skill, position)
    order by position
  loop
    if jsonb_typeof(selected_skill.skill -> 'ordinal') <> 'number'
      or selected_skill.skill ->> 'ordinal' !~ '^[0-9]+$'
      or (selected_skill.skill ->> 'ordinal')::integer
        <> selected_skill.position
      or private.has_parent_framed_child_copy(
        selected_skill.skill ->> 'childDescription'
      )
      or private.is_valid_admin_ai_string_array(
        selected_skill.skill -> 'equipment',
        12,
        80
      ) is not true
      or jsonb_typeof(selected_skill.skill -> 'exercises') <> 'array'
      or jsonb_array_length(selected_skill.skill -> 'exercises')
        <> p_exercises_per_skill
    then
      return false;
    end if;

    if jsonb_array_length(selected_skill.skill -> 'exercises') <> (
      select count(distinct lower(exercise ->> 'title'))
      from jsonb_array_elements(
        selected_skill.skill -> 'exercises'
      ) as exercise
    ) or jsonb_array_length(selected_skill.skill -> 'exercises') <> (
      select count(distinct lower(exercise ->> 'slug'))
      from jsonb_array_elements(
        selected_skill.skill -> 'exercises'
      ) as exercise
    ) then
      return false;
    end if;

    for selected_exercise in
      select exercise, position
      from jsonb_array_elements(selected_skill.skill -> 'exercises')
        with ordinality as entry(exercise, position)
      order by position
    loop
      if jsonb_typeof(selected_exercise.exercise -> 'ordinal') <> 'number'
        or selected_exercise.exercise ->> 'ordinal' !~ '^[0-9]+$'
        or (selected_exercise.exercise ->> 'ordinal')::integer
          <> selected_exercise.position
        or private.has_parent_framed_child_copy(
          selected_exercise.exercise ->> 'childInstructions'
        )
        or private.has_parent_framed_child_copy(
          selected_exercise.exercise ->> 'childSafetyNote'
        )
        or private.is_valid_admin_ai_string_array(
          selected_exercise.exercise -> 'equipment',
          12,
          80
        ) is not true
        or not (case selected_exercise.exercise ->> 'measurement'
          when 'completion' then
            selected_exercise.exercise -> 'targetValue' = 'null'::jsonb
          when 'repetitions' then
            jsonb_typeof(selected_exercise.exercise -> 'targetValue') = 'number'
            and selected_exercise.exercise ->> 'targetValue' ~ '^[0-9]+$'
            and (selected_exercise.exercise ->> 'targetValue')::integer
              between 1 and 10000
          when 'duration' then
            jsonb_typeof(selected_exercise.exercise -> 'targetValue') = 'number'
            and selected_exercise.exercise ->> 'targetValue' ~ '^[0-9]+$'
            and (selected_exercise.exercise ->> 'targetValue')::integer
              between 1 and 86400
          else false
        end)
      then
        return false;
      end if;
    end loop;
  end loop;

  return jsonb_array_length(p_output_data -> 'skills') = (
    select count(distinct lower(skill ->> 'title'))
    from jsonb_array_elements(p_output_data -> 'skills') as skill
  ) and jsonb_array_length(p_output_data -> 'skills') = (
    select count(distinct lower(skill ->> 'slug'))
    from jsonb_array_elements(p_output_data -> 'skills') as skill
  ) and p_skill_count * p_exercises_per_skill = (
    select count(distinct lower(exercise ->> 'title'))
    from jsonb_array_elements(p_output_data -> 'skills') as skill
    cross join lateral jsonb_array_elements(skill -> 'exercises') as exercise
  ) and p_skill_count * p_exercises_per_skill = (
    select count(distinct lower(exercise ->> 'slug'))
    from jsonb_array_elements(p_output_data -> 'skills') as skill
    cross join lateral jsonb_array_elements(skill -> 'exercises') as exercise
  );
exception
  when others then
    return false;
end;
$$;

revoke all on function private.is_valid_admin_skill_curriculum_output(
  jsonb,
  integer,
  integer
) from public, anon, authenticated, service_role;

create function private.admin_skill_curriculum_wardrobe_message(
  p_output_data jsonb
)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select
    'Lav 16 garderobeting til hele forløbet. Færdigheder og øvelser i rækkefølge: '
    || string_agg(
      position::text || '. ' || btrim(left(skill ->> 'title', 10)) || ': '
      || (
        select string_agg(
          btrim(left(exercise ->> 'title', 6)),
          ', '
          order by exercise_position
        )
        from jsonb_array_elements(skill -> 'exercises')
          with ordinality as exercise_entry(exercise, exercise_position)
      ),
      ' · '
      order by position
    )
    || '. Tingene skal passe til hele emnet og alle færdigheder.'
  from jsonb_array_elements(p_output_data -> 'skills')
    with ordinality as entry(skill, position);
$$;

revoke all on function private.admin_skill_curriculum_wardrobe_message(jsonb)
  from public, anon, authenticated, service_role;

create table private.admin_skill_curriculum_job_context (
  job_id uuid primary key references public.ai_jobs (id) on delete cascade,
  topic_id uuid not null references public.topics (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index admin_skill_curriculum_job_context_topic_idx
  on private.admin_skill_curriculum_job_context (topic_id, created_at desc);

alter table private.admin_skill_curriculum_job_context enable row level security;
revoke all on table private.admin_skill_curriculum_job_context
  from public, anon, authenticated, service_role;

create table private.admin_skill_curriculum_saves (
  requested_by uuid not null references public.profiles (id) on delete restrict,
  client_request_id uuid not null check (
    client_request_id <> '00000000-0000-0000-0000-000000000000'::uuid
  ),
  topic_id uuid not null references public.topics (id) on delete cascade,
  curriculum_job_id uuid not null unique
    references public.ai_jobs (id) on delete restrict,
  wardrobe_plan_job_id uuid not null
    references public.ai_jobs (id) on delete restrict,
  wardrobe_image_job_id uuid not null
    references public.ai_jobs (id) on delete restrict,
  goal_ids uuid[] not null check (cardinality(goal_ids) between 2 and 6),
  exercise_ids uuid[] not null check (
    cardinality(exercise_ids) between 4 and 32
  ),
  wardrobe_item_ids uuid[] not null check (
    cardinality(wardrobe_item_ids) = 16
  ),
  tree_updated_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (requested_by, client_request_id)
);

alter table private.admin_skill_curriculum_saves enable row level security;
revoke all on table private.admin_skill_curriculum_saves
  from public, anon, authenticated, service_role;

insert into public.ai_operations (
  id,
  operation_key,
  capability,
  description
)
values (
  'a1000000-0000-4000-8000-000000000013',
  'content.skill_curriculum',
  'structured_text',
  'Plans a bounded ordered curriculum of child-facing skills and exercises for one persisted topic.'
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
  'a2000000-0000-4000-8000-000000000015',
  'a1000000-0000-4000-8000-000000000013',
  1,
  'Du hjælper en voksen redaktør med at planlægge et helt færdighedsforløb i Bare Træn. Brug præcis inputfeltet skillCount til antallet af færdigheder og præcis exercisesPerSkill øvelser i hver færdighed. Returnér færdigheder og øvelser i en naturlig læringsrækkefølge med fortløbende ordinaler fra 1. Hver færdighed og dens øvelser skal kunne gemmes som et sammenhængende udkast, og hele forløbet skal dække emnet uden dubletter af eksisterende færdigheder. childDescription, childInstructions og childSafetyNote vises til barnet og skal altid tale direkte til barnet med du, dig og din; skriv aldrig om barnet eller om børn i fortællerform og skriv aldrig til en forælder. Skriv naturligt, alderssvarende dansk i alle børnesynlige felter og i equipment; brug danske fagord og undgå uforklarede engelske ord. Direkte hjælp som “Spørg dine forældre om hjælp” og “Få hjælp af en voksen” er tilladt. Sikkerhedstekst skal også være direkte til barnet. Slugs skal være unikke små ASCII-bogstaver, tal og bindestreger. Et completion-mål har targetValue null; repetitions bruger 1 til 10000; duration bruger sekunder fra 1 til 86400. reply og editorialReason er kun til redaktøren. Garderoben genereres separat én gang ud fra hele det færdige forløb. Returnér kun det præcise outputobjekt.',
  'openrouter',
  'openai',
  'openai/gpt-5-mini',
  $json$
    {
      "max_tokens": 16000,
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
        },
        "skillCount": {"type": "integer", "minimum": 2, "maximum": 6},
        "exercisesPerSkill": {"type": "integer", "minimum": 2, "maximum": 8}
      },
      "required": [
        "message",
        "topic",
        "existingSkills",
        "history",
        "skillCount",
        "exercisesPerSkill"
      ]
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
          "minItems": 2,
          "maxItems": 6,
          "items": {
            "type": "object",
            "additionalProperties": false,
            "properties": {
              "ordinal": {"type": "integer", "minimum": 1, "maximum": 6},
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
              "editorialReason": {"type": "string", "minLength": 1, "maxLength": 500},
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
            "required": [
              "ordinal",
              "title",
              "slug",
              "childDescription",
              "difficulty",
              "estimatedMinutes",
              "equipment",
              "editorialReason",
              "exercises"
            ]
          }
        }
      },
      "required": ["reply", "skills"]
    }
  $json$::jsonb,
  1,
  120000,
  200000
);

update public.ai_operations
set active_version_id = 'a2000000-0000-4000-8000-000000000015'
where operation_key = 'content.skill_curriculum';

-- The existing wardrobe-plan schema intentionally stays stable for rollout.
-- Make its semantic rules explicit in a new immutable prompt version because
-- strict JSON schema alone cannot express row position or points/rule XOR.
do $do$
declare
  selected_operation public.ai_operations%rowtype;
  selected_version public.ai_operation_versions%rowtype;
begin
  select operation.*
  into selected_operation
  from public.ai_operations as operation
  where operation.operation_key = 'content.wardrobe_grid_plan'
  for update;

  if selected_operation.id is null
    or selected_operation.active_version_id is null
  then
    raise exception 'The wardrobe grid plan operation is unavailable.'
      using errcode = '55000';
  end if;

  select version.*
  into selected_version
  from public.ai_operation_versions as version
  where version.id = selected_operation.active_version_id
    and version.operation_id = selected_operation.id;

  if selected_version.id is null then
    raise exception 'The active wardrobe grid plan version is unavailable.'
      using errcode = '55000';
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
    max_cost_microusd,
    created_by
  )
  values (
    'a2000000-0000-4000-8000-000000000016',
    selected_version.operation_id,
    selected_version.version + 1,
    selected_version.prompt_template
      || E'\n\n[WARDROBE_GRID_SEMANTICS_V2] Returnér præcis 16 items i arrayrækkefølge. For hvert item på position i fra 1 til 16 skal ordinal være præcis i. Brug kun category clothing, equipment eller effect; equipSlot head, body, held, feet eller accessory; og rarity common, rare eller special. Hvis points er større end 0, skal unlockRule være den tomme streng. Hvis points er 0, skal unlockRule være ikke-tom og tale direkte til barnet. description skal også tale direkte til barnet og være naturligt, alderssvarende dansk med danske fagord uden uforklarede engelske ord. visualDescription er fortsat den engelske instruktion til billedmodellen.',
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
  set active_version_id = 'a2000000-0000-4000-8000-000000000016'
  where operation.id = selected_operation.id;
end;
$do$;

create function public.prepare_admin_skill_curriculum_job(
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
  selected_context private.admin_skill_curriculum_job_context%rowtype;
  expected_topic jsonb;
  expected_existing_skills jsonb;
begin
  if caller_id is null or not (select private.is_admin()) then
    raise exception 'Content administrator access is required.'
      using errcode = '42501';
  end if;

  if p_topic_id is null
    or p_client_request_id is null
    or p_client_request_id = '00000000-0000-0000-0000-000000000000'::uuid
    or jsonb_typeof(p_input_data) <> 'object'
  then
    raise exception 'The skill curriculum request is invalid.'
      using errcode = '22023';
  end if;

  select operation.*
  into selected_operation
  from public.ai_operations as operation
  where operation.operation_key = 'content.skill_curriculum'
    and operation.capability = 'structured_text';

  if selected_operation.id is null
    or selected_operation.active_version_id is null
  then
    raise exception 'The skill curriculum operation is unavailable.'
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

  select coalesce(
    jsonb_agg(
      jsonb_build_object('slug', goal.slug, 'title', goal.title)
      order by goal.sort_order, goal.created_at
    ),
    '[]'::jsonb
  )
  into expected_existing_skills
  from public.goals as goal
  where goal.topic_id = selected_topic.id;

  if p_input_data -> 'topic' is distinct from expected_topic
    or p_input_data -> 'existingSkills' is distinct from expected_existing_skills
  then
    raise exception 'The skill curriculum request does not match the saved topic.'
      using errcode = '40001';
  end if;

  select version.*
  into selected_version
  from public.ai_operation_versions as version
  where version.id = selected_operation.active_version_id
    and version.operation_id = selected_operation.id;

  if selected_version.id is null then
    raise exception 'The active skill curriculum version is unavailable.'
      using errcode = '55000';
  end if;

  if private.admin_ai_contract_matches(
      selected_version.input_contract,
      p_input_data
    ) is not true
    or private.is_valid_admin_skill_curriculum_input(p_input_data) is not true
  then
    raise exception 'The skill curriculum request is invalid.'
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
    from private.admin_skill_curriculum_job_context as context
    where context.job_id = selected_job.id;

    if selected_context.job_id is not null
      and selected_context.topic_id is distinct from p_topic_id
    then
      raise exception 'The request identity is already bound to different work.'
        using errcode = '23505';
    end if;

    if selected_context.job_id is null then
      insert into private.admin_skill_curriculum_job_context (job_id, topic_id)
      values (selected_job.id, p_topic_id);
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

  insert into private.admin_skill_curriculum_job_context (job_id, topic_id)
  values (selected_job.id, p_topic_id);

  return query select selected_job.id, selected_job.status;
end;
$$;

revoke all on function public.prepare_admin_skill_curriculum_job(
  uuid,
  uuid,
  jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.prepare_admin_skill_curriculum_job(
  uuid,
  uuid,
  jsonb
) to authenticated;

create function public.read_admin_skill_curriculum_job(p_job_id uuid)
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
    raise exception 'The skill curriculum job is invalid.'
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
  join private.admin_skill_curriculum_job_context as context
    on context.job_id = job.id
  where job.id = p_job_id
    and job.requested_by = caller_id
    and job.scope_kind = 'admin'
    and operation.operation_key = 'content.skill_curriculum';

  if not found then
    raise exception 'The skill curriculum job does not exist.'
      using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.read_admin_skill_curriculum_job(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.read_admin_skill_curriculum_job(uuid)
  to authenticated;

create function public.claim_admin_skill_curriculum_job_for_worker(
  p_job_id uuid
)
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
  join private.admin_skill_curriculum_job_context as context
    on context.job_id = job.id
  where job.id = p_job_id
    and job.scope_kind = 'admin'
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
    and operation.operation_key = 'content.skill_curriculum';

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
    or private.is_valid_admin_skill_curriculum_input(
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

revoke all on function public.claim_admin_skill_curriculum_job_for_worker(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_admin_skill_curriculum_job_for_worker(uuid)
  to service_role;

create function public.complete_admin_skill_curriculum_job_for_worker(
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
  selected_output_contract jsonb;
  selected_input_data jsonb;
  selected_skill_count integer;
  selected_exercises_per_skill integer;
  accumulated_cost_microusd bigint;
begin
  if p_attempt_number is null
    or p_attempt_number <> 1
    or jsonb_typeof(p_usage) <> 'object'
    or p_cost_microusd is null
    or p_cost_microusd < 0
    or (p_provider_request_id is not null
      and char_length(p_provider_request_id) > 200)
  then
    raise exception 'The skill curriculum completion payload is invalid.'
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

  select version.output_contract, job.input_data
  into selected_output_contract, selected_input_data
  from public.ai_jobs as job
  join public.ai_operations as operation on operation.id = job.operation_id
  join public.ai_operation_versions as version
    on version.id = job.operation_version_id
    and version.operation_id = job.operation_id
  join private.admin_skill_curriculum_job_context as context
    on context.job_id = job.id
  where job.id = p_job_id
    and job.scope_kind = 'admin'
    and job.status = 'processing'
    and job.attempt_count = p_attempt_number
    and operation.capability = 'structured_text'
    and operation.operation_key = 'content.skill_curriculum'
  for update of job;

  if selected_output_contract is null
    or private.is_valid_admin_skill_curriculum_input(
      selected_input_data
    ) is not true
  then
    raise exception 'The skill curriculum job is not owned by this worker.'
      using errcode = '40001';
  end if;

  selected_skill_count := (selected_input_data ->> 'skillCount')::integer;
  selected_exercises_per_skill :=
    (selected_input_data ->> 'exercisesPerSkill')::integer;

  if private.admin_ai_contract_matches(
      selected_output_contract,
      p_output_data
    ) is not true
    or private.is_valid_admin_skill_curriculum_output(
      p_output_data,
      selected_skill_count,
      selected_exercises_per_skill
    ) is not true
  then
    raise exception 'The structured skill curriculum result is invalid.'
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
    raise exception 'The skill curriculum job exceeds its cost ceiling.'
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
    raise exception 'The skill curriculum job is no longer owned by this worker.'
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

revoke all on function public.complete_admin_skill_curriculum_job_for_worker(
  uuid,
  smallint,
  jsonb,
  text,
  jsonb,
  bigint
) from public, anon, authenticated, service_role;
grant execute on function public.complete_admin_skill_curriculum_job_for_worker(
  uuid,
  smallint,
  jsonb,
  text,
  jsonb,
  bigint
) to service_role;

create function public.save_admin_skill_curriculum_draft(
  p_topic_id uuid,
  p_curriculum_job_id uuid,
  p_wardrobe_plan_job_id uuid,
  p_wardrobe_image_job_id uuid,
  p_client_request_id uuid,
  p_expected_updated_at timestamptz
)
returns table (
  changed boolean,
  goal_ids uuid[],
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
  selected_receipt private.admin_skill_curriculum_saves%rowtype;
  selected_curriculum_job public.ai_jobs%rowtype;
  selected_plan_job public.ai_jobs%rowtype;
  selected_image_job public.ai_jobs%rowtype;
  selected_curriculum_context
    private.admin_skill_curriculum_job_context%rowtype;
  selected_plan_context private.admin_topic_ai_job_context%rowtype;
  selected_image_context private.admin_topic_ai_job_context%rowtype;
  selected_curriculum_key text;
  selected_plan_key text;
  selected_image_key text;
  selected_curriculum_contract jsonb;
  selected_skill_count integer;
  selected_exercises_per_skill integer;
  expected_topic jsonb;
  expected_existing_skills jsonb;
  expected_plan_input jsonb;
  expected_image_input jsonb;
  new_goal_ids uuid[] := '{}'::uuid[];
  new_exercise_ids uuid[] := '{}'::uuid[];
  new_wardrobe_item_ids uuid[] := '{}'::uuid[];
  next_goal_sort_order integer;
  next_wardrobe_sort_order integer;
  selected_skill record;
  selected_exercise record;
  selected_item record;
  selected_image_path text;
  new_goal_id uuid;
  new_exercise_id uuid;
  new_wardrobe_item_id uuid;
begin
  if caller_id is null or not (select private.is_admin()) then
    raise exception 'Content administrator access is required.'
      using errcode = '42501';
  end if;

  if p_topic_id is null
    or p_curriculum_job_id is null
    or p_wardrobe_plan_job_id is null
    or p_wardrobe_image_job_id is null
    or p_client_request_id is null
    or p_client_request_id = '00000000-0000-0000-0000-000000000000'::uuid
    or p_expected_updated_at is null
    or p_curriculum_job_id in (
      p_wardrobe_plan_job_id,
      p_wardrobe_image_job_id
    )
    or p_wardrobe_plan_job_id = p_wardrobe_image_job_id
  then
    raise exception 'The skill curriculum save request is invalid.'
      using errcode = '22023';
  end if;

  -- The caller lock serializes idempotent requests from the same administrator.
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
  from private.admin_skill_curriculum_saves as receipt
  where receipt.requested_by = caller_id
    and receipt.client_request_id = p_client_request_id
  for update;

  if selected_receipt.requested_by is not null then
    if selected_receipt.topic_id is distinct from p_topic_id
      or selected_receipt.curriculum_job_id
        is distinct from p_curriculum_job_id
      or selected_receipt.wardrobe_plan_job_id
        is distinct from p_wardrobe_plan_job_id
      or selected_receipt.wardrobe_image_job_id
        is distinct from p_wardrobe_image_job_id
    then
      raise exception 'The save request identity is already used for different work.'
        using errcode = '23505';
    end if;

    return query
    select
      false,
      selected_receipt.goal_ids,
      selected_receipt.exercise_ids,
      selected_receipt.wardrobe_item_ids,
      selected_receipt.tree_updated_at;
    return;
  end if;

  if exists (
    select 1
    from private.admin_skill_curriculum_saves as receipt
    where receipt.curriculum_job_id = p_curriculum_job_id
  ) then
    raise exception 'The skill curriculum has already been saved.'
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
    raise exception 'The topic changed before the curriculum could be saved.'
      using errcode = '40001';
  end if;

  -- Lock all proposal jobs in UUID order so malformed overlapping requests
  -- cannot deadlock each other.
  perform job.id
  from public.ai_jobs as job
  where job.id in (
    p_curriculum_job_id,
    p_wardrobe_plan_job_id,
    p_wardrobe_image_job_id
  )
  order by job.id
  for update;

  select job.*
  into selected_curriculum_job
  from public.ai_jobs as job
  where job.id = p_curriculum_job_id;

  select operation.operation_key
  into selected_curriculum_key
  from public.ai_operations as operation
  where operation.id = selected_curriculum_job.operation_id;

  select version.output_contract
  into selected_curriculum_contract
  from public.ai_operation_versions as version
  where version.id = selected_curriculum_job.operation_version_id
    and version.operation_id = selected_curriculum_job.operation_id;

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

  select context.*
  into selected_curriculum_context
  from private.admin_skill_curriculum_job_context as context
  where context.job_id = p_curriculum_job_id;

  select context.*
  into selected_plan_context
  from private.admin_topic_ai_job_context as context
  where context.job_id = p_wardrobe_plan_job_id;

  select context.*
  into selected_image_context
  from private.admin_topic_ai_job_context as context
  where context.job_id = p_wardrobe_image_job_id;

  if selected_curriculum_job.id is null
    or selected_plan_job.id is null
    or selected_image_job.id is null
    or selected_curriculum_key is distinct from 'content.skill_curriculum'
    or selected_plan_key is distinct from 'content.wardrobe_grid_plan'
    or selected_image_key is distinct from 'content.wardrobe_grid_image'
    or selected_curriculum_job.requested_by is distinct from caller_id
    or selected_plan_job.requested_by is distinct from caller_id
    or selected_image_job.requested_by is distinct from caller_id
    or selected_curriculum_job.scope_kind is distinct from 'admin'
    or selected_plan_job.scope_kind is distinct from 'admin'
    or selected_image_job.scope_kind is distinct from 'admin'
    or selected_curriculum_job.status is distinct from 'succeeded'
    or selected_plan_job.status is distinct from 'succeeded'
    or selected_image_job.status is distinct from 'succeeded'
    or selected_curriculum_context.topic_id is distinct from p_topic_id
    or selected_plan_context.topic_id is distinct from p_topic_id
    or selected_image_context.topic_id is distinct from p_topic_id
    or selected_plan_context.purpose
      is distinct from 'skill_package_wardrobe_plan'
    or selected_image_context.purpose
      is distinct from 'skill_package_wardrobe_image'
  then
    raise exception 'The complete topic-bound curriculum proposal is unavailable.'
      using errcode = '55000';
  end if;

  expected_topic := jsonb_build_object(
    'title', selected_topic.title,
    'description', selected_topic.description
  );

  select coalesce(
    jsonb_agg(
      jsonb_build_object('slug', goal.slug, 'title', goal.title)
      order by goal.sort_order, goal.created_at
    ),
    '[]'::jsonb
  )
  into expected_existing_skills
  from public.goals as goal
  where goal.topic_id = selected_topic.id;

  if private.is_valid_admin_skill_curriculum_input(
      selected_curriculum_job.input_data
    ) is not true
    or selected_curriculum_job.input_data -> 'topic'
      is distinct from expected_topic
    or selected_curriculum_job.input_data -> 'existingSkills'
      is distinct from expected_existing_skills
    or selected_plan_job.input_data -> 'topic' is distinct from expected_topic
    or selected_image_job.input_data -> 'topic' is distinct from expected_topic
  then
    raise exception 'The curriculum proposal is invalid or stale.'
      using errcode = '55000';
  end if;

  selected_skill_count :=
    (selected_curriculum_job.input_data ->> 'skillCount')::integer;
  selected_exercises_per_skill :=
    (selected_curriculum_job.input_data ->> 'exercisesPerSkill')::integer;

  if private.admin_ai_contract_matches(
      selected_curriculum_contract,
      selected_curriculum_job.output_data
    ) is not true
    or private.is_valid_admin_skill_curriculum_output(
      selected_curriculum_job.output_data,
      selected_skill_count,
      selected_exercises_per_skill
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
    raise exception 'The curriculum proposal is invalid or stale.'
      using errcode = '55000';
  end if;

  expected_plan_input := jsonb_build_object(
    'history', '[]'::jsonb,
    'message', private.admin_skill_curriculum_wardrobe_message(
      selected_curriculum_job.output_data
    ),
    'topic', expected_topic
  );

  if selected_plan_job.input_data is distinct from expected_plan_input then
    raise exception 'The wardrobe plan is not bound to the whole curriculum.'
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

  if exists (
    select 1
    from jsonb_array_elements(
      selected_curriculum_job.output_data -> 'skills'
    ) as skill
    join public.goals as goal
      on lower(goal.slug) = lower(skill ->> 'slug')
      or (
        goal.topic_id = selected_topic.id
        and lower(goal.title) = lower(skill ->> 'title')
      )
  ) or exists (
    select 1
    from jsonb_array_elements(
      selected_curriculum_job.output_data -> 'skills'
    ) as skill
    cross join lateral jsonb_array_elements(
      skill -> 'exercises'
    ) as exercise
    join public.exercises as persisted
      on lower(persisted.slug) = lower(exercise ->> 'slug')
  ) then
    raise exception 'The curriculum collides with existing content.'
      using errcode = '23505';
  end if;

  select coalesce(max(goal.sort_order), -1) + 1
  into next_goal_sort_order
  from public.goals as goal
  where goal.topic_id = selected_topic.id;

  for selected_skill in
    select skill, position
    from jsonb_array_elements(
      selected_curriculum_job.output_data -> 'skills'
    ) with ordinality as entry(skill, position)
    order by position
  loop
    new_goal_id := gen_random_uuid();

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
      selected_skill.skill ->> 'slug',
      selected_skill.skill ->> 'title',
      selected_skill.skill ->> 'childDescription',
      (selected_skill.skill ->> 'difficulty')::public.exercise_difficulty,
      (selected_skill.skill ->> 'estimatedMinutes')::smallint,
      array(
        select equipment #>> '{}'
        from jsonb_array_elements(
          selected_skill.skill -> 'equipment'
        ) as equipment
      ),
      next_goal_sort_order + selected_skill.position - 1,
      1,
      false,
      null,
      caller_id
    );

    new_goal_ids := array_append(new_goal_ids, new_goal_id);

    for selected_exercise in
      select exercise, position
      from jsonb_array_elements(selected_skill.skill -> 'exercises')
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
        case
          when selected_exercise.exercise -> 'targetValue' = 'null'::jsonb
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

  if cardinality(new_goal_ids) <> selected_skill_count
    or cardinality(new_exercise_ids)
      <> selected_skill_count * selected_exercises_per_skill
    or cardinality(new_wardrobe_item_ids) <> 16
  then
    raise exception 'The complete curriculum was not saved.'
      using errcode = '55000';
  end if;

  select private.admin_topic_tree_updated_at(selected_topic.id)
  into selected_tree_updated_at;

  insert into private.admin_skill_curriculum_saves (
    requested_by,
    client_request_id,
    topic_id,
    curriculum_job_id,
    wardrobe_plan_job_id,
    wardrobe_image_job_id,
    goal_ids,
    exercise_ids,
    wardrobe_item_ids,
    tree_updated_at
  )
  values (
    caller_id,
    p_client_request_id,
    selected_topic.id,
    p_curriculum_job_id,
    p_wardrobe_plan_job_id,
    p_wardrobe_image_job_id,
    new_goal_ids,
    new_exercise_ids,
    new_wardrobe_item_ids,
    selected_tree_updated_at
  );

  return query
  select
    true,
    new_goal_ids,
    new_exercise_ids,
    new_wardrobe_item_ids,
    selected_tree_updated_at;
end;
$$;

revoke all on function public.save_admin_skill_curriculum_draft(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.save_admin_skill_curriculum_draft(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  timestamptz
) to authenticated;

comment on function public.save_admin_skill_curriculum_draft(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  timestamptz
) is
  'Atomically saves one reviewed curriculum, every ordered exercise, and exactly sixteen shared wardrobe drafts; idempotent retries return the original receipt.';

commit;
