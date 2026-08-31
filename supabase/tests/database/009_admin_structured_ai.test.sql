begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(76);

select results_eq(
  $$
    select operation_key
    from public.ai_operations
    where operation_key like 'content.%'
    order by operation_key
  $$,
  $$
    values
      ('content.draft_review'::text),
      ('content.exercise_draft'::text),
      ('content.goal_draft'::text),
      ('content.skill_curriculum'::text),
      ('content.skill_package'::text),
      ('content.skill_suggestions'::text),
      ('content.topic_brief'::text),
      ('content.wardrobe_examples'::text),
      ('content.wardrobe_grid_image'::text),
      ('content.wardrobe_grid_plan'::text)
  $$,
  'all ten bounded administrator AI operations exist'
);

select results_eq(
  $$
    select operation.operation_key, gateway, provider, model
    from public.ai_operation_versions as version
    join public.ai_operations as operation
      on operation.active_version_id = version.id
      and operation.id = version.operation_id
    where operation.operation_key like 'content.%'
    order by operation.operation_key
  $$,
  $$
    values
      ('content.draft_review'::text, 'openrouter'::text, 'openai'::text, 'openai/gpt-5-mini'::text),
      ('content.exercise_draft'::text, 'openrouter'::text, 'openai'::text, 'openai/gpt-5-mini'::text),
      ('content.goal_draft'::text, 'openrouter'::text, 'openai'::text, 'openai/gpt-5-mini'::text),
      ('content.skill_curriculum'::text, 'openrouter'::text, 'openai'::text, 'openai/gpt-5-mini'::text),
      ('content.skill_package'::text, 'openrouter'::text, 'openai'::text, 'openai/gpt-5-mini'::text),
      ('content.skill_suggestions'::text, 'openrouter'::text, 'openai'::text, 'openai/gpt-5-mini'::text),
      ('content.topic_brief'::text, 'openrouter'::text, 'openai'::text, 'openai/gpt-5-mini'::text),
      ('content.wardrobe_examples'::text, 'openrouter'::text, 'openai'::text, 'openai/gpt-5-mini'::text),
      ('content.wardrobe_grid_image'::text, 'openrouter'::text, 'openai'::text, 'openai/gpt-image-2'::text),
      ('content.wardrobe_grid_plan'::text, 'openrouter'::text, 'openai'::text, 'openai/gpt-5-mini'::text)
  $$,
  'all ten operations pin their intended OpenAI model on OpenRouter'
);

create temporary table prompt_revision_baseline as
select
  operation.operation_key,
  operation.active_version_id,
  version.version + 1 as expected_next_version
from public.ai_operations as operation
join public.ai_operation_versions as version
  on version.id = operation.active_version_id
  and version.operation_id = operation.id
where operation.operation_key in (
  'content.goal_draft',
  'content.topic_brief'
);

grant select on prompt_revision_baseline to authenticated;

select is(
  (
    select request_options -> 'provider'
    from public.ai_operation_versions
    where id = 'a2000000-0000-4000-8000-000000000003'
  ),
  '{"only":["openai"],"allow_fallbacks":false,"require_parameters":true}'::jsonb,
  'structured output requires supported OpenAI parameters without fallback'
);

select is(
  (
    select output_contract #> '{properties,suggestion,anyOf,4,properties,targetValue,maximum}'
    from public.ai_operation_versions
    where id = 'a2000000-0000-4000-8000-000000000006'
  ),
  '10000'::jsonb,
  'the strict repetition schema uses the same ten-thousand target ceiling as validation and persistence'
);

select is(
  (
    select output_contract #> '{properties,suggestion,anyOf,5,properties,targetValue,maximum}'
    from public.ai_operation_versions
    where id = 'a2000000-0000-4000-8000-000000000006'
  ),
  '86400'::jsonb,
  'the strict duration schema uses the same one-day target ceiling as validation and persistence'
);

select is(
  (
    select jsonb_array_length(output_contract #> '{properties,suggestion,anyOf}')
    from public.ai_operation_versions
    where id = 'a2000000-0000-4000-8000-000000000003'
  ),
  2,
  'the topic schema separates incomplete clarification from a complete ready proposal'
);

select is(
  (
    select output_contract #>> '{properties,suggestion,anyOf,1,properties,estimatedMinutes,type}'
    from public.ai_operation_versions
    where id = 'a2000000-0000-4000-8000-000000000005'
  ),
  'integer',
  'a ready goal schema cannot return a null time estimate'
);

select is(
  (
    select jsonb_array_length(output_contract #> '{properties,suggestion,anyOf}')
    from public.ai_operation_versions
    where id = 'a2000000-0000-4000-8000-000000000006'
  ),
  6,
  'the exercise schema separates readiness and all three measurement contracts'
);

select is(
  (
    select jsonb_array_length(output_contract #> '{properties,items,items,anyOf}')
    from public.ai_operation_versions
    where id = 'a2000000-0000-4000-8000-000000000004'
  ),
  2,
  'wardrobe items use distinct point-price and unlock-rule schemas'
);

select is(
  has_function_privilege(
    'authenticated',
    'public.prepare_admin_ai_job(text,uuid,jsonb)',
    'execute'
  ),
  true,
  'authenticated administrators can call the guarded preparation RPC'
);

select is(
  has_function_privilege(
    'authenticated',
    'public.claim_admin_ai_job_for_worker(uuid)',
    'execute'
  ),
  false,
  'browser clients cannot claim administrator AI jobs'
);

select is(
  has_function_privilege(
    'service_role',
    'public.claim_admin_ai_job_for_worker(uuid)',
    'execute'
  ),
  true,
  'the worker can call the narrow administrator claim RPC'
);

select is(
  has_function_privilege(
    'authenticated',
    'public.complete_admin_ai_job_for_worker(uuid,smallint,jsonb,text,jsonb,bigint)',
    'execute'
  ),
  false,
  'browser clients cannot forge structured AI completion'
);

select is(
  has_function_privilege(
    'authenticated',
    'public.fail_admin_ai_job_for_worker(uuid,smallint,text,text,text,jsonb,bigint)',
    'execute'
  ),
  false,
  'browser clients cannot forge structured AI failure'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

select throws_ok(
  $$
    select * from public.prepare_admin_ai_job(
      'content.topic_brief',
      'c3000000-0000-4000-8000-000000000001',
      '{"message":"Lav et emne","draft":{"title":"","description":"","icon":"✨","accentColor":"#53C987"},"history":[]}'::jsonb
    )
  $$,
  '42501',
  'Content administrator access is required.',
  'a regular authenticated account cannot prepare administrator AI work'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);
set local role authenticated;

select throws_ok(
  $$
    select * from public.prepare_admin_ai_job(
      'content.topic_brief',
      'c3000000-0000-4000-8000-000000000002',
      '{}'::jsonb
    )
  $$,
  '22023',
  'The admin AI request is invalid.',
  'missing top-level input fields fail closed'
);

select throws_ok(
  $$
    select * from public.prepare_admin_ai_job(
      'content.topic_brief',
      'c3000000-0000-4000-8000-000000000003',
      '{"message":"Lav et emne","draft":{"title":"","description":"","icon":"✨","accentColor":"#53C987"},"history":[{"content":"Mangler rolle"}]}'::jsonb
    )
  $$,
  '22023',
  'The admin AI request is invalid.',
  'missing nested history fields fail closed'
);

select throws_ok(
  $$
    select * from public.prepare_admin_ai_job(
      'content.topic_brief',
      'c3000000-0000-4000-8000-000000000004',
      '{"message":"Lav et emne","draft":{"title":"","description":"","icon":"✨","accentColor":"#53C987"},"history":[],"model":"attacker-choice"}'::jsonb
    )
  $$,
  '22023',
  'The admin AI request is invalid.',
  'browser input cannot add provider or model controls'
);

select results_eq(
  $$
    select job_status::text
    from public.prepare_admin_ai_job(
      'content.topic_brief',
      'c3000000-0000-4000-8000-000000000010',
      '{"message":"Lav et emne om balance","draft":{"title":"","description":"","icon":"✨","accentColor":"#53C987"},"history":[]}'::jsonb
    )
  $$,
  $$ values ('awaiting_upload'::text) $$,
  'a valid topic request creates a version-pinned proposal job'
);

select is(
  (
    select count(*)::integer
    from public.prepare_admin_ai_job(
      'content.topic_brief',
      'c3000000-0000-4000-8000-000000000010',
      '{"message":"Lav et emne om balance","draft":{"title":"","description":"","icon":"✨","accentColor":"#53C987"},"history":[]}'::jsonb
    )
  ),
  1,
  'an exact retry returns the existing job'
);

select is(
  (
    select count(*)::integer
    from public.ai_jobs
    where client_request_id = 'c3000000-0000-4000-8000-000000000010'
      and requested_by = '10000000-0000-4000-8000-000000000003'
  ),
  1,
  'an exact retry does not create a duplicate row'
);

select throws_ok(
  $$
    select * from public.prepare_admin_ai_job(
      'content.topic_brief',
      'c3000000-0000-4000-8000-000000000010',
      '{"message":"Anderledes arbejde","draft":{"title":"","description":"","icon":"✨","accentColor":"#53C987"},"history":[]}'::jsonb
    )
  $$,
  '23505',
  'The request identity is already used for different work.',
  'reusing an idempotency key for different work is rejected'
);

reset role;
set local role service_role;

select results_eq(
  $$
    select operation_key, gateway, provider, model
    from public.claim_admin_ai_job_for_worker(
      (select id from public.ai_jobs where client_request_id = 'c3000000-0000-4000-8000-000000000010')
    )
  $$,
  $$ values ('content.topic_brief'::text, 'openrouter'::text, 'openai'::text, 'openai/gpt-5-mini'::text) $$,
  'the worker receives only the immutable server-owned topic configuration'
);

select is_empty(
  $$
    select *
    from public.claim_admin_ai_job_for_worker(
      (select id from public.ai_jobs where client_request_id = 'c3000000-0000-4000-8000-000000000010')
    )
  $$,
  'a live worker lease cannot be claimed twice'
);

select throws_ok(
  $$
    select public.complete_admin_ai_job_for_worker(
      (select id from public.ai_jobs where client_request_id = 'c3000000-0000-4000-8000-000000000010'),
      1::smallint,
      '{"reply":"Forslaget er klar.","suggestion":{"ready":true,"title":"Balancebanen","description":"Små trygge balancelege.","icon":"🤸","accentColor":"#53C987"}}'::jsonb,
      'test-topic-missing',
      '{}'::jsonb,
      100::bigint
    )
  $$,
  '22023',
  'The structured admin AI result is invalid.',
  'topic output missing a nested required field fails closed'
);

select throws_ok(
  $$
    select public.complete_admin_ai_job_for_worker(
      (select id from public.ai_jobs where client_request_id = 'c3000000-0000-4000-8000-000000000010'),
      1::smallint,
      '{"reply":"Forslaget er klar.","suggestion":{"ready":true,"title":" ","description":"Små trygge balancelege.","icon":"🤸","accentColor":"#53C987","reason":"Klar"}}'::jsonb,
      'test-topic-blank',
      '{}'::jsonb,
      100::bigint
    )
  $$,
  '22023',
  'The structured admin AI result is invalid.',
  'a ready proposal cannot hide an empty title in whitespace'
);

select lives_ok(
  $$
    select public.complete_admin_ai_job_for_worker(
      (select id from public.ai_jobs where client_request_id = 'c3000000-0000-4000-8000-000000000010'),
      1::smallint,
      '{"reply":"Forslaget er klar.","suggestion":{"ready":true,"title":"Balancebanen","description":"Små trygge balancelege.","icon":"🤸","accentColor":"#53C987","reason":"Klar til menneskelig gennemgang."}}'::jsonb,
      'test-topic-success',
      '{"prompt_tokens":80,"completion_tokens":60,"total_tokens":140}'::jsonb,
      100::bigint
    )
  $$,
  'a valid structured topic proposal can complete'
);

select results_eq(
  $$
    select status::text, output_data #>> '{suggestion,title}'
    from public.ai_jobs
    where client_request_id = 'c3000000-0000-4000-8000-000000000010'
  $$,
  $$ values ('succeeded'::text, 'Balancebanen'::text) $$,
  'the accepted topic output remains a stored proposal'
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
    select job_status::text
    from public.prepare_admin_ai_job(
      'content.wardrobe_examples',
      'c3000000-0000-4000-8000-000000000020',
      '{"message":"Foreslå garderobeting","draft":{"title":"Fodbold","description":"Boldlege","icon":"⚽","accentColor":"#53C987"},"history":[]}'::jsonb
    )
  $$,
  $$ values ('awaiting_upload'::text) $$,
  'an administrator can prepare a separate wardrobe proposal'
);

reset role;
set local role service_role;

select results_eq(
  $$
    select operation_key
    from public.claim_admin_ai_job_for_worker(
      (select id from public.ai_jobs where client_request_id = 'c3000000-0000-4000-8000-000000000020')
    )
  $$,
  $$ values ('content.wardrobe_examples'::text) $$,
  'the wardrobe job is claimed with its own operation contract'
);

select throws_ok(
  $$
    select public.complete_admin_ai_job_for_worker(
      (select id from public.ai_jobs where client_request_id = 'c3000000-0000-4000-8000-000000000020'),
      1::smallint,
      '{"reply":"Et forslag.","items":[{"name":"Regnbuebold","icon":"🌈","category":"equipment","equipSlot":"held","rarity":"rare","points":250,"unlockRule":"","reason":"Passer til emnet."}]}'::jsonb,
      'test-wardrobe-one',
      '{}'::jsonb,
      100::bigint
    )
  $$,
  '22023',
  'The structured admin AI result is invalid.',
  'wardrobe output must contain the promised three to six examples'
);

select throws_ok(
  $$
    select public.complete_admin_ai_job_for_worker(
      (select id from public.ai_jobs where client_request_id = 'c3000000-0000-4000-8000-000000000020'),
      1::smallint,
      '{"reply":"Tre forslag.","items":[{"name":"Regnbuebold","icon":"🌈","category":"equipment","equipSlot":"held","rarity":"rare","unlockRule":"","reason":"Passer."},{"name":"Trænerkasket","icon":"🧢","category":"clothing","equipSlot":"head","rarity":"common","points":100,"unlockRule":"","reason":"Passer."},{"name":"Stjernestøv","icon":"✨","category":"effect","equipSlot":"accessory","rarity":"special","points":0,"unlockRule":"Gennemfør tre mål","reason":"Passer."}]}'::jsonb,
      'test-wardrobe-missing',
      '{}'::jsonb,
      100::bigint
    )
  $$,
  '22023',
  'The structured admin AI result is invalid.',
  'wardrobe output missing points fails closed'
);

select throws_ok(
  $$
    select public.complete_admin_ai_job_for_worker(
      (select id from public.ai_jobs where client_request_id = 'c3000000-0000-4000-8000-000000000020'),
      1::smallint,
      '{"reply":"Tre forslag.","items":[{"name":"Regnbuebold","icon":"🌈","category":"equipment","equipSlot":"held","rarity":"rare","points":250,"unlockRule":"Gennemfør noget","reason":"Passer."},{"name":"Trænerkasket","icon":"🧢","category":"clothing","equipSlot":"head","rarity":"common","points":100,"unlockRule":"","reason":"Passer."},{"name":"Stjernestøv","icon":"✨","category":"effect","equipSlot":"accessory","rarity":"special","points":0,"unlockRule":"Gennemfør tre mål","reason":"Passer."}]}'::jsonb,
      'test-wardrobe-rule',
      '{}'::jsonb,
      100::bigint
    )
  $$,
  '22023',
  'The structured admin AI result is invalid.',
  'a wardrobe item uses either points or an unlock rule, not both'
);

select lives_ok(
  $$
    select public.complete_admin_ai_job_for_worker(
      (select id from public.ai_jobs where client_request_id = 'c3000000-0000-4000-8000-000000000020'),
      1::smallint,
      '{"reply":"Tre forslag til gennemgang.","items":[{"name":"Regnbuebold","icon":"🌈","category":"equipment","equipSlot":"held","rarity":"rare","points":250,"unlockRule":"","reason":"Passer til emnet."},{"name":"Trænerkasket","icon":"🧢","category":"clothing","equipSlot":"head","rarity":"common","points":100,"unlockRule":"","reason":"En enkel syntetisk belønning."},{"name":"Stjernestøv","icon":"✨","category":"effect","equipSlot":"accessory","rarity":"special","points":0,"unlockRule":"Gennemfør tre mål","reason":"En oplåselig effekt uden brand."}]}'::jsonb,
      'test-wardrobe-success',
      '{"total_tokens":180}'::jsonb,
      150::bigint
    )
  $$,
  'three valid synthetic wardrobe examples can complete'
);

select is(
  (
    select jsonb_array_length(output_data -> 'items')
    from public.ai_jobs
    where client_request_id = 'c3000000-0000-4000-8000-000000000020'
      and status = 'succeeded'
  ),
  3,
  'wardrobe examples remain proposal data and are not catalog rows'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);
set local role authenticated;

select throws_ok(
  $$
    select * from public.prepare_admin_ai_job(
      'content.goal_draft',
      'c3000000-0000-4000-8000-000000000041',
      '{"message":"Lav et mål","topic":{"title":"Balance"},"draft":{"title":"","summary":"","difficulty":"beginner","estimatedMinutes":null,"equipment":[]},"history":[]}'::jsonb
    )
  $$,
  '22023',
  'The admin AI request is invalid.',
  'goal input missing topic description fails closed'
);

select results_eq(
  $$
    select job_status::text
    from public.prepare_admin_ai_job(
      'content.goal_draft',
      'c3000000-0000-4000-8000-000000000040',
      '{"message":"Lav et begyndermål om balance","topic":{"title":"Balance","description":"Trygge balancelege."},"draft":{"title":"","summary":"","difficulty":"beginner","estimatedMinutes":null,"equipment":[]},"history":[]}'::jsonb
    )
  $$,
  $$ values ('awaiting_upload'::text) $$,
  'a valid goal request creates a version-pinned proposal job'
);

select results_eq(
  $$
    select job_status::text
    from public.prepare_admin_ai_job(
      'content.goal_draft',
      'c3000000-0000-4000-8000-000000000042',
      '{"message":"Hjælp med at beskrive et mål","topic":{"title":"Balance","description":""},"draft":{"title":"","summary":"","difficulty":"beginner","estimatedMinutes":null,"equipment":[]},"history":[]}'::jsonb
    )
  $$,
  $$ values ('awaiting_upload'::text) $$,
  'goal assistance also accepts an optional empty topic description'
);

select is(
  (
    select count(*)::integer
    from public.prepare_admin_ai_job(
      'content.goal_draft',
      'c3000000-0000-4000-8000-000000000040',
      '{"message":"Lav et begyndermål om balance","topic":{"title":"Balance","description":"Trygge balancelege."},"draft":{"title":"","summary":"","difficulty":"beginner","estimatedMinutes":null,"equipment":[]},"history":[]}'::jsonb
    )
  ),
  1,
  'an exact goal retry returns the existing proposal job'
);

select is(
  (
    select count(*)::integer
    from public.ai_jobs
    where client_request_id = 'c3000000-0000-4000-8000-000000000040'
      and requested_by = '10000000-0000-4000-8000-000000000003'
  ),
  1,
  'an exact goal retry remains a single database row'
);

reset role;
set local role service_role;

select results_eq(
  $$
    select operation_key
    from public.claim_admin_ai_job_for_worker(
      (select id from public.ai_jobs where client_request_id = 'c3000000-0000-4000-8000-000000000040')
    )
  $$,
  $$ values ('content.goal_draft'::text) $$,
  'the goal worker claim contains the dedicated operation contract'
);

select throws_ok(
  $$
    select public.complete_admin_ai_job_for_worker(
      (select id from public.ai_jobs where client_request_id = 'c3000000-0000-4000-8000-000000000040'),
      1::smallint,
      '{"reply":"Målet er klar til gennemgang.","suggestion":{"ready":true,"title":"Stå som en flamingo","summary":"Øv rolig balance på begge ben.","difficulty":"beginner","estimatedMinutes":10,"reason":"Passer til emnet."}}'::jsonb,
      'test-goal-missing',
      '{}'::jsonb,
      100::bigint
    )
  $$,
  '22023',
  'The structured admin AI result is invalid.',
  'goal output missing equipment fails closed'
);

select throws_ok(
  $$
    select public.complete_admin_ai_job_for_worker(
      (select id from public.ai_jobs where client_request_id = 'c3000000-0000-4000-8000-000000000040'),
      1::smallint,
      '{"reply":"Målet er klar til gennemgang.","suggestion":{"ready":true,"title":"Stå som en flamingo","summary":"Øv rolig balance på begge ben.","difficulty":"beginner","estimatedMinutes":null,"equipment":[],"reason":"Passer til emnet."}}'::jsonb,
      'test-goal-no-time',
      '{}'::jsonb,
      100::bigint
    )
  $$,
  '22023',
  'The structured admin AI result is invalid.',
  'a ready goal proposal must include a realistic time estimate'
);

select throws_ok(
  $$
    select public.complete_admin_ai_job_for_worker(
      (select id from public.ai_jobs where client_request_id = 'c3000000-0000-4000-8000-000000000040'),
      1::smallint,
      '{"reply":"Målet er klar til gennemgang.","suggestion":{"ready":true,"title":"Stå som en flamingo","summary":"Øv rolig balance på begge ben.","difficulty":"beginner","estimatedMinutes":10,"equipment":[],"reason":"Passer til emnet.","publish":true}}'::jsonb,
      'test-goal-extra',
      '{}'::jsonb,
      100::bigint
    )
  $$,
  '22023',
  'The structured admin AI result is invalid.',
  'goal output cannot add a publication control'
);

select lives_ok(
  $$
    select public.complete_admin_ai_job_for_worker(
      (select id from public.ai_jobs where client_request_id = 'c3000000-0000-4000-8000-000000000040'),
      1::smallint,
      '{"reply":"Målet er klar til menneskelig gennemgang.","suggestion":{"ready":true,"title":"Stå som en flamingo","summary":"Øv rolig balance på begge ben.","difficulty":"beginner","estimatedMinutes":10,"equipment":["En stabil stol"],"reason":"Målet er positivt og passer til emnet."}}'::jsonb,
      'test-goal-success',
      '{"total_tokens":160}'::jsonb,
      125::bigint
    )
  $$,
  'a valid structured goal proposal can complete'
);

select results_eq(
  $$
    select
      job.status::text,
      job.output_data #>> '{suggestion,title}',
      (select count(*)::integer from public.goals where title = 'Stå som en flamingo')
    from public.ai_jobs as job
    where job.client_request_id = 'c3000000-0000-4000-8000-000000000040'
  $$,
  $$ values ('succeeded'::text, 'Stå som en flamingo'::text, 0::integer) $$,
  'the goal result remains proposal data and creates no goal row'
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
    select version
    from public.publish_ai_operation_version(
      'content.goal_draft',
      'Opdateret testprompt til redaktionelle målforslag.',
      (
        select active_version_id
        from prompt_revision_baseline
        where operation_key = 'content.goal_draft'
      )
    )
  $$,
  $$
    select expected_next_version
    from prompt_revision_baseline
    where operation_key = 'content.goal_draft'
  $$,
  'an administrator can activate a new goal prompt version'
);

select results_eq(
  $$
    select job_status::text
    from public.prepare_admin_ai_job(
      'content.goal_draft',
      'c3000000-0000-4000-8000-000000000040',
      '{"message":"Lav et begyndermål om balance","topic":{"title":"Balance","description":"Trygge balancelege."},"draft":{"title":"","summary":"","difficulty":"beginner","estimatedMinutes":null,"equipment":[]},"history":[]}'::jsonb
    )
  $$,
  $$ values ('succeeded'::text) $$,
  'an exact retry still returns its original job after a prompt revision'
);

select is(
  (
    select operation_version_id
    from public.ai_jobs
    where client_request_id = 'c3000000-0000-4000-8000-000000000040'
  ),
  (
    select active_version_id
    from prompt_revision_baseline
    where operation_key = 'content.goal_draft'
  ),
  'the retried goal job remains pinned to its original immutable version'
);

select throws_ok(
  $$
    select * from public.prepare_admin_ai_job(
      'content.exercise_draft',
      'c3000000-0000-4000-8000-000000000051',
      '{"message":"Lav første øvelse","topic":{"title":"Balance","description":"Trygge balancelege."},"goal":{"title":"Stå som en flamingo","summary":"Øv rolig balance.","difficulty":"beginner","estimatedMinutes":10,"equipment":[]},"position":1,"sequence":[],"draft":{"title":"","instructions":"","measurement":"completion","targetValue":1,"recommendedMinutes":null,"equipment":[],"safetyNote":""},"history":[]}'::jsonb
    )
  $$,
  '22023',
  'The admin AI request is invalid.',
  'completion exercise input must keep targetValue null'
);

select results_eq(
  $$
    select job_status::text
    from public.prepare_admin_ai_job(
      'content.exercise_draft',
      'c3000000-0000-4000-8000-000000000050',
      '{"message":"Lav første øvelse","topic":{"title":"Balance","description":"Trygge balancelege."},"goal":{"title":"Stå som en flamingo","summary":"Øv rolig balance.","difficulty":"beginner","estimatedMinutes":10,"equipment":[]},"position":1,"sequence":[],"draft":{"title":"","instructions":"","measurement":"completion","targetValue":null,"recommendedMinutes":null,"equipment":[],"safetyNote":""},"history":[]}'::jsonb
    )
  $$,
  $$ values ('awaiting_upload'::text) $$,
  'a valid exercise request creates a version-pinned proposal job'
);

select is(
  (
    select count(*)::integer
    from public.prepare_admin_ai_job(
      'content.exercise_draft',
      'c3000000-0000-4000-8000-000000000050',
      '{"message":"Lav første øvelse","topic":{"title":"Balance","description":"Trygge balancelege."},"goal":{"title":"Stå som en flamingo","summary":"Øv rolig balance.","difficulty":"beginner","estimatedMinutes":10,"equipment":[]},"position":1,"sequence":[],"draft":{"title":"","instructions":"","measurement":"completion","targetValue":null,"recommendedMinutes":null,"equipment":[],"safetyNote":""},"history":[]}'::jsonb
    )
  ),
  1,
  'an exact exercise retry returns the existing proposal job'
);

select is(
  (
    select count(*)::integer
    from public.ai_jobs
    where client_request_id = 'c3000000-0000-4000-8000-000000000050'
      and requested_by = '10000000-0000-4000-8000-000000000003'
  ),
  1,
  'an exact exercise retry remains a single database row'
);

select results_eq(
  $$
    select job_status::text
    from public.prepare_admin_ai_job(
      'content.exercise_draft',
      'c3000000-0000-4000-8000-000000000052',
      '{"message":"Hjælp med et passende antal","topic":{"title":"Balance","description":""},"goal":{"title":"Stå som en flamingo","summary":"Øv rolig balance.","difficulty":"beginner","estimatedMinutes":10,"equipment":[]},"position":1,"sequence":[],"draft":{"title":"Flamingoben","instructions":"Stå ved en stol.","measurement":"repetitions","targetValue":null,"recommendedMinutes":null,"equipment":[],"safetyNote":""},"history":[]}'::jsonb
    )
  $$,
  $$ values ('awaiting_upload'::text) $$,
  'exercise assistance accepts an incomplete numeric target draft'
);

reset role;
set local role service_role;

select results_eq(
  $$
    select operation_key
    from public.claim_admin_ai_job_for_worker(
      (select id from public.ai_jobs where client_request_id = 'c3000000-0000-4000-8000-000000000050')
    )
  $$,
  $$ values ('content.exercise_draft'::text) $$,
  'the exercise worker claim contains the dedicated operation contract'
);

select throws_ok(
  $$
    select public.complete_admin_ai_job_for_worker(
      (select id from public.ai_jobs where client_request_id = 'c3000000-0000-4000-8000-000000000050'),
      1::smallint,
      '{"reply":"Øvelsen er klar.","suggestion":{"ready":true,"title":"Flamingoben","instructions":"Stå ved en stol og løft den ene fod.","measurement":"completion","targetValue":1,"recommendedMinutes":5,"equipment":["En stabil stol"],"safetyNote":"Få en voksen til at holde stolen.","reason":"Et roligt første trin."}}'::jsonb,
      'test-exercise-target',
      '{}'::jsonb,
      100::bigint
    )
  $$,
  '22023',
  'The structured admin AI result is invalid.',
  'exercise output enforces the measurement and target invariant'
);

select throws_ok(
  $$
    select public.complete_admin_ai_job_for_worker(
      (select id from public.ai_jobs where client_request_id = 'c3000000-0000-4000-8000-000000000050'),
      1::smallint,
      '{"reply":"Øvelsen er klar.","suggestion":{"ready":true,"title":"Flamingoben","instructions":"Stå ved en stol og løft den ene fod.","measurement":"completion","targetValue":null,"recommendedMinutes":5,"equipment":["En stabil stol"],"reason":"Et roligt første trin."}}'::jsonb,
      'test-exercise-missing',
      '{}'::jsonb,
      100::bigint
    )
  $$,
  '22023',
  'The structured admin AI result is invalid.',
  'exercise output missing safetyNote fails closed'
);

select throws_ok(
  $$
    select public.complete_admin_ai_job_for_worker(
      (select id from public.ai_jobs where client_request_id = 'c3000000-0000-4000-8000-000000000050'),
      1::smallint,
      '{"reply":"Øvelsen er klar.","suggestion":{"ready":true,"title":"Flamingoben","instructions":"Stå ved en stol og løft den ene fod.","measurement":"completion","targetValue":null,"recommendedMinutes":5,"equipment":["En stabil stol","en stabil stol"],"safetyNote":"Få en voksen til at holde stolen.","reason":"Et roligt første trin."}}'::jsonb,
      'test-exercise-equipment',
      '{}'::jsonb,
      100::bigint
    )
  $$,
  '22023',
  'The structured admin AI result is invalid.',
  'exercise equipment labels must be case-insensitively unique'
);

select lives_ok(
  $$
    select public.complete_admin_ai_job_for_worker(
      (select id from public.ai_jobs where client_request_id = 'c3000000-0000-4000-8000-000000000050'),
      1::smallint,
      '{"reply":"Øvelsen er klar til menneskelig gennemgang.","suggestion":{"ready":true,"title":"Flamingoben","instructions":"Stå ved en stabil stol, og løft forsigtigt den ene fod.","measurement":"completion","targetValue":null,"recommendedMinutes":5,"equipment":["En stabil stol"],"safetyNote":"Få en voksen til at holde stolen og hjælp, hvis du mister balancen.","reason":"Det er et roligt og tydeligt første trin."}}'::jsonb,
      'test-exercise-success',
      '{"total_tokens":190}'::jsonb,
      150::bigint
    )
  $$,
  'a valid structured exercise proposal can complete'
);

select results_eq(
  $$
    select
      job.status::text,
      job.output_data #>> '{suggestion,title}',
      (select count(*)::integer from public.exercises where title = 'Flamingoben')
    from public.ai_jobs as job
    where job.client_request_id = 'c3000000-0000-4000-8000-000000000050'
  $$,
  $$ values ('succeeded'::text, 'Flamingoben'::text, 0::integer) $$,
  'the exercise result remains proposal data and creates no exercise row'
);

select results_eq(
  $$
    select operation_key
    from public.claim_admin_ai_job_for_worker(
      (select id from public.ai_jobs where client_request_id = 'c3000000-0000-4000-8000-000000000052')
    )
  $$,
  $$ values ('content.exercise_draft'::text) $$,
  'the incomplete exercise request can be claimed for contextual help'
);

select throws_ok(
  $$
    select public.complete_admin_ai_job_for_worker(
      (select id from public.ai_jobs where client_request_id = 'c3000000-0000-4000-8000-000000000052'),
      1::smallint,
      '{"reply":"Forslaget er klar.","suggestion":{"ready":true,"title":"Flamingoben","instructions":"Stå ved en stol.","measurement":"repetitions","targetValue":null,"recommendedMinutes":5,"equipment":[],"safetyNote":"Få hjælp af en voksen.","reason":"Der mangler stadig et talmål."}}'::jsonb,
      'test-exercise-ready-without-target',
      '{}'::jsonb,
      100::bigint
    )
  $$,
  '22023',
  'The structured admin AI result is invalid.',
  'a ready numeric exercise proposal must contain its target'
);

select lives_ok(
  $$
    select public.complete_admin_ai_job_for_worker(
      (select id from public.ai_jobs where client_request_id = 'c3000000-0000-4000-8000-000000000052'),
      1::smallint,
      '{"reply":"Hvor mange gentagelser skal barnet sigte efter?","suggestion":{"ready":false,"title":"Flamingoben","instructions":"Stå ved en stol.","measurement":"repetitions","targetValue":null,"recommendedMinutes":null,"equipment":[],"safetyNote":"","reason":"Et talmål skal afklares, før forslaget er klar."}}'::jsonb,
      'test-exercise-clarification',
      '{"total_tokens":120}'::jsonb,
      100::bigint
    )
  $$,
  'an incomplete numeric proposal can safely return a clarification'
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
    select job_status::text
    from public.prepare_admin_ai_job(
      'content.topic_brief',
      'c3000000-0000-4000-8000-000000000030',
      '{"message":"Lav et dyrt forslag","draft":{"title":"","description":"","icon":"✨","accentColor":"#53C987"},"history":[]}'::jsonb
    )
  $$,
  $$ values ('awaiting_upload'::text) $$,
  'a separate job is prepared for cost-ceiling verification'
);

reset role;
set local role service_role;

select is(
  (
    select count(*)::integer
    from public.claim_admin_ai_job_for_worker(
      (select id from public.ai_jobs where client_request_id = 'c3000000-0000-4000-8000-000000000030')
    )
  ),
  1,
  'the cost test job can be claimed once'
);

select throws_ok(
  $$
    select public.complete_admin_ai_job_for_worker(
      (select id from public.ai_jobs where client_request_id = 'c3000000-0000-4000-8000-000000000030'),
      1::smallint,
      '{"reply":"Forslaget er klar.","suggestion":{"ready":true,"title":"Dyrelegen","description":"Leg som forskellige dyr.","icon":"🐾","accentColor":"#53C987","reason":"Klar til gennemgang."}}'::jsonb,
      'test-too-expensive',
      '{}'::jsonb,
      20001::bigint
    )
  $$,
  '40001',
  'The admin AI job exceeds its cost ceiling.',
  'completion cannot exceed the immutable cost ceiling'
);

select lives_ok(
  $$
    select public.fail_admin_ai_job_for_worker(
      (select id from public.ai_jobs where client_request_id = 'c3000000-0000-4000-8000-000000000030'),
      1::smallint,
      'cost_limit_exceeded',
      'provider_cost_limit_exceeded',
      'test-too-expensive',
      '{}'::jsonb,
      null::bigint
    )
  $$,
  'the worker can record a sanitized failure after refusing excess cost'
);

select results_eq(
  $$
    select status::text, public_error_code
    from public.ai_jobs
    where client_request_id = 'c3000000-0000-4000-8000-000000000030'
  $$,
  $$ values ('failed'::text, 'cost_limit_exceeded'::text) $$,
  'the rejected cost is exposed only as a stable public failure code'
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
    select version
    from public.publish_ai_operation_version(
      'content.topic_brief',
      'Opdateret testprompt til redaktionelle emneforslag.',
      (
        select active_version_id
        from prompt_revision_baseline
        where operation_key = 'content.topic_brief'
      )
    )
  $$,
  $$
    select expected_next_version
    from prompt_revision_baseline
    where operation_key = 'content.topic_brief'
  $$,
  'an administrator can publish a reviewed prompt-only revision'
);

select results_eq(
  $$
    select gateway, provider, model, request_options
    from public.ai_operations as operation
    join public.ai_operation_versions as version
      on version.id = operation.active_version_id
      and version.operation_id = operation.id
    where operation.operation_key = 'content.topic_brief'
  $$,
  $$
    values (
      'openrouter'::text,
      'openai'::text,
      'openai/gpt-5-mini'::text,
      '{"max_tokens":1200,"provider":{"only":["openai"],"allow_fallbacks":false,"require_parameters":true}}'::jsonb
    )
  $$,
  'prompt publication preserves the reviewed model and routing controls'
);

select results_eq(
  $$
    select job_status::text
    from public.prepare_admin_ai_job(
      'content.topic_brief',
      'c3000000-0000-4000-8000-000000000060',
      '{"message":"Lav et emne til en versionsprøve","draft":{"title":"","description":"","icon":"✨","accentColor":"#53C987"},"history":[]}'::jsonb
    )
  $$,
  $$ values ('awaiting_upload'::text) $$,
  'a queued topic job is pinned before a contract revision is published'
);

reset role;

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
  'a2000000-0000-4000-8000-000000000099'::uuid,
  operation.id,
  active_version.version + 1,
  'Inkompatibel testrevision, som kun bruges til at bevise versionsbinding.',
  active_version.gateway,
  active_version.provider,
  active_version.model,
  active_version.request_options,
  '{"type":"object","additionalProperties":false,"properties":{"revisionMarker":{"type":"string","enum":["v4"]}},"required":["revisionMarker"]}'::jsonb,
  '{"type":"object","additionalProperties":false,"properties":{"revisionMarker":{"type":"string","enum":["v4"]}},"required":["revisionMarker"]}'::jsonb,
  active_version.max_attempts,
  active_version.timeout_ms,
  active_version.max_cost_microusd
from public.ai_operations as operation
join public.ai_operation_versions as active_version
  on active_version.id = operation.active_version_id
  and active_version.operation_id = operation.id
where operation.operation_key = 'content.topic_brief';

update public.ai_operations
set active_version_id = 'a2000000-0000-4000-8000-000000000099'
where operation_key = 'content.topic_brief';

-- Simulate application validators changing with the newly published contract.
-- Existing jobs must continue to use the immutable contracts they were pinned
-- to when they were created.
create or replace function private.is_valid_admin_ai_input(
  p_operation_key text,
  p_input_data jsonb
)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select false;
$$;

create or replace function private.is_valid_admin_ai_output(
  p_operation_key text,
  p_output_data jsonb
)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select false;
$$;

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  (
    select count(*)::integer
    from public.prepare_admin_ai_job(
      'content.topic_brief',
      'c3000000-0000-4000-8000-000000000060',
      '{"message":"Lav et emne til en versionsprøve","draft":{"title":"","description":"","icon":"✨","accentColor":"#53C987"},"history":[]}'::jsonb
    )
  ),
  1,
  'an exact retry returns the queued job after active validation changes'
);

select isnt(
  (
    select operation_version_id
    from public.ai_jobs
    where client_request_id = 'c3000000-0000-4000-8000-000000000060'
  ),
  'a2000000-0000-4000-8000-000000000099'::uuid,
  'the queued job remains pinned to its original contract version'
);

reset role;
set local role service_role;

select results_eq(
  $$
    select operation_key
    from public.claim_admin_ai_job_for_worker(
      (select id from public.ai_jobs where client_request_id = 'c3000000-0000-4000-8000-000000000060')
    )
  $$,
  $$ values ('content.topic_brief'::text) $$,
  'the worker claims the queued job against its pinned input contract'
);

select lives_ok(
  $$
    select public.complete_admin_ai_job_for_worker(
      (select id from public.ai_jobs where client_request_id = 'c3000000-0000-4000-8000-000000000060'),
      1::smallint,
      '{"reply":"Versionsprøven er klar.","suggestion":{"ready":true,"title":"Versionsbanen","description":"En syntetisk prøve af versionsbinding.","icon":"✨","accentColor":"#53C987","reason":"Klar til menneskelig gennemgang."}}'::jsonb,
      'test-pinned-contract-success',
      '{"total_tokens":120}'::jsonb,
      100::bigint
    )
  $$,
  'the worker completes the queued job against its pinned output contract'
);

select results_eq(
  $$
    select status::text, actual_cost_microusd
    from public.ai_jobs
    where client_request_id = 'c3000000-0000-4000-8000-000000000060'
  $$,
  $$ values ('succeeded'::text, 100::bigint) $$,
  'the old-version job succeeds without being reinterpreted by the new contract'
);

select * from finish();

rollback;
