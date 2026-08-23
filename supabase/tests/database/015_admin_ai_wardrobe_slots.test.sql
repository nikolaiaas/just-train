begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(21);

create temporary table wardrobe_ai_slot_fixtures as
select
  '{
    "reply":"Tre forslag til menneskelig gennemgang.",
    "items":[
      {"name":"Stjernesko","icon":"⭐","category":"clothing","rarity":"common","points":100,"unlockRule":"","reason":"Et ældre versionsbundet skoforslag."},
      {"name":"Balancekrone","icon":"👑","category":"clothing","rarity":"rare","points":250,"unlockRule":"","reason":"Et ældre versionsbundet hovedforslag."},
      {"name":"Regnbuespor","icon":"🌈","category":"effect","rarity":"special","points":0,"unlockRule":"Gennemfør første mål","reason":"Et ældre versionsbundet effektforslag."}
    ]
  }'::jsonb as legacy_output,
  '{
    "reply":"Tre forslag til menneskelig gennemgang.",
    "items":[
      {"name":"Stjernesko","icon":"⭐","category":"clothing","equipSlot":"feet","rarity":"common","points":100,"unlockRule":"","reason":"Et samlet par sko til begge fødder."},
      {"name":"Balancekrone","icon":"👑","category":"clothing","equipSlot":"head","rarity":"rare","points":250,"unlockRule":"","reason":"En krone til hovedpositionen."},
      {"name":"Regnbuespor","icon":"🌈","category":"effect","equipSlot":"accessory","rarity":"special","points":0,"unlockRule":"Gennemfør første mål","reason":"En valgfri effekt i tilbehørspositionen."}
    ]
  }'::jsonb as slot_output;

create temporary table draft_review_ai_slot_fixtures as
select
  jsonb_build_object(
    'message', 'Gennemgå hele kladden.',
    'topic', jsonb_build_object(
      'title', 'Balanceeventyr',
      'description', 'Trygge balancelege.',
      'icon', '🤸',
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
    'wardrobeExamples', fixture.legacy_output -> 'items',
    'history', '[]'::jsonb
  ) as legacy_input,
  jsonb_build_object(
    'message', 'Gennemgå hele kladden.',
    'topic', jsonb_build_object(
      'title', 'Balanceeventyr',
      'description', 'Trygge balancelege.',
      'icon', '🤸',
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
    'wardrobeExamples', fixture.slot_output -> 'items',
    'history', '[]'::jsonb
  ) as slot_input
from wardrobe_ai_slot_fixtures as fixture;

select results_eq(
  $$
    select operation.operation_key, version.version
    from public.ai_operations as operation
    join public.ai_operation_versions as version
      on version.id = operation.active_version_id
      and version.operation_id = operation.id
    where operation.operation_key in (
      'content.wardrobe_examples',
      'content.draft_review'
    )
    order by operation.operation_key
  $$,
  $$
    values
      ('content.draft_review'::text, 2),
      ('content.wardrobe_examples'::text, 2)
  $$,
  'slot-aware wardrobe and review contracts are active immutable revisions'
);

select results_eq(
  $$
    select operation.operation_key, count(*)::bigint
    from public.ai_operations as operation
    join public.ai_operation_versions as version
      on version.operation_id = operation.id
    where operation.operation_key in (
      'content.wardrobe_examples',
      'content.draft_review'
    )
    group by operation.operation_key
    order by operation.operation_key
  $$,
  $$
    values
      ('content.draft_review'::text, 2::bigint),
      ('content.wardrobe_examples'::text, 2::bigint)
  $$,
  'each operation keeps its immutable legacy version beside the new revision'
);

select is(
  (
    select not (
      output_contract #> '{properties,items,items,anyOf,0,properties}'
      ? 'equipSlot'
    )
    from public.ai_operation_versions as version
    join public.ai_operations as operation on operation.id = version.operation_id
    where operation.operation_key = 'content.wardrobe_examples'
      and version.version = 1
  ),
  true,
  'the legacy wardrobe output contract is unchanged'
);

select is(
  (
    select not (
      input_contract #> '{properties,wardrobeExamples,items,anyOf,0,properties}'
      ? 'equipSlot'
    )
    from public.ai_operation_versions as version
    join public.ai_operations as operation on operation.id = version.operation_id
    where operation.operation_key = 'content.draft_review'
      and version.version = 1
  ),
  true,
  'the legacy review input contract is unchanged'
);

select is(
  (
    select output_contract #>
      '{properties,items,items,anyOf,0,properties,equipSlot,enum}'
    from public.ai_operation_versions as version
    join public.ai_operations as operation
      on operation.active_version_id = version.id
      and operation.id = version.operation_id
    where operation.operation_key = 'content.wardrobe_examples'
  ),
  '["head","body","held","feet","accessory"]'::jsonb,
  'wardrobe output exposes the shared five-slot enum'
);

select is(
  (
    select not exists (
      select 1
      from jsonb_array_elements(
        version.output_contract #> '{properties,items,items,anyOf}'
      ) as branch
      where not (branch -> 'required' ? 'equipSlot')
    )
    from public.ai_operation_versions as version
    join public.ai_operations as operation
      on operation.active_version_id = version.id
      and operation.id = version.operation_id
    where operation.operation_key = 'content.wardrobe_examples'
  ),
  true,
  'every wardrobe reward-rule branch requires an equipment slot'
);

select is(
  (
    select input_contract #>
      '{properties,wardrobeExamples,items,anyOf,0,properties,equipSlot,enum}'
    from public.ai_operation_versions as version
    join public.ai_operations as operation
      on operation.active_version_id = version.id
      and operation.id = version.operation_id
    where operation.operation_key = 'content.draft_review'
  ),
  '["head","body","held","feet","accessory"]'::jsonb,
  'complete-draft review receives the same five-slot enum'
);

select is(
  (
    select not exists (
      select 1
      from jsonb_array_elements(
        version.input_contract #>
          '{properties,wardrobeExamples,items,anyOf}'
      ) as branch
      where not (branch -> 'required' ? 'equipSlot')
    )
    from public.ai_operation_versions as version
    join public.ai_operations as operation
      on operation.active_version_id = version.id
      and operation.id = version.operation_id
    where operation.operation_key = 'content.draft_review'
  ),
  true,
  'every review wardrobe reward-rule branch requires an equipment slot'
);

select is(
  (
    select prompt_template like '%Et par sko er én samlet garderobeting%feet%'
    from public.ai_operation_versions as version
    join public.ai_operations as operation
      on operation.active_version_id = version.id
      and operation.id = version.operation_id
    where operation.operation_key = 'content.wardrobe_examples'
  ),
  true,
  'the wardrobe prompt models a pair of shoes as one feet item'
);

select is(
  (
    select prompt_template like '%hvert garderobeeksempels equipSlot%'
    from public.ai_operation_versions as version
    join public.ai_operations as operation
      on operation.active_version_id = version.id
      and operation.id = version.operation_id
    where operation.operation_key = 'content.draft_review'
  ),
  true,
  'the review prompt checks authored wardrobe placement'
);

select is(
  private.is_valid_admin_ai_wardrobe_output(
    (select legacy_output from wardrobe_ai_slot_fixtures),
    true
  ),
  true,
  'the invariant validator still accepts an immutable legacy output'
);

select is(
  private.is_valid_admin_ai_wardrobe_output(
    (select slot_output from wardrobe_ai_slot_fixtures),
    false
  ),
  true,
  'the invariant validator accepts exact slot-aware output'
);

select is(
  private.is_valid_admin_ai_wardrobe_output(
    jsonb_set(
      (select slot_output from wardrobe_ai_slot_fixtures),
      '{items,0,equipSlot}',
      '"left-foot"'::jsonb
    ),
    false
  ),
  false,
  'the invariant validator rejects an unknown slot'
);

select is(
  (
    select private.admin_ai_contract_matches(
      version.output_contract,
      fixture.legacy_output
    )
    from public.ai_operation_versions as version
    join public.ai_operations as operation on operation.id = version.operation_id
    cross join wardrobe_ai_slot_fixtures as fixture
    where operation.operation_key = 'content.wardrobe_examples'
      and version.version = 1
  ),
  true,
  'the legacy wardrobe version continues to match legacy output'
);

select is(
  (
    select private.admin_ai_contract_matches(
      version.output_contract,
      fixture.slot_output
    )
    from public.ai_operation_versions as version
    join public.ai_operations as operation on operation.id = version.operation_id
    cross join wardrobe_ai_slot_fixtures as fixture
    where operation.operation_key = 'content.wardrobe_examples'
      and version.version = 1
  ),
  false,
  'the immutable legacy contract does not accept a new unpinned shape'
);

select is(
  (
    select private.admin_ai_contract_matches(
      version.output_contract,
      fixture.slot_output
    )
    from public.ai_operation_versions as version
    join public.ai_operations as operation
      on operation.active_version_id = version.id
      and operation.id = version.operation_id
    cross join wardrobe_ai_slot_fixtures as fixture
    where operation.operation_key = 'content.wardrobe_examples'
  ),
  true,
  'the active wardrobe contract accepts slot-aware output'
);

select is(
  (
    select private.admin_ai_contract_matches(
      version.output_contract,
      fixture.legacy_output
    )
    from public.ai_operation_versions as version
    join public.ai_operations as operation
      on operation.active_version_id = version.id
      and operation.id = version.operation_id
    cross join wardrobe_ai_slot_fixtures as fixture
    where operation.operation_key = 'content.wardrobe_examples'
  ),
  false,
  'the active wardrobe contract requires an explicit human-overridable slot'
);

select is(
  (
    select private.admin_ai_contract_matches(
      version.input_contract,
      fixture.legacy_input
    )
    from public.ai_operation_versions as version
    join public.ai_operations as operation on operation.id = version.operation_id
    cross join draft_review_ai_slot_fixtures as fixture
    where operation.operation_key = 'content.draft_review'
      and version.version = 1
  ),
  true,
  'the legacy review version continues to match legacy wardrobe context'
);

select is(
  (
    select private.admin_ai_contract_matches(
      version.input_contract,
      fixture.slot_input
    )
    from public.ai_operation_versions as version
    join public.ai_operations as operation
      on operation.active_version_id = version.id
      and operation.id = version.operation_id
    cross join draft_review_ai_slot_fixtures as fixture
    where operation.operation_key = 'content.draft_review'
  ),
  true,
  'the active review contract accepts slot-aware wardrobe context'
);

select is(
  (
    select private.admin_ai_contract_matches(
      version.input_contract,
      fixture.legacy_input
    )
    from public.ai_operation_versions as version
    join public.ai_operations as operation
      on operation.active_version_id = version.id
      and operation.id = version.operation_id
    cross join draft_review_ai_slot_fixtures as fixture
    where operation.operation_key = 'content.draft_review'
  ),
  false,
  'the active review contract requires wardrobe placement context'
);

select is(
  has_function_privilege(
    'authenticated',
    'private.is_valid_admin_ai_wardrobe_output(jsonb,boolean)',
    'execute'
  ),
  false,
  'browser clients cannot call the private wardrobe output validator'
);

select * from finish();

rollback;
