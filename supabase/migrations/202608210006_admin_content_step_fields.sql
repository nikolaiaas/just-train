begin;

-- Topic and goal slugs are consumed below their parent route. Scoping their
-- uniqueness prevents unrelated editorial drafts from blocking each other.
alter table public.goals
  drop constraint goals_slug_key;
alter table public.goals
  add constraint goals_topic_slug_key unique (topic_id, slug);

alter table public.exercises
  drop constraint exercises_slug_key;
alter table public.exercises
  add constraint exercises_goal_slug_key unique (goal_id, slug);

create function private.is_valid_editorial_equipment(p_equipment text[])
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(
    cardinality(p_equipment) between 0 and 12
    and coalesce(array_ndims(p_equipment), 1) = 1
    and not exists (
      select 1
      from unnest(p_equipment) as equipment_item
      where equipment_item is null
        or equipment_item <> btrim(equipment_item)
        or char_length(equipment_item) not between 1 and 80
        or equipment_item ~ '[[:cntrl:]]'
    )
    and cardinality(p_equipment) = (
      select count(distinct lower(equipment_item))
      from unnest(p_equipment) as equipment_item
    ),
    false
  );
$$;

comment on function private.is_valid_editorial_equipment(text[]) is
  'Validates a flat list of at most twelve trimmed and case-insensitively unique equipment labels for administrator-authored content.';

revoke all on function private.is_valid_editorial_equipment(text[])
  from public, anon, authenticated, service_role;
-- PostgreSQL evaluates CHECK functions with the writer's privileges. The
-- authenticated administrator and trusted server therefore need EXECUTE for
-- inserts and updates to reach the constraint; anonymous clients still have no
-- access, and table RLS remains the authorisation boundary.
grant execute on function private.is_valid_editorial_equipment(text[])
  to authenticated, service_role;

alter table public.exercises
  add column estimated_minutes smallint
    check (estimated_minutes is null or estimated_minutes between 1 and 180),
  add column equipment text[] not null default '{}'::text[],
  add column safety_notes text not null default '';

-- These constraints intentionally start NOT VALID. Hosted databases may
-- contain editorial rows created before these limits existed. PostgreSQL still
-- enforces every constraint for new and changed rows; legacy rows can be
-- cleaned and the constraints validated in a later, separately reviewed step.
alter table public.topics
  add constraint topics_slug_is_bounded
    check (char_length(slug) between 1 and 120) not valid,
  add constraint topics_title_is_bounded
    check (
      title = btrim(title)
      and char_length(title) between 1 and 100
      and title !~ '[[:cntrl:]]'
    ) not valid,
  add constraint topics_description_is_bounded
    check (
      description = btrim(description, E' \t\n\r')
      and char_length(description) <= 500
      and position(E'\r' in description) = 0
      and translate(description, E'\n\r\t', '') !~ '[[:cntrl:]]'
    ) not valid,
  add constraint topics_icon_is_bounded
    check (
      icon is null
      or (
        icon = btrim(icon)
        and char_length(icon) between 1 and 16
        and icon !~ '[[:cntrl:]]'
      )
    ) not valid;

alter table public.goals
  add constraint goals_slug_is_bounded
    check (char_length(slug) between 1 and 120) not valid,
  add constraint goals_title_is_bounded
    check (
      title = btrim(title)
      and char_length(title) between 1 and 120
      and title !~ '[[:cntrl:]]'
    ) not valid,
  add constraint goals_summary_is_bounded
    check (
      summary = btrim(summary, E' \t\n\r')
      and char_length(summary) <= 1000
      and position(E'\r' in summary) = 0
      and translate(summary, E'\n\r\t', '') !~ '[[:cntrl:]]'
    ) not valid,
  add constraint goals_equipment_is_bounded
    check (private.is_valid_editorial_equipment(equipment)) not valid;

alter table public.exercises
  drop constraint exercises_target_matches_measurement;

alter table public.exercises
  add constraint exercises_slug_is_bounded
    check (char_length(slug) between 1 and 120) not valid,
  add constraint exercises_title_is_bounded
    check (
      title = btrim(title)
      and char_length(title) between 1 and 120
      and title !~ '[[:cntrl:]]'
    ) not valid,
  add constraint exercises_instructions_are_bounded
    check (
      instructions = btrim(instructions, E' \t\n\r')
      and char_length(instructions) <= 1500
      and position(E'\r' in instructions) = 0
      and translate(instructions, E'\n\r\t', '') !~ '[[:cntrl:]]'
    ) not valid,
  add constraint exercises_target_matches_measurement
    check (
      (measurement = 'completion' and target_value is null)
      or (
        measurement = 'repetitions'
        and target_value between 1 and 10000
      )
      or (
        measurement = 'duration'
        and target_value between 1 and 86400
      )
    ) not valid,
  add constraint exercises_equipment_is_bounded
    check (private.is_valid_editorial_equipment(equipment)) not valid,
  add constraint exercises_safety_notes_are_bounded
    check (
      safety_notes = btrim(safety_notes, E' \t\n\r')
      and char_length(safety_notes) <= 1000
      and position(E'\r' in safety_notes) = 0
      and translate(safety_notes, E'\n\r\t', '') !~ '[[:cntrl:]]'
    ) not valid;

comment on column public.exercises.estimated_minutes is
  'Optional administrator-reviewed practice-time guidance for one exercise.';
comment on column public.exercises.equipment is
  'Bounded equipment labels needed for one exercise.';
comment on column public.exercises.safety_notes is
  'Administrator-reviewed safety and adult-help guidance shown with one exercise.';

-- Direct authenticated writes must bind new-row provenance to the signed-in
-- administrator. Column grants keep created_by immutable while still allowing
-- one administrator to continue another administrator's editorial draft.
drop policy "Admins can create topics" on public.topics;
drop policy "Admins can create goals" on public.goals;
drop policy "Admins can create exercises" on public.exercises;

create policy "Admins can create topics"
on public.topics for insert to authenticated
with check (
  (select private.is_admin())
  and created_by = (select auth.uid())
);

create policy "Admins can create goals"
on public.goals for insert to authenticated
with check (
  (select private.is_admin())
  and created_by = (select auth.uid())
);

create policy "Admins can create exercises"
on public.exercises for insert to authenticated
with check (
  (select private.is_admin())
  and created_by = (select auth.uid())
);

revoke insert, update on table
  public.topics,
  public.goals,
  public.exercises
from authenticated;

grant insert (
  id,
  slug,
  title,
  description,
  icon,
  accent_color,
  sort_order,
  content_version,
  is_published,
  created_by
) on public.topics to authenticated;
grant update (
  slug,
  title,
  description,
  icon,
  accent_color,
  sort_order,
  content_version,
  is_published
) on public.topics to authenticated;

grant insert (
  id,
  topic_id,
  slug,
  title,
  summary,
  difficulty,
  estimated_minutes,
  equipment,
  hero_media_url,
  sort_order,
  content_version,
  is_published,
  created_by
) on public.goals to authenticated;
grant update (
  topic_id,
  slug,
  title,
  summary,
  difficulty,
  estimated_minutes,
  equipment,
  hero_media_url,
  sort_order,
  content_version,
  is_published
) on public.goals to authenticated;

grant insert (
  id,
  goal_id,
  slug,
  title,
  instructions,
  measurement,
  target_value,
  estimated_minutes,
  equipment,
  safety_notes,
  video_url,
  sort_order,
  content_version,
  is_published,
  created_by
) on public.exercises to authenticated;
grant update (
  goal_id,
  slug,
  title,
  instructions,
  measurement,
  target_value,
  estimated_minutes,
  equipment,
  safety_notes,
  video_url,
  sort_order,
  content_version,
  is_published
) on public.exercises to authenticated;

-- Published exercise guidance is public content, just like the pre-existing
-- instruction and target columns.
grant select (estimated_minutes, equipment, safety_notes)
  on public.exercises to anon;

-- Trusted server code keeps its deliberately narrow column privileges while
-- gaining access to the three new exercise fields.
grant insert (estimated_minutes, equipment, safety_notes)
  on public.exercises to service_role;
grant update (estimated_minutes, equipment, safety_notes)
  on public.exercises to service_role;

commit;
