begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(42);

create temporary table admin_skill_curriculum_fixture as
with curriculum as (
  select
    jsonb_build_object(
      'message', 'Planlæg et helt begyndervenligt fodboldforløb.',
      'topic', jsonb_build_object(
        'title', 'Fodbold',
        'description', 'Leg med bolden og lær nye færdigheder trin for trin.'
      ),
      'existingSkills', jsonb_build_array(
        jsonb_build_object(
          'slug', 'laer-at-jonglere',
          'title', 'Lær at jonglere'
        )
      ),
      'history', '[]'::jsonb,
      'skillCount', 2,
      'exercisesPerSkill', 2
    ) as curriculum_input,
    jsonb_build_object(
      'reply', 'Her er et samlet forløb med fire øvelser.',
      'skills', jsonb_build_array(
        jsonb_build_object(
          'ordinal', 1,
          'title', 'Dribling',
          'slug', 'dribling-batch',
          'childDescription', 'Du lærer at holde bolden tæt på dig.',
          'difficulty', 'beginner',
          'estimatedMinutes', 30,
          'equipment', jsonb_build_array('Bold', 'Kegler'),
          'editorialReason', 'Et trygt første trin.',
          'exercises', jsonb_build_array(
            jsonb_build_object(
              'ordinal', 1,
              'title', 'Hold bolden tæt',
              'slug', 'hold-bolden-batch',
              'childInstructions', 'Du prikker bolden roligt frem med begge fødder.',
              'measurement', 'completion',
              'targetValue', null,
              'recommendedMinutes', 10,
              'equipment', jsonb_build_array('Bold'),
              'childSafetyNote', 'Du stopper, hvis noget gør ondt.',
              'editorialReason', 'Giver sikker boldkontakt.'
            ),
            jsonb_build_object(
              'ordinal', 2,
              'title', 'Dribl mellem kegler',
              'slug', 'dribl-kegler-batch',
              'childInstructions', 'Du fører bolden gennem fire kegler.',
              'measurement', 'repetitions',
              'targetValue', 4,
              'recommendedMinutes', 12,
              'equipment', jsonb_build_array('Bold', 'Kegler'),
              'childSafetyNote', 'Få hjælp af en voksen, hvis banen er glat.',
              'editorialReason', 'Træner små retningsskift.'
            )
          )
        ),
        jsonb_build_object(
          'ordinal', 2,
          'title', 'Aflevering',
          'slug', 'aflevering-batch',
          'childDescription', 'Du lærer at sende bolden præcist videre.',
          'difficulty', 'beginner',
          'estimatedMinutes', 30,
          'equipment', jsonb_build_array('Bold', 'Kegler'),
          'editorialReason', 'Bygger videre på din boldkontrol.',
          'exercises', jsonb_build_array(
            jsonb_build_object(
              'ordinal', 1,
              'title', 'Spark til en ven',
              'slug', 'spark-ven-batch',
              'childInstructions', 'Du sparker roligt til en ven og tager imod igen.',
              'measurement', 'repetitions',
              'targetValue', 6,
              'recommendedMinutes', 10,
              'equipment', jsonb_build_array('Bold'),
              'childSafetyNote', 'Du holder god afstand til andre spillere.',
              'editorialReason', 'Gør afleveringen social og tydelig.'
            ),
            jsonb_build_object(
              'ordinal', 2,
              'title', 'Ram et mål',
              'slug', 'ram-maal-batch',
              'childInstructions', 'Du sigter mellem to kegler og afleverer bolden.',
              'measurement', 'duration',
              'targetValue', 60,
              'recommendedMinutes', 12,
              'equipment', jsonb_build_array('Bold', 'Kegler'),
              'childSafetyNote', 'Du henter først bolden, når banen er fri.',
              'editorialReason', 'Samler retning og præcision.'
            )
          )
        )
      )
    ) as curriculum_output
), wardrobe as (
  select jsonb_agg(
    jsonb_build_object(
      'ordinal', ordinal,
      'name', format('Forløbsting %s', ordinal),
      'description', format('Du kan bruge ting %s i dit fodboldforløb.', ordinal),
      'visualDescription', format('A centered friendly football item, variant %s.', ordinal),
      'category', case when ordinal % 3 = 0 then 'effect'
        when ordinal % 2 = 0 then 'equipment' else 'clothing' end,
      'equipSlot', (array['head', 'body', 'held', 'feet', 'accessory'])[
        ((ordinal - 1) % 5) + 1
      ],
      'rarity', case when ordinal % 5 = 0 then 'special'
        when ordinal % 2 = 0 then 'rare' else 'common' end,
      'points', 100,
      'unlockRule', '',
      'reason', format('Passer til hele forløbet, variant %s.', ordinal)
    )
    order by ordinal
  ) as items
  from generate_series(1, 16) as ordinal
)
select
  curriculum.curriculum_input,
  curriculum.curriculum_output,
  jsonb_build_object(
    'history', '[]'::jsonb,
    'message', 'Lav 16 garderobeting til hele forløbet. Færdigheder og øvelser i rækkefølge: 1. Dribling: Hold b, Dribl · 2. Aflevering: Spark, Ram et. Tingene skal passe til hele emnet og alle færdigheder.',
    'topic', curriculum.curriculum_input -> 'topic'
  ) as plan_input,
  jsonb_build_object('items', wardrobe.items) as plan_output,
  jsonb_build_object(
    'topic', curriculum.curriculum_input -> 'topic',
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
      from jsonb_array_elements(wardrobe.items) as item
    )
  ) as image_input,
  wardrobe.items
from curriculum, wardrobe;

grant select on admin_skill_curriculum_fixture to authenticated, service_role;

select results_eq(
  $$
    select operation_key, id
    from public.ai_operations
    where operation_key = 'content.skill_curriculum'
  $$,
  $$
    values (
      'content.skill_curriculum'::text,
      'a1000000-0000-4000-8000-000000000013'::uuid
    )
  $$,
  'the curriculum operation has a stable identifier'
);
select results_eq(
  $$
    select version.id, version.version, version.gateway, version.provider, version.model
    from public.ai_operations as operation
    join public.ai_operation_versions as version
      on version.id = operation.active_version_id
    where operation.operation_key = 'content.skill_curriculum'
  $$,
  $$
    values (
      'a2000000-0000-4000-8000-000000000015'::uuid,
      1,
      'openrouter'::text,
      'openai'::text,
      'openai/gpt-5-mini'::text
    )
  $$,
  'the curriculum operation activates its immutable OpenAI version'
);
select ok(
  (
    select position('alderssvarende dansk' in version.prompt_template) > 0
      and position('uforklarede engelske ord' in version.prompt_template) > 0
    from public.ai_operations as operation
    join public.ai_operation_versions as version
      on version.id = operation.active_version_id
    where operation.operation_key = 'content.skill_curriculum'
  ),
  'the curriculum prompt requires natural Danish child-visible copy'
);
select results_eq(
  $$
    select operation.active_version_id, version.version
    from public.ai_operations as operation
    join public.ai_operation_versions as version
      on version.id = operation.active_version_id
    where operation.operation_key = 'content.wardrobe_grid_plan'
  $$,
  $$
    values ('a2000000-0000-4000-8000-000000000016'::uuid, 3)
  $$,
  'the wardrobe grid activates its immutable semantic prompt revision'
);
select ok(
  (
    select position('ordinal være præcis i' in version.prompt_template) > 0
      and position('Hvis points er større end 0' in version.prompt_template) > 0
      and position('Hvis points er 0' in version.prompt_template) > 0
      and position('naturligt, alderssvarende dansk' in version.prompt_template) > 0
      and position('category clothing, equipment eller effect' in version.prompt_template) > 0
      and position('equipSlot head, body, held, feet eller accessory' in version.prompt_template) > 0
      and position('rarity common, rare eller special' in version.prompt_template) > 0
    from public.ai_operations as operation
    join public.ai_operation_versions as version
      on version.id = operation.active_version_id
    where operation.operation_key = 'content.wardrobe_grid_plan'
  ),
  'the wardrobe prompt states positional, reward, language, and enum invariants'
);
select ok(
  (
    select active.request_options = previous.request_options
      and active.input_contract = previous.input_contract
      and active.output_contract = previous.output_contract
      and active.gateway = previous.gateway
      and active.provider = previous.provider
      and active.model = previous.model
      and active.max_attempts = previous.max_attempts
      and active.timeout_ms = previous.timeout_ms
      and active.max_cost_microusd = previous.max_cost_microusd
    from public.ai_operations as operation
    join public.ai_operation_versions as active
      on active.id = operation.active_version_id
    join public.ai_operation_versions as previous
      on previous.operation_id = active.operation_id
      and previous.version = active.version - 1
    where operation.operation_key = 'content.wardrobe_grid_plan'
  ),
  'the wardrobe semantic revision preserves routing, limits, and contracts'
);
select has_table(
  'private',
  'admin_skill_curriculum_job_context',
  'curriculum jobs have a private topic binding'
);
select has_table(
  'private',
  'admin_skill_curriculum_saves',
  'curriculum saves have a private idempotency receipt'
);
select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'private.admin_skill_curriculum_job_context'::regclass
  ),
  'curriculum job context has RLS enabled'
);
select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'private.admin_skill_curriculum_saves'::regclass
  ),
  'curriculum save receipts have RLS enabled'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.prepare_admin_skill_curriculum_job(uuid,uuid,jsonb)',
    'execute'
  ),
  'authenticated administrators can enter the curriculum prepare boundary'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.claim_admin_skill_curriculum_job_for_worker(uuid)',
    'execute'
  ),
  'the worker can claim a curriculum job'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.claim_admin_skill_curriculum_job_for_worker(uuid)',
    'execute'
  ),
  false,
  'browser clients cannot claim curriculum jobs'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.complete_admin_skill_curriculum_job_for_worker(uuid,smallint,jsonb,text,jsonb,bigint)',
    'execute'
  ),
  'the worker can complete curriculum jobs'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.save_admin_skill_curriculum_draft(uuid,uuid,uuid,uuid,uuid,timestamptz)',
    'execute'
  ),
  'administrators can enter the atomic curriculum save boundary'
);
select ok(
  private.is_valid_admin_skill_curriculum_input(
    (select curriculum_input from admin_skill_curriculum_fixture)
  ),
  'two skills with two exercises each is a valid explicit request'
);
select is(
  private.is_valid_admin_skill_curriculum_input(
    jsonb_set(
      jsonb_set(
        (select curriculum_input from admin_skill_curriculum_fixture),
        '{skillCount}',
        '5'::jsonb
      ),
      '{exercisesPerSkill}',
      '7'::jsonb
    )
  ),
  false,
  'requests over the thirty-two exercise ceiling fail closed'
);
select ok(
  private.is_valid_admin_skill_curriculum_output(
    (select curriculum_output from admin_skill_curriculum_fixture),
    2,
    2
  ),
  'the exact ordered child-facing curriculum passes completion invariants'
);
select is(
  private.is_valid_admin_skill_curriculum_output(
    (select curriculum_output from admin_skill_curriculum_fixture),
    3,
    2
  ),
  false,
  'output must contain exactly the requested skill count'
);
select is(
  private.is_valid_admin_skill_curriculum_output(
    jsonb_set(
      (select curriculum_output from admin_skill_curriculum_fixture),
      '{skills,0,exercises,0,childInstructions}',
      '"Forældre hjælper med øvelsen."'::jsonb
    ),
    2,
    2
  ),
  false,
  'parent-framed exercise copy fails completion invariants'
);
select is(
  private.admin_skill_curriculum_wardrobe_message(
    (select curriculum_output from admin_skill_curriculum_fixture)
  ),
  (select plan_input ->> 'message' from admin_skill_curriculum_fixture),
  'the bounded wardrobe lineage includes every skill and exercise title'
);

set local role anon;
select throws_ok(
  $$
    select * from public.prepare_admin_skill_curriculum_job(
      'fc400000-0000-4000-8000-000000000099',
      '40000000-0000-4000-8000-000000000001',
      '{}'::jsonb
    )
  $$,
  '42501',
  'permission denied for function prepare_admin_skill_curriculum_job',
  'anonymous callers cannot prepare curriculum jobs'
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
    select * from public.prepare_admin_skill_curriculum_job(
      'fc400000-0000-4000-8000-000000000098',
      '40000000-0000-4000-8000-000000000001',
      jsonb_set(
        (select curriculum_input from admin_skill_curriculum_fixture),
        '{existingSkills}',
        '[]'::jsonb
      )
    )
  $$,
  '40001',
  'The skill curriculum request does not match the saved topic.',
  'the browser cannot omit persisted skills from the trusted context'
);
select results_eq(
  $$
    select job_status::text
    from public.prepare_admin_skill_curriculum_job(
      'fc400000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      (select curriculum_input from admin_skill_curriculum_fixture)
    )
  $$,
  $$ values ('awaiting_upload'::text) $$,
  'an administrator can prepare a strict curriculum job'
);
select is(
  (
    select count(distinct job_id)::integer
    from public.prepare_admin_skill_curriculum_job(
      'fc400000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      (select curriculum_input from admin_skill_curriculum_fixture)
    )
  ),
  1,
  'an exact curriculum prepare retry returns the same job'
);
select results_eq(
  $$
    select job_status::text
    from public.prepare_admin_skill_curriculum_job(
      'fc400000-0000-4000-8000-000000000002',
      '40000000-0000-4000-8000-000000000001',
      (select curriculum_input from admin_skill_curriculum_fixture)
    )
  $$,
  $$ values ('awaiting_upload'::text) $$,
  'a second independently reviewable curriculum can be prepared'
);
select is(
  (
    select count(*)::integer
    from (
      values
        ('content.wardrobe_grid_plan'::text, 'fc400000-0000-4000-8000-000000000003'::uuid, (select plan_input from admin_skill_curriculum_fixture)),
        ('content.wardrobe_grid_plan'::text, 'fc400000-0000-4000-8000-000000000004'::uuid, (select plan_input from admin_skill_curriculum_fixture)),
        ('content.wardrobe_grid_image'::text, 'fc400000-0000-4000-8000-000000000005'::uuid, (select image_input from admin_skill_curriculum_fixture)),
        ('content.wardrobe_grid_image'::text, 'fc400000-0000-4000-8000-000000000006'::uuid, (select image_input from admin_skill_curriculum_fixture))
    ) as request(operation_key, request_id, input_data)
    cross join lateral public.prepare_admin_topic_ai_job(
      request.operation_key,
      request.request_id,
      '40000000-0000-4000-8000-000000000001',
      request.input_data
    ) as prepared
    where prepared.job_status = 'awaiting_upload'
  ),
  4,
  'both concurrent candidates get one shared plan and image stage'
);

reset role;
set local role service_role;
select results_eq(
  $$
    select operation_key, capability
    from public.claim_admin_skill_curriculum_job_for_worker(
      (
        select id
        from public.ai_jobs
        where client_request_id = 'fc400000-0000-4000-8000-000000000001'
      )
    )
  $$,
  $$ values ('content.skill_curriculum'::text, 'structured_text'::text) $$,
  'the dedicated worker claims the new operation'
);
select throws_ok(
  $$
    select public.complete_admin_skill_curriculum_job_for_worker(
      (
        select id
        from public.ai_jobs
        where client_request_id = 'fc400000-0000-4000-8000-000000000001'
      ),
      1::smallint,
      jsonb_set(
        (select curriculum_output from admin_skill_curriculum_fixture),
        '{skills,0,exercises}',
        (
          (select curriculum_output #> '{skills,0,exercises}' from admin_skill_curriculum_fixture)
          || jsonb_build_array(
            jsonb_build_object(
              'ordinal', 3,
              'title', 'Stands bolden',
              'slug', 'stands-bolden-batch',
              'childInstructions', 'Du standser bolden under din fod.',
              'measurement', 'completion',
              'targetValue', null,
              'recommendedMinutes', 5,
              'equipment', jsonb_build_array('Bold'),
              'childSafetyNote', 'Du holder afstand til andre.',
              'editorialReason', 'Et ekstra trin.'
            )
          )
        )
      ),
      'synthetic-invalid-count',
      '{}'::jsonb,
      1000
    )
  $$,
  '22023',
  'The structured skill curriculum result is invalid.',
  'completion rejects a schema-valid result with the wrong requested count'
);
select lives_ok(
  $$
    select public.complete_admin_skill_curriculum_job_for_worker(
      (
        select id
        from public.ai_jobs
        where client_request_id = 'fc400000-0000-4000-8000-000000000001'
      ),
      1::smallint,
      (select curriculum_output from admin_skill_curriculum_fixture),
      'synthetic-valid-curriculum',
      '{}'::jsonb,
      1000
    )
  $$,
  'the exact requested curriculum completes once'
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
    select operation_key, job_status::text
    from public.read_admin_skill_curriculum_job(
      (
        select id
        from public.ai_jobs
        where client_request_id = 'fc400000-0000-4000-8000-000000000001'
      )
    )
  $$,
  $$ values ('content.skill_curriculum'::text, 'succeeded'::text) $$,
  'the requester can read the sanitized curriculum result'
);

reset role;
update public.ai_jobs as job
set status = 'succeeded',
    output_data = case
      when job.client_request_id = 'fc400000-0000-4000-8000-000000000002'
        then (select curriculum_output from admin_skill_curriculum_fixture)
      when job.client_request_id in (
        'fc400000-0000-4000-8000-000000000003',
        'fc400000-0000-4000-8000-000000000004'
      ) then (select plan_output from admin_skill_curriculum_fixture)
      when job.client_request_id in (
        'fc400000-0000-4000-8000-000000000005',
        'fc400000-0000-4000-8000-000000000006'
      ) then jsonb_build_object(
        'sheetPath', job.id::text || '/sheet.png',
        'items', (
          select jsonb_agg(
            jsonb_build_object(
              'ordinal', ordinal,
              'imagePath', job.id::text || '/'
                || lpad(ordinal::text, 2, '0') || '.png'
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
  'fc400000-0000-4000-8000-000000000002',
  'fc400000-0000-4000-8000-000000000003',
  'fc400000-0000-4000-8000-000000000004',
  'fc400000-0000-4000-8000-000000000005',
  'fc400000-0000-4000-8000-000000000006'
);

create temporary table admin_skill_curriculum_revision as
select
  private.admin_topic_tree_updated_at(
    '40000000-0000-4000-8000-000000000001'
  ) as updated_at,
  (
    select coalesce(max(goal.sort_order), -1) + 1
    from public.goals as goal
    where goal.topic_id = '40000000-0000-4000-8000-000000000001'
  ) as next_goal_sort_order;
grant select on admin_skill_curriculum_revision to authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);
set local role authenticated;
select ok(
  (
    select changed
      and cardinality(goal_ids) = 2
      and cardinality(exercise_ids) = 4
      and cardinality(wardrobe_item_ids) = 16
    from public.save_admin_skill_curriculum_draft(
      '40000000-0000-4000-8000-000000000001',
      (select id from public.ai_jobs where client_request_id = 'fc400000-0000-4000-8000-000000000001'),
      (select id from public.ai_jobs where client_request_id = 'fc400000-0000-4000-8000-000000000003'),
      (select id from public.ai_jobs where client_request_id = 'fc400000-0000-4000-8000-000000000005'),
      'fc400000-0000-4000-8000-000000000007',
      (select updated_at from admin_skill_curriculum_revision)
    )
  ),
  'one transaction saves every curriculum row and exactly sixteen wardrobe drafts'
);

reset role;
select results_eq(
  $$
    select title, sort_order, is_published
    from public.goals
    where slug in ('dribling-batch', 'aflevering-batch')
    order by sort_order
  $$,
  $$
    select 'Dribling'::text, next_goal_sort_order, false
    from admin_skill_curriculum_revision
    union all
    select 'Aflevering'::text, next_goal_sort_order + 1, false
    from admin_skill_curriculum_revision
  $$,
  'all generated skills are ordered unpublished drafts after existing content'
);
select results_eq(
  $$
    select goal.slug, count(*)::integer, min(exercise.sort_order), max(exercise.sort_order), bool_and(not exercise.is_published)
    from public.goals as goal
    join public.exercises as exercise on exercise.goal_id = goal.id
    where goal.slug in ('dribling-batch', 'aflevering-batch')
    group by goal.slug
    order by goal.slug
  $$,
  $$
    values
      ('aflevering-batch'::text, 2, 0, 1, true),
      ('dribling-batch'::text, 2, 0, 1, true)
  $$,
  'each generated skill owns exactly its ordered exercise set'
);
select results_eq(
  $$
    select count(*)::integer, bool_and(not item.is_published), bool_and(item.editorial_status = 'draft'), count(item.image_path)::integer
    from private.admin_skill_curriculum_saves as receipt
    cross join unnest(receipt.wardrobe_item_ids) as saved(item_id)
    join public.wardrobe_items as item on item.id = saved.item_id
    where receipt.client_request_id = 'fc400000-0000-4000-8000-000000000007'
  $$,
  $$ values (16, true, true, 16) $$,
  'all sixteen topic wardrobe items remain unpublished and unapproved'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);
set local role authenticated;
select ok(
  (
    select not changed
      and cardinality(goal_ids) = 2
      and cardinality(exercise_ids) = 4
      and cardinality(wardrobe_item_ids) = 16
    from public.save_admin_skill_curriculum_draft(
      '40000000-0000-4000-8000-000000000001',
      (select id from public.ai_jobs where client_request_id = 'fc400000-0000-4000-8000-000000000001'),
      (select id from public.ai_jobs where client_request_id = 'fc400000-0000-4000-8000-000000000003'),
      (select id from public.ai_jobs where client_request_id = 'fc400000-0000-4000-8000-000000000005'),
      'fc400000-0000-4000-8000-000000000007',
      '2020-01-01 00:00:00+00'
    )
  ),
  'an exact save retry returns its receipt before checking a stale revision'
);
select throws_ok(
  $$
    select * from public.save_admin_skill_curriculum_draft(
      '40000000-0000-4000-8000-000000000001',
      (select id from public.ai_jobs where client_request_id = 'fc400000-0000-4000-8000-000000000002'),
      (select id from public.ai_jobs where client_request_id = 'fc400000-0000-4000-8000-000000000004'),
      (select id from public.ai_jobs where client_request_id = 'fc400000-0000-4000-8000-000000000006'),
      'fc400000-0000-4000-8000-000000000008',
      (select updated_at from admin_skill_curriculum_revision)
    )
  $$,
  '40001',
  'The topic changed before the curriculum could be saved.',
  'a concurrent candidate with the same old revision loses atomically'
);

reset role;
select results_eq(
  $$
    select
      count(*)::integer,
      (select count(*)::integer from public.goals where slug in ('dribling-batch', 'aflevering-batch')),
      (select count(*)::integer from public.exercises where slug in ('hold-bolden-batch', 'dribl-kegler-batch', 'spark-ven-batch', 'ram-maal-batch'))
    from private.admin_skill_curriculum_saves
    where curriculum_job_id in (
      select id
      from public.ai_jobs
      where client_request_id in (
        'fc400000-0000-4000-8000-000000000001',
        'fc400000-0000-4000-8000-000000000002'
      )
    )
  $$,
  $$ values (1, 2, 4) $$,
  'the stale concurrent save leaves no receipt or partial content'
);
select has_function(
  'public',
  'save_admin_skill_package_draft',
  array['uuid', 'uuid', 'uuid', 'uuid', 'uuid', 'timestamp with time zone'],
  'the prior one-skill atomic save remains installed'
);
select is(
  has_table_privilege(
    'authenticated',
    'private.admin_skill_curriculum_saves',
    'select'
  ),
  false,
  'authenticated clients cannot browse curriculum receipts'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.complete_admin_skill_curriculum_job_for_worker(uuid,smallint,jsonb,text,jsonb,bigint)',
    'execute'
  ),
  false,
  'browser clients cannot forge curriculum completion'
);
select is(
  has_function_privilege(
    'anon',
    'public.save_admin_skill_curriculum_draft(uuid,uuid,uuid,uuid,uuid,timestamptz)',
    'execute'
  ),
  false,
  'anonymous clients cannot save curriculum drafts'
);

select * from finish();
rollback;
