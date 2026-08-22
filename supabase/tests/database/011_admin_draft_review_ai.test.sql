begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(22);

select results_eq(
  $$
    select operation_key, capability
    from public.ai_operations
    where operation_key = 'content.draft_review'
  $$,
  $$ values ('content.draft_review'::text, 'structured_text'::text) $$,
  'the bounded draft-review operation exists'
);

select results_eq(
  $$
    select version, gateway, provider, model
    from public.ai_operation_versions as version
    join public.ai_operations as operation
      on operation.active_version_id = version.id
      and operation.id = version.operation_id
    where operation.operation_key = 'content.draft_review'
  $$,
  $$ values (1, 'openrouter'::text, 'openai'::text, 'openai/gpt-5-mini'::text) $$,
  'the review operation pins its immutable OpenAI-only route'
);

select is(
  (
    select version.prompt_template like
      '%Du må aldrig ændre felter, oprette eller gemme indhold, godkende, publicere%'
    from public.ai_operation_versions as version
    join public.ai_operations as operation
      on operation.active_version_id = version.id
    where operation.operation_key = 'content.draft_review'
  ),
  true,
  'the review prompt explicitly forbids save, approval, and publication actions'
);

select is(
  (
    select version
    from public.ai_operation_versions as version
    join public.ai_operations as operation
      on operation.active_version_id = version.id
    where operation.operation_key = 'content.topic_brief'
  ),
  2,
  'the tested topic prompt revision is active as immutable version 2'
);

select is(
  (
    select right(prompt_template, 95)
    from public.ai_operation_versions as version
    join public.ai_operations as operation
      on operation.active_version_id = version.id
    where operation.operation_key = 'content.topic_brief'
  ),
  'Kort beskrivelse skal være højst 400 tegn inklusive mellemrum. Skriv helst 1-2 korte sætninger.',
  'topic prompt version 2 carries the tested short-description guidance'
);

savepoint preserve_newer_topic_prompt_versions;

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
  candidate.id,
  active_version.operation_id,
  candidate.version,
  active_version.prompt_template || candidate.prompt_suffix,
  active_version.gateway,
  active_version.provider,
  active_version.model,
  active_version.request_options,
  active_version.input_contract,
  active_version.output_contract,
  active_version.max_attempts,
  active_version.timeout_ms,
  active_version.max_cost_microusd
from public.ai_operations as operation
join public.ai_operation_versions as active_version
  on active_version.id = operation.active_version_id
  and active_version.operation_id = operation.id
cross join (
  values
    (
      'a2000000-0000-4000-8000-000000000093'::uuid,
      3,
      ' Administrator revision 3.'::text
    ),
    (
      'a2000000-0000-4000-8000-000000000094'::uuid,
      4,
      ' Administrator revision 4.'::text
    )
) as candidate(id, version, prompt_suffix)
where operation.operation_key = 'content.topic_brief';

update public.ai_operations
set active_version_id = 'a2000000-0000-4000-8000-000000000094'
where operation_key = 'content.topic_brief';

select is(
  private.apply_seeded_topic_brief_length_guidance(),
  false,
  'the seed upgrade skips a topic prompt with newer administrator revisions'
);

select is(
  (
    select active_version_id
    from public.ai_operations
    where operation_key = 'content.topic_brief'
  ),
  'a2000000-0000-4000-8000-000000000094'::uuid,
  'the seed upgrade preserves the active administrator revision'
);

select is(
  (
    select count(*)
    from public.ai_operation_versions as version
    join public.ai_operations as operation
      on operation.id = version.operation_id
    where operation.operation_key = 'content.topic_brief'
  ),
  4::bigint,
  'the seed upgrade does not append or replace a version beside newer revisions'
);

rollback to savepoint preserve_newer_topic_prompt_versions;

select is(
  (
    select output_contract #> '{properties,checklist,required}'
    from public.ai_operation_versions as version
    join public.ai_operations as operation
      on operation.active_version_id = version.id
    where operation.operation_key = 'content.draft_review'
  ),
  '["topic","goal","exercise","wardrobe"]'::jsonb,
  'the output contract requires a check for every authoring area'
);

select is(
  (
    select output_contract ->> 'additionalProperties'
    from public.ai_operation_versions as version
    join public.ai_operations as operation
      on operation.active_version_id = version.id
    where operation.operation_key = 'content.draft_review'
  ),
  'false',
  'the output contract rejects mutation or publication fields'
);

create temporary table review_content_counts as
select
  (select count(*) from public.topics) as topics,
  (select count(*) from public.goals) as goals,
  (select count(*) from public.exercises) as exercises;

create temporary table review_test_input(input_data jsonb not null);

insert into review_test_input(input_data)
values ('{
  "message":"Gennemgå hele forløbet og peg på det vigtigste næste trin.",
  "topic":{"title":"Balanceeventyr","description":"Trygge balancelege med små succeser.","icon":"🧭","accentColor":"#53C987"},
  "goal":{"title":"Gå på balancebane","summary":"Barnet gennemfører en kort og rolig balancebane.","difficulty":"beginner","estimatedMinutes":15,"equipment":["Malertape"]},
  "exercise":{"title":"Følg stregen","instructions":"Gå langsomt hen over stregen med armene ud til siden.","measurement":"completion","targetValue":null,"recommendedMinutes":8,"equipment":["Malertape"],"safetyNote":"En voksen holder sig tæt på, og gulvet skal være frit."},
  "wardrobeExamples":[
    {"name":"Stjernestøvler","icon":"⭐","category":"clothing","rarity":"common","points":100,"unlockRule":"","reason":"Et brandfrit eksempel til balanceeventyret."},
    {"name":"Regnbuespor","icon":"🌈","category":"effect","rarity":"rare","points":250,"unlockRule":"","reason":"En synlig belønning uden køb eller brand."},
    {"name":"Balancekrone","icon":"👑","category":"clothing","rarity":"special","points":0,"unlockRule":"Gennemfør det første mål","reason":"En milepælsbelønning med en tydelig regel."}
  ],
  "history":[]
}'::jsonb);

grant select on review_content_counts, review_test_input
  to authenticated, service_role;

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
      'content.draft_review',
      'c3000000-0000-4000-8000-000000000070',
      (select input_data from review_test_input)
    )
  $$,
  $$ values ('awaiting_upload'::text) $$,
  'an administrator can prepare a complete non-mutating review'
);

select throws_ok(
  $$
    select * from public.prepare_admin_ai_job(
      'content.draft_review',
      'c3000000-0000-4000-8000-000000000071',
      (select input_data - 'wardrobeExamples' from review_test_input)
    )
  $$,
  '22023',
  'The admin AI request is invalid.',
  'review input missing one authoring area fails closed'
);

select throws_ok(
  $$
    select * from public.prepare_admin_ai_job(
      'content.draft_review',
      'c3000000-0000-4000-8000-000000000072',
      jsonb_set(
        (select input_data from review_test_input),
        '{exercise,safetyNote}',
        '""'::jsonb
      )
    )
  $$,
  '22023',
  'The admin AI request is invalid.',
  'review input cannot omit a required saved exercise value'
);

select throws_ok(
  $$
    select * from public.prepare_admin_ai_job(
      'content.draft_review',
      'c3000000-0000-4000-8000-000000000073',
      jsonb_set(
        (select input_data from review_test_input),
        '{wardrobeExamples}',
        ((select input_data -> 'wardrobeExamples' from review_test_input) -> 0)
      )
    )
  $$,
  '22023',
  'The admin AI request is invalid.',
  'a non-array wardrobe context fails closed'
);

reset role;
set local role service_role;

select results_eq(
  $$
    select operation_key
    from public.claim_admin_ai_job_for_worker(
      (
        select id
        from public.ai_jobs
        where client_request_id = 'c3000000-0000-4000-8000-000000000070'
      )
    )
  $$,
  $$ values ('content.draft_review'::text) $$,
  'the worker claims the review against its pinned contract'
);

select throws_ok(
  $$
    select public.complete_admin_ai_job_for_worker(
      (select id from public.ai_jobs where client_request_id = 'c3000000-0000-4000-8000-000000000070'),
      1::smallint,
      '{"reply":"Klar.","verdict":"ready_for_human_review","checklist":{"topic":{"status":"ok","note":"Klar."},"goal":{"status":"ok","note":"Klar."},"exercise":{"status":"ok","note":"Klar."},"wardrobe":{"status":"optional","note":"Valgfri."}},"nextActions":[],"published":true}'::jsonb,
      'test-review-invalid-publish',
      '{}'::jsonb,
      100::bigint
    )
  $$,
  '22023',
  'The structured admin AI result is invalid.',
  'a review result cannot smuggle a publication field'
);

select throws_ok(
  $$
    select public.complete_admin_ai_job_for_worker(
      (select id from public.ai_jobs where client_request_id = 'c3000000-0000-4000-8000-000000000070'),
      1::smallint,
      '{"reply":"Næsten klar.","verdict":"needs_attention","checklist":{"topic":{"status":"ok","note":"Klar."},"goal":{"status":"ok","note":"Klar."},"exercise":{"status":"attention","note":"Læs sikkerheden igen."},"wardrobe":{"status":"optional","note":"Valgfri."}},"nextActions":["Læs sikkerheden igen","læs sikkerheden igen"]}'::jsonb,
      'test-review-duplicate-action',
      '{}'::jsonb,
      100::bigint
    )
  $$,
  '22023',
  'The structured admin AI result is invalid.',
  'duplicate review actions fail the database invariant'
);

select lives_ok(
  $$
    select public.complete_admin_ai_job_for_worker(
      (select id from public.ai_jobs where client_request_id = 'c3000000-0000-4000-8000-000000000070'),
      1::smallint,
      '{"reply":"Forløbet hænger sammen og er klar til menneskelig gennemgang.","verdict":"ready_for_human_review","checklist":{"topic":{"status":"ok","note":"Emnet er tydeligt."},"goal":{"status":"ok","note":"Målet passer til emnet."},"exercise":{"status":"ok","note":"Måling og sikkerhed er konkrete."},"wardrobe":{"status":"ok","note":"Tre brandfrie eksempler er med."}},"nextActions":["Læs hele forløbet højt én gang"]}'::jsonb,
      'test-review-success',
      '{"total_tokens":180}'::jsonb,
      100::bigint
    )
  $$,
  'a strict non-mutating review can complete'
);

select results_eq(
  $$
    select status::text, output_data ->> 'verdict'
    from public.ai_jobs
    where client_request_id = 'c3000000-0000-4000-8000-000000000070'
  $$,
  $$ values ('succeeded'::text, 'ready_for_human_review'::text) $$,
  'the structured checklist is retained as proposal output'
);

select is(
  (
    select not (output_data ?| array['suggestion', 'items', 'published', 'saved'])
    from public.ai_jobs
    where client_request_id = 'c3000000-0000-4000-8000-000000000070'
  ),
  true,
  'review output has no draft mutation, save, or publication shape'
);

select results_eq(
  $$
    select
      (select count(*) from public.topics),
      (select count(*) from public.goals),
      (select count(*) from public.exercises)
  $$,
  $$ select topics, goals, exercises from review_content_counts $$,
  'preparing and completing a review does not change content rows'
);

select is(
  (
    select jsonb_array_length(input_data -> 'wardrobeExamples')
    from public.ai_jobs
    where client_request_id = 'c3000000-0000-4000-8000-000000000070'
  ),
  3,
  'the complete bounded wardrobe-example context is pinned with the job'
);

select * from finish();

rollback;
