begin;

-- Hosted projects can have Supabase's optional auto-RLS event-trigger helper.
-- Event triggers invoke their function internally and do not require client
-- EXECUTE grants. The local CLI baseline does not currently install the helper,
-- so keep this hardening conditional and safe on both environments.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable()
      from public, anon, authenticated, service_role;
  end if;
end;
$$;

-- Published content remains visible to both API roles. Authenticated users had
-- two permissive SELECT policies per table (published content plus admin
-- access), which PostgreSQL OR'ed together. One role-specific policy preserves
-- the same result while avoiding duplicate policy evaluation and Advisor noise.
drop policy "Anyone can read published topics" on public.topics;
drop policy "Admins can read all topics" on public.topics;

create policy "Anonymous users can read published topics"
on public.topics for select to anon
using (is_published);

create policy "Authenticated users can read available topics"
on public.topics for select to authenticated
using (
  is_published
  or (select private.is_admin())
);

drop policy "Anyone can read published goals" on public.goals;
drop policy "Admins can read all goals" on public.goals;

create policy "Anonymous users can read published goals"
on public.goals for select to anon
using (
  is_published
  and exists (
    select 1
    from public.topics as topic
    where topic.id = goals.topic_id
      and topic.is_published
  )
);

create policy "Authenticated users can read available goals"
on public.goals for select to authenticated
using (
  (select private.is_admin())
  or (
    is_published
    and exists (
      select 1
      from public.topics as topic
      where topic.id = goals.topic_id
        and topic.is_published
    )
  )
);

drop policy "Anyone can read published exercises" on public.exercises;
drop policy "Admins can read all exercises" on public.exercises;

create policy "Anonymous users can read published exercises"
on public.exercises for select to anon
using (
  is_published
  and exists (
    select 1
    from public.goals as goal
    join public.topics as topic on topic.id = goal.topic_id
    where goal.id = exercises.goal_id
      and goal.is_published
      and topic.is_published
  )
);

create policy "Authenticated users can read available exercises"
on public.exercises for select to authenticated
using (
  (select private.is_admin())
  or (
    is_published
    and exists (
      select 1
      from public.goals as goal
      join public.topics as topic on topic.id = goal.topic_id
      where goal.id = exercises.goal_id
        and goal.is_published
        and topic.is_published
    )
  )
);

commit;
