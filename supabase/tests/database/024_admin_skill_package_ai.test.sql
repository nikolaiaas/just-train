begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(41);

create temporary table admin_skill_package_fixture as
with wardrobe_items as (
  select jsonb_agg(
    jsonb_build_object(
      'ordinal', ordinal,
      'name', format('Driblingsting %s', ordinal),
      'description', format('Du kan bruge garderobeting %s til din dribleleg.', ordinal),
      'visualDescription', format('A centered friendly blue football wardrobe object, variant %s.', ordinal),
      'category', case when ordinal % 3 = 0 then 'effect'
        when ordinal % 2 = 0 then 'equipment' else 'clothing' end,
      'equipSlot', (array['head', 'body', 'held', 'feet', 'accessory'])[
        ((ordinal - 1) % 5) + 1
      ],
      'rarity', case when ordinal % 5 = 0 then 'special'
        when ordinal % 2 = 0 then 'rare' else 'common' end,
      'points', 100,
      'unlockRule', '',
      'reason', format('Passer til driblingstrin %s.', ordinal)
    )
    order by ordinal
  ) as items
  from generate_series(1, 16) as ordinal
), fixture as (
  select
    jsonb_build_object(
      'message', 'Foreslå flere tydelige færdigheder til emnet.',
      'topic', jsonb_build_object(
        'title', 'Fodbold',
        'description', 'Leg med bolden og lær nye færdigheder trin for trin.'
      ),
      'existingSkills', jsonb_build_array(
        jsonb_build_object(
          'title', 'Lær at jonglere',
          'summary', 'Byg boldkontrol op med små, sjove trin.'
        )
      ),
      'history', '[]'::jsonb
    ) as suggestion_input,
    jsonb_build_object(
      'reply', 'Her er tre tydelige muligheder.',
      'skills', jsonb_build_array(
        jsonb_build_object(
          'ordinal', 1,
          'title', 'Dribling',
          'slug', 'dribling',
          'childDescription', 'Du lærer at holde bolden tæt på dig.',
          'difficulty', 'beginner',
          'estimatedMinutes', 30,
          'editorialReason', 'Et godt første trin.'
        ),
        jsonb_build_object(
          'ordinal', 2,
          'title', 'Aflevering',
          'slug', 'aflevering',
          'childDescription', 'Du lærer at sende bolden præcist til en ven.',
          'difficulty', 'beginner',
          'estimatedMinutes', 30,
          'editorialReason', 'Bygger videre på boldkontrol.'
        ),
        jsonb_build_object(
          'ordinal', 3,
          'title', 'Skud',
          'slug', 'skud',
          'childDescription', 'Du lærer at sparke bolden mod et mål.',
          'difficulty', 'intermediate',
          'estimatedMinutes', 35,
          'editorialReason', 'Giver et motiverende næste trin.'
        )
      )
    ) as suggestion_output,
    jsonb_build_object(
      'message', 'Lav hele færdigheden Dribling i én pakke.',
      'topic', jsonb_build_object(
        'title', 'Fodbold',
        'description', 'Leg med bolden og lær nye færdigheder trin for trin.'
      ),
      'skillSeed', jsonb_build_object(
        'title', 'Dribling',
        'childDescription', 'Du lærer at holde bolden tæt på dig.',
        'difficulty', 'beginner',
        'estimatedMinutes', 30
      ),
      'existingSkills', jsonb_build_array(
        jsonb_build_object(
          'title', 'Lær at jonglere',
          'slug', 'laer-at-jonglere'
        )
      ),
      'history', '[]'::jsonb
    ) as package_input,
    jsonb_build_object(
      'reply', 'Her er hele færdigheden som et udkast.',
      'skill', jsonb_build_object(
        'title', 'Dribling',
        'slug', 'dribling',
        'childDescription', 'Du lærer at holde bolden tæt på dig.',
        'difficulty', 'beginner',
        'estimatedMinutes', 30,
        'equipment', jsonb_build_array('Bold', 'Kegler'),
        'editorialReason', 'Et godt første trin.'
      ),
      'exercises', jsonb_build_array(
        jsonb_build_object(
          'ordinal', 1,
          'title', 'Hold bolden tæt',
          'slug', 'hold-bolden-taet',
          'childInstructions', 'Du går frem og prikker bolden let med skiftevis højre og venstre fod.',
          'measurement', 'completion',
          'targetValue', null,
          'recommendedMinutes', 10,
          'equipment', jsonb_build_array('Bold'),
          'childSafetyNote', 'Få hjælp af en voksen, hvis underlaget er glat.',
          'editorialReason', 'Et trygt første trin.'
        ),
        jsonb_build_object(
          'ordinal', 2,
          'title', 'Dribl mellem kegler',
          'slug', 'dribl-mellem-kegler',
          'childInstructions', 'Du fører bolden roligt mellem fire kegler.',
          'measurement', 'repetitions',
          'targetValue', 4,
          'recommendedMinutes', 12,
          'equipment', jsonb_build_array('Bold', 'Kegler'),
          'childSafetyNote', 'Du stopper, hvis noget gør ondt.',
          'editorialReason', 'Gør retningen mere udfordrende.'
        )
      )
    ) as package_output,
    jsonb_build_object(
      'message', 'Lav 16 garderobeting til færdigheden Dribling. Brug hele fodboldemnet som ramme.',
      'topic', jsonb_build_object(
        'title', 'Fodbold',
        'description', 'Leg med bolden og lær nye færdigheder trin for trin.'
      ),
      'history', '[]'::jsonb
    ) as plan_input,
    jsonb_build_object('items', wardrobe_items.items) as plan_output,
    wardrobe_items.items
  from wardrobe_items
)
select
  fixture.suggestion_input,
  fixture.suggestion_output,
  fixture.package_input,
  fixture.package_output,
  fixture.plan_input,
  fixture.plan_output,
  jsonb_build_object(
    'topic', fixture.plan_input -> 'topic',
    'items', (
      select jsonb_agg(
        jsonb_build_object(
          'ordinal', item -> 'ordinal',
          'name', item -> 'name',
          'visualDescription', item -> 'visualDescription',
          'equipSlot', item -> 'equipSlot'
        )
        order by (item ->> 'ordinal')::integer
      )
      from jsonb_array_elements(fixture.items) as item
    )
  ) as image_input,
  jsonb_build_object(
    'sheetPath', 'fe500000-0000-4000-8000-000000000004/sheet.png',
    'items', (
      select jsonb_agg(
        jsonb_build_object(
          'ordinal', ordinal,
          'imagePath', format(
            'fe500000-0000-4000-8000-000000000004/%s.png',
            lpad(ordinal::text, 2, '0')
          )
        )
        order by ordinal
      )
      from generate_series(1, 16) as ordinal
    )
  ) as image_output
from fixture;

grant select on admin_skill_package_fixture to authenticated, service_role;

select results_eq(
  $$
    select operation_key, id
    from public.ai_operations
    where operation_key in ('content.skill_suggestions', 'content.skill_package')
    order by operation_key
  $$,
  $$
    values
      ('content.skill_package'::text, 'a1000000-0000-4000-8000-000000000012'::uuid),
      ('content.skill_suggestions'::text, 'a1000000-0000-4000-8000-000000000011'::uuid)
  $$,
  'both stable skill operation identifiers exist'
);
select results_eq(
  $$
    select operation.operation_key, version.id, version.version, version.gateway, version.provider, version.model
    from public.ai_operations as operation
    join public.ai_operation_versions as version on version.id = operation.active_version_id
    where operation.operation_key in ('content.skill_suggestions', 'content.skill_package')
    order by operation.operation_key
  $$,
  $$
    values
      ('content.skill_package'::text, 'a2000000-0000-4000-8000-000000000014'::uuid, 1, 'openrouter'::text, 'openai'::text, 'openai/gpt-5-mini'::text),
      ('content.skill_suggestions'::text, 'a2000000-0000-4000-8000-000000000013'::uuid, 1, 'openrouter'::text, 'openai'::text, 'openai/gpt-5-mini'::text)
  $$,
  'both operations activate the fixed immutable OpenAI versions'
);
select ok(
  (
    select bool_and(
      request_options -> 'provider' =
        '{"only":["openai"],"allow_fallbacks":false,"require_parameters":true}'::jsonb
    )
    from public.ai_operation_versions
    where id in (
      'a2000000-0000-4000-8000-000000000013',
      'a2000000-0000-4000-8000-000000000014'
    )
  ),
  'skill operations disable fallback and require supported OpenAI parameters'
);
select is(
  (
    select count(*)::integer
    from public.ai_operations as operation
    join public.ai_operation_versions as version on version.id = operation.active_version_id
    where operation.operation_key in (
      'content.topic_brief',
      'content.wardrobe_examples',
      'content.goal_draft',
      'content.exercise_draft',
      'content.draft_review',
      'content.wardrobe_grid_plan',
      'content.skill_suggestions',
      'content.skill_package'
    )
      and position('“Børn kan øve sig med bolden”' in version.prompt_template) > 0
      and position('“Forældre hjælper med øvelsen”' in version.prompt_template) > 0
      and position('“Spørg dine forældre om hjælp”' in version.prompt_template) > 0
      and position('“Få hjælp af en voksen”' in version.prompt_template) > 0
  ),
  8,
  'all child-visible active prompts distinguish narration from direct guidance'
);
select has_table('private', 'admin_topic_ai_job_context', 'topic jobs have a private context binding');
select has_table('private', 'admin_skill_package_saves', 'atomic saves have a private idempotency receipt');
select ok(
  (select relrowsecurity from pg_class where oid = 'private.admin_topic_ai_job_context'::regclass),
  'topic job context is default-deny with RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'private.admin_skill_package_saves'::regclass),
  'skill save receipts are default-deny with RLS enabled'
);
select is(has_table_privilege('authenticated', 'private.admin_topic_ai_job_context', 'select'), false, 'authenticated clients cannot browse topic bindings');
select ok(has_function_privilege('authenticated', 'public.prepare_admin_topic_ai_job(text,uuid,uuid,jsonb)', 'execute'), 'administrators can enter the topic-bound prepare boundary');
select ok(has_function_privilege('authenticated', 'public.read_admin_topic_ai_job(uuid)', 'execute'), 'administrators can read caller-owned topic jobs');
select ok(has_function_privilege('authenticated', 'public.save_admin_skill_package_draft(uuid,uuid,uuid,uuid,uuid,timestamptz)', 'execute'), 'administrators can enter the atomic save boundary');
select ok(has_function_privilege('service_role', 'public.claim_admin_skill_job_for_worker(uuid)', 'execute'), 'the worker can claim new skill jobs');
select is(has_function_privilege('authenticated', 'public.claim_admin_skill_job_for_worker(uuid)', 'execute'), false, 'browser clients cannot claim skill jobs');
select ok(has_function_privilege('service_role', 'public.complete_admin_skill_job_for_worker(uuid,smallint,jsonb,text,jsonb,bigint)', 'execute'), 'the worker can complete new skill jobs');
select is(has_function_privilege('authenticated', 'public.complete_admin_skill_job_for_worker(uuid,smallint,jsonb,text,jsonb,bigint)', 'execute'), false, 'browser clients cannot forge skill completion');
select ok(private.has_parent_framed_child_copy('Dit barn lærer at drible.'), 'adult-framed child copy is detected');
select is(private.has_parent_framed_child_copy('Få hjælp af en voksen.'), false, 'direct child safety guidance remains allowed');
select ok(
  private.has_parent_framed_child_copy('Barnet lærer at drible.')
  and private.has_parent_framed_child_copy('Børn kan øve sig med bolden.')
  and private.has_parent_framed_child_copy('Barn løber gennem banen.')
  and private.has_parent_framed_child_copy('Børn dribler med bolden.')
  and private.has_parent_framed_child_copy('Forældre skal holde bolden.')
  and private.has_parent_framed_child_copy('Forældre hjælper med øvelsen.')
  and not private.has_parent_framed_child_copy('Spørg dine forældre om hjælp.')
  and not private.has_parent_framed_child_copy('Leg med andre børn og skiftes til bolden.'),
  'narrator and parent instructions are rejected while direct child guidance remains valid'
);
select ok(
  private.has_parent_framed_child_copy('Som forælder kan du stille keglerne frem.')
  and private.has_parent_framed_child_copy('Kære forældre, find en bold sammen.')
  and private.has_parent_framed_child_copy('Denne besked er til forældrene.')
  and private.has_parent_framed_child_copy('Forælderen bør hjælpe med banen.'),
  'explicit parent-address variants are rejected consistently'
);
select ok(private.is_valid_admin_skill_ai_output('content.skill_suggestions', (select suggestion_output from admin_skill_package_fixture)), 'ordered child-facing suggestions pass completion invariants');
select is(
  private.is_valid_admin_skill_ai_output(
    'content.skill_suggestions',
    jsonb_set(
      (select suggestion_output from admin_skill_package_fixture),
      '{skills,0,childDescription}',
      '"Børn kan øve sig med bolden."'::jsonb
    )
  ),
  false,
  'parent-framed suggestions fail completion invariants'
);
select ok(private.is_valid_admin_skill_ai_output('content.skill_package', (select package_output from admin_skill_package_fixture)), 'a complete child-facing package passes invariants');
select is(
  private.is_valid_admin_skill_ai_output(
    'content.skill_package',
    jsonb_set(
      (select package_output from admin_skill_package_fixture),
      '{exercises,0,targetValue}',
      '3'::jsonb
    )
  ),
  false,
  'completion exercises reject a non-null target'
);

set local role anon;
select throws_ok(
  $$ select * from public.prepare_admin_topic_ai_job('content.skill_suggestions', 'fe400000-0000-4000-8000-000000000099', '40000000-0000-4000-8000-000000000001', '{}'::jsonb) $$,
  '42501',
  'permission denied for function prepare_admin_topic_ai_job',
  'anonymous callers cannot prepare topic jobs'
);

reset role;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;

select throws_ok(
  $$
    select * from public.prepare_admin_topic_ai_job(
      'content.skill_suggestions',
      'fe400000-0000-4000-8000-000000000098',
      '40000000-0000-4000-8000-000000000001',
      jsonb_set((select suggestion_input from admin_skill_package_fixture), '{topic,title}', '"Gymnastik"'::jsonb)
    )
  $$,
  '40001',
  'The topic AI request does not match the saved topic.',
  'topic copy spoofing fails before job creation'
);
select results_eq(
  $$
    select job_status::text
    from public.prepare_admin_topic_ai_job(
      'content.skill_suggestions',
      'fe400000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      (select suggestion_input from admin_skill_package_fixture)
    )
  $$,
  $$ values ('awaiting_upload'::text) $$,
  'an administrator can prepare a strict suggestion job'
);
select is(
  (
    select count(distinct job_id)::integer
    from public.prepare_admin_topic_ai_job(
      'content.skill_suggestions',
      'fe400000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      (select suggestion_input from admin_skill_package_fixture)
    )
  ),
  1,
  'an exact prepare retry returns the same job'
);
select throws_ok(
  $$
    select * from public.prepare_admin_topic_ai_job(
      'content.skill_suggestions',
      'fe400000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      jsonb_set((select suggestion_input from admin_skill_package_fixture), '{message}', '"Andet arbejde"'::jsonb)
    )
  $$,
  '23505',
  'The request identity is already used for different work.',
  'changed payload cannot reuse a prepare identity'
);

reset role;
set local role service_role;
select results_eq(
  $$
    select operation_key, capability
    from public.claim_admin_skill_job_for_worker(
      (select id from public.ai_jobs where client_request_id = 'fe400000-0000-4000-8000-000000000001')
    )
  $$,
  $$ values ('content.skill_suggestions'::text, 'structured_text'::text) $$,
  'the dedicated worker claim accepts the new suggestion operation'
);
select lives_ok(
  $$
    select public.complete_admin_skill_job_for_worker(
      (select id from public.ai_jobs where client_request_id = 'fe400000-0000-4000-8000-000000000001'),
      1::smallint,
      (select suggestion_output from admin_skill_package_fixture),
      'synthetic-request',
      '{}'::jsonb,
      1000
    )
  $$,
  'a valid child-facing suggestion completes once'
);

reset role;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select results_eq(
  $$
    select operation_key, job_status::text
    from public.read_admin_topic_ai_job(
      (select id from public.ai_jobs where client_request_id = 'fe400000-0000-4000-8000-000000000001')
    )
  $$,
  $$ values ('content.skill_suggestions'::text, 'succeeded'::text) $$,
  'the requester can read the sanitized succeeded job result'
);
select results_eq(
  $$
    select request.operation_key, prepared.job_status::text
    from (
      values
        ('content.skill_package'::text, 'fe400000-0000-4000-8000-000000000002'::uuid, (select package_input from admin_skill_package_fixture)),
        ('content.wardrobe_grid_plan'::text, 'fe400000-0000-4000-8000-000000000003'::uuid, (select plan_input from admin_skill_package_fixture)),
        ('content.wardrobe_grid_image'::text, 'fe400000-0000-4000-8000-000000000004'::uuid, (select image_input from admin_skill_package_fixture))
    ) as request(operation_key, request_id, input_data)
    cross join lateral public.prepare_admin_topic_ai_job(
      request.operation_key,
      request.request_id,
      '40000000-0000-4000-8000-000000000001',
      request.input_data
    ) as prepared
    order by request.operation_key
  $$,
  $$
    values
      ('content.skill_package'::text, 'awaiting_upload'::text),
      ('content.wardrobe_grid_image'::text, 'awaiting_upload'::text),
      ('content.wardrobe_grid_plan'::text, 'awaiting_upload'::text)
  $$,
  'the complete package and both reused wardrobe stages are topic-bound'
);

reset role;
update public.ai_jobs as job
set status = 'succeeded',
    output_data = case job.client_request_id
      when 'fe400000-0000-4000-8000-000000000002' then (select package_output from admin_skill_package_fixture)
      when 'fe400000-0000-4000-8000-000000000003' then (select plan_output from admin_skill_package_fixture)
      when 'fe400000-0000-4000-8000-000000000004' then jsonb_build_object(
        'sheetPath', job.id::text || '/sheet.png',
        'items', (
          select jsonb_agg(
            jsonb_build_object(
              'ordinal', ordinal,
              'imagePath', job.id::text || '/' || lpad(ordinal::text, 2, '0') || '.png'
            )
            order by ordinal
          )
          from generate_series(1, 16) as ordinal
        )
      )
    end,
    actual_cost_microusd = 1000,
    completed_at = now()
where job.client_request_id in (
  'fe400000-0000-4000-8000-000000000002',
  'fe400000-0000-4000-8000-000000000003',
  'fe400000-0000-4000-8000-000000000004'
);

create temporary table admin_skill_package_revision as
select private.admin_topic_tree_updated_at(
  '40000000-0000-4000-8000-000000000001'
) as updated_at;
grant select on admin_skill_package_revision to authenticated;

select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;

select ok(
  (
    select changed
      and cardinality(exercise_ids) = 2
      and cardinality(wardrobe_item_ids) = 16
    from public.save_admin_skill_package_draft(
      '40000000-0000-4000-8000-000000000001',
      (select id from public.ai_jobs where client_request_id = 'fe400000-0000-4000-8000-000000000002'),
      (select id from public.ai_jobs where client_request_id = 'fe400000-0000-4000-8000-000000000003'),
      (select id from public.ai_jobs where client_request_id = 'fe400000-0000-4000-8000-000000000004'),
      'fe400000-0000-4000-8000-000000000005',
      (select updated_at from admin_skill_package_revision)
    )
  ),
  'one transaction saves the complete draft package'
);

-- The next assertions inspect private editorial state that is intentionally
-- unavailable to browser roles. The save itself above still ran as the admin.
reset role;
select results_eq(
  $$
    select title, summary, is_published, content_version
    from public.goals
    where topic_id = '40000000-0000-4000-8000-000000000001'
      and slug = 'dribling'
  $$,
  $$ values ('Dribling'::text, 'Du lærer at holde bolden tæt på dig.'::text, false, 1) $$,
  'the generated skill is an unpublished child-facing goal draft'
);
select results_eq(
  $$
    select count(*)::integer, bool_and(not is_published), min(sort_order), max(sort_order)
    from public.exercises
    where goal_id = (select id from public.goals where topic_id = '40000000-0000-4000-8000-000000000001' and slug = 'dribling')
  $$,
  $$ values (2, true, 0, 1) $$,
  'all generated exercises are ordered unpublished drafts'
);
select results_eq(
  $$
    select count(*)::integer, bool_and(not is_published), bool_and(editorial_status = 'draft'), count(image_path)::integer
    from public.wardrobe_items
    where topic_id = '40000000-0000-4000-8000-000000000001'
      and created_at >= (select created_at from private.admin_skill_package_saves where client_request_id = 'fe400000-0000-4000-8000-000000000005')
  $$,
  $$ values (16, true, true, 16) $$,
  'all sixteen generated wardrobe crops remain unpublished and unapproved'
);

select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select ok(
  (
    select not changed
      and goal_id = (select id from public.goals where topic_id = '40000000-0000-4000-8000-000000000001' and slug = 'dribling')
    from public.save_admin_skill_package_draft(
      '40000000-0000-4000-8000-000000000001',
      (select id from public.ai_jobs where client_request_id = 'fe400000-0000-4000-8000-000000000002'),
      (select id from public.ai_jobs where client_request_id = 'fe400000-0000-4000-8000-000000000003'),
      (select id from public.ai_jobs where client_request_id = 'fe400000-0000-4000-8000-000000000004'),
      'fe400000-0000-4000-8000-000000000005',
      '2020-01-01 00:00:00+00'
    )
  ),
  'an exact save retry returns the original IDs before revision checks'
);
select throws_ok(
  $$
    select * from public.save_admin_skill_package_draft(
      '40000000-0000-4000-8000-000000000001',
      (select id from public.ai_jobs where client_request_id = 'fe400000-0000-4000-8000-000000000002'),
      (select id from public.ai_jobs where client_request_id = 'fe400000-0000-4000-8000-000000000003'),
      (select id from public.ai_jobs where client_request_id = 'fe400000-0000-4000-8000-000000000004'),
      'fe400000-0000-4000-8000-000000000006',
      (select updated_at from admin_skill_package_revision)
    )
  $$,
  '23505',
  'The skill proposal has already been saved.',
  'one succeeded skill proposal cannot be saved twice under new identities'
);
select has_function(
  'public',
  'prepare_admin_ai_job',
  array['text', 'uuid', 'jsonb'],
  'the prior generic admin preparation contract remains installed'
);
select is(has_table_privilege('authenticated', 'private.admin_skill_package_saves', 'select'), false, 'authenticated clients cannot browse save receipts');

select * from finish();
rollback;
