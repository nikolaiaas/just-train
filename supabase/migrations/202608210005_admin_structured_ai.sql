begin;

create extension if not exists pg_jsonschema with schema extensions;

-- The browser-facing experience may look conversational, but every turn is a
-- bounded admin operation pinned to an immutable prompt/configuration version.
-- AI output is stored only as a proposal and never mutates or publishes
-- training content directly.

create function private.is_valid_admin_ai_history(p_history jsonb)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(
    jsonb_typeof(p_history) = 'array'
    and case when jsonb_typeof(p_history) = 'array'
      then jsonb_array_length(p_history) <= 6
      else false
    end
    and not exists (
      select 1
      from jsonb_array_elements(
        case when jsonb_typeof(p_history) = 'array'
          then p_history else '[]'::jsonb end
      ) as history_item
      where
        jsonb_typeof(history_item) is distinct from 'object'
        or not (history_item ?& array['role', 'content'])
        or exists (
          select 1
          from jsonb_object_keys(
            case when jsonb_typeof(history_item) = 'object'
              then history_item else '{}'::jsonb end
          ) as history_key
          where history_key <> all (array['role', 'content'])
        )
        or jsonb_typeof(history_item -> 'role') is distinct from 'string'
        or history_item ->> 'role' not in ('user', 'assistant')
        or jsonb_typeof(history_item -> 'content') is distinct from 'string'
        or history_item ->> 'content' is distinct from
          btrim(history_item ->> 'content')
        or char_length(history_item ->> 'content') not between 1 and 1800
    ),
    false
  );
$$;

create function private.is_valid_admin_ai_string_array(
  p_value jsonb,
  p_max_items integer,
  p_max_item_length integer
)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(
    p_max_items between 0 and 100
    and p_max_item_length between 1 and 1000
    and jsonb_typeof(p_value) = 'array'
    and case when jsonb_typeof(p_value) = 'array'
      then jsonb_array_length(p_value) <= p_max_items
      else false
    end
    and not exists (
      select 1
      from jsonb_array_elements(
        case when jsonb_typeof(p_value) = 'array'
          then p_value else '[]'::jsonb end
      ) as item
      where jsonb_typeof(item) is distinct from 'string'
        or item #>> '{}' is distinct from btrim(item #>> '{}')
        or char_length(item #>> '{}') not between 1 and p_max_item_length
    )
    and case when jsonb_typeof(p_value) = 'array'
      then jsonb_array_length(p_value) = (
        select count(distinct lower(item #>> '{}'))
        from jsonb_array_elements(p_value) as item
        where jsonb_typeof(item) = 'string'
      )
      else false
    end,
    false
  );
$$;

create function private.admin_ai_contract_matches(
  p_contract jsonb,
  p_value jsonb
)
returns boolean
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
begin
  if p_contract is null
    or jsonb_typeof(p_contract) <> 'object'
    or p_value is null
  then
    return false;
  end if;

  return coalesce(
    extensions.jsonb_matches_schema(p_contract::json, p_value),
    false
  );
exception
  when others then
    -- Operation versions are server-owned, but a malformed future contract
    -- must still fail closed instead of leaving a worker exception surface.
    return false;
end;
$$;

create function private.is_valid_admin_ai_output_invariants(
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
      else true
    end,
    false
  );
$$;

create function private.is_valid_admin_ai_input(
  p_operation_key text,
  p_input_data jsonb
)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(case p_operation_key
    when 'content.topic_brief' then
      jsonb_typeof(p_input_data) = 'object'
      and p_input_data ?& array['message', 'draft', 'history']
      and not exists (
        select 1
        from jsonb_object_keys(
          case when jsonb_typeof(p_input_data) = 'object'
            then p_input_data else '{}'::jsonb end
        ) as input_key
        where input_key <> all (array['message', 'draft', 'history'])
      )
      and jsonb_typeof(p_input_data -> 'message') = 'string'
      and p_input_data ->> 'message' = btrim(p_input_data ->> 'message')
      and char_length(p_input_data ->> 'message') between 1 and 1000
      and jsonb_typeof(p_input_data -> 'draft') = 'object'
      and (p_input_data -> 'draft') ?& array[
        'title',
        'description',
        'icon',
        'accentColor'
      ]
      and not exists (
        select 1
        from jsonb_object_keys(
          case when jsonb_typeof(p_input_data -> 'draft') = 'object'
            then p_input_data -> 'draft' else '{}'::jsonb end
        ) as draft_key
        where draft_key <> all (
          array['title', 'description', 'icon', 'accentColor']
        )
      )
      and jsonb_typeof(p_input_data #> '{draft,title}') = 'string'
      and char_length(p_input_data #>> '{draft,title}') <= 100
      and jsonb_typeof(p_input_data #> '{draft,description}') = 'string'
      and char_length(p_input_data #>> '{draft,description}') <= 500
      and jsonb_typeof(p_input_data #> '{draft,icon}') = 'string'
      and char_length(p_input_data #>> '{draft,icon}') <= 16
      and jsonb_typeof(p_input_data #> '{draft,accentColor}') = 'string'
      and (
        p_input_data #>> '{draft,accentColor}' = ''
        or p_input_data #>> '{draft,accentColor}' ~ '^#[0-9A-Fa-f]{6}$'
      )
      and private.is_valid_admin_ai_history(p_input_data -> 'history')
    when 'content.wardrobe_examples' then
      private.is_valid_admin_ai_input('content.topic_brief', p_input_data)
    when 'content.goal_draft' then
      jsonb_typeof(p_input_data) = 'object'
      and p_input_data ?& array['message', 'topic', 'draft', 'history']
      and not exists (
        select 1
        from jsonb_object_keys(
          case when jsonb_typeof(p_input_data) = 'object'
            then p_input_data else '{}'::jsonb end
        ) as input_key
        where input_key <> all (array['message', 'topic', 'draft', 'history'])
      )
      and jsonb_typeof(p_input_data -> 'message') = 'string'
      and p_input_data ->> 'message' = btrim(p_input_data ->> 'message')
      and char_length(p_input_data ->> 'message') between 1 and 1000
      and jsonb_typeof(p_input_data -> 'topic') = 'object'
      and (p_input_data -> 'topic') ?& array['title', 'description']
      and not exists (
        select 1
        from jsonb_object_keys(
          case when jsonb_typeof(p_input_data -> 'topic') = 'object'
            then p_input_data -> 'topic' else '{}'::jsonb end
        ) as topic_key
        where topic_key <> all (array['title', 'description'])
      )
      and jsonb_typeof(p_input_data #> '{topic,title}') = 'string'
      and p_input_data #>> '{topic,title}' =
        btrim(p_input_data #>> '{topic,title}')
      and char_length(p_input_data #>> '{topic,title}') between 1 and 100
      and jsonb_typeof(p_input_data #> '{topic,description}') = 'string'
      and p_input_data #>> '{topic,description}' =
        btrim(p_input_data #>> '{topic,description}')
      and char_length(p_input_data #>> '{topic,description}') <= 500
      and jsonb_typeof(p_input_data -> 'draft') = 'object'
      and (p_input_data -> 'draft') ?& array[
        'title',
        'summary',
        'difficulty',
        'estimatedMinutes',
        'equipment'
      ]
      and not exists (
        select 1
        from jsonb_object_keys(
          case when jsonb_typeof(p_input_data -> 'draft') = 'object'
            then p_input_data -> 'draft' else '{}'::jsonb end
        ) as draft_key
        where draft_key <> all (array[
          'title',
          'summary',
          'difficulty',
          'estimatedMinutes',
          'equipment'
        ])
      )
      and jsonb_typeof(p_input_data #> '{draft,title}') = 'string'
      and char_length(p_input_data #>> '{draft,title}') <= 120
      and jsonb_typeof(p_input_data #> '{draft,summary}') = 'string'
      and char_length(p_input_data #>> '{draft,summary}') <= 1000
      and jsonb_typeof(p_input_data #> '{draft,difficulty}') = 'string'
      and p_input_data #>> '{draft,difficulty}' in (
        'beginner',
        'intermediate',
        'advanced'
      )
      and case jsonb_typeof(p_input_data #> '{draft,estimatedMinutes}')
        when 'null' then true
        when 'number' then
          (p_input_data #>> '{draft,estimatedMinutes}') ~ '^[0-9]+$'
          and (p_input_data #>> '{draft,estimatedMinutes}')::numeric
            between 1 and 180
        else false
      end
      and private.is_valid_admin_ai_string_array(
        p_input_data #> '{draft,equipment}',
        12,
        80
      )
      and private.is_valid_admin_ai_history(p_input_data -> 'history')
    when 'content.exercise_draft' then
      jsonb_typeof(p_input_data) = 'object'
      and p_input_data ?& array[
        'message',
        'topic',
        'goal',
        'position',
        'sequence',
        'draft',
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
          'position',
          'sequence',
          'draft',
          'history'
        ])
      )
      and jsonb_typeof(p_input_data -> 'message') = 'string'
      and p_input_data ->> 'message' = btrim(p_input_data ->> 'message')
      and char_length(p_input_data ->> 'message') between 1 and 1000
      and jsonb_typeof(p_input_data -> 'topic') = 'object'
      and (p_input_data -> 'topic') ?& array['title', 'description']
      and not exists (
        select 1
        from jsonb_object_keys(
          case when jsonb_typeof(p_input_data -> 'topic') = 'object'
            then p_input_data -> 'topic' else '{}'::jsonb end
        ) as topic_key
        where topic_key <> all (array['title', 'description'])
      )
      and jsonb_typeof(p_input_data #> '{topic,title}') = 'string'
      and p_input_data #>> '{topic,title}' =
        btrim(p_input_data #>> '{topic,title}')
      and char_length(p_input_data #>> '{topic,title}') between 1 and 100
      and jsonb_typeof(p_input_data #> '{topic,description}') = 'string'
      and p_input_data #>> '{topic,description}' =
        btrim(p_input_data #>> '{topic,description}')
      and char_length(p_input_data #>> '{topic,description}') <= 500
      and jsonb_typeof(p_input_data -> 'goal') = 'object'
      and (p_input_data -> 'goal') ?& array[
        'title',
        'summary',
        'difficulty',
        'estimatedMinutes',
        'equipment'
      ]
      and not exists (
        select 1
        from jsonb_object_keys(
          case when jsonb_typeof(p_input_data -> 'goal') = 'object'
            then p_input_data -> 'goal' else '{}'::jsonb end
        ) as goal_key
        where goal_key <> all (array[
          'title',
          'summary',
          'difficulty',
          'estimatedMinutes',
          'equipment'
        ])
      )
      and jsonb_typeof(p_input_data #> '{goal,title}') = 'string'
      and p_input_data #>> '{goal,title}' = btrim(p_input_data #>> '{goal,title}')
      and char_length(p_input_data #>> '{goal,title}') between 1 and 120
      and jsonb_typeof(p_input_data #> '{goal,summary}') = 'string'
      and char_length(p_input_data #>> '{goal,summary}') <= 1000
      and jsonb_typeof(p_input_data #> '{goal,difficulty}') = 'string'
      and p_input_data #>> '{goal,difficulty}' in (
        'beginner',
        'intermediate',
        'advanced'
      )
      and case jsonb_typeof(p_input_data #> '{goal,estimatedMinutes}')
        when 'null' then true
        when 'number' then
          (p_input_data #>> '{goal,estimatedMinutes}') ~ '^[0-9]+$'
          and (p_input_data #>> '{goal,estimatedMinutes}')::numeric
            between 1 and 180
        else false
      end
      and private.is_valid_admin_ai_string_array(
        p_input_data #> '{goal,equipment}',
        12,
        80
      )
      and jsonb_typeof(p_input_data -> 'position') = 'number'
      and (p_input_data ->> 'position') ~ '^[0-9]+$'
      and (p_input_data ->> 'position')::numeric between 1 and 50
      and jsonb_typeof(p_input_data -> 'sequence') = 'array'
      and case when jsonb_typeof(p_input_data -> 'sequence') = 'array'
        then jsonb_array_length(p_input_data -> 'sequence') <= 12
        else false
      end
      and not exists (
        select 1
        from jsonb_array_elements(
          case when jsonb_typeof(p_input_data -> 'sequence') = 'array'
            then p_input_data -> 'sequence' else '[]'::jsonb end
        ) as sequence_item
        where
          jsonb_typeof(sequence_item) is distinct from 'object'
          or not (sequence_item ?& array[
            'position',
            'title',
            'measurement',
            'targetValue'
          ])
          or exists (
            select 1
            from jsonb_object_keys(
              case when jsonb_typeof(sequence_item) = 'object'
                then sequence_item else '{}'::jsonb end
            ) as sequence_key
            where sequence_key <> all (array[
              'position',
              'title',
              'measurement',
              'targetValue'
            ])
          )
          or jsonb_typeof(sequence_item -> 'position') is distinct from 'number'
          or (sequence_item ->> 'position') !~ '^[0-9]+$'
          or (sequence_item ->> 'position')::numeric not between 1 and 50
          or jsonb_typeof(sequence_item -> 'title') is distinct from 'string'
          or char_length(sequence_item ->> 'title') not between 1 and 120
          or jsonb_typeof(sequence_item -> 'measurement') is distinct from 'string'
          or sequence_item ->> 'measurement' not in (
            'completion',
            'repetitions',
            'duration'
          )
          or not case sequence_item ->> 'measurement'
            when 'completion' then
              jsonb_typeof(sequence_item -> 'targetValue') = 'null'
            when 'repetitions' then
              jsonb_typeof(sequence_item -> 'targetValue') = 'number'
              and (sequence_item ->> 'targetValue') ~ '^[0-9]+$'
              and (sequence_item ->> 'targetValue')::numeric between 1 and 10000
            when 'duration' then
              jsonb_typeof(sequence_item -> 'targetValue') = 'number'
              and (sequence_item ->> 'targetValue') ~ '^[0-9]+$'
              and (sequence_item ->> 'targetValue')::numeric between 1 and 86400
            else false
          end
      )
      and jsonb_typeof(p_input_data -> 'draft') = 'object'
      and (p_input_data -> 'draft') ?& array[
        'title',
        'instructions',
        'measurement',
        'targetValue',
        'recommendedMinutes',
        'equipment',
        'safetyNote'
      ]
      and not exists (
        select 1
        from jsonb_object_keys(
          case when jsonb_typeof(p_input_data -> 'draft') = 'object'
            then p_input_data -> 'draft' else '{}'::jsonb end
        ) as draft_key
        where draft_key <> all (array[
          'title',
          'instructions',
          'measurement',
          'targetValue',
          'recommendedMinutes',
          'equipment',
          'safetyNote'
        ])
      )
      and jsonb_typeof(p_input_data #> '{draft,title}') = 'string'
      and char_length(p_input_data #>> '{draft,title}') <= 120
      and jsonb_typeof(p_input_data #> '{draft,instructions}') = 'string'
      and char_length(p_input_data #>> '{draft,instructions}') <= 1500
      and jsonb_typeof(p_input_data #> '{draft,measurement}') = 'string'
      and p_input_data #>> '{draft,measurement}' in (
        'completion',
        'repetitions',
        'duration'
      )
      and case p_input_data #>> '{draft,measurement}'
        when 'completion' then
          jsonb_typeof(p_input_data #> '{draft,targetValue}') = 'null'
        when 'repetitions' then
          jsonb_typeof(p_input_data #> '{draft,targetValue}') = 'null'
          or (
            jsonb_typeof(p_input_data #> '{draft,targetValue}') = 'number'
            and (p_input_data #>> '{draft,targetValue}') ~ '^[0-9]+$'
            and (p_input_data #>> '{draft,targetValue}')::numeric
              between 1 and 10000
          )
        when 'duration' then
          jsonb_typeof(p_input_data #> '{draft,targetValue}') = 'null'
          or (
            jsonb_typeof(p_input_data #> '{draft,targetValue}') = 'number'
            and (p_input_data #>> '{draft,targetValue}') ~ '^[0-9]+$'
            and (p_input_data #>> '{draft,targetValue}')::numeric
              between 1 and 86400
          )
        else false
      end
      and case jsonb_typeof(p_input_data #> '{draft,recommendedMinutes}')
        when 'null' then true
        when 'number' then
          (p_input_data #>> '{draft,recommendedMinutes}') ~ '^[0-9]+$'
          and (p_input_data #>> '{draft,recommendedMinutes}')::numeric
            between 1 and 180
        else false
      end
      and private.is_valid_admin_ai_string_array(
        p_input_data #> '{draft,equipment}',
        12,
        80
      )
      and jsonb_typeof(p_input_data #> '{draft,safetyNote}') = 'string'
      and char_length(p_input_data #>> '{draft,safetyNote}') <= 1000
      and private.is_valid_admin_ai_history(p_input_data -> 'history')
    else false
  end, false);
$$;

comment on function private.is_valid_admin_ai_input(text, jsonb) is
  'Validates the bounded editorial context accepted by admin structured-text operations. It is not a general chat payload.';

create function private.is_valid_admin_ai_output(
  p_operation_key text,
  p_output_data jsonb
)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(case p_operation_key
    when 'content.topic_brief' then
      jsonb_typeof(p_output_data) = 'object'
      and p_output_data ?& array['reply', 'suggestion']
      and not exists (
        select 1
        from jsonb_object_keys(
          case when jsonb_typeof(p_output_data) = 'object'
            then p_output_data else '{}'::jsonb end
        ) as output_key
        where output_key <> all (array['reply', 'suggestion'])
      )
      and jsonb_typeof(p_output_data -> 'reply') = 'string'
      and p_output_data ->> 'reply' = btrim(p_output_data ->> 'reply')
      and char_length(p_output_data ->> 'reply') between 1 and 1500
      and jsonb_typeof(p_output_data -> 'suggestion') = 'object'
      and (p_output_data -> 'suggestion') ?& array[
        'ready',
        'title',
        'description',
        'icon',
        'accentColor',
        'reason'
      ]
      and not exists (
        select 1
        from jsonb_object_keys(
          case when jsonb_typeof(p_output_data -> 'suggestion') = 'object'
            then p_output_data -> 'suggestion' else '{}'::jsonb end
        ) as suggestion_key
        where suggestion_key <> all (
          array[
            'ready',
            'title',
            'description',
            'icon',
            'accentColor',
            'reason'
          ]
        )
      )
      and jsonb_typeof(p_output_data #> '{suggestion,ready}') = 'boolean'
      and jsonb_typeof(p_output_data #> '{suggestion,title}') = 'string'
      and char_length(p_output_data #>> '{suggestion,title}') <= 100
      and jsonb_typeof(p_output_data #> '{suggestion,description}') = 'string'
      and char_length(p_output_data #>> '{suggestion,description}') <= 500
      and jsonb_typeof(p_output_data #> '{suggestion,icon}') = 'string'
      and char_length(p_output_data #>> '{suggestion,icon}') <= 16
      and jsonb_typeof(p_output_data #> '{suggestion,accentColor}') = 'string'
      and (
        p_output_data #>> '{suggestion,accentColor}' = ''
        or p_output_data #>> '{suggestion,accentColor}' ~ '^#[0-9A-Fa-f]{6}$'
      )
      and jsonb_typeof(p_output_data #> '{suggestion,reason}') = 'string'
      and p_output_data #>> '{suggestion,reason}' =
        btrim(p_output_data #>> '{suggestion,reason}')
      and char_length(p_output_data #>> '{suggestion,reason}') between 1 and 500
      and case
        when jsonb_typeof(p_output_data #> '{suggestion,ready}') = 'boolean'
          then
            not (p_output_data #>> '{suggestion,ready}')::boolean
            or (
              p_output_data #>> '{suggestion,title}' =
                btrim(p_output_data #>> '{suggestion,title}')
              and char_length(p_output_data #>> '{suggestion,title}') between 1 and 100
              and p_output_data #>> '{suggestion,description}' =
                btrim(p_output_data #>> '{suggestion,description}')
              and char_length(p_output_data #>> '{suggestion,description}') between 1 and 500
              and p_output_data #>> '{suggestion,icon}' =
                btrim(p_output_data #>> '{suggestion,icon}')
              and char_length(p_output_data #>> '{suggestion,icon}') between 1 and 16
              and p_output_data #>> '{suggestion,accentColor}'
                ~ '^#[0-9A-Fa-f]{6}$'
            )
        else false
      end
    when 'content.goal_draft' then
      jsonb_typeof(p_output_data) = 'object'
      and p_output_data ?& array['reply', 'suggestion']
      and not exists (
        select 1
        from jsonb_object_keys(
          case when jsonb_typeof(p_output_data) = 'object'
            then p_output_data else '{}'::jsonb end
        ) as output_key
        where output_key <> all (array['reply', 'suggestion'])
      )
      and jsonb_typeof(p_output_data -> 'reply') = 'string'
      and p_output_data ->> 'reply' = btrim(p_output_data ->> 'reply')
      and char_length(p_output_data ->> 'reply') between 1 and 1500
      and jsonb_typeof(p_output_data -> 'suggestion') = 'object'
      and (p_output_data -> 'suggestion') ?& array[
        'ready',
        'title',
        'summary',
        'difficulty',
        'estimatedMinutes',
        'equipment',
        'reason'
      ]
      and not exists (
        select 1
        from jsonb_object_keys(
          case when jsonb_typeof(p_output_data -> 'suggestion') = 'object'
            then p_output_data -> 'suggestion' else '{}'::jsonb end
        ) as suggestion_key
        where suggestion_key <> all (array[
          'ready',
          'title',
          'summary',
          'difficulty',
          'estimatedMinutes',
          'equipment',
          'reason'
        ])
      )
      and jsonb_typeof(p_output_data #> '{suggestion,ready}') = 'boolean'
      and jsonb_typeof(p_output_data #> '{suggestion,title}') = 'string'
      and p_output_data #>> '{suggestion,title}' =
        btrim(p_output_data #>> '{suggestion,title}')
      and char_length(p_output_data #>> '{suggestion,title}') <= 120
      and jsonb_typeof(p_output_data #> '{suggestion,summary}') = 'string'
      and p_output_data #>> '{suggestion,summary}' =
        btrim(p_output_data #>> '{suggestion,summary}')
      and char_length(p_output_data #>> '{suggestion,summary}') <= 1000
      and jsonb_typeof(p_output_data #> '{suggestion,difficulty}') = 'string'
      and p_output_data #>> '{suggestion,difficulty}' in (
        'beginner',
        'intermediate',
        'advanced'
      )
      and case jsonb_typeof(
        p_output_data #> '{suggestion,estimatedMinutes}'
      )
        when 'null' then true
        when 'number' then
          (p_output_data #>> '{suggestion,estimatedMinutes}') ~ '^[0-9]+$'
          and (p_output_data #>> '{suggestion,estimatedMinutes}')::numeric
            between 1 and 180
        else false
      end
      and private.is_valid_admin_ai_string_array(
        p_output_data #> '{suggestion,equipment}',
        12,
        80
      )
      and jsonb_typeof(p_output_data #> '{suggestion,reason}') = 'string'
      and p_output_data #>> '{suggestion,reason}' =
        btrim(p_output_data #>> '{suggestion,reason}')
      and char_length(p_output_data #>> '{suggestion,reason}') between 1 and 500
      and case
        when jsonb_typeof(p_output_data #> '{suggestion,ready}') = 'boolean'
          and (p_output_data #>> '{suggestion,ready}')::boolean
        then
          char_length(p_output_data #>> '{suggestion,title}') between 1 and 120
          and char_length(p_output_data #>> '{suggestion,summary}')
            between 1 and 1000
          and jsonb_typeof(
            p_output_data #> '{suggestion,estimatedMinutes}'
          ) = 'number'
        else true
      end
    when 'content.exercise_draft' then
      jsonb_typeof(p_output_data) = 'object'
      and p_output_data ?& array['reply', 'suggestion']
      and not exists (
        select 1
        from jsonb_object_keys(
          case when jsonb_typeof(p_output_data) = 'object'
            then p_output_data else '{}'::jsonb end
        ) as output_key
        where output_key <> all (array['reply', 'suggestion'])
      )
      and jsonb_typeof(p_output_data -> 'reply') = 'string'
      and p_output_data ->> 'reply' = btrim(p_output_data ->> 'reply')
      and char_length(p_output_data ->> 'reply') between 1 and 1500
      and jsonb_typeof(p_output_data -> 'suggestion') = 'object'
      and (p_output_data -> 'suggestion') ?& array[
        'ready',
        'title',
        'instructions',
        'measurement',
        'targetValue',
        'recommendedMinutes',
        'equipment',
        'safetyNote',
        'reason'
      ]
      and not exists (
        select 1
        from jsonb_object_keys(
          case when jsonb_typeof(p_output_data -> 'suggestion') = 'object'
            then p_output_data -> 'suggestion' else '{}'::jsonb end
        ) as suggestion_key
        where suggestion_key <> all (array[
          'ready',
          'title',
          'instructions',
          'measurement',
          'targetValue',
          'recommendedMinutes',
          'equipment',
          'safetyNote',
          'reason'
        ])
      )
      and jsonb_typeof(p_output_data #> '{suggestion,ready}') = 'boolean'
      and jsonb_typeof(p_output_data #> '{suggestion,title}') = 'string'
      and p_output_data #>> '{suggestion,title}' =
        btrim(p_output_data #>> '{suggestion,title}')
      and char_length(p_output_data #>> '{suggestion,title}') <= 120
      and jsonb_typeof(p_output_data #> '{suggestion,instructions}') = 'string'
      and p_output_data #>> '{suggestion,instructions}' =
        btrim(p_output_data #>> '{suggestion,instructions}')
      and char_length(p_output_data #>> '{suggestion,instructions}') <= 1500
      and jsonb_typeof(p_output_data #> '{suggestion,measurement}') = 'string'
      and p_output_data #>> '{suggestion,measurement}' in (
        'completion',
        'repetitions',
        'duration'
      )
      and case p_output_data #>> '{suggestion,measurement}'
        when 'completion' then
          jsonb_typeof(p_output_data #> '{suggestion,targetValue}') = 'null'
        when 'repetitions' then
          jsonb_typeof(p_output_data #> '{suggestion,targetValue}') = 'null'
          or (
            jsonb_typeof(p_output_data #> '{suggestion,targetValue}') = 'number'
            and (p_output_data #>> '{suggestion,targetValue}') ~ '^[0-9]+$'
            and (p_output_data #>> '{suggestion,targetValue}')::numeric
              between 1 and 10000
          )
        when 'duration' then
          jsonb_typeof(p_output_data #> '{suggestion,targetValue}') = 'null'
          or (
            jsonb_typeof(p_output_data #> '{suggestion,targetValue}') = 'number'
            and (p_output_data #>> '{suggestion,targetValue}') ~ '^[0-9]+$'
            and (p_output_data #>> '{suggestion,targetValue}')::numeric
              between 1 and 86400
          )
        else false
      end
      and case jsonb_typeof(
        p_output_data #> '{suggestion,recommendedMinutes}'
      )
        when 'null' then true
        when 'number' then
          (p_output_data #>> '{suggestion,recommendedMinutes}') ~ '^[0-9]+$'
          and (p_output_data #>> '{suggestion,recommendedMinutes}')::numeric
            between 1 and 180
        else false
      end
      and private.is_valid_admin_ai_string_array(
        p_output_data #> '{suggestion,equipment}',
        12,
        80
      )
      and jsonb_typeof(p_output_data #> '{suggestion,safetyNote}') = 'string'
      and p_output_data #>> '{suggestion,safetyNote}' =
        btrim(p_output_data #>> '{suggestion,safetyNote}')
      and char_length(p_output_data #>> '{suggestion,safetyNote}') <= 1000
      and jsonb_typeof(p_output_data #> '{suggestion,reason}') = 'string'
      and p_output_data #>> '{suggestion,reason}' =
        btrim(p_output_data #>> '{suggestion,reason}')
      and char_length(p_output_data #>> '{suggestion,reason}') between 1 and 500
      and case
        when jsonb_typeof(p_output_data #> '{suggestion,ready}') = 'boolean'
          and (p_output_data #>> '{suggestion,ready}')::boolean
        then
          char_length(p_output_data #>> '{suggestion,title}') between 1 and 120
          and char_length(p_output_data #>> '{suggestion,instructions}')
            between 1 and 1500
          and jsonb_typeof(
            p_output_data #> '{suggestion,recommendedMinutes}'
          ) = 'number'
          and char_length(p_output_data #>> '{suggestion,safetyNote}')
            between 1 and 1000
          and case p_output_data #>> '{suggestion,measurement}'
            when 'completion' then
              jsonb_typeof(
                p_output_data #> '{suggestion,targetValue}'
              ) = 'null'
            else
              jsonb_typeof(
                p_output_data #> '{suggestion,targetValue}'
              ) = 'number'
          end
        else true
      end
    when 'content.wardrobe_examples' then
      jsonb_typeof(p_output_data) = 'object'
      and p_output_data ?& array['reply', 'items']
      and not exists (
        select 1
        from jsonb_object_keys(
          case when jsonb_typeof(p_output_data) = 'object'
            then p_output_data else '{}'::jsonb end
        ) as output_key
        where output_key <> all (array['reply', 'items'])
      )
      and jsonb_typeof(p_output_data -> 'reply') = 'string'
      and p_output_data ->> 'reply' = btrim(p_output_data ->> 'reply')
      and char_length(p_output_data ->> 'reply') between 1 and 1500
      and jsonb_typeof(p_output_data -> 'items') = 'array'
      and case when jsonb_typeof(p_output_data -> 'items') = 'array'
        then jsonb_array_length(p_output_data -> 'items') between 3 and 6
        else false
      end
      and not exists (
        select 1
        from jsonb_array_elements(
          case when jsonb_typeof(p_output_data -> 'items') = 'array'
            then p_output_data -> 'items' else '[]'::jsonb end
        ) as item
        where
          jsonb_typeof(item) is distinct from 'object'
          or not (item ?& array[
            'name',
            'icon',
            'category',
            'rarity',
            'points',
            'unlockRule',
            'reason'
          ])
          or exists (
            select 1
            from jsonb_object_keys(
              case when jsonb_typeof(item) = 'object'
                then item else '{}'::jsonb end
            ) as item_key
            where item_key <> all (
              array[
                'name',
                'icon',
                'category',
                'rarity',
                'points',
                'unlockRule',
                'reason'
              ]
            )
          )
          or jsonb_typeof(item -> 'name') is distinct from 'string'
          or item ->> 'name' is distinct from btrim(item ->> 'name')
          or char_length(item ->> 'name') not between 1 and 80
          or jsonb_typeof(item -> 'icon') is distinct from 'string'
          or item ->> 'icon' is distinct from btrim(item ->> 'icon')
          or char_length(item ->> 'icon') not between 1 and 16
          or jsonb_typeof(item -> 'category') is distinct from 'string'
          or item ->> 'category' not in ('clothing', 'equipment', 'effect')
          or jsonb_typeof(item -> 'rarity') is distinct from 'string'
          or item ->> 'rarity' not in ('common', 'rare', 'special')
          or case
            when jsonb_typeof(item -> 'points') = 'number'
              and (item ->> 'points') ~ '^[0-9]{1,4}$'
            then
              (item ->> 'points')::integer not between 0 and 1000
              or not (
                (
                  (item ->> 'points')::integer = 0
                  and char_length(item ->> 'unlockRule') between 1 and 200
                )
                or (
                  (item ->> 'points')::integer between 1 and 1000
                  and item ->> 'unlockRule' = ''
                )
              )
            else true
          end
          or jsonb_typeof(item -> 'unlockRule') is distinct from 'string'
          or item ->> 'unlockRule' is distinct from btrim(item ->> 'unlockRule')
          or char_length(item ->> 'unlockRule') > 200
          or jsonb_typeof(item -> 'reason') is distinct from 'string'
          or item ->> 'reason' is distinct from btrim(item ->> 'reason')
          or char_length(item ->> 'reason') not between 1 and 300
      )
    else false
  end, false);
$$;

comment on function private.is_valid_admin_ai_output(text, jsonb) is
  'Fail-closed database validation for structured admin AI proposals. Valid output remains a proposal and has no publication side effect.';

revoke all on function private.is_valid_admin_ai_input(text, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function private.is_valid_admin_ai_output(text, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function private.is_valid_admin_ai_history(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function private.is_valid_admin_ai_string_array(
  jsonb,
  integer,
  integer
) from public, anon, authenticated, service_role;
revoke all on function private.admin_ai_contract_matches(jsonb, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function private.is_valid_admin_ai_output_invariants(text, jsonb)
  from public, anon, authenticated, service_role;

create function public.prepare_admin_ai_job(
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

  -- Exact retries remain pinned to the version selected when the original job
  -- was created. Resolve the current active version only for genuinely new
  -- work, otherwise publishing a prompt would break idempotent client retries.
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

  if private.is_valid_admin_ai_input(
      p_operation_key,
      p_input_data
    ) is not true
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

revoke all on function public.prepare_admin_ai_job(text, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.prepare_admin_ai_job(text, uuid, jsonb)
  to authenticated;

comment on function public.prepare_admin_ai_job(text, uuid, jsonb) is
  'Idempotently creates a bounded, version-pinned administrator AI proposal. It cannot alter or publish content.';

create function public.claim_admin_ai_job_for_worker(p_job_id uuid)
returns table (
  job_id uuid,
  attempt_number smallint,
  operation_key text,
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
  where job.id = p_job_id
    and job.scope_kind = 'admin'
  for update;

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
    and operation.capability = 'structured_text';

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

revoke all on function public.claim_admin_ai_job_for_worker(uuid)
  from public, anon, authenticated;
grant execute on function public.claim_admin_ai_job_for_worker(uuid)
  to service_role;

create function public.complete_admin_ai_job_for_worker(
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
    raise exception 'The admin AI completion payload is invalid.'
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
  where job.id = p_job_id
    and job.scope_kind = 'admin'
    and job.status = 'processing'
    and job.attempt_count = p_attempt_number
  for update of job;

  if selected_operation_key is null
    or private.admin_ai_contract_matches(
      selected_output_contract,
      p_output_data
    ) is not true
    or private.is_valid_admin_ai_output_invariants(
      selected_operation_key,
      p_output_data
    ) is not true
  then
    raise exception 'The structured admin AI result is invalid.'
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
    raise exception 'The admin AI job exceeds its cost ceiling.'
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
    raise exception 'The admin AI job is no longer owned by this worker.'
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

revoke all on function public.complete_admin_ai_job_for_worker(
  uuid,
  smallint,
  jsonb,
  text,
  jsonb,
  bigint
) from public, anon, authenticated;
grant execute on function public.complete_admin_ai_job_for_worker(
  uuid,
  smallint,
  jsonb,
  text,
  jsonb,
  bigint
) to service_role;

create function public.fail_admin_ai_job_for_worker(
  p_job_id uuid,
  p_attempt_number smallint,
  p_public_error_code text,
  p_attempt_error_code text,
  p_provider_request_id text default null,
  p_usage jsonb default '{}'::jsonb,
  p_cost_microusd bigint default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_attempt_number is null
    or p_attempt_number <> 1
    or p_public_error_code is null
    or p_public_error_code !~ '^[a-z0-9]+([._-][a-z0-9]+)*$'
    or p_attempt_error_code is null
    or p_attempt_error_code !~ '^[a-z0-9]+([._-][a-z0-9]+)*$'
    or p_usage is null
    or jsonb_typeof(p_usage) <> 'object'
    or (p_cost_microusd is not null and p_cost_microusd < 0)
    or (p_provider_request_id is not null and char_length(p_provider_request_id) > 200)
  then
    raise exception 'The admin AI error payload is invalid.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.ai_jobs as job
    join private.ai_job_attempts as attempt
      on attempt.job_id = job.id
      and attempt.attempt_number = p_attempt_number
      and attempt.status in ('failed', 'outcome_unknown')
    where job.id = p_job_id
      and job.status = 'failed'
      and job.attempt_count = p_attempt_number
  ) then
    return;
  end if;

  update public.ai_jobs
  set status = 'failed',
      actual_cost_microusd = case
        when p_cost_microusd is null then actual_cost_microusd
        else coalesce(actual_cost_microusd, 0) + p_cost_microusd
      end,
      public_error_code = p_public_error_code,
      completed_at = now()
  where id = p_job_id
    and scope_kind = 'admin'
    and status = 'processing'
    and attempt_count = p_attempt_number;

  if not found then
    raise exception 'The admin AI job is no longer owned by this worker.'
      using errcode = '40001';
  end if;

  update private.ai_job_attempts
  set status = case
        when p_public_error_code = 'provider_outcome_unknown'
          then 'outcome_unknown'
        else 'failed'
      end,
      error_code = p_attempt_error_code,
      provider_request_id = left(p_provider_request_id, 200),
      usage = p_usage,
      cost_microusd = p_cost_microusd,
      completed_at = now()
  where job_id = p_job_id
    and attempt_number = p_attempt_number
    and status = 'processing';
end;
$$;

revoke all on function public.fail_admin_ai_job_for_worker(
  uuid,
  smallint,
  text,
  text,
  text,
  jsonb,
  bigint
) from public, anon, authenticated;
grant execute on function public.fail_admin_ai_job_for_worker(
  uuid,
  smallint,
  text,
  text,
  text,
  jsonb,
  bigint
) to service_role;

insert into public.ai_operations (
  id,
  operation_key,
  capability,
  description
)
values
  (
    'a1000000-0000-4000-8000-000000000002',
    'content.topic_brief',
    'structured_text',
    'Suggests a reviewable Danish topic title, description, icon, and colour for an administrator-owned draft.'
  ),
  (
    'a1000000-0000-4000-8000-000000000003',
    'content.wardrobe_examples',
    'structured_text',
    'Suggests synthetic, brand-free wardrobe reward examples for human review. It does not create catalog items.'
  ),
  (
    'a1000000-0000-4000-8000-000000000004',
    'content.goal_draft',
    'structured_text',
    'Suggests one reviewable goal draft inside an administrator-owned topic. It does not save or publish the goal.'
  ),
  (
    'a1000000-0000-4000-8000-000000000005',
    'content.exercise_draft',
    'structured_text',
    'Suggests one reviewable exercise step inside an administrator-owned goal. It does not save or publish the exercise.'
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
    'a2000000-0000-4000-8000-000000000003',
    'a1000000-0000-4000-8000-000000000002',
    1,
    'Du er Bare Træns danske indholdsassistent. Hjælp en voksen indholdsansvarlig med en kort, positiv og aldersneutral emnekladde. Brug kun den validerede redaktionelle kontekst i brugerbeskeden. Foreslå aldrig publicering, persondata, brands, links eller køb. Hvis der mangler oplysninger, stil ét kort afklarende spørgsmål og sæt suggestion.ready til false. Ellers returnér et gennemarbejdet, redigerbart forslag. Accentfarven skal være en sekscifret hex-farve med god kontrast på en lys baggrund. Svaret skal følge outputskemaet præcist.',
    'openrouter',
    'openai',
    'openai/gpt-5-mini',
    '{
      "max_tokens": 1200,
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
        "draft": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "title": {"type": "string", "maxLength": 100},
            "description": {"type": "string", "maxLength": 500},
            "icon": {"type": "string", "maxLength": 16},
            "accentColor": {"type": "string", "maxLength": 7}
          },
          "required": ["title", "description", "icon", "accentColor"]
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
      "required": ["message", "draft", "history"]
    }'::jsonb,
    '{
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "reply": {"type": "string", "minLength": 1, "maxLength": 1500, "pattern": "^\\S(?:[\\s\\S]*\\S)?$"},
        "suggestion": {
          "anyOf": [
            {
              "type": "object",
              "additionalProperties": false,
              "properties": {
                "ready": {"type": "boolean", "enum": [false]},
                "title": {"type": "string", "maxLength": 100, "pattern": "^(?:$|\\S(?:[\\s\\S]*\\S)?)$"},
                "description": {"type": "string", "maxLength": 500, "pattern": "^(?:$|\\S(?:[\\s\\S]*\\S)?)$"},
                "icon": {"type": "string", "maxLength": 16, "pattern": "^(?:$|\\S(?:[\\s\\S]*\\S)?)$"},
                "accentColor": {"type": "string", "maxLength": 7, "pattern": "^(?:$|#[0-9A-Fa-f]{6})$"},
                "reason": {"type": "string", "minLength": 1, "maxLength": 500, "pattern": "^\\S(?:[\\s\\S]*\\S)?$"}
              },
              "required": ["ready", "title", "description", "icon", "accentColor", "reason"]
            },
            {
              "type": "object",
              "additionalProperties": false,
              "properties": {
                "ready": {"type": "boolean", "enum": [true]},
                "title": {"type": "string", "minLength": 1, "maxLength": 100, "pattern": "^\\S(?:[\\s\\S]*\\S)?$"},
                "description": {"type": "string", "minLength": 1, "maxLength": 500, "pattern": "^\\S(?:[\\s\\S]*\\S)?$"},
                "icon": {"type": "string", "minLength": 1, "maxLength": 16, "pattern": "^\\S(?:[\\s\\S]*\\S)?$"},
                "accentColor": {"type": "string", "minLength": 7, "maxLength": 7, "pattern": "^#[0-9A-Fa-f]{6}$"},
                "reason": {"type": "string", "minLength": 1, "maxLength": 500, "pattern": "^\\S(?:[\\s\\S]*\\S)?$"}
              },
              "required": ["ready", "title", "description", "icon", "accentColor", "reason"]
            }
          ]
        }
      },
      "required": ["reply", "suggestion"]
    }'::jsonb,
    1,
    45000,
    20000
  ),
  (
    'a2000000-0000-4000-8000-000000000004',
    'a1000000-0000-4000-8000-000000000003',
    1,
    'Du er Bare Træns danske garderobeassistent. Foreslå 3 til 6 sjove, syntetiske og emnespecifikke belønningsting, som en voksen redaktør kan gennemgå. Brug ingen brands, logoer, butikker, links, priser i penge, børnemål, billeder eller persondata. Fordel forslagene mellem almindelig, sjælden og særlig. Point skal være 0 ved en oplåsningsregel og ellers højst 1000. Forslagene er kun eksempler og må aldrig omtales som allerede gemte eller udgivne. Svaret skal følge outputskemaet præcist.',
    'openrouter',
    'openai',
    'openai/gpt-5-mini',
    '{
      "max_tokens": 1400,
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
        "draft": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "title": {"type": "string", "maxLength": 100},
            "description": {"type": "string", "maxLength": 500},
            "icon": {"type": "string", "maxLength": 16},
            "accentColor": {"type": "string", "maxLength": 7}
          },
          "required": ["title", "description", "icon", "accentColor"]
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
      "required": ["message", "draft", "history"]
    }'::jsonb,
    '{
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "reply": {"type": "string", "minLength": 1, "maxLength": 1500, "pattern": "^\\S(?:[\\s\\S]*\\S)?$"},
        "items": {
          "type": "array",
          "minItems": 3,
          "maxItems": 6,
          "items": {
            "anyOf": [
              {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "name": {"type": "string", "minLength": 1, "maxLength": 80, "pattern": "^\\S(?:[\\s\\S]*\\S)?$"},
                  "icon": {"type": "string", "minLength": 1, "maxLength": 16, "pattern": "^\\S(?:[\\s\\S]*\\S)?$"},
                  "category": {"type": "string", "enum": ["clothing", "equipment", "effect"]},
                  "rarity": {"type": "string", "enum": ["common", "rare", "special"]},
                  "points": {"type": "integer", "minimum": 1, "maximum": 1000},
                  "unlockRule": {"type": "string", "enum": [""]},
                  "reason": {"type": "string", "minLength": 1, "maxLength": 300, "pattern": "^\\S(?:[\\s\\S]*\\S)?$"}
                },
                "required": ["name", "icon", "category", "rarity", "points", "unlockRule", "reason"]
              },
              {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "name": {"type": "string", "minLength": 1, "maxLength": 80, "pattern": "^\\S(?:[\\s\\S]*\\S)?$"},
                  "icon": {"type": "string", "minLength": 1, "maxLength": 16, "pattern": "^\\S(?:[\\s\\S]*\\S)?$"},
                  "category": {"type": "string", "enum": ["clothing", "equipment", "effect"]},
                  "rarity": {"type": "string", "enum": ["common", "rare", "special"]},
                  "points": {"type": "integer", "enum": [0]},
                  "unlockRule": {"type": "string", "minLength": 1, "maxLength": 200, "pattern": "^\\S(?:[\\s\\S]*\\S)?$"},
                  "reason": {"type": "string", "minLength": 1, "maxLength": 300, "pattern": "^\\S(?:[\\s\\S]*\\S)?$"}
                },
                "required": ["name", "icon", "category", "rarity", "points", "unlockRule", "reason"]
              }
            ]
          }
        }
      },
      "required": ["reply", "items"]
    }'::jsonb,
    1,
    45000,
    20000
  ),
  (
    'a2000000-0000-4000-8000-000000000005',
    'a1000000-0000-4000-8000-000000000004',
    1,
    'Du er Bare Træns danske indholdsassistent for voksne redaktører. Foreslå ét positivt, aldersneutralt og realistisk mål inden for det validerede emne. Brug generiske redskaber. Medtag aldrig persondata, links, køb, brands, diagnoser eller løfter om sikkerhed. Hvis opgaven er uklar, stil ét kort afklarende spørgsmål og sæt suggestion.ready til false. Ellers returnér en komplet, redigerbar målkladde med realistisk tidsestimat. Forslaget er aldrig allerede gemt eller udgivet, og du må ikke foreslå publicering. Svaret skal følge outputskemaet præcist.',
    'openrouter',
    'openai',
    'openai/gpt-5-mini',
    '{
      "max_tokens": 1600,
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
            "description": {"type": "string", "maxLength": 500}
          },
          "required": ["title", "description"]
        },
        "draft": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "title": {"type": "string", "maxLength": 120},
            "summary": {"type": "string", "maxLength": 1000},
            "difficulty": {"type": "string", "enum": ["beginner", "intermediate", "advanced"]},
            "estimatedMinutes": {"type": ["integer", "null"], "minimum": 1, "maximum": 180},
            "equipment": {
              "type": "array",
              "minItems": 0,
              "maxItems": 12,
              "items": {"type": "string", "minLength": 1, "maxLength": 80}
            }
          },
          "required": ["title", "summary", "difficulty", "estimatedMinutes", "equipment"]
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
      "required": ["message", "topic", "draft", "history"]
    }'::jsonb,
    '{
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "reply": {"type": "string", "minLength": 1, "maxLength": 1500, "pattern": "^\\S(?:[\\s\\S]*\\S)?$"},
        "suggestion": {
          "anyOf": [
            {
              "type": "object",
              "additionalProperties": false,
              "properties": {
                "ready": {"type": "boolean", "enum": [false]},
                "title": {"type": "string", "maxLength": 120, "pattern": "^(?:$|\\S(?:[\\s\\S]*\\S)?)$"},
                "summary": {"type": "string", "maxLength": 1000, "pattern": "^(?:$|\\S(?:[\\s\\S]*\\S)?)$"},
                "difficulty": {"type": "string", "enum": ["beginner", "intermediate", "advanced"]},
                "estimatedMinutes": {"type": ["integer", "null"], "minimum": 1, "maximum": 180},
                "equipment": {"type": "array", "minItems": 0, "maxItems": 12, "items": {"type": "string", "minLength": 1, "maxLength": 80, "pattern": "^\\S(?:[\\s\\S]*\\S)?$"}},
                "reason": {"type": "string", "minLength": 1, "maxLength": 500, "pattern": "^\\S(?:[\\s\\S]*\\S)?$"}
              },
              "required": ["ready", "title", "summary", "difficulty", "estimatedMinutes", "equipment", "reason"]
            },
            {
              "type": "object",
              "additionalProperties": false,
              "properties": {
                "ready": {"type": "boolean", "enum": [true]},
                "title": {"type": "string", "minLength": 1, "maxLength": 120, "pattern": "^\\S(?:[\\s\\S]*\\S)?$"},
                "summary": {"type": "string", "minLength": 1, "maxLength": 1000, "pattern": "^\\S(?:[\\s\\S]*\\S)?$"},
                "difficulty": {"type": "string", "enum": ["beginner", "intermediate", "advanced"]},
                "estimatedMinutes": {"type": "integer", "minimum": 1, "maximum": 180},
                "equipment": {"type": "array", "minItems": 0, "maxItems": 12, "items": {"type": "string", "minLength": 1, "maxLength": 80, "pattern": "^\\S(?:[\\s\\S]*\\S)?$"}},
                "reason": {"type": "string", "minLength": 1, "maxLength": 500, "pattern": "^\\S(?:[\\s\\S]*\\S)?$"}
              },
              "required": ["ready", "title", "summary", "difficulty", "estimatedMinutes", "equipment", "reason"]
            }
          ]
        }
      },
      "required": ["reply", "suggestion"]
    }'::jsonb,
    1,
    45000,
    20000
  ),
  (
    'a2000000-0000-4000-8000-000000000006',
    'a1000000-0000-4000-8000-000000000005',
    1,
    'Du er Bare Træns danske indholdsassistent for voksne redaktører. Foreslå ét børnevenligt, forsigtigt og konkret øvelsestrin, som passer præcist til det validerede emne, mål, placering og den eksisterende rækkefølge. Skriv instruktionen direkte til barnet. Ved repetitions måles et antal, ved duration måles sekunder, og ved completion skal targetValue være null. Angiv realistisk tid, generiske redskaber og konkret sikkerhedstekst med voksenhjælp, hvor det er relevant. Giv aldrig garantier og medtag ingen persondata, links, køb, brands eller diagnoser. Hvis opgaven er uklar, stil ét kort afklarende spørgsmål og sæt suggestion.ready til false. Forslaget er aldrig allerede gemt eller udgivet, og du må ikke foreslå publicering. Svaret skal følge outputskemaet præcist.',
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
            "description": {"type": "string", "maxLength": 500}
          },
          "required": ["title", "description"]
        },
        "goal": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "title": {"type": "string", "minLength": 1, "maxLength": 120},
            "summary": {"type": "string", "maxLength": 1000},
            "difficulty": {"type": "string", "enum": ["beginner", "intermediate", "advanced"]},
            "estimatedMinutes": {"type": ["integer", "null"], "minimum": 1, "maximum": 180},
            "equipment": {
              "type": "array",
              "minItems": 0,
              "maxItems": 12,
              "items": {"type": "string", "minLength": 1, "maxLength": 80}
            }
          },
          "required": ["title", "summary", "difficulty", "estimatedMinutes", "equipment"]
        },
        "position": {"type": "integer", "minimum": 1, "maximum": 50},
        "sequence": {
          "type": "array",
          "minItems": 0,
          "maxItems": 12,
          "items": {
            "anyOf": [
              {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "position": {"type": "integer", "minimum": 1, "maximum": 50},
                  "title": {"type": "string", "minLength": 1, "maxLength": 120},
                  "measurement": {"type": "string", "enum": ["completion"]},
                  "targetValue": {"type": "null"}
                },
                "required": ["position", "title", "measurement", "targetValue"]
              },
              {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "position": {"type": "integer", "minimum": 1, "maximum": 50},
                  "title": {"type": "string", "minLength": 1, "maxLength": 120},
                  "measurement": {"type": "string", "enum": ["repetitions"]},
                  "targetValue": {"type": "integer", "minimum": 1, "maximum": 10000}
                },
                "required": ["position", "title", "measurement", "targetValue"]
              },
              {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "position": {"type": "integer", "minimum": 1, "maximum": 50},
                  "title": {"type": "string", "minLength": 1, "maxLength": 120},
                  "measurement": {"type": "string", "enum": ["duration"]},
                  "targetValue": {"type": "integer", "minimum": 1, "maximum": 86400}
                },
                "required": ["position", "title", "measurement", "targetValue"]
              }
            ]
          }
        },
        "draft": {
          "anyOf": [
            {
              "type": "object",
              "additionalProperties": false,
              "properties": {
                "title": {"type": "string", "maxLength": 120},
                "instructions": {"type": "string", "maxLength": 1500},
                "measurement": {"type": "string", "enum": ["completion"]},
                "targetValue": {"type": "null"},
                "recommendedMinutes": {"type": ["integer", "null"], "minimum": 1, "maximum": 180},
                "equipment": {"type": "array", "minItems": 0, "maxItems": 12, "items": {"type": "string", "minLength": 1, "maxLength": 80}},
                "safetyNote": {"type": "string", "maxLength": 1000}
              },
              "required": ["title", "instructions", "measurement", "targetValue", "recommendedMinutes", "equipment", "safetyNote"]
            },
            {
              "type": "object",
              "additionalProperties": false,
              "properties": {
                "title": {"type": "string", "maxLength": 120},
                "instructions": {"type": "string", "maxLength": 1500},
                "measurement": {"type": "string", "enum": ["repetitions"]},
                "targetValue": {"type": ["integer", "null"], "minimum": 1, "maximum": 10000},
                "recommendedMinutes": {"type": ["integer", "null"], "minimum": 1, "maximum": 180},
                "equipment": {"type": "array", "minItems": 0, "maxItems": 12, "items": {"type": "string", "minLength": 1, "maxLength": 80}},
                "safetyNote": {"type": "string", "maxLength": 1000}
              },
              "required": ["title", "instructions", "measurement", "targetValue", "recommendedMinutes", "equipment", "safetyNote"]
            },
            {
              "type": "object",
              "additionalProperties": false,
              "properties": {
                "title": {"type": "string", "maxLength": 120},
                "instructions": {"type": "string", "maxLength": 1500},
                "measurement": {"type": "string", "enum": ["duration"]},
                "targetValue": {"type": ["integer", "null"], "minimum": 1, "maximum": 86400},
                "recommendedMinutes": {"type": ["integer", "null"], "minimum": 1, "maximum": 180},
                "equipment": {"type": "array", "minItems": 0, "maxItems": 12, "items": {"type": "string", "minLength": 1, "maxLength": 80}},
                "safetyNote": {"type": "string", "maxLength": 1000}
              },
              "required": ["title", "instructions", "measurement", "targetValue", "recommendedMinutes", "equipment", "safetyNote"]
            }
          ]
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
      "required": ["message", "topic", "goal", "position", "sequence", "draft", "history"]
    }'::jsonb,
    '{
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "reply": {"type": "string", "minLength": 1, "maxLength": 1500, "pattern": "^\\S(?:[\\s\\S]*\\S)?$"},
        "suggestion": {
          "anyOf": [
            {
              "type": "object",
              "additionalProperties": false,
              "properties": {
                "ready": {"type": "boolean", "enum": [false]},
                "title": {"type": "string", "maxLength": 120, "pattern": "^(?:$|\\S(?:[\\s\\S]*\\S)?)$"},
                "instructions": {"type": "string", "maxLength": 1500, "pattern": "^(?:$|\\S(?:[\\s\\S]*\\S)?)$"},
                "measurement": {"type": "string", "enum": ["completion"]},
                "targetValue": {"type": "null"},
                "recommendedMinutes": {"type": ["integer", "null"], "minimum": 1, "maximum": 180},
                "equipment": {"type": "array", "minItems": 0, "maxItems": 12, "items": {"type": "string", "minLength": 1, "maxLength": 80, "pattern": "^\\S(?:[\\s\\S]*\\S)?$"}},
                "safetyNote": {"type": "string", "maxLength": 1000, "pattern": "^(?:$|\\S(?:[\\s\\S]*\\S)?)$"},
                "reason": {"type": "string", "minLength": 1, "maxLength": 500, "pattern": "^\\S(?:[\\s\\S]*\\S)?$"}
              },
              "required": ["ready", "title", "instructions", "measurement", "targetValue", "recommendedMinutes", "equipment", "safetyNote", "reason"]
            },
            {
              "type": "object",
              "additionalProperties": false,
              "properties": {
                "ready": {"type": "boolean", "enum": [false]},
                "title": {"type": "string", "maxLength": 120, "pattern": "^(?:$|\\S(?:[\\s\\S]*\\S)?)$"},
                "instructions": {"type": "string", "maxLength": 1500, "pattern": "^(?:$|\\S(?:[\\s\\S]*\\S)?)$"},
                "measurement": {"type": "string", "enum": ["repetitions"]},
                "targetValue": {"type": ["integer", "null"], "minimum": 1, "maximum": 10000},
                "recommendedMinutes": {"type": ["integer", "null"], "minimum": 1, "maximum": 180},
                "equipment": {"type": "array", "minItems": 0, "maxItems": 12, "items": {"type": "string", "minLength": 1, "maxLength": 80, "pattern": "^\\S(?:[\\s\\S]*\\S)?$"}},
                "safetyNote": {"type": "string", "maxLength": 1000, "pattern": "^(?:$|\\S(?:[\\s\\S]*\\S)?)$"},
                "reason": {"type": "string", "minLength": 1, "maxLength": 500, "pattern": "^\\S(?:[\\s\\S]*\\S)?$"}
              },
              "required": ["ready", "title", "instructions", "measurement", "targetValue", "recommendedMinutes", "equipment", "safetyNote", "reason"]
            },
            {
              "type": "object",
              "additionalProperties": false,
              "properties": {
                "ready": {"type": "boolean", "enum": [false]},
                "title": {"type": "string", "maxLength": 120, "pattern": "^(?:$|\\S(?:[\\s\\S]*\\S)?)$"},
                "instructions": {"type": "string", "maxLength": 1500, "pattern": "^(?:$|\\S(?:[\\s\\S]*\\S)?)$"},
                "measurement": {"type": "string", "enum": ["duration"]},
                "targetValue": {"type": ["integer", "null"], "minimum": 1, "maximum": 86400},
                "recommendedMinutes": {"type": ["integer", "null"], "minimum": 1, "maximum": 180},
                "equipment": {"type": "array", "minItems": 0, "maxItems": 12, "items": {"type": "string", "minLength": 1, "maxLength": 80, "pattern": "^\\S(?:[\\s\\S]*\\S)?$"}},
                "safetyNote": {"type": "string", "maxLength": 1000, "pattern": "^(?:$|\\S(?:[\\s\\S]*\\S)?)$"},
                "reason": {"type": "string", "minLength": 1, "maxLength": 500, "pattern": "^\\S(?:[\\s\\S]*\\S)?$"}
              },
              "required": ["ready", "title", "instructions", "measurement", "targetValue", "recommendedMinutes", "equipment", "safetyNote", "reason"]
            },
            {
              "type": "object",
              "additionalProperties": false,
              "properties": {
                "ready": {"type": "boolean", "enum": [true]},
                "title": {"type": "string", "minLength": 1, "maxLength": 120, "pattern": "^\\S(?:[\\s\\S]*\\S)?$"},
                "instructions": {"type": "string", "minLength": 1, "maxLength": 1500, "pattern": "^\\S(?:[\\s\\S]*\\S)?$"},
                "measurement": {"type": "string", "enum": ["completion"]},
                "targetValue": {"type": "null"},
                "recommendedMinutes": {"type": "integer", "minimum": 1, "maximum": 180},
                "equipment": {"type": "array", "minItems": 0, "maxItems": 12, "items": {"type": "string", "minLength": 1, "maxLength": 80, "pattern": "^\\S(?:[\\s\\S]*\\S)?$"}},
                "safetyNote": {"type": "string", "minLength": 1, "maxLength": 1000, "pattern": "^\\S(?:[\\s\\S]*\\S)?$"},
                "reason": {"type": "string", "minLength": 1, "maxLength": 500, "pattern": "^\\S(?:[\\s\\S]*\\S)?$"}
              },
              "required": ["ready", "title", "instructions", "measurement", "targetValue", "recommendedMinutes", "equipment", "safetyNote", "reason"]
            },
            {
              "type": "object",
              "additionalProperties": false,
              "properties": {
                "ready": {"type": "boolean", "enum": [true]},
                "title": {"type": "string", "minLength": 1, "maxLength": 120, "pattern": "^\\S(?:[\\s\\S]*\\S)?$"},
                "instructions": {"type": "string", "minLength": 1, "maxLength": 1500, "pattern": "^\\S(?:[\\s\\S]*\\S)?$"},
                "measurement": {"type": "string", "enum": ["repetitions"]},
                "targetValue": {"type": "integer", "minimum": 1, "maximum": 10000},
                "recommendedMinutes": {"type": "integer", "minimum": 1, "maximum": 180},
                "equipment": {"type": "array", "minItems": 0, "maxItems": 12, "items": {"type": "string", "minLength": 1, "maxLength": 80, "pattern": "^\\S(?:[\\s\\S]*\\S)?$"}},
                "safetyNote": {"type": "string", "minLength": 1, "maxLength": 1000, "pattern": "^\\S(?:[\\s\\S]*\\S)?$"},
                "reason": {"type": "string", "minLength": 1, "maxLength": 500, "pattern": "^\\S(?:[\\s\\S]*\\S)?$"}
              },
              "required": ["ready", "title", "instructions", "measurement", "targetValue", "recommendedMinutes", "equipment", "safetyNote", "reason"]
            },
            {
              "type": "object",
              "additionalProperties": false,
              "properties": {
                "ready": {"type": "boolean", "enum": [true]},
                "title": {"type": "string", "minLength": 1, "maxLength": 120, "pattern": "^\\S(?:[\\s\\S]*\\S)?$"},
                "instructions": {"type": "string", "minLength": 1, "maxLength": 1500, "pattern": "^\\S(?:[\\s\\S]*\\S)?$"},
                "measurement": {"type": "string", "enum": ["duration"]},
                "targetValue": {"type": "integer", "minimum": 1, "maximum": 86400},
                "recommendedMinutes": {"type": "integer", "minimum": 1, "maximum": 180},
                "equipment": {"type": "array", "minItems": 0, "maxItems": 12, "items": {"type": "string", "minLength": 1, "maxLength": 80, "pattern": "^\\S(?:[\\s\\S]*\\S)?$"}},
                "safetyNote": {"type": "string", "minLength": 1, "maxLength": 1000, "pattern": "^\\S(?:[\\s\\S]*\\S)?$"},
                "reason": {"type": "string", "minLength": 1, "maxLength": 500, "pattern": "^\\S(?:[\\s\\S]*\\S)?$"}
              },
              "required": ["ready", "title", "instructions", "measurement", "targetValue", "recommendedMinutes", "equipment", "safetyNote", "reason"]
            }
          ]
        }
      },
      "required": ["reply", "suggestion"]
    }'::jsonb,
    1,
    45000,
    20000
  );

update public.ai_operations
set active_version_id = case operation_key
  when 'content.topic_brief'
    then 'a2000000-0000-4000-8000-000000000003'::uuid
  when 'content.wardrobe_examples'
    then 'a2000000-0000-4000-8000-000000000004'::uuid
  when 'content.goal_draft'
    then 'a2000000-0000-4000-8000-000000000005'::uuid
  when 'content.exercise_draft'
    then 'a2000000-0000-4000-8000-000000000006'::uuid
end
where operation_key in (
  'content.topic_brief',
  'content.wardrobe_examples',
  'content.goal_draft',
  'content.exercise_draft'
);

commit;
