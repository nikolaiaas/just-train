begin;

create function public.complete_parent_onboarding(
  p_display_name text,
  p_family_name text
)
returns table (
  profile_id uuid,
  display_name text,
  family_id uuid,
  family_name text,
  role public.family_member_role,
  created boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  normalized_display_name text := btrim(p_display_name);
  normalized_family_name text := btrim(p_family_name);
  selected_family_id uuid;
  selected_family_name text;
  selected_role public.family_member_role;
begin
  if caller_id is null then
    raise exception 'Authentication is required.'
      using errcode = '42501';
  end if;

  if normalized_display_name is null
    or char_length(normalized_display_name) not between 1 and 80
    or normalized_display_name ~ '[[:cntrl:]]'
  then
    raise exception 'Display name must contain between 1 and 80 characters.'
      using errcode = '22023';
  end if;

  if normalized_family_name is null
    or char_length(normalized_family_name) not between 1 and 80
    or normalized_family_name ~ '[[:cntrl:]]'
  then
    raise exception 'Family name must contain between 1 and 80 characters.'
      using errcode = '22023';
  end if;

  -- All first-family attempts for one account take the same row lock. A retry
  -- after a lost response therefore returns the family that was already made,
  -- and two concurrent requests cannot create two first families.
  perform profile.id
  from public.profiles as profile
  where profile.id = caller_id
  for update;

  if not found then
    raise exception 'The authenticated profile is missing.'
      using errcode = 'P0002';
  end if;

  update public.profiles as profile
  set display_name = normalized_display_name
  where profile.id = caller_id
    and profile.display_name is distinct from normalized_display_name;

  select
    membership.family_id,
    family.name,
    membership.role
  into
    selected_family_id,
    selected_family_name,
    selected_role
  from public.family_memberships as membership
  join public.families as family on family.id = membership.family_id
  where membership.user_id = caller_id
  order by membership.created_at, membership.family_id
  limit 1;

  if selected_family_id is not null then
    return query
    select
      caller_id,
      normalized_display_name,
      selected_family_id,
      selected_family_name,
      selected_role,
      false;
    return;
  end if;

  insert into public.families (name, created_by)
  values (normalized_family_name, caller_id)
  returning id, name
  into selected_family_id, selected_family_name;

  -- The existing add_family_creator_as_owner trigger creates the matching
  -- owner membership in the same transaction.
  return query
  select
    caller_id,
    normalized_display_name,
    selected_family_id,
    selected_family_name,
    'owner'::public.family_member_role,
    true;
end;
$$;

revoke all on function public.complete_parent_onboarding(text, text)
  from public, anon;
grant execute on function public.complete_parent_onboarding(text, text)
  to authenticated;

comment on function public.complete_parent_onboarding(text, text) is
  'Atomically updates the authenticated adult profile and returns or creates their first family. Safe to retry; caller identity always comes from auth.uid().';

commit;
