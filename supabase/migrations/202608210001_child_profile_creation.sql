begin;

create function private.assert_child_profile_creation_preconditions()
returns void
language plpgsql
set search_path = ''
as $$
declare
  invalid_name_count integer;
  over_limit_family_count integer;
begin
  select count(*)::integer
    into invalid_name_count
  from public.child_profiles as child
  where child.display_name <> btrim(child.display_name)
    or child.display_name ~ '[[:cntrl:]]';

  if invalid_name_count > 0 then
    raise exception 'Child-profile creation migration blocked: existing child names require review.'
      using
        errcode = '23514',
        detail = format(
          '%s child profile row(s) contain surrounding whitespace or control characters.',
          invalid_name_count
        ),
        hint = 'Review those names with the family, normalize them explicitly, and retry the migration. The migration will not rewrite child data automatically.';
  end if;

  select count(*)::integer
    into over_limit_family_count
  from (
    select child.family_id
    from public.child_profiles as child
    where child.is_active
    group by child.family_id
    having count(*) > 10
  ) as over_limit_family;

  if over_limit_family_count > 0 then
    raise exception 'Child-profile creation migration blocked: a family exceeds the active-child limit.'
      using
        errcode = '54000',
        detail = format(
          '%s family row(s) have more than 10 active child profiles.',
          over_limit_family_count
        ),
        hint = 'Ask the family owner which profiles should be deactivated or retained, remediate explicitly, and retry the migration. The migration will not choose children automatically.';
  end if;
end;
$$;

revoke all on function private.assert_child_profile_creation_preconditions()
  from public, anon, authenticated;

comment on function private.assert_child_profile_creation_preconditions() is
  'Fail-fast hosted-deployment preflight. Refuses to normalize child names or choose which active child profiles a family should retain.';

-- Freeze legacy writers across the preflight-to-trigger window. After this
-- lock is acquired, the next READ COMMITTED statement sees every earlier
-- child write, and no insert/update/delete can cross the count-to-enforcement
-- boundary before this migration commits.
lock table public.child_profiles in share row exclusive mode;

select private.assert_child_profile_creation_preconditions();

-- The public child id is globally unique already. The redundant composite key
-- lets the private consent record carry the family lineage in a declarative
-- foreign key, so those two values can never drift apart.
alter table public.child_profiles
  add constraint child_profiles_id_family_id_key unique (id, family_id);
alter table public.child_profiles
  add constraint child_profiles_display_name_normalized check (
    display_name = btrim(display_name)
    and display_name !~ '[[:cntrl:]]'
  );

create table private.child_profile_consents (
  child_profile_id uuid not null,
  family_id uuid not null,
  creation_request_id uuid not null
    check (creation_request_id <> '00000000-0000-0000-0000-000000000000'::uuid),
  notice_version text not null
    check (notice_version = 'child-profile-pilot-v1'),
  granted_by uuid not null references public.profiles (id) on delete restrict,
  granted_at timestamptz not null default now(),
  primary key (child_profile_id),
  unique (granted_by, creation_request_id),
  constraint child_profile_consents_child_family_fkey
    foreign key (child_profile_id, family_id)
    references public.child_profiles (id, family_id)
    on delete cascade
);

comment on table private.child_profile_consents is
  'Immutable, non-API evidence that an authenticated family owner accepted the versioned child-profile notice. Row existence represents acceptance.';
comment on column private.child_profile_consents.creation_request_id is
  'Client-generated idempotency key scoped to the authenticated adult.';

-- This table is deliberately outside the exposed API schemas. RLS remains
-- enabled without client policies as an additional default-deny boundary.
alter table private.child_profile_consents enable row level security;
revoke all on table private.child_profile_consents
  from public, anon, authenticated, service_role;
grant select on table private.child_profile_consents to service_role;

create function private.enforce_active_child_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_children integer;
begin
  if not new.is_active then
    return new;
  end if;

  if tg_op = 'UPDATE'
    and old.is_active
    and new.family_id = old.family_id
  then
    return new;
  end if;

  -- Every insert or activation for one family takes the same row lock. NO KEY
  -- UPDATE serializes the count and owner removal while remaining compatible
  -- with the KEY SHARE lock taken by an unrelated membership insert FK check.
  perform family.id
  from public.families as family
  where family.id = new.family_id
  for no key update;

  if not found then
    raise exception 'The family does not exist.'
      using errcode = '23503';
  end if;

  select count(*)::integer
    into active_children
  from public.child_profiles as child
  where child.family_id = new.family_id
    and child.is_active
    and child.id <> new.id;

  if active_children >= 10 then
    raise exception 'A family can have at most 10 active child profiles.'
      using errcode = '54000';
  end if;

  return new;
end;
$$;

create trigger enforce_active_child_limit
before insert or update of family_id, is_active on public.child_profiles
for each row execute function private.enforce_active_child_limit();

revoke all on function private.enforce_active_child_limit()
  from public, anon, authenticated;

create function public.create_child_profile(
  p_family_id uuid,
  p_expected_user_id uuid,
  p_creation_request_id uuid,
  p_display_name text,
  p_avatar_seed text,
  p_consent_version text,
  p_consent_granted boolean
)
returns table (
  child_profile_id uuid,
  family_id uuid,
  display_name text,
  avatar_seed text,
  is_active boolean,
  consent_version text,
  consented_at timestamptz,
  created boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  normalized_display_name text := btrim(p_display_name);
  existing_child_profile_id uuid;
  existing_family_id uuid;
  existing_display_name text;
  existing_avatar_seed text;
  existing_is_active boolean;
  existing_consent_version text;
  existing_consented_at timestamptz;
  inserted_child_profile_id uuid;
  inserted_is_active boolean;
  inserted_consented_at timestamptz;
begin
  if caller_id is null then
    raise exception 'Authentication is required.'
      using errcode = '42501';
  end if;

  if p_expected_user_id is null
    or caller_id is distinct from p_expected_user_id
  then
    raise exception 'The authenticated account changed before child creation.'
      using errcode = '28000';
  end if;

  if p_family_id is null then
    raise exception 'A family is required.'
      using errcode = '22023';
  end if;

  if p_creation_request_id is null
    or p_creation_request_id = '00000000-0000-0000-0000-000000000000'::uuid
  then
    raise exception 'A non-zero creation request id is required.'
      using errcode = '22023';
  end if;

  if normalized_display_name is null
    or char_length(normalized_display_name) not between 1 and 60
    or normalized_display_name ~ '[[:cntrl:]]'
  then
    raise exception 'Child display name must contain between 1 and 60 characters.'
      using errcode = '22023';
  end if;

  if p_avatar_seed is null or p_avatar_seed not in (
    'preset-star',
    'preset-rocket',
    'preset-rainbow',
    'preset-sprout'
  ) then
    raise exception 'The selected preset avatar is invalid.'
      using errcode = '22023';
  end if;

  if p_consent_granted is distinct from true then
    raise exception 'The child-profile notice must be accepted.'
      using errcode = '22023';
  end if;

  if p_consent_version is distinct from 'child-profile-pilot-v1' then
    raise exception 'The child-profile notice version is invalid.'
      using errcode = '22023';
  end if;

  -- Serialize request ids for this adult, including accidental reuse across
  -- two families, before inspecting the private idempotency record.
  perform profile.id
  from public.profiles as profile
  where profile.id = caller_id
  for update;

  if not found then
    raise exception 'The authenticated profile is missing.'
      using errcode = 'P0002';
  end if;

  -- Lock the family in its own READ COMMITTED statement. Owner removal's FOR
  -- UPDATE conflicts with this lock, while an unrelated membership insert's
  -- FK KEY SHARE does not. A waiter proceeds only after removal commits.
  perform family.id
  from public.families as family
  where family.id = p_family_id
  for no key update;

  if not found then
    raise exception 'Family owner access is required.'
      using errcode = '42501';
  end if;

  -- This separate statement receives a fresh READ COMMITTED snapshot after a
  -- lock wait. A concurrently removed or demoted owner therefore fails closed
  -- instead of being authorized from the stale pre-wait snapshot.
  perform membership.family_id
  from public.family_memberships as membership
  where membership.family_id = p_family_id
    and membership.user_id = caller_id
    and membership.role = 'owner';

  if not found then
    raise exception 'Family owner access is required.'
      using errcode = '42501';
  end if;

  select
    child.id,
    child.family_id,
    child.display_name,
    child.avatar_seed,
    child.is_active,
    consent.notice_version,
    consent.granted_at
  into
    existing_child_profile_id,
    existing_family_id,
    existing_display_name,
    existing_avatar_seed,
    existing_is_active,
    existing_consent_version,
    existing_consented_at
  from private.child_profile_consents as consent
  join public.child_profiles as child
    on child.id = consent.child_profile_id
    and child.family_id = consent.family_id
  where consent.granted_by = caller_id
    and consent.creation_request_id = p_creation_request_id;

  if existing_child_profile_id is not null then
    if existing_family_id <> p_family_id
      or existing_display_name <> normalized_display_name
      or existing_avatar_seed <> p_avatar_seed
      or existing_consent_version <> p_consent_version
    then
      raise exception 'A creation request id cannot be reused with different input.'
        using errcode = '22023';
    end if;

    return query
    select
      existing_child_profile_id,
      existing_family_id,
      existing_display_name,
      existing_avatar_seed,
      existing_is_active,
      existing_consent_version,
      existing_consented_at,
      false;
    return;
  end if;

  insert into public.child_profiles (
    family_id,
    display_name,
    avatar_url,
    avatar_seed,
    preferences,
    is_active,
    created_by
  )
  values (
    p_family_id,
    normalized_display_name,
    null,
    p_avatar_seed,
    '{}'::jsonb,
    true,
    caller_id
  )
  returning id, child_profiles.is_active
  into inserted_child_profile_id, inserted_is_active;

  insert into private.child_profile_consents (
    child_profile_id,
    family_id,
    creation_request_id,
    notice_version,
    granted_by
  )
  values (
    inserted_child_profile_id,
    p_family_id,
    p_creation_request_id,
    p_consent_version,
    caller_id
  )
  returning granted_at into inserted_consented_at;

  return query
  select
    inserted_child_profile_id,
    p_family_id,
    normalized_display_name,
    p_avatar_seed,
    inserted_is_active,
    p_consent_version,
    inserted_consented_at,
    true;
end;
$$;

revoke all on function public.create_child_profile(
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  boolean
) from public, anon;
grant execute on function public.create_child_profile(
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  boolean
) to authenticated;

comment on function public.create_child_profile(
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  boolean
) is
  'Atomically creates a preset-only parent-owned child profile and its versioned owner consent. Safe to retry with the same caller-scoped request id.';

-- New child profiles must pass through the consent-gated RPC. Existing legacy
-- avatar seeds remain readable, while untrusted clients lose every field that
-- could bypass the pilot preset, consent, or active-child limit.
drop policy "Members can create child profiles in their family"
  on public.child_profiles;
revoke insert (
  family_id,
  display_name,
  avatar_url,
  avatar_seed,
  preferences,
  is_active,
  created_by
) on public.child_profiles from authenticated;
revoke update (avatar_url, avatar_seed, preferences, is_active)
  on public.child_profiles from authenticated;

commit;
