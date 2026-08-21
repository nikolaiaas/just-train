begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(61);

select has_column(
  'public',
  'exercises',
  'estimated_minutes',
  'exercises can store administrator-reviewed practice-time guidance'
);
select has_column(
  'public',
  'exercises',
  'equipment',
  'exercises can store their own equipment list'
);
select has_column(
  'public',
  'exercises',
  'safety_notes',
  'exercises can store safety and adult-help guidance'
);
select col_not_null(
  'public',
  'exercises',
  'equipment',
  'exercise equipment cannot be null'
);
select col_not_null(
  'public',
  'exercises',
  'safety_notes',
  'exercise safety guidance cannot be null'
);
select col_type_is(
  'public',
  'exercises',
  'estimated_minutes',
  'smallint',
  'exercise practice-time guidance uses the same bounded type as goals'
);

select ok(
  exists (
    select 1
    from pg_constraint as constraint_record
    join pg_class as relation on relation.oid = constraint_record.conrelid
    join pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'goals'
      and constraint_record.conname = 'goals_topic_slug_key'
      and constraint_record.contype = 'u'
      and pg_get_constraintdef(constraint_record.oid)
        = 'UNIQUE (topic_id, slug)'
  ),
  'goal slugs are unique within one topic instead of globally'
);
select ok(
  exists (
    select 1
    from pg_constraint as constraint_record
    join pg_class as relation on relation.oid = constraint_record.conrelid
    join pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'exercises'
      and constraint_record.conname = 'exercises_goal_slug_key'
      and constraint_record.contype = 'u'
      and pg_get_constraintdef(constraint_record.oid)
        = 'UNIQUE (goal_id, slug)'
  ),
  'exercise slugs are unique within one goal instead of globally'
);
select ok(
  (
    select
      not has_function_privilege('anon', function.oid, 'execute')
      and has_function_privilege(
        'authenticated',
        function.oid,
        'execute'
      )
      and has_function_privilege(
        'service_role',
        function.oid,
        'execute'
      )
    from pg_proc as function
    join pg_namespace as namespace on namespace.oid = function.pronamespace
    where namespace.nspname = 'private'
      and function.proname = 'is_valid_editorial_equipment'
      and function.pronargs = 1
  ),
  'the equipment check is executable only by authenticated writers and trusted server code'
);

select is(
  (
    select constraint_record.convalidated
    from pg_constraint as constraint_record
    join pg_class as relation on relation.oid = constraint_record.conrelid
    join pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'goals'
      and constraint_record.conname = 'goals_equipment_is_bounded'
  ),
  false,
  'legacy goal equipment does not block migration before a separate cleanup and validation pass'
);

select is(
  (
    select count(*)::integer
    from pg_constraint as constraint_record
    join pg_class as relation on relation.oid = constraint_record.conrelid
    join pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and constraint_record.conname in (
        'topics_title_is_bounded',
        'goals_title_is_bounded',
        'exercises_title_is_bounded'
      )
      and not constraint_record.convalidated
  ),
  3,
  'title hardening is migration-safe for all three existing content tables'
);

select ok(
  has_column_privilege(
    'service_role',
    'public.exercises',
    'estimated_minutes',
    'insert'
  )
  and has_column_privilege(
    'service_role',
    'public.exercises',
    'equipment',
    'insert'
  )
  and has_column_privilege(
    'service_role',
    'public.exercises',
    'safety_notes',
    'insert'
  )
  and has_column_privilege(
    'service_role',
    'public.exercises',
    'estimated_minutes',
    'update'
  )
  and has_column_privilege(
    'service_role',
    'public.exercises',
    'equipment',
    'update'
  )
  and has_column_privilege(
    'service_role',
    'public.exercises',
    'safety_notes',
    'update'
  ),
  'trusted server code can write all new exercise guidance columns'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);
set local role authenticated;

select throws_ok(
  $$
    insert into public.topics (
      id,
      slug,
      title,
      created_by
    )
    values (
      'd0000000-0000-4000-8000-000000000098',
      'forkert-oprindelse',
      'Forkert oprindelse',
      '10000000-0000-4000-8000-000000000001'
    )
  $$,
  '42501',
  null,
  'an administrator cannot attribute a new content row to another profile'
);

select lives_ok(
  $$
    insert into public.topics (
      id,
      slug,
      title,
      description,
      created_by
    )
    values
      (
        'd0000000-0000-4000-8000-000000000001',
        'balancebane-a',
        'Balancebane A',
        'Et syntetisk kladdeemne til databasekontrol.',
        '10000000-0000-4000-8000-000000000003'
      ),
      (
        'd0000000-0000-4000-8000-000000000002',
        'balancebane-b',
        'Balancebane B',
        'Et andet syntetisk kladdeemne til databasekontrol.',
        '10000000-0000-4000-8000-000000000003'
      )
  $$,
  'a content administrator can create two unpublished topic drafts'
);
select lives_ok(
  $$
    insert into public.goals (
      id,
      topic_id,
      slug,
      title,
      summary,
      estimated_minutes,
      equipment,
      created_by
    )
    values (
      'd1000000-0000-4000-8000-000000000001',
      'd0000000-0000-4000-8000-000000000001',
      'gaa-paa-linje',
      'Gå på en linje',
      'Træn rolig balance med plads omkring kroppen.',
      12,
      array['Gulvtape', '4 kegler'],
      '10000000-0000-4000-8000-000000000003'
    )
  $$,
  'a content administrator can create a goal with valid equipment'
);
select lives_ok(
  $$
    insert into public.goals (
      id,
      topic_id,
      slug,
      title,
      summary,
      estimated_minutes,
      equipment,
      created_by
    )
    values (
      'd1000000-0000-4000-8000-000000000002',
      'd0000000-0000-4000-8000-000000000002',
      'gaa-paa-linje',
      'Gå på en anden linje',
      'Det samme rutenavn må genbruges under et andet emne.',
      15,
      array['Gulvtape'],
      '10000000-0000-4000-8000-000000000003'
    )
  $$,
  'the same goal slug can be reused under a different topic'
);
select throws_ok(
  $$
    insert into public.goals (
      id,
      topic_id,
      slug,
      title,
      created_by
    )
    values (
      'd1000000-0000-4000-8000-000000000003',
      'd0000000-0000-4000-8000-000000000001',
      'gaa-paa-linje',
      'Dublet i samme emne',
      '10000000-0000-4000-8000-000000000003'
    )
  $$,
  '23505',
  null,
  'the same goal slug is rejected within one topic'
);
select lives_ok(
  $$
    insert into public.exercises (
      id,
      goal_id,
      slug,
      title,
      instructions,
      estimated_minutes,
      equipment,
      safety_notes,
      created_by
    )
    values (
      'd2000000-0000-4000-8000-000000000001',
      'd1000000-0000-4000-8000-000000000001',
      'haele-mod-taeer',
      'Hæle mod tæer',
      'Sæt den ene fod roligt foran den anden.',
      8,
      array['Gulvtape'],
      'Find et sted med god plads omkring banen.',
      '10000000-0000-4000-8000-000000000003'
    )
  $$,
  'a content administrator can create an exercise with valid step fields'
);
select lives_ok(
  $$
    insert into public.exercises (
      id,
      goal_id,
      slug,
      title,
      instructions,
      estimated_minutes,
      equipment,
      safety_notes,
      created_by
    )
    values (
      'd2000000-0000-4000-8000-000000000002',
      'd1000000-0000-4000-8000-000000000002',
      'haele-mod-taeer',
      'Hæle mod tæer igen',
      'Prøv den samme øvelsesrute under det andet mål.',
      10,
      array['Gulvtape'],
      '',
      '10000000-0000-4000-8000-000000000003'
    )
  $$,
  'the same exercise slug can be reused under a different goal'
);

select throws_ok(
  $$
    update public.topics
    set title = ' Balancebane A'
    where id = 'd0000000-0000-4000-8000-000000000001'
  $$,
  '23514',
  null,
  'topic titles must be stored without leading whitespace'
);
select throws_ok(
  $$
    update public.goals
    set title = 'Gå på en linje   '
    where id = 'd1000000-0000-4000-8000-000000000001'
  $$,
  '23514',
  null,
  'goal titles cannot evade the raw bound with trailing whitespace'
);
select throws_ok(
  $$
    update public.exercises
    set title = E'Hæle\nmod tæer'
    where id = 'd2000000-0000-4000-8000-000000000001'
  $$,
  '23514',
  null,
  'exercise titles reject control characters'
);
select throws_ok(
  $$
    update public.topics
    set title = repeat('t', 101)
    where id = 'd0000000-0000-4000-8000-000000000001'
  $$,
  '23514',
  null,
  'topic titles use the same one-hundred-character ceiling as contextual AI'
);
select throws_ok(
  $$
    update public.goals
    set title = repeat('g', 121)
    where id = 'd1000000-0000-4000-8000-000000000001'
  $$,
  '23514',
  null,
  'goal titles use the same one-hundred-and-twenty-character ceiling as contextual AI'
);
select throws_ok(
  $$
    update public.exercises
    set title = repeat('e', 121)
    where id = 'd2000000-0000-4000-8000-000000000001'
  $$,
  '23514',
  null,
  'exercise titles use the same one-hundred-and-twenty-character ceiling as contextual AI'
);
select throws_ok(
  $$
    insert into public.exercises (
      id,
      goal_id,
      slug,
      title,
      sort_order,
      created_by
    )
    values (
      'd2000000-0000-4000-8000-000000000003',
      'd1000000-0000-4000-8000-000000000001',
      'haele-mod-taeer',
      'Dublet i samme mål',
      20,
      '10000000-0000-4000-8000-000000000003'
    )
  $$,
  '23505',
  null,
  'the same exercise slug is rejected within one goal'
);

select results_eq(
  $$
    select estimated_minutes, equipment, is_published, published_at is null
    from public.goals
    where id = 'd1000000-0000-4000-8000-000000000001'
  $$,
  $$ values (12::smallint, array['Gulvtape', '4 kegler']::text[], false, true) $$,
  'goal authoring fields are stored without publishing the draft'
);
select results_eq(
  $$
    select
      estimated_minutes,
      equipment,
      safety_notes,
      is_published,
      published_at is null
    from public.exercises
    where id = 'd2000000-0000-4000-8000-000000000001'
  $$,
  $$
    values (
      8::smallint,
      array['Gulvtape']::text[],
      'Find et sted med god plads omkring banen.'::text,
      false,
      true
    )
  $$,
  'exercise authoring fields are stored without publishing the draft'
);

select throws_ok(
  $$
    update public.goals
    set equipment = array[' Gulvtape']
    where id = 'd1000000-0000-4000-8000-000000000001'
  $$,
  '23514',
  null,
  'goal equipment labels must already be trimmed'
);
select throws_ok(
  $$
    update public.goals
    set equipment = array['Gulvtape', 'gulvtape']
    where id = 'd1000000-0000-4000-8000-000000000001'
  $$,
  '23514',
  null,
  'goal equipment labels are case-insensitively unique'
);
select throws_ok(
  $$
    update public.goals
    set equipment = array(
      select 'Ting ' || item_number
      from generate_series(1, 13) as item_number
    )
    where id = 'd1000000-0000-4000-8000-000000000001'
  $$,
  '23514',
  null,
  'a goal cannot contain more than twelve equipment labels'
);
select throws_ok(
  $$
    update public.goals
    set equipment = array[['Gulvtape', 'Kegle'], ['Bold', 'Stol']]
    where id = 'd1000000-0000-4000-8000-000000000001'
  $$,
  '23514',
  null,
  'editorial equipment must be a flat one-dimensional list'
);
select throws_ok(
  $$
    update public.goals
    set summary = repeat('s', 1001)
    where id = 'd1000000-0000-4000-8000-000000000001'
  $$,
  '23514',
  null,
  'goal summaries use the same one-thousand-character ceiling as contextual AI'
);
select throws_ok(
  $$
    update public.topics
    set description = E'Første linje\r\nAnden linje'
    where id = 'd0000000-0000-4000-8000-000000000001'
  $$,
  '23514',
  null,
  'topic descriptions require canonical LF line endings'
);
select throws_ok(
  $$
    update public.goals
    set summary = E'Første linje\rAnden linje'
    where id = 'd1000000-0000-4000-8000-000000000001'
  $$,
  '23514',
  null,
  'goal summaries reject non-canonical carriage returns'
);
select throws_ok(
  $$
    update public.exercises
    set equipment = array['Gulvtape ']
    where id = 'd2000000-0000-4000-8000-000000000001'
  $$,
  '23514',
  null,
  'exercise equipment labels must already be trimmed'
);
select throws_ok(
  $$
    update public.exercises
    set equipment = array['Kegle', 'KEGLE']
    where id = 'd2000000-0000-4000-8000-000000000001'
  $$,
  '23514',
  null,
  'exercise equipment labels are case-insensitively unique'
);
select throws_ok(
  $$
    update public.exercises
    set instructions = repeat('i', 1501)
    where id = 'd2000000-0000-4000-8000-000000000001'
  $$,
  '23514',
  null,
  'exercise instructions use the same fifteen-hundred-character ceiling as contextual AI'
);
select throws_ok(
  $$
    update public.exercises
    set instructions = E'Første linje\r\nAnden linje'
    where id = 'd2000000-0000-4000-8000-000000000001'
  $$,
  '23514',
  null,
  'exercise instructions require canonical LF line endings'
);
select throws_ok(
  $$
    update public.exercises
    set estimated_minutes = 0
    where id = 'd2000000-0000-4000-8000-000000000001'
  $$,
  '23514',
  null,
  'exercise practice-time guidance cannot be below one minute'
);
select throws_ok(
  $$
    update public.exercises
    set estimated_minutes = 181
    where id = 'd2000000-0000-4000-8000-000000000001'
  $$,
  '23514',
  null,
  'exercise practice-time guidance cannot exceed 180 minutes'
);
select lives_ok(
  $$
    update public.exercises
    set estimated_minutes = case id
      when 'd2000000-0000-4000-8000-000000000001' then 1
      else 180
    end
    where id in (
      'd2000000-0000-4000-8000-000000000001',
      'd2000000-0000-4000-8000-000000000002'
    )
  $$,
  'exercise practice-time guidance accepts both inclusive boundaries'
);
select throws_ok(
  $$
    update public.exercises
    set safety_notes = ' Hold god afstand.'
    where id = 'd2000000-0000-4000-8000-000000000001'
  $$,
  '23514',
  null,
  'exercise safety guidance must already be trimmed'
);
select throws_ok(
  $$
    update public.exercises
    set safety_notes = repeat('s', 1001)
    where id = 'd2000000-0000-4000-8000-000000000001'
  $$,
  '23514',
  null,
  'exercise safety guidance is bounded to one thousand characters'
);
select throws_ok(
  $$
    update public.exercises
    set safety_notes = 'Hold afstand' || chr(1)
    where id = 'd2000000-0000-4000-8000-000000000001'
  $$,
  '23514',
  null,
  'exercise safety guidance rejects non-text control characters'
);
select throws_ok(
  $$
    update public.exercises
    set safety_notes = E'Første linje\r\nAnden linje'
    where id = 'd2000000-0000-4000-8000-000000000001'
  $$,
  '23514',
  null,
  'exercise safety guidance requires canonical LF line endings'
);
select lives_ok(
  $$
    update public.exercises
    set safety_notes = E'Hold god afstand.\nBed en voksen om hjælp.'
    where id = 'd2000000-0000-4000-8000-000000000001'
  $$,
  'exercise safety guidance may contain intentional internal line breaks'
);
select throws_ok(
  $$
    update public.exercises
    set measurement = 'repetitions', target_value = 10001
    where id = 'd2000000-0000-4000-8000-000000000001'
  $$,
  '23514',
  null,
  'repetition targets cannot exceed ten thousand'
);
select throws_ok(
  $$
    update public.exercises
    set measurement = 'duration', target_value = 86401
    where id = 'd2000000-0000-4000-8000-000000000001'
  $$,
  '23514',
  null,
  'duration targets cannot exceed one day in seconds'
);
select lives_ok(
  $$
    update public.exercises
    set
      measurement = case id
        when 'd2000000-0000-4000-8000-000000000001' then 'repetitions'::public.exercise_measurement
        else 'duration'::public.exercise_measurement
      end,
      target_value = case id
        when 'd2000000-0000-4000-8000-000000000001' then 10000
        else 86400
      end
    where id in (
      'd2000000-0000-4000-8000-000000000001',
      'd2000000-0000-4000-8000-000000000002'
    )
  $$,
  'both measurement-specific target ceilings are accepted inclusively'
);
select throws_ok(
  $$
    update public.topics
    set slug = repeat('a', 121)
    where id = 'd0000000-0000-4000-8000-000000000001'
  $$,
  '23514',
  null,
  'persisted content slugs cannot exceed the shared 120-character ceiling'
);
select throws_ok(
  $$
    update public.goals
    set created_by = '10000000-0000-4000-8000-000000000001'
    where id = 'd1000000-0000-4000-8000-000000000001'
  $$,
  '42501',
  null,
  'created-by provenance is immutable for direct authenticated writes'
);

select is(
  (
    select count(*)::integer
    from (
      select is_published, published_at
      from public.topics
      where id in (
        'd0000000-0000-4000-8000-000000000001',
        'd0000000-0000-4000-8000-000000000002'
      )
      union all
      select is_published, published_at
      from public.goals
      where id in (
        'd1000000-0000-4000-8000-000000000001',
        'd1000000-0000-4000-8000-000000000002'
      )
      union all
      select is_published, published_at
      from public.exercises
      where id in (
        'd2000000-0000-4000-8000-000000000001',
        'd2000000-0000-4000-8000-000000000002'
      )
    ) as admin_draft
    where not admin_draft.is_published
      and admin_draft.published_at is null
  ),
  6,
  'all administrator-authored content steps remain unpublished by default'
);
select lives_ok(
  $$
    update public.goals
    set is_published = true
    where id in (
      'd1000000-0000-4000-8000-000000000001',
      'd1000000-0000-4000-8000-000000000002'
    );
    update public.exercises
    set is_published = true
    where id in (
      'd2000000-0000-4000-8000-000000000001',
      'd2000000-0000-4000-8000-000000000002'
    );
  $$,
  'an administrator can review child steps without publishing their topic'
);
select is(
  (
    select count(*)::integer
    from public.goals
    where id in (
      'd1000000-0000-4000-8000-000000000001',
      'd1000000-0000-4000-8000-000000000002'
    )
      and is_published
      and published_at is not null
  ) + (
    select count(*)::integer
    from public.exercises
    where id in (
      'd2000000-0000-4000-8000-000000000001',
      'd2000000-0000-4000-8000-000000000002'
    )
      and is_published
      and published_at is not null
  ),
  4,
  'publishing child steps records their publication timestamps'
);

reset role;
set local role anon;

select results_eq(
  $$
    select content_kind, visible_count
    from (
      values
        (
          'exercise'::text,
          (
            select count(*)::integer
            from public.exercises
            where id in (
              'd2000000-0000-4000-8000-000000000001',
              'd2000000-0000-4000-8000-000000000002'
            )
          )
        ),
        (
          'goal'::text,
          (
            select count(*)::integer
            from public.goals
            where id in (
              'd1000000-0000-4000-8000-000000000001',
              'd1000000-0000-4000-8000-000000000002'
            )
          )
        ),
        (
          'topic'::text,
          (
            select count(*)::integer
            from public.topics
            where id in (
              'd0000000-0000-4000-8000-000000000001',
              'd0000000-0000-4000-8000-000000000002'
            )
          )
        )
    ) as visibility(content_kind, visible_count)
    order by content_kind
  $$,
  $$
    values
      ('exercise'::text, 0),
      ('goal'::text, 0),
      ('topic'::text, 0)
  $$,
  'anonymous clients cannot see child steps beneath unpublished topics'
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
    select content_kind, visible_count
    from (
      values
        (
          'exercise'::text,
          (
            select count(*)::integer
            from public.exercises
            where id in (
              'd2000000-0000-4000-8000-000000000001',
              'd2000000-0000-4000-8000-000000000002'
            )
          )
        ),
        (
          'goal'::text,
          (
            select count(*)::integer
            from public.goals
            where id in (
              'd1000000-0000-4000-8000-000000000001',
              'd1000000-0000-4000-8000-000000000002'
            )
          )
        ),
        (
          'topic'::text,
          (
            select count(*)::integer
            from public.topics
            where id in (
              'd0000000-0000-4000-8000-000000000001',
              'd0000000-0000-4000-8000-000000000002'
            )
          )
        )
    ) as visibility(content_kind, visible_count)
    order by content_kind
  $$,
  $$
    values
      ('exercise'::text, 0),
      ('goal'::text, 0),
      ('topic'::text, 0)
  $$,
  'authenticated parents cannot see child steps beneath unpublished topics'
);
select throws_ok(
  $$
    insert into public.goals (
      id,
      topic_id,
      slug,
      title,
      created_by
    )
    values (
      'd1000000-0000-4000-8000-000000000099',
      'd0000000-0000-4000-8000-000000000001',
      'parent-forsoeg',
      'Forældre må ikke redigere',
      '10000000-0000-4000-8000-000000000001'
    )
  $$,
  '42501',
  null,
  'an authenticated parent cannot create administrator content'
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
    select content_kind, visible_count
    from (
      values
        (
          'exercise'::text,
          (
            select count(*)::integer
            from public.exercises
            where id in (
              'd2000000-0000-4000-8000-000000000001',
              'd2000000-0000-4000-8000-000000000002'
            )
          )
        ),
        (
          'goal'::text,
          (
            select count(*)::integer
            from public.goals
            where id in (
              'd1000000-0000-4000-8000-000000000001',
              'd1000000-0000-4000-8000-000000000002'
            )
          )
        ),
        (
          'topic'::text,
          (
            select count(*)::integer
            from public.topics
            where id in (
              'd0000000-0000-4000-8000-000000000001',
              'd0000000-0000-4000-8000-000000000002'
            )
          )
        )
    ) as visibility(content_kind, visible_count)
    order by content_kind
  $$,
  $$
    values
      ('exercise'::text, 2),
      ('goal'::text, 2),
      ('topic'::text, 2)
  $$,
  'the content administrator can continue reviewing the full draft chain'
);

select lives_ok(
  $$
    update public.topics
    set is_published = true
    where id in (
      'd0000000-0000-4000-8000-000000000001',
      'd0000000-0000-4000-8000-000000000002'
    )
  $$,
  'an administrator can publish the reviewed parent topics'
);

reset role;
set local role anon;

select results_eq(
  $$
    select estimated_minutes, equipment, safety_notes
    from public.exercises
    where id = 'd2000000-0000-4000-8000-000000000001'
  $$,
  $$
    values (
      1::smallint,
      array['Gulvtape']::text[],
      E'Hold god afstand.\nBed en voksen om hjælp.'::text
    )
  $$,
  'anonymous clients can read the new guidance fields on fully published exercises'
);

reset role;
select * from finish();
rollback;
