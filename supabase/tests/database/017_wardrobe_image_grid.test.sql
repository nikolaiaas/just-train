begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(61);

create temporary table wardrobe_grid_fixtures as
with plan_items as (
  select jsonb_agg(
    jsonb_build_object(
      'ordinal', ordinal,
      'name', format('Syntetisk ting %s', ordinal),
      'description', format('En børnevenlig garderobeting nummer %s.', ordinal),
      'visualDescription', format(
        'A complete friendly blue synthetic wardrobe object for cell %s.',
        ordinal
      ),
      'category', case when ordinal % 3 = 0 then 'effect'
        when ordinal % 2 = 0 then 'equipment' else 'clothing' end,
      'equipSlot', (array['head', 'body', 'held', 'feet', 'accessory'])[
        ((ordinal - 1) % 5) + 1
      ],
      'rarity', case when ordinal % 5 = 0 then 'special'
        when ordinal % 2 = 0 then 'rare' else 'common' end,
      'points', 100,
      'unlockRule', '',
      'reason', format('Et syntetisk eksempel til placering %s.', ordinal)
    )
    order by ordinal
  ) as items
  from generate_series(1, 16) as ordinal
), fixture as (
  select
    jsonb_build_object(
      'message', 'Lav et varieret sæt med tydelige former.',
      'topic', jsonb_build_object(
        'title', 'Syntetisk balanceeventyr',
        'description', 'Trygge lege med balance og bevægelse.'
      ),
      'history', jsonb_build_array(
        jsonb_build_object(
          'role', 'user',
          'content', 'Brug venlige blå og grønne farver.'
        )
      )
    ) as plan_input,
    jsonb_build_object('items', plan_items.items) as plan_output,
    plan_items.items
  from plan_items
)
select
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
    'sheetPath', 'fd500000-0000-4000-8000-000000000001/sheet.png',
    'items', (
      select jsonb_agg(
        jsonb_build_object(
          'ordinal', ordinal,
          'imagePath', format(
            'fd500000-0000-4000-8000-000000000001/%s.png',
            lpad(ordinal::text, 2, '0')
          )
        )
        order by ordinal
      )
      from generate_series(1, 16) as ordinal
    )
  ) as image_output
from fixture;

create temporary table wardrobe_grid_review_fixture as
select jsonb_build_object(
  'message', 'Gennemgå hele den syntetiske kladde.',
  'topic', jsonb_build_object(
    'title', 'Syntetisk balanceeventyr',
    'description', 'Trygge lege med balance og bevægelse.',
    'icon', '✨',
    'accentColor', '#53C987'
  ),
  'goal', jsonb_build_object(
    'title', 'Gå på balancebane',
    'summary', 'Gennemfør en kort balancebane.',
    'difficulty', 'beginner',
    'estimatedMinutes', 15,
    'equipment', jsonb_build_array('Malertape')
  ),
  'exercise', jsonb_build_object(
    'title', 'Følg stregen',
    'instructions', 'Gå langsomt hen over stregen.',
    'measurement', 'completion',
    'targetValue', null,
    'recommendedMinutes', 8,
    'equipment', jsonb_build_array('Malertape'),
    'safetyNote', 'En voksen holder sig tæt på.'
  ),
  'wardrobeExamples', (
    select jsonb_agg(
      jsonb_build_object(
        'name', format('Gemt ting %s', ordinal),
        'icon', '✨',
        'category', 'clothing',
        'equipSlot', (array['head', 'body', 'held', 'feet', 'accessory'])[
          ((ordinal - 1) % 5) + 1
        ],
        'rarity', 'common',
        'points', 100,
        'unlockRule', '',
        'reason', format('Gemt syntetisk ting %s.', ordinal)
      )
      order by ordinal
    )
    from generate_series(1, 16) as ordinal
  ),
  'history', '[]'::jsonb
) as input_data;

grant select on wardrobe_grid_fixtures, wardrobe_grid_review_fixture
  to authenticated, service_role;

select has_column(
  'public',
  'wardrobe_items',
  'description',
  'catalogue items can persist optional public copy'
);
select has_column(
  'public',
  'wardrobe_items',
  'image_path',
  'catalogue items can reference a synthetic crop'
);
select has_column(
  'private',
  'wardrobe_item_revisions',
  'description',
  'pending published-item copy is staged privately'
);
select has_column(
  'private',
  'wardrobe_item_revisions',
  'image_path',
  'pending published-item images are staged privately'
);
select ok(
  (
    select is_nullable = 'YES'
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'wardrobe_items'
      and column_name = 'description'
  )
  and (
    select is_nullable = 'YES'
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'wardrobe_items'
      and column_name = 'image_path'
  ),
  'both new catalogue fields remain nullable for legacy rows and clients'
);
select ok(
  private.is_valid_wardrobe_item_image_path(
    'fd500000-0000-4000-8000-000000000001/01.png'
  )
  and private.is_valid_wardrobe_item_image_path(
    'fd500000-0000-4000-8000-000000000001/16.png'
  )
  and not private.is_valid_wardrobe_item_image_path(
    'fd500000-0000-4000-8000-000000000001/00.png'
  )
  and not private.is_valid_wardrobe_item_image_path(
    'fd500000-0000-4000-8000-000000000001/17.png'
  )
  and not private.is_valid_wardrobe_item_image_path(
    'fd500000-0000-4000-8000-000000000001/sheet.png'
  ),
  'catalogue paths accept only row-major crops 01 through 16'
);
select results_eq(
  $$
    select
      bucket.public,
      bucket.file_size_limit,
      bucket.allowed_mime_types
    from storage.buckets as bucket
    where bucket.id = 'wardrobe-images'
  $$,
  $$
    values (
      true,
      16777216::bigint,
      array['image/png']::text[]
    )
  $$,
  'the synthetic wardrobe bucket is public, PNG-only, and size-bounded'
);
select results_eq(
  $$
    select policy.cmd::text collate "default", policy.roles
    from pg_policies as policy
    where policy.schemaname = 'storage'
      and policy.tablename = 'objects'
      and policy.policyname = 'Anyone can read public wardrobe images'
  $$,
  $$ values ('SELECT'::text, array['public']::name[]) $$,
  'the wardrobe bucket has one explicit public read policy'
);
select ok(
  has_column_privilege(
    'anon',
    'public.wardrobe_items',
    'description',
    'select'
  )
  and has_column_privilege(
    'anon',
    'public.wardrobe_items',
    'image_path',
    'select'
  )
  and has_column_privilege(
    'authenticated',
    'public.wardrobe_items',
    'description',
    'insert'
  )
  and has_column_privilege(
    'authenticated',
    'public.wardrobe_items',
    'image_path',
    'update'
  )
  and has_function_privilege(
    'authenticated',
    'private.is_valid_wardrobe_item_image_path(text)',
    'execute'
  )
  and has_function_privilege(
    'service_role',
    'private.is_valid_wardrobe_item_image_path(text)',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'private.is_valid_wardrobe_item_image_path(text)',
    'execute'
  ),
  'readers can see image copy and trusted writers can reach its path check'
);
select has_function(
  'public',
  'save_admin_wardrobe_item_draft_with_image',
  array[
    'uuid',
    'uuid',
    'timestamp with time zone',
    'text',
    'text',
    'text',
    'text',
    'wardrobe_item_category',
    'wardrobe_equip_slot',
    'wardrobe_item_rarity',
    'integer',
    'text',
    'text',
    'integer'
  ],
  'new clients have one unambiguous image-aware wardrobe save RPC'
);
select has_function(
  'public',
  'save_admin_wardrobe_item_draft',
  array[
    'uuid',
    'uuid',
    'timestamp with time zone',
    'text',
    'text',
    'wardrobe_item_category',
    'wardrobe_equip_slot',
    'wardrobe_item_rarity',
    'integer',
    'text',
    'text',
    'integer'
  ],
  'the installed legacy save RPC remains available'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.save_admin_wardrobe_item_draft_with_image(uuid,uuid,timestamp with time zone,text,text,text,text,wardrobe_item_category,wardrobe_equip_slot,wardrobe_item_rarity,integer,text,text,integer)',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'public.save_admin_wardrobe_item_draft_with_image(uuid,uuid,timestamp with time zone,text,text,text,text,wardrobe_item_category,wardrobe_equip_slot,wardrobe_item_rarity,integer,text,text,integer)',
    'execute'
  )
  and not has_function_privilege(
    'service_role',
    'public.save_admin_wardrobe_item_draft_with_image(uuid,uuid,timestamp with time zone,text,text,text,text,wardrobe_item_category,wardrobe_equip_slot,wardrobe_item_rarity,integer,text,text,integer)',
    'execute'
  ),
  'only authenticated admin sessions may enter the image-aware save guard'
);
select is(
  pg_get_function_result(
    'public.list_admin_wardrobe_item_drafts(uuid,uuid)'::regprocedure
  ),
  'TABLE(id uuid, topic_id uuid, name text, icon text, description text, image_path text, category wardrobe_item_category, equip_slot wardrobe_equip_slot, rarity wardrobe_item_rarity, points integer, unlock_rule text, editorial_note text, editorial_status wardrobe_editorial_status, sort_order integer, content_version integer, is_published boolean, published_at timestamp with time zone, created_by uuid, created_at timestamp with time zone, updated_at timestamp with time zone, has_pending_revision boolean)',
  'the admin listing returns staged description and image path explicitly'
);
select is(
  pg_get_function_result('public.list_child_wardrobe(uuid)'::regprocedure),
  'TABLE(child_profile_id uuid, wardrobe_item_id uuid, catalog_item_id uuid, topic_id uuid, name text, icon text, description text, image_path text, category wardrobe_item_category, equip_slot wardrobe_equip_slot, catalog_equip_slot wardrobe_equip_slot, rarity wardrobe_item_rarity, is_equipped boolean, acquired_at timestamp with time zone, equipped_at timestamp with time zone)',
  'the mobile listing returns canonical description and crop path explicitly'
);

select results_eq(
  $$
    select operation.operation_key, operation.capability
    from public.ai_operations as operation
    where operation.operation_key in (
      'content.wardrobe_grid_plan',
      'content.wardrobe_grid_image'
    )
    order by operation.operation_key
  $$,
  $$
    values
      ('content.wardrobe_grid_image'::text, 'image_generation'::text),
      ('content.wardrobe_grid_plan'::text, 'structured_text'::text)
  $$,
  'the two grid stages use distinct pinned capabilities'
);
select results_eq(
  $$
    select operation.operation_key, version.model
    from public.ai_operations as operation
    join public.ai_operation_versions as version
      on version.id = operation.active_version_id
      and version.operation_id = operation.id
    where operation.operation_key in (
      'content.wardrobe_grid_plan',
      'content.wardrobe_grid_image'
    )
    order by operation.operation_key
  $$,
  $$
    values
      ('content.wardrobe_grid_image'::text, 'openai/gpt-image-2'::text),
      ('content.wardrobe_grid_plan'::text, 'openai/gpt-5-mini'::text)
  $$,
  'grid planning and image generation pin the requested OpenAI models'
);
select ok(
  (
    select version.prompt_template like '%square 4x4 grid%row-major%'
      and version.prompt_template like '%no overlap or bleed%'
      and version.prompt_template like '%no text, numbers%logos%people%'
    from public.ai_operations as operation
    join public.ai_operation_versions as version
      on version.id = operation.active_version_id
    where operation.operation_key = 'content.wardrobe_grid_image'
  ),
  'the editable image prompt fixes the safe 4x4 visual composition'
);
select ok(
  (
    select
      version.input_contract ?& array[
        'type',
        'additionalProperties',
        'properties',
        'required'
      ]
      and version.input_contract #>>
        '{properties,topic,properties,title,maxLength}' = '100'
      and version.input_contract #>>
        '{properties,topic,properties,description,maxLength}' = '500'
      and version.input_contract #>>
        '{properties,history,maxItems}' = '6'
      and version.request_options ->> 'max_tokens' = '4096'
    from public.ai_operations as operation
    join public.ai_operation_versions as version
      on version.id = operation.active_version_id
    where operation.operation_key = 'content.wardrobe_grid_plan'
  ),
  'the plan input and worker token budget stay inside their shared bounds'
);
select ok(
  (
    select version.output_contract #>>
      '{properties,items,minItems}' = '16'
      and version.output_contract #>>
        '{properties,items,maxItems}' = '16'
      and version.output_contract #>>
        '{properties,items,items,properties,description,maxLength}' = '240'
      and not (
        version.output_contract #>
          '{properties,items,items,properties}' ? 'icon'
      )
    from public.ai_operations as operation
    join public.ai_operation_versions as version
      on version.id = operation.active_version_id
    where operation.operation_key = 'content.wardrobe_grid_plan'
  ),
  'the plan output is exactly sixteen image-ready items without emoji copy'
);
select results_eq(
  $$
    select
      version.version,
      (version.input_contract #>>
        '{properties,wardrobeExamples,maxItems}')::integer
    from public.ai_operations as operation
    join public.ai_operation_versions as version
      on version.operation_id = operation.id
    where operation.operation_key = 'content.draft_review'
    order by version.version
  $$,
  $$ values (1, 6), (2, 6), (3, 16) $$,
  'draft review appends a 16-item contract without changing pinned versions'
);

select is(
  private.is_valid_admin_wardrobe_grid_plan_input(
    (select plan_input from wardrobe_grid_fixtures)
  ),
  true,
  'the exact bounded chat and topic input is accepted for planning'
);
select is(
  private.is_valid_admin_wardrobe_grid_plan_input(
    (select plan_input || '{"injected":true}'::jsonb from wardrobe_grid_fixtures)
  ),
  false,
  'an injected plan-input key fails closed'
);
select is(
  private.is_valid_admin_wardrobe_grid_plan_input(
    (select plan_input - 'topic' from wardrobe_grid_fixtures)
  ),
  false,
  'the topic title and description cannot be omitted from planning'
);
select is(
  private.is_valid_admin_wardrobe_grid_plan_output(
    (select plan_output from wardrobe_grid_fixtures)
  ),
  true,
  'a complete ordered 16-item plan is accepted'
);
select is(
  private.is_valid_admin_wardrobe_grid_plan_output(
    (
      select jsonb_set(plan_output, '{items}', (plan_output -> 'items') - 15)
      from wardrobe_grid_fixtures
    )
  ),
  false,
  'a 15-item plan fails closed'
);
select is(
  private.is_valid_admin_wardrobe_grid_plan_output(
    (
      select jsonb_set(plan_output, '{items,0,ordinal}', '2'::jsonb)
      from wardrobe_grid_fixtures
    )
  ),
  false,
  'an out-of-order ordinal fails closed'
);
select is(
  private.is_valid_admin_wardrobe_grid_plan_output(
    (
      select jsonb_set(plan_output, '{items,0,icon}', '"✨"'::jsonb)
      from wardrobe_grid_fixtures
    )
  ),
  false,
  'an uncontracted icon property fails closed'
);
select is(
  private.is_valid_admin_wardrobe_grid_plan_output(
    (
      select jsonb_set(
        plan_output,
        '{items,0,description}',
        to_jsonb(repeat('x', 241))
      )
      from wardrobe_grid_fixtures
    )
  ),
  false,
  'a public description above 240 code points fails closed'
);
select is(
  private.is_valid_admin_wardrobe_grid_plan_output(
    (
      select jsonb_set(plan_output, '{items,0,points}', '0'::jsonb)
      from wardrobe_grid_fixtures
    )
  ),
  false,
  'a zero-point item without an unlock rule fails closed'
);
select is(
  private.is_valid_admin_wardrobe_grid_image_input(
    (select image_input from wardrobe_grid_fixtures)
  ),
  true,
  'the image operation accepts topic copy and exactly 16 visual cells'
);
select is(
  private.is_valid_admin_wardrobe_grid_image_input(
    (
      select jsonb_set(image_input, '{items}', (image_input -> 'items') - 0)
      from wardrobe_grid_fixtures
    )
  ),
  false,
  'the image operation rejects an incomplete cell plan'
);
select is(
  private.is_valid_admin_wardrobe_grid_image_output(
    (select image_output from wardrobe_grid_fixtures),
    null
  ),
  true,
  'one sheet plus ordered paths 01 through 16 is accepted'
);
select is(
  private.is_valid_admin_wardrobe_grid_image_output(
    (
      select jsonb_set(
        image_output,
        '{items,15,imagePath}',
        '"fd500000-0000-4000-8000-000000000001/15.png"'::jsonb
      )
      from wardrobe_grid_fixtures
    ),
    null
  ),
  false,
  'a crop path that does not match its ordinal fails closed'
);
select is(
  private.is_valid_admin_wardrobe_grid_image_output(
    (select image_output from wardrobe_grid_fixtures),
    'fd500000-0000-4000-8000-000000000002'
  ),
  false,
  'an otherwise valid sheet cannot be completed for another job id'
);
select is(
  private.is_valid_admin_draft_review_input(
    (select input_data from wardrobe_grid_review_fixture)
  ),
  true,
  'draft review accepts all sixteen saved slot-aware wardrobe items'
);

insert into public.topics (
  id,
  slug,
  title,
  description,
  is_published,
  created_by,
  created_at,
  updated_at
)
values (
  'fd000000-0000-4000-8000-000000000001',
  'syntetisk-garderobegitter',
  'Syntetisk garderobegitter',
  'Et publiceret emne til billedstaging.',
  true,
  '10000000-0000-4000-8000-000000000003',
  '2026-08-23 10:00:00+00',
  '2026-08-23 10:00:00+00'
);
insert into public.goals (
  id,
  topic_id,
  slug,
  title,
  sort_order,
  is_published,
  created_by,
  created_at,
  updated_at
)
values (
  'fd100000-0000-4000-8000-000000000001',
  'fd000000-0000-4000-8000-000000000001',
  'syntetisk-gittermaal',
  'Syntetisk gittermål',
  10,
  true,
  '10000000-0000-4000-8000-000000000003',
  '2026-08-23 10:01:00+00',
  '2026-08-23 10:01:00+00'
);
insert into public.exercises (
  id,
  goal_id,
  slug,
  title,
  sort_order,
  is_published,
  created_by,
  created_at,
  updated_at
)
values (
  'fd200000-0000-4000-8000-000000000001',
  'fd100000-0000-4000-8000-000000000001',
  'syntetisk-gitteroevelse',
  'Syntetisk gitterøvelse',
  10,
  true,
  '10000000-0000-4000-8000-000000000003',
  '2026-08-23 10:02:00+00',
  '2026-08-23 10:02:00+00'
);
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
  editorial_status,
  content_version,
  is_published,
  created_by,
  created_at,
  updated_at
)
values (
  'fd300000-0000-4000-8000-000000000001',
  'fd000000-0000-4000-8000-000000000001',
  'Publiceret syntetisk hat',
  '🎩',
  'Den gamle offentlige beskrivelse.',
  'fd500000-0000-4000-8000-000000000001/01.png',
  'clothing',
  'head',
  'rare',
  150,
  'approved',
  2,
  true,
  '10000000-0000-4000-8000-000000000003',
  '2026-08-23 10:03:00+00',
  '2026-08-23 10:03:00+00'
);
insert into public.wardrobe_items (
  id,
  topic_id,
  name,
  icon,
  category,
  equip_slot,
  rarity,
  points,
  editorial_status,
  content_version,
  is_published,
  created_by,
  created_at,
  updated_at
)
values (
  'fd300000-0000-4000-8000-000000000002',
  'fd000000-0000-4000-8000-000000000001',
  'Ældre emoji-belønning',
  '🎁',
  'effect',
  'accessory',
  'common',
  75,
  'approved',
  1,
  true,
  '10000000-0000-4000-8000-000000000003',
  '2026-08-23 10:04:00+00',
  '2026-08-23 10:04:00+00'
);

select is(
  (
    select description is null and image_path is null
    from public.wardrobe_items
    where id = 'fd300000-0000-4000-8000-000000000002'
  ),
  true,
  'a legacy emoji-only item remains valid without image copy'
);
select throws_ok(
  $$
    insert into public.wardrobe_items (
      id,
      topic_id,
      name,
      icon,
      image_path,
      category,
      equip_slot,
      rarity,
      points,
      created_by
    ) values (
      'fd300000-0000-4000-8000-000000000099',
      'fd000000-0000-4000-8000-000000000001',
      'Ugyldig beskæring',
      '❌',
      'fd500000-0000-4000-8000-000000000001/17.png',
      'effect',
      'accessory',
      'common',
      50,
      '10000000-0000-4000-8000-000000000003'
    )
  $$,
  '23514',
  null,
  'a catalogue row cannot reference a crop outside 01 through 16'
);
select throws_ok(
  $$
    insert into public.wardrobe_items (
      id,
      topic_id,
      name,
      icon,
      description,
      category,
      equip_slot,
      rarity,
      points,
      created_by
    ) values (
      'fd300000-0000-4000-8000-000000000098',
      'fd000000-0000-4000-8000-000000000001',
      'For lang beskrivelse',
      '❌',
      repeat('x', 241),
      'effect',
      'accessory',
      'common',
      50,
      '10000000-0000-4000-8000-000000000003'
    )
  $$,
  '23514',
  null,
  'catalogue descriptions are bounded to 240 code points'
);

set local role anon;
select throws_ok(
  $$
    insert into storage.objects (bucket_id, name, owner_id, metadata)
    values (
      'wardrobe-images',
      'fd500000-0000-4000-8000-000000000099/01.png',
      null,
      '{"size":100,"mimetype":"image/png"}'::jsonb
    )
  $$,
  '42501',
  null,
  'anonymous users cannot write the public wardrobe bucket'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;
select throws_ok(
  $$
    insert into storage.objects (bucket_id, name, owner_id, metadata)
    values (
      'wardrobe-images',
      'fd500000-0000-4000-8000-000000000099/01.png',
      '10000000-0000-4000-8000-000000000001',
      '{"size":100,"mimetype":"image/png"}'::jsonb
    )
  $$,
  '42501',
  null,
  'authenticated family users cannot write the public wardrobe bucket'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);
set local role authenticated;
select lives_ok(
  $$
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
      editorial_note,
      created_by
    ) values (
      'fd300000-0000-4000-8000-000000000003',
      'fd000000-0000-4000-8000-000000000001',
      'Ny syntetisk krone',
      '👑',
      'En ny offentlig kladdebeskrivelse.',
      'fd500000-0000-4000-8000-000000000001/02.png',
      'clothing',
      'head',
      'common',
      100,
      'Oprettet med den additive billedkontrakt.',
      '10000000-0000-4000-8000-000000000003'
    )
  $$,
  'an administrator can directly create a new unpublished image-backed draft'
);
select results_eq(
  $$
    select id
    from public.save_admin_wardrobe_item_draft(
      'fd300000-0000-4000-8000-000000000001',
      'fd000000-0000-4000-8000-000000000001',
      '2026-08-23 10:03:00+00',
      'Publiceret hat rettet af ældre klient',
      '🎩',
      'clothing',
      'head',
      'rare',
      150,
      null,
      'Den ældre klient ændrede kun navnet.',
      10
    )
  $$,
  $$ values ('fd300000-0000-4000-8000-000000000001'::uuid) $$,
  'the legacy save still stages a published edit'
);
select results_eq(
  $$
    select description, image_path, has_pending_revision
    from public.list_admin_wardrobe_item_drafts(
      'fd000000-0000-4000-8000-000000000001',
      'fd300000-0000-4000-8000-000000000001'
    )
  $$,
  $$
    values (
      'Den gamle offentlige beskrivelse.'::text,
      'fd500000-0000-4000-8000-000000000001/01.png'::text,
      true
    )
  $$,
  'a legacy save preserves existing image copy in its pending revision'
);
select results_eq(
  $$
    select id
    from public.save_admin_wardrobe_item_draft_with_image(
      'fd300000-0000-4000-8000-000000000001',
      'fd000000-0000-4000-8000-000000000001',
      (
        select updated_at
        from public.list_admin_wardrobe_item_drafts(
          'fd000000-0000-4000-8000-000000000001',
          'fd300000-0000-4000-8000-000000000001'
        )
      ),
      'Publiceret syntetisk stjernekrone',
      '👑',
      'Den nye staged beskrivelse.',
      'fd500000-0000-4000-8000-000000000001/03.png',
      'clothing',
      'head',
      'special',
      250,
      null,
      'Et menneske skal godkende den nye billedversion.',
      10
    )
  $$,
  $$ values ('fd300000-0000-4000-8000-000000000001'::uuid) $$,
  'the image-aware save replaces the complete pending revision'
);
select results_eq(
  $$
    select name, description, image_path, content_version
    from public.wardrobe_items
    where id = 'fd300000-0000-4000-8000-000000000001'
  $$,
  $$
    values (
      'Publiceret syntetisk hat'::text,
      'Den gamle offentlige beskrivelse.'::text,
      'fd500000-0000-4000-8000-000000000001/01.png'::text,
      2
    )
  $$,
  'canonical child-visible image copy is unchanged before review and publication'
);
select results_eq(
  $$
    select description, image_path, editorial_status::text, has_pending_revision
    from public.list_admin_wardrobe_item_drafts(
      'fd000000-0000-4000-8000-000000000001',
      'fd300000-0000-4000-8000-000000000001'
    )
  $$,
  $$
    values (
      'Den nye staged beskrivelse.'::text,
      'fd500000-0000-4000-8000-000000000001/03.png'::text,
      'draft'::text,
      true
    )
  $$,
  'the administrator sees staged image copy over the unchanged live item'
);
select results_eq(
  $$
    select id
    from public.decide_admin_wardrobe_item_draft(
      'fd300000-0000-4000-8000-000000000001',
      'fd000000-0000-4000-8000-000000000001',
      (
        select updated_at
        from public.list_admin_wardrobe_item_drafts(
          'fd000000-0000-4000-8000-000000000001',
          'fd300000-0000-4000-8000-000000000001'
        )
      ),
      'approved'
    )
  $$,
  $$ values ('fd300000-0000-4000-8000-000000000001'::uuid) $$,
  'the complete image revision can be explicitly approved'
);
select results_eq(
  $$
    select changed, published_wardrobe_item_count
    from public.publish_admin_topic(
      'fd000000-0000-4000-8000-000000000001',
      (
        select updated_at
        from public.list_admin_wardrobe_item_drafts(
          'fd000000-0000-4000-8000-000000000001',
          'fd300000-0000-4000-8000-000000000001'
        )
      )
    )
  $$,
  $$ values (true, 1) $$,
  'topic publication atomically promotes the approved image revision'
);
select results_eq(
  $$
    select description, image_path, content_version
    from public.wardrobe_items
    where id = 'fd300000-0000-4000-8000-000000000001'
  $$,
  $$
    values (
      'Den nye staged beskrivelse.'::text,
      'fd500000-0000-4000-8000-000000000001/03.png'::text,
      3
    )
  $$,
  'publication advances canonical image copy by exactly one version'
);

reset role;
set local role service_role;
select lives_ok(
  $$
    insert into public.child_wardrobe_items (
      child_profile_id,
      wardrobe_item_id
    ) values (
      '30000000-0000-4000-8000-000000000001',
      'fd300000-0000-4000-8000-000000000001'
    )
  $$,
  'trusted reward code can grant the image-backed published item'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;
select results_eq(
  $$
    select description, image_path
    from public.list_child_wardrobe(
      '30000000-0000-4000-8000-000000000001'
    )
    where wardrobe_item_id = 'fd300000-0000-4000-8000-000000000001'
  $$,
  $$
    values (
      'Den nye staged beskrivelse.'::text,
      'fd500000-0000-4000-8000-000000000001/03.png'::text
    )
  $$,
  'the family sees only canonical image copy after publication'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);
set local role authenticated;

select ok(
  position(
    'capability text' in pg_get_function_result(
      'public.claim_admin_ai_job_for_worker(uuid)'::regprocedure
    )
  ) > 0,
  'the worker claim contract exposes the pinned capability'
);

select throws_ok(
  $$
    select *
    from public.prepare_admin_ai_job(
      'content.wardrobe_grid_plan',
      'fd400000-0000-4000-8000-000000000004',
      (
        select plan_input || '{"injected":true}'::jsonb
        from wardrobe_grid_fixtures
      )
    )
  $$,
  '22023',
  'The admin AI request is invalid.',
  'the public preparation boundary rejects injected planning context'
);

select results_eq(
  $$
    select request.operation_key, prepared.job_status::text
    from (
      values
        (
          'content.wardrobe_grid_plan'::text,
          'fd400000-0000-4000-8000-000000000001'::uuid,
          (select plan_input from wardrobe_grid_fixtures)
        ),
        (
          'content.wardrobe_grid_image'::text,
          'fd400000-0000-4000-8000-000000000002'::uuid,
          (select image_input from wardrobe_grid_fixtures)
        ),
        (
          'content.draft_review'::text,
          'fd400000-0000-4000-8000-000000000003'::uuid,
          (select input_data from wardrobe_grid_review_fixture)
        )
    ) as request(operation_key, request_id, input_data)
    cross join lateral public.prepare_admin_ai_job(
      request.operation_key,
      request.request_id,
      request.input_data
    ) as prepared
    order by request.operation_key
  $$,
  $$
    values
      ('content.draft_review'::text, 'awaiting_upload'::text),
      ('content.wardrobe_grid_image'::text, 'awaiting_upload'::text),
      ('content.wardrobe_grid_plan'::text, 'awaiting_upload'::text)
  $$,
  'administrators can prepare both grid stages and a sixteen-item review'
);

reset role;
set local role service_role;

select results_eq(
  $$
    select operation_key, capability
    from public.claim_admin_ai_job_for_worker(
      (
        select id
        from public.ai_jobs
        where client_request_id =
          'fd400000-0000-4000-8000-000000000001'
      )
    )
  $$,
  $$
    values (
      'content.wardrobe_grid_plan'::text,
      'structured_text'::text
    )
  $$,
  'the worker receives the structured planning capability'
);

select lives_ok(
  $$
    select public.complete_admin_ai_job_for_worker(
      (
        select id
        from public.ai_jobs
        where client_request_id =
          'fd400000-0000-4000-8000-000000000001'
      ),
      1::smallint,
      (select plan_output from wardrobe_grid_fixtures),
      'synthetic-grid-plan',
      '{"total_tokens":900}'::jsonb,
      1000::bigint
    )
  $$,
  'the exact sixteen-item structured plan can complete'
);

select results_eq(
  $$
    select operation_key, capability
    from public.claim_admin_ai_job_for_worker(
      (
        select id
        from public.ai_jobs
        where client_request_id =
          'fd400000-0000-4000-8000-000000000002'
      )
    )
  $$,
  $$
    values (
      'content.wardrobe_grid_image'::text,
      'image_generation'::text
    )
  $$,
  'the worker receives the image-generation capability'
);

select throws_ok(
  $$
    select public.complete_admin_ai_job_for_worker(
      job.id,
      1::smallint,
      jsonb_build_object(
        'sheetPath', job.id::text || '/sheet.png',
        'items', (
          select jsonb_agg(
            jsonb_build_object(
              'ordinal', ordinal,
              'imagePath', job.id::text || '/' ||
                lpad(ordinal::text, 2, '0') || '.png'
            )
            order by ordinal
          )
          from generate_series(1, 16) as ordinal
        )
      ),
      'synthetic-grid-image-missing',
      '{}'::jsonb,
      1000::bigint
    )
    from public.ai_jobs as job
    where job.client_request_id =
      'fd400000-0000-4000-8000-000000000002'
  $$,
  '22023',
  'The exact wardrobe grid objects are missing or invalid.',
  'image completion fails closed before all seventeen PNGs exist'
);

insert into storage.objects (
  bucket_id,
  name,
  owner_id,
  metadata
)
select
  'wardrobe-images',
  job.id::text || generated.path_suffix,
  null,
  '{"size":100,"mimetype":"image/png"}'::jsonb
from public.ai_jobs as job
cross join lateral (
  select '/sheet.png'::text as path_suffix
  union all
  select '/' || lpad(ordinal::text, 2, '0') || '.png'
  from generate_series(1, 16) as ordinal
) as generated
where job.client_request_id =
  'fd400000-0000-4000-8000-000000000002';

reset role;
set local role anon;
select is(
  (
    select count(*)
    from storage.objects as object
    where object.bucket_id = 'wardrobe-images'
  ),
  17::bigint,
  'public clients can read the complete synthetic sheet and crop set'
);

reset role;
set local role service_role;
select lives_ok(
  $$
    select public.complete_admin_ai_job_for_worker(
      job.id,
      1::smallint,
      jsonb_build_object(
        'sheetPath', job.id::text || '/sheet.png',
        'items', (
          select jsonb_agg(
            jsonb_build_object(
              'ordinal', ordinal,
              'imagePath', job.id::text || '/' ||
                lpad(ordinal::text, 2, '0') || '.png'
            )
            order by ordinal
          )
          from generate_series(1, 16) as ordinal
        )
      ),
      'synthetic-grid-image',
      '{"images":1}'::jsonb,
      1000::bigint
    )
    from public.ai_jobs as job
    where job.client_request_id =
      'fd400000-0000-4000-8000-000000000002'
  $$,
  'the image job completes only after all job-owned PNGs exist'
);

select results_eq(
  $$
    select
      status::text,
      output_data ->> 'sheetPath',
      jsonb_array_length(output_data -> 'items')
    from public.ai_jobs
    where client_request_id =
      'fd400000-0000-4000-8000-000000000002'
  $$,
  $$
    select
      'succeeded'::text,
      job.id::text || '/sheet.png',
      16
    from public.ai_jobs as job
    where job.client_request_id =
      'fd400000-0000-4000-8000-000000000002'
  $$,
  'the exact sheet and sixteen paths are persisted as the image result'
);

select * from finish();

rollback;
