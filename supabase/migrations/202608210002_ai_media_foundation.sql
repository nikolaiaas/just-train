begin;

create type public.media_subject_kind as enum (
  'synthetic',
  'adult_test',
  'child'
);
create type public.media_asset_role as enum (
  'reference_input',
  'generated_output'
);
create type public.media_asset_status as enum (
  'pending',
  'ready',
  'failed',
  'deleted'
);
create type public.ai_job_status as enum (
  'awaiting_upload',
  'processing',
  'succeeded',
  'failed',
  'cancelled'
);
create type public.ai_job_scope_kind as enum (
  'family',
  'admin'
);

create table public.ai_operations (
  id uuid primary key default gen_random_uuid(),
  operation_key text not null unique
    check (operation_key ~ '^[a-z0-9]+([._-][a-z0-9]+)*$'),
  capability text not null
    check (capability ~ '^[a-z0-9]+([._-][a-z0-9]+)*$'),
  description text not null default ''
    check (char_length(description) <= 500),
  is_enabled boolean not null default false,
  active_version_id uuid,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, active_version_id)
);

comment on table public.ai_operations is
  'Stable client-facing AI operation keys. Provider details and prompts live in immutable versions.';

create table public.ai_operation_versions (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null references public.ai_operations (id) on delete restrict,
  version integer not null check (version > 0),
  prompt_template text not null
    check (
      prompt_template = btrim(prompt_template)
      and char_length(prompt_template) between 1 and 12000
      and translate(prompt_template, E'\n\r\t', '') !~ '[[:cntrl:]]'
    ),
  gateway text not null
    check (gateway ~ '^[a-z0-9]+([._-][a-z0-9]+)*$'),
  provider text not null
    check (provider ~ '^[a-z0-9]+([._-][a-z0-9]+)*$'),
  model text not null
    check (model ~ '^[A-Za-z0-9]+([._:/-][A-Za-z0-9]+)*$'),
  request_options jsonb not null default '{}'::jsonb
    check (jsonb_typeof(request_options) = 'object'),
  input_contract jsonb not null default '{}'::jsonb
    check (jsonb_typeof(input_contract) = 'object'),
  output_contract jsonb not null default '{}'::jsonb
    check (jsonb_typeof(output_contract) = 'object'),
  max_attempts smallint not null default 1
    check (max_attempts = 1),
  timeout_ms integer not null default 115000
    check (timeout_ms between 1000 and 120000),
  max_cost_microusd bigint not null
    check (max_cost_microusd between 1 and 10000000),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (operation_id, version),
  unique (id, operation_id)
);

comment on table public.ai_operation_versions is
  'Immutable prompt, provider, model, validation, timeout, and cost snapshots. Existing jobs remain pinned when a new version is activated.';

alter table public.ai_operations
  add constraint ai_operations_active_version_fkey
  foreign key (active_version_id, id)
  references public.ai_operation_versions (id, operation_id)
  on delete restrict;

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete restrict,
  child_profile_id uuid,
  subject_kind public.media_subject_kind not null,
  asset_role public.media_asset_role not null,
  status public.media_asset_status not null default 'pending',
  storage_bucket text not null default 'ai-media-private'
    check (storage_bucket = 'ai-media-private'),
  storage_object_path text not null unique
    check (
      storage_object_path !~ '(^|/)\.\.(/|$)'
      and storage_object_path !~ '[[:cntrl:]]'
      and char_length(storage_object_path) between 10 and 500
    ),
  mime_type text not null
    check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  byte_size bigint
    check (byte_size is null or byte_size between 1 and 8388608),
  sha256_hex text
    check (sha256_hex is null or sha256_hex ~ '^[0-9a-f]{64}$'),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  delete_after timestamptz,
  deleted_at timestamptz,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, family_id),
  constraint media_assets_child_family_fkey
    foreign key (child_profile_id, family_id)
    references public.child_profiles (id, family_id)
    on delete restrict,
  constraint media_assets_subject_matches_child check (
    (subject_kind = 'child' and child_profile_id is not null)
    or (subject_kind <> 'child' and child_profile_id is null)
  ),
  constraint media_assets_deleted_state check (
    (status = 'deleted' and deleted_at is not null)
    or (status <> 'deleted' and deleted_at is null)
  )
);

comment on table public.media_assets is
  'Metadata for private Storage objects. It never contains image bytes, signed URLs, or provider payloads.';

create table public.ai_jobs (
  id uuid primary key default gen_random_uuid(),
  scope_kind public.ai_job_scope_kind not null default 'family',
  family_id uuid references public.families (id) on delete restrict,
  child_profile_id uuid,
  subject_kind public.media_subject_kind,
  operation_id uuid not null references public.ai_operations (id) on delete restrict,
  operation_version_id uuid not null,
  requested_by uuid not null references public.profiles (id) on delete restrict,
  client_request_id uuid not null
    check (client_request_id <> '00000000-0000-0000-0000-000000000000'::uuid),
  status public.ai_job_status not null default 'awaiting_upload',
  attempt_count smallint not null default 0 check (attempt_count >= 0),
  max_attempts smallint not null check (max_attempts = 1),
  max_cost_microusd bigint not null check (max_cost_microusd > 0),
  actual_cost_microusd bigint
    check (actual_cost_microusd is null or actual_cost_microusd >= 0),
  public_error_code text
    check (
      public_error_code is null
      or public_error_code ~ '^[a-z0-9]+([._-][a-z0-9]+)*$'
    ),
  queued_at timestamptz,
  processing_started_at timestamptz,
  completed_at timestamptz,
  input_data jsonb not null default '{}'::jsonb
    check (jsonb_typeof(input_data) = 'object'),
  output_data jsonb
    check (output_data is null or jsonb_typeof(output_data) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (requested_by, client_request_id),
  unique (id, family_id),
  constraint ai_jobs_operation_version_fkey
    foreign key (operation_version_id, operation_id)
    references public.ai_operation_versions (id, operation_id)
    on delete restrict,
  constraint ai_jobs_child_family_fkey
    foreign key (child_profile_id, family_id)
    references public.child_profiles (id, family_id)
    on delete restrict,
  constraint ai_jobs_scope_shape check (
    (
      scope_kind = 'family'
      and family_id is not null
      and subject_kind is not null
      and (
        (subject_kind = 'child' and child_profile_id is not null)
        or (subject_kind <> 'child' and child_profile_id is null)
      )
    )
    or (
      scope_kind = 'admin'
      and family_id is null
      and subject_kind is null
      and child_profile_id is null
    )
  ),
  constraint ai_jobs_attempt_limit check (attempt_count <= max_attempts),
  constraint ai_jobs_terminal_state check (
    (status in ('succeeded', 'failed', 'cancelled') and completed_at is not null)
    or (status not in ('succeeded', 'failed', 'cancelled') and completed_at is null)
  )
);

comment on table public.ai_jobs is
  'General idempotent family/admin AI work records pinned to immutable operation versions. Capability-specific media or structured data attaches without exposing provider configuration.';

create table public.ai_job_media (
  job_id uuid not null,
  media_asset_id uuid not null,
  family_id uuid not null,
  slot text not null
    check (slot ~ '^[a-z0-9]+([._-][a-z0-9]+)*$'),
  ordinal smallint not null default 0 check (ordinal between 0 and 31),
  created_at timestamptz not null default now(),
  primary key (job_id, slot, ordinal),
  unique (job_id, media_asset_id),
  constraint ai_job_media_job_family_fkey
    foreign key (job_id, family_id)
    references public.ai_jobs (id, family_id)
    on delete cascade,
  constraint ai_job_media_asset_family_fkey
    foreign key (media_asset_id, family_id)
    references public.media_assets (id, family_id)
    on delete cascade
);

comment on table public.ai_job_media is
  'Named, ordered media inputs and outputs so future operations can accept multiple images, audio, or video without a job-table redesign.';

create table private.ai_job_attempts (
  job_id uuid not null references public.ai_jobs (id) on delete cascade,
  attempt_number smallint not null check (attempt_number = 1),
  gateway text not null,
  provider text not null,
  model text not null,
  provider_request_id text
    check (provider_request_id is null or char_length(provider_request_id) <= 200),
  status text not null
    check (status in ('processing', 'succeeded', 'failed', 'outcome_unknown')),
  error_code text
    check (
      error_code is null
      or error_code ~ '^[a-z0-9]+([._-][a-z0-9]+)*$'
    ),
  usage jsonb not null default '{}'::jsonb
    check (jsonb_typeof(usage) = 'object'),
  cost_microusd bigint
    check (cost_microusd is null or cost_microusd >= 0),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (job_id, attempt_number)
);

comment on table private.ai_job_attempts is
  'Worker-only provider attempt audit. Never store prompts, media, signed URLs, or raw provider responses here.';

create table private.ai_media_testers (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  authorized_by uuid references public.profiles (id) on delete set null,
  authorized_at timestamptz not null default now(),
  expires_at timestamptz not null,
  check (expires_at > authorized_at)
);

comment on table private.ai_media_testers is
  'Server-managed, expiring allowlist for audited adult/synthetic media testing. It is intentionally empty outside tests until a reviewed activation.';

create index ai_operation_versions_operation_idx
  on public.ai_operation_versions (operation_id, version desc);
create index media_assets_family_created_idx
  on public.media_assets (family_id, created_at desc);
create index media_assets_delete_after_idx
  on public.media_assets (delete_after)
  where status <> 'deleted' and delete_after is not null;
create index ai_jobs_family_created_idx
  on public.ai_jobs (family_id, created_at desc);
create index ai_jobs_claim_idx
  on public.ai_jobs (status, processing_started_at, created_at)
  where status in ('awaiting_upload', 'processing', 'failed');
create index ai_job_media_asset_idx
  on public.ai_job_media (media_asset_id);

create trigger ai_operations_set_updated_at
before update on public.ai_operations
for each row execute function private.set_updated_at();
create trigger media_assets_set_updated_at
before update on public.media_assets
for each row execute function private.set_updated_at();
create trigger ai_jobs_set_updated_at
before update on public.ai_jobs
for each row execute function private.set_updated_at();

create function private.prevent_ai_operation_version_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'AI operation versions are immutable; create and activate a new version.'
    using errcode = '55000';
end;
$$;

create trigger prevent_ai_operation_version_mutation
before update or delete on public.ai_operation_versions
for each row execute function private.prevent_ai_operation_version_mutation();

revoke all on function private.prevent_ai_operation_version_mutation()
  from public, anon, authenticated, service_role;

alter table public.ai_operations enable row level security;
alter table public.ai_operation_versions enable row level security;
alter table public.media_assets enable row level security;
alter table public.ai_jobs enable row level security;
alter table public.ai_job_media enable row level security;
alter table private.ai_job_attempts enable row level security;
alter table private.ai_media_testers enable row level security;

create policy "Admins can read AI operations"
on public.ai_operations for select to authenticated
using ((select private.is_admin()));

create policy "Admins can read AI operation versions"
on public.ai_operation_versions for select to authenticated
using ((select private.is_admin()));

create policy "Family members can read their AI media metadata"
on public.media_assets for select to authenticated
using (
  asset_role = 'generated_output'
  and status = 'ready'
  and (select private.is_family_member(family_id))
);

create policy "Family members can read their AI jobs"
on public.ai_jobs for select to authenticated
using (
  (
    scope_kind = 'family'
    and family_id is not null
    and (select private.is_family_member(family_id))
  )
  or (
    scope_kind = 'admin'
    and requested_by = (select auth.uid())
    and (select private.is_admin())
  )
);

create policy "Family members can read their AI job media links"
on public.ai_job_media for select to authenticated
using (
  slot = 'generated_image'
  and (select private.is_family_member(family_id))
  and exists (
    select 1
    from public.media_assets as asset
    where asset.id = ai_job_media.media_asset_id
      and asset.family_id = ai_job_media.family_id
      and asset.asset_role = 'generated_output'
      and asset.status = 'ready'
  )
);

revoke all on table
  public.ai_operations,
  public.ai_operation_versions,
  public.media_assets,
  public.ai_jobs,
  public.ai_job_media
from anon, authenticated, service_role;

grant select on table
  public.ai_operations,
  public.ai_operation_versions,
  public.media_assets,
  public.ai_jobs,
  public.ai_job_media
to authenticated;

grant select on table
  public.ai_operations,
  public.ai_operation_versions,
  public.media_assets,
  public.ai_jobs,
  public.ai_job_media
to service_role;

revoke all on table private.ai_job_attempts
  from public, anon, authenticated, service_role;
grant select on table private.ai_job_attempts to service_role;

revoke all on table private.ai_media_testers
  from public, anon, authenticated, service_role;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'ai-media-private',
  'ai-media-private',
  false,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1
    from storage.buckets as bucket
    where bucket.id = 'ai-media-private'
      and not bucket.public
      and bucket.file_size_limit = 8388608
      and bucket.allowed_mime_types =
        array['image/jpeg', 'image/png', 'image/webp']::text[]
  ) then
    raise exception 'The private AI media bucket exists with unsafe settings.'
      using errcode = '23514';
  end if;
end;
$$;

create function private.can_upload_reserved_ai_input(
  p_bucket_id text,
  p_object_name text,
  p_mime_type text,
  p_byte_size bigint
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and p_byte_size between 1 and 8388608
    and exists (
      select 1
      from public.media_assets as asset
      where asset.storage_bucket = p_bucket_id
        and asset.storage_object_path = p_object_name
        and asset.mime_type = p_mime_type
        and asset.asset_role = 'reference_input'
        and asset.status = 'pending'
        and asset.subject_kind <> 'child'
        and asset.created_by = (select auth.uid())
        and (select private.is_family_member(asset.family_id))
    );
$$;

revoke all on function private.can_upload_reserved_ai_input(
  text,
  text,
  text,
  bigint
) from public, anon, authenticated, service_role;
grant execute on function private.can_upload_reserved_ai_input(
  text,
  text,
  text,
  bigint
) to authenticated;

create policy "Family members can read ready private AI outputs"
on storage.objects for select to authenticated
using (
  bucket_id = 'ai-media-private'
  and exists (
    select 1
    from public.media_assets as asset
    where asset.storage_bucket = storage.objects.bucket_id
      and asset.storage_object_path = storage.objects.name
      and asset.asset_role = 'generated_output'
      and asset.status = 'ready'
      and (select private.is_family_member(asset.family_id))
  )
);

create policy "Requesters can upload reserved non-child AI inputs"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'ai-media-private'
  and owner_id = (select auth.uid())::text
  and (storage.objects.metadata ->> 'size') ~ '^[0-9]{1,8}$'
  and private.can_upload_reserved_ai_input(
    storage.objects.bucket_id,
    storage.objects.name,
    storage.objects.metadata ->> 'mimetype',
    (storage.objects.metadata ->> 'size')::bigint
  )
);

create function public.publish_ai_operation_version(
  p_operation_key text,
  p_prompt_template text,
  p_expected_active_version_id uuid
)
returns table (
  operation_id uuid,
  operation_version_id uuid,
  version integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  selected_operation_id uuid;
  selected_active_version_id uuid;
  selected_gateway text;
  selected_provider text;
  selected_model text;
  selected_request_options jsonb;
  selected_input_contract jsonb;
  selected_output_contract jsonb;
  selected_max_attempts smallint;
  selected_timeout_ms integer;
  selected_max_cost_microusd bigint;
  next_version integer;
  inserted_version_id uuid;
begin
  if caller_id is null or not (select private.is_admin()) then
    raise exception 'Content administrator access is required.'
      using errcode = '42501';
  end if;

  if p_prompt_template is null
    or p_prompt_template <> btrim(p_prompt_template)
    or char_length(p_prompt_template) not between 1 and 12000
    or translate(p_prompt_template, E'\n\r\t', '') ~ '[[:cntrl:]]'
  then
    raise exception 'The prompt template is invalid.'
      using errcode = '22023';
  end if;

  select
    operation.id,
    operation.active_version_id,
    active_version.gateway,
    active_version.provider,
    active_version.model,
    active_version.request_options,
    active_version.input_contract,
    active_version.output_contract,
    active_version.max_attempts,
    active_version.timeout_ms,
    active_version.max_cost_microusd
  into
    selected_operation_id,
    selected_active_version_id,
    selected_gateway,
    selected_provider,
    selected_model,
    selected_request_options,
    selected_input_contract,
    selected_output_contract,
    selected_max_attempts,
    selected_timeout_ms,
    selected_max_cost_microusd
  from public.ai_operations as operation
  join public.ai_operation_versions as active_version
    on active_version.id = operation.active_version_id
    and active_version.operation_id = operation.id
  where operation.operation_key = p_operation_key
  for update of operation;

  if selected_operation_id is null then
    raise exception 'The AI operation does not exist or has no active version.'
      using errcode = 'P0002';
  end if;

  if selected_active_version_id is distinct from p_expected_active_version_id then
    raise exception 'The active AI prompt changed before this version was published.'
      using errcode = '40001';
  end if;

  select coalesce(max(existing.version), 0) + 1
  into next_version
  from public.ai_operation_versions as existing
  where existing.operation_id = selected_operation_id;

  insert into public.ai_operation_versions (
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
    max_cost_microusd,
    created_by
  )
  values (
    selected_operation_id,
    next_version,
    p_prompt_template,
    selected_gateway,
    selected_provider,
    selected_model,
    selected_request_options,
    selected_input_contract,
    selected_output_contract,
    selected_max_attempts,
    selected_timeout_ms,
    selected_max_cost_microusd,
    caller_id
  )
  returning id into inserted_version_id;

  update public.ai_operations
  set active_version_id = inserted_version_id
  where id = selected_operation_id;

  return query
  select selected_operation_id, inserted_version_id, next_version;
end;
$$;

revoke all on function public.publish_ai_operation_version(text, text, uuid)
  from public, anon;
grant execute on function public.publish_ai_operation_version(text, text, uuid)
  to authenticated;

comment on function public.publish_ai_operation_version(text, text, uuid) is
  'Creates and atomically activates a new immutable prompt version while retaining the active provider and safety configuration.';

create function public.prepare_ai_media_job(
  p_operation_key text,
  p_family_id uuid,
  p_expected_user_id uuid,
  p_client_request_id uuid,
  p_subject_kind public.media_subject_kind,
  p_input_mime_type text,
  p_child_profile_id uuid default null
)
returns table (
  job_id uuid,
  input_asset_id uuid,
  output_asset_id uuid,
  storage_bucket text,
  input_object_path text,
  job_status public.ai_job_status,
  created boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  selected_operation_id uuid;
  selected_operation_version_id uuid;
  selected_max_attempts smallint;
  selected_max_cost_microusd bigint;
  existing_job_id uuid;
  existing_input_asset_id uuid;
  existing_output_asset_id uuid;
  existing_operation_id uuid;
  existing_family_id uuid;
  existing_subject_kind public.media_subject_kind;
  existing_child_profile_id uuid;
  existing_mime_type text;
  existing_input_path text;
  existing_status public.ai_job_status;
  inserted_job_id uuid := gen_random_uuid();
  inserted_input_asset_id uuid := gen_random_uuid();
  inserted_output_asset_id uuid := gen_random_uuid();
  input_extension text;
  inserted_input_path text;
  inserted_output_path text;
begin
  if caller_id is null then
    raise exception 'Authentication is required.'
      using errcode = '42501';
  end if;

  if caller_id is distinct from p_expected_user_id then
    raise exception 'The authenticated account changed before the AI request.'
      using errcode = '28000';
  end if;

  if p_family_id is null or not (select private.is_family_member(p_family_id)) then
    raise exception 'Family access is required.'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from private.ai_media_testers as tester
    where tester.user_id = caller_id
      and tester.expires_at > now()
  ) then
    raise exception 'AI media testing is not enabled for this account.'
      using errcode = '0A000';
  end if;

  if p_client_request_id is null
    or p_client_request_id = '00000000-0000-0000-0000-000000000000'::uuid
  then
    raise exception 'A non-zero client request id is required.'
      using errcode = '22023';
  end if;

  -- The allowlist above limits this to audited technical testers, but a caller
  -- label cannot prove who appears in an image. Child media therefore remains
  -- prohibited until a reviewed legal basis, notice, withdrawal, provider
  -- privacy mode, deletion, and retention contract exists.
  if p_subject_kind = 'child' or p_child_profile_id is not null then
    raise exception 'Child photo AI processing is not enabled.'
      using errcode = '0A000';
  end if;

  if p_subject_kind not in ('synthetic', 'adult_test') then
    raise exception 'Only synthetic or adult test media is allowed.'
      using errcode = '22023';
  end if;

  if p_input_mime_type not in ('image/jpeg', 'image/png', 'image/webp') then
    raise exception 'The input image type is not supported.'
      using errcode = '22023';
  end if;

  select operation.id
  into selected_operation_id
  from public.ai_operations as operation
  where operation.operation_key = p_operation_key
    and operation.capability = 'image_transform';

  if selected_operation_id is null then
    raise exception 'The requested AI operation is unavailable.'
      using errcode = 'P0002';
  end if;

  perform profile.id
  from public.profiles as profile
  where profile.id = caller_id
  for update;

  if not found then
    raise exception 'The authenticated profile is missing.'
      using errcode = 'P0002';
  end if;

  select
    job.id,
    input_asset.id,
    output_asset.id,
    job.operation_id,
    job.family_id,
    job.subject_kind,
    job.child_profile_id,
    input_asset.mime_type,
    input_asset.storage_object_path,
    job.status
  into
    existing_job_id,
    existing_input_asset_id,
    existing_output_asset_id,
    existing_operation_id,
    existing_family_id,
    existing_subject_kind,
    existing_child_profile_id,
    existing_mime_type,
    existing_input_path,
    existing_status
  from public.ai_jobs as job
  join public.ai_job_media as input_link
    on input_link.job_id = job.id
    and input_link.family_id = job.family_id
    and input_link.slot = 'reference_image'
    and input_link.ordinal = 0
  join public.media_assets as input_asset
    on input_asset.id = input_link.media_asset_id
    and input_asset.family_id = input_link.family_id
  join public.ai_job_media as output_link
    on output_link.job_id = job.id
    and output_link.family_id = job.family_id
    and output_link.slot = 'generated_image'
    and output_link.ordinal = 0
  join public.media_assets as output_asset
    on output_asset.id = output_link.media_asset_id
    and output_asset.family_id = output_link.family_id
  where job.requested_by = caller_id
    and job.client_request_id = p_client_request_id;

  if existing_job_id is not null then
    if existing_operation_id <> selected_operation_id
      or existing_family_id <> p_family_id
      or existing_subject_kind <> p_subject_kind
      or existing_child_profile_id is distinct from p_child_profile_id
      or existing_mime_type <> p_input_mime_type
    then
      raise exception 'A client request id cannot be reused with different input.'
        using errcode = '22023';
    end if;

    return query
    select
      existing_job_id,
      existing_input_asset_id,
      existing_output_asset_id,
      'ai-media-private'::text,
      existing_input_path,
      existing_status,
      false;
    return;
  end if;

  select
    operation.active_version_id,
    active_version.max_attempts,
    active_version.max_cost_microusd
  into
    selected_operation_version_id,
    selected_max_attempts,
    selected_max_cost_microusd
  from public.ai_operations as operation
  join public.ai_operation_versions as active_version
    on active_version.id = operation.active_version_id
    and active_version.operation_id = operation.id
  where operation.id = selected_operation_id
    and operation.is_enabled;

  if selected_operation_version_id is null then
    raise exception 'The requested AI operation is unavailable.'
      using errcode = 'P0002';
  end if;

  if (
    select count(*)
    from public.ai_jobs as recent_job
    where recent_job.requested_by = caller_id
      and recent_job.created_at >= now() - interval '24 hours'
  ) >= 10 then
    raise exception 'The daily AI media test limit has been reached.'
      using errcode = '54000';
  end if;

  -- A browser/app can disappear after reserving private paths but before it
  -- receives the job id. A genuinely new, validated request supersedes only
  -- unclaimed reservations so that such a crash cannot block the tester
  -- forever. The profile lock serializes competing prepares; the job lock
  -- serializes a racing worker claim so it either wins and remains protected
  -- as processing, or observes the committed cancellation without calling
  -- the provider.
  with superseded_jobs as (
    update public.ai_jobs as superseded_job
    set status = 'cancelled',
        public_error_code = 'request_superseded',
        completed_at = now()
    where superseded_job.requested_by = caller_id
      and superseded_job.status = 'awaiting_upload'
    returning superseded_job.id
  )
  update public.media_assets as asset
  set status = 'failed'
  where asset.status = 'pending'
    and exists (
      select 1
      from superseded_jobs
      join public.ai_job_media as link
        on link.job_id = superseded_jobs.id
      where link.media_asset_id = asset.id
        and link.family_id = asset.family_id
    );

  if exists (
    select 1
    from public.ai_jobs as active_job
    where active_job.requested_by = caller_id
      and active_job.status in ('awaiting_upload', 'processing')
  ) then
    raise exception 'Only one AI media test can be active at a time.'
      using errcode = '55000';
  end if;

  input_extension := case p_input_mime_type
    when 'image/jpeg' then 'jpg'
    when 'image/png' then 'png'
    when 'image/webp' then 'webp'
  end;
  inserted_input_path := format(
    '%s/%s/%s/input.%s',
    p_family_id,
    caller_id,
    inserted_job_id,
    input_extension
  );
  inserted_output_path := format(
    '%s/%s/%s/output.png',
    p_family_id,
    caller_id,
    inserted_job_id
  );

  insert into public.media_assets (
    id,
    family_id,
    child_profile_id,
    subject_kind,
    asset_role,
    status,
    storage_object_path,
    mime_type,
    delete_after,
    created_by
  )
  values
    (
      inserted_input_asset_id,
      p_family_id,
      null,
      p_subject_kind,
      'reference_input',
      'pending',
      inserted_input_path,
      p_input_mime_type,
      now() + interval '24 hours',
      caller_id
    ),
    (
      inserted_output_asset_id,
      p_family_id,
      null,
      p_subject_kind,
      'generated_output',
      'pending',
      inserted_output_path,
      'image/png',
      now() + interval '30 days',
      caller_id
    );

  insert into public.ai_jobs (
    id,
    family_id,
    child_profile_id,
    subject_kind,
    operation_id,
    operation_version_id,
    requested_by,
    client_request_id,
    status,
    max_attempts,
    max_cost_microusd
  )
  values (
    inserted_job_id,
    p_family_id,
    null,
    p_subject_kind,
    selected_operation_id,
    selected_operation_version_id,
    caller_id,
    p_client_request_id,
    'awaiting_upload',
    selected_max_attempts,
    selected_max_cost_microusd
  );

  insert into public.ai_job_media (
    job_id,
    media_asset_id,
    family_id,
    slot,
    ordinal
  )
  values
    (
      inserted_job_id,
      inserted_input_asset_id,
      p_family_id,
      'reference_image',
      0
    ),
    (
      inserted_job_id,
      inserted_output_asset_id,
      p_family_id,
      'generated_image',
      0
    );

  return query
  select
    inserted_job_id,
    inserted_input_asset_id,
    inserted_output_asset_id,
    'ai-media-private'::text,
    inserted_input_path,
    'awaiting_upload'::public.ai_job_status,
    true;
end;
$$;

revoke all on function public.prepare_ai_media_job(
  text,
  uuid,
  uuid,
  uuid,
  public.media_subject_kind,
  text,
  uuid
) from public, anon;
grant execute on function public.prepare_ai_media_job(
  text,
  uuid,
  uuid,
  uuid,
  public.media_subject_kind,
  text,
  uuid
) to authenticated;

comment on function public.prepare_ai_media_job(
  text,
  uuid,
  uuid,
  uuid,
  public.media_subject_kind,
  text,
  uuid
) is
  'Reserves an idempotent family-scoped AI job and private input/output paths, superseding only older unclaimed reservations. Child media is deliberately rejected until a separate approved privacy migration.';

create function public.claim_ai_media_job_for_worker(p_job_id uuid)
returns table (
  job_id uuid,
  attempt_number smallint,
  gateway text,
  provider text,
  model text,
  prompt_template text,
  request_options jsonb,
  input_contract jsonb,
  output_contract jsonb,
  timeout_ms integer,
  max_cost_microusd bigint,
  storage_bucket text,
  input_object_path text,
  input_mime_type text,
  output_asset_id uuid,
  output_object_path text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_job public.ai_jobs%rowtype;
  selected_version public.ai_operation_versions%rowtype;
  selected_input public.media_assets%rowtype;
  selected_output public.media_assets%rowtype;
  next_attempt smallint;
begin
  select job.*
  into selected_job
  from public.ai_jobs as job
  where job.id = p_job_id
  for update;

  if selected_job.id is null then
    return;
  end if;

  if selected_job.subject_kind = 'child'
    or selected_job.child_profile_id is not null
    or selected_job.status in ('succeeded', 'cancelled')
  then
    return;
  end if;

  -- Disabling an operation is a strict release kill switch. It prevents new
  -- work and closes an existing lease if this job is invoked again. The
  -- completion transition independently rechecks the same gate so an active
  -- worker cannot publish output after the switch is committed.
  if not exists (
    select 1
    from public.ai_operations as operation
    where operation.id = selected_job.operation_id
      and operation.is_enabled
  ) then
    update public.ai_jobs
    set status = 'cancelled',
        public_error_code = 'operation_disabled',
        completed_at = now()
    where id = selected_job.id
      and status not in ('succeeded', 'cancelled');

    update private.ai_job_attempts as attempt
    set status = 'failed',
        error_code = 'operation_disabled',
        completed_at = now()
    where attempt.job_id = selected_job.id
      and attempt.status = 'processing';

    update public.media_assets as asset
    set status = 'failed'
    where asset.status = 'pending'
      and asset.asset_role = 'generated_output'
      and exists (
        select 1
        from public.ai_job_media as link
        where link.job_id = selected_job.id
          and link.family_id = selected_job.family_id
          and link.media_asset_id = asset.id
          and link.slot = 'generated_image'
          and link.ordinal = 0
      );
    return;
  end if;

  if selected_job.status = 'processing'
    and selected_job.processing_started_at > now() - interval '7 minutes'
  then
    return;
  end if;

  if selected_job.status = 'processing'
    and selected_job.processing_started_at <= now() - interval '7 minutes'
    and selected_job.attempt_count >= selected_job.max_attempts
  then
    update public.ai_jobs
    set status = 'failed',
        public_error_code = 'provider_outcome_unknown',
        completed_at = now()
    where id = selected_job.id
      and status = 'processing'
      and attempt_count = selected_job.attempt_count;

    update private.ai_job_attempts as attempt
    set status = 'outcome_unknown',
        error_code = 'worker_lease_expired',
        completed_at = now()
    where attempt.job_id = selected_job.id
      and attempt.attempt_number = selected_job.attempt_count
      and attempt.status = 'processing';

    update public.media_assets as asset
    set status = 'failed'
    where asset.status = 'pending'
      and asset.asset_role = 'generated_output'
      and exists (
        select 1
        from public.ai_job_media as link
        where link.job_id = selected_job.id
          and link.family_id = selected_job.family_id
          and link.media_asset_id = asset.id
          and link.slot = 'generated_image'
          and link.ordinal = 0
      );
    return;
  end if;

  if selected_job.status = 'failed'
    and selected_job.public_error_code not in (
      'provider_rate_limited',
      'provider_unavailable',
      'worker_interrupted'
    )
  then
    return;
  end if;

  if selected_job.attempt_count >= selected_job.max_attempts then
    return;
  end if;

  select version.*
  into selected_version
  from public.ai_operation_versions as version
  where version.id = selected_job.operation_version_id
    and version.operation_id = selected_job.operation_id;

  select asset.*
  into selected_input
  from public.ai_job_media as link
  join public.media_assets as asset
    on asset.id = link.media_asset_id
    and asset.family_id = link.family_id
  join storage.objects as object
    on object.bucket_id = asset.storage_bucket
    and object.name = asset.storage_object_path
  where link.job_id = selected_job.id
    and link.family_id = selected_job.family_id
    and link.slot = 'reference_image'
    and link.ordinal = 0
    and asset.asset_role = 'reference_input'
    and asset.subject_kind <> 'child';

  select asset.*
  into selected_output
  from public.ai_job_media as link
  join public.media_assets as asset
    on asset.id = link.media_asset_id
    and asset.family_id = link.family_id
  where link.job_id = selected_job.id
    and link.family_id = selected_job.family_id
    and link.slot = 'generated_image'
    and link.ordinal = 0
    and asset.asset_role = 'generated_output'
    and asset.subject_kind <> 'child';

  if selected_version.id is null
    or selected_input.id is null
    or selected_output.id is null
  then
    return;
  end if;

  next_attempt := selected_job.attempt_count + 1;

  update public.media_assets
  set status = 'ready',
      byte_size = coalesce(
        byte_size,
        (
          select (object.metadata ->> 'size')::bigint
          from storage.objects as object
          where object.bucket_id = selected_input.storage_bucket
            and object.name = selected_input.storage_object_path
        )
      )
  where id = selected_input.id;

  update public.ai_jobs
  set status = 'processing',
      attempt_count = next_attempt,
      public_error_code = null,
      queued_at = coalesce(queued_at, now()),
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
    selected_version.gateway,
    selected_version.provider,
    selected_version.model,
    selected_version.prompt_template,
    selected_version.request_options,
    selected_version.input_contract,
    selected_version.output_contract,
    selected_version.timeout_ms,
    selected_version.max_cost_microusd,
    selected_input.storage_bucket,
    selected_input.storage_object_path,
    selected_input.mime_type,
    selected_output.id,
    selected_output.storage_object_path;
end;
$$;

revoke all on function public.claim_ai_media_job_for_worker(uuid)
  from public, anon, authenticated;
grant execute on function public.claim_ai_media_job_for_worker(uuid)
  to service_role;

create function public.complete_ai_media_job_for_worker(
  p_job_id uuid,
  p_attempt_number smallint,
  p_output_asset_id uuid,
  p_output_byte_size bigint,
  p_output_sha256_hex text,
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
  accumulated_cost_microusd bigint;
  operation_enabled boolean;
  selected_operation_id uuid;
begin
  if p_output_byte_size is null
    or p_output_byte_size not between 1 and 8388608
    or p_output_sha256_hex is null
    or p_output_sha256_hex !~ '^[0-9a-f]{64}$'
    or p_usage is null
    or jsonb_typeof(p_usage) <> 'object'
    or p_cost_microusd is null
    or p_cost_microusd < 0
  then
    raise exception 'The worker completion payload is invalid.'
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
      and job.attempt_count = p_attempt_number
  ) then
    return;
  end if;

  select job.operation_id
  into selected_operation_id
  from public.ai_jobs as job
  where job.id = p_job_id
    and job.status = 'processing'
    and job.attempt_count = p_attempt_number
  for update;

  if selected_operation_id is null then
    raise exception 'The AI job is no longer owned by this worker attempt.'
      using errcode = '40001';
  end if;

  -- Lock the operation row until this completion commits. A concurrent
  -- disable either wins first and blocks publication, or waits until this
  -- already-validated completion is atomically visible.
  select operation.is_enabled
  into operation_enabled
  from public.ai_operations as operation
  where operation.id = selected_operation_id
  for share;

  if operation_enabled is distinct from true then
    raise exception 'The AI operation was disabled before completion.'
      using errcode = '55000';
  end if;

  select coalesce(job.actual_cost_microusd, 0) + p_cost_microusd
  into accumulated_cost_microusd
  from public.ai_jobs as job
  where job.id = p_job_id
    and job.status = 'processing'
    and job.attempt_count = p_attempt_number
    and job.max_cost_microusd >=
      coalesce(job.actual_cost_microusd, 0) + p_cost_microusd;

  if accumulated_cost_microusd is null then
    raise exception 'The AI job is no longer owned by this worker attempt or exceeds its cost ceiling.'
      using errcode = '40001';
  end if;

  update public.media_assets as asset
  set status = 'ready',
      byte_size = p_output_byte_size,
      sha256_hex = p_output_sha256_hex
  where asset.id = p_output_asset_id
    and asset.asset_role = 'generated_output'
    and asset.status = 'pending'
    and asset.mime_type = 'image/png'
    and exists (
      select 1
      from public.ai_jobs as job
      join public.ai_job_media as link
        on link.job_id = job.id
        and link.family_id = job.family_id
        and link.media_asset_id = asset.id
        and link.slot = 'generated_image'
        and link.ordinal = 0
      join storage.objects as object
        on object.bucket_id = asset.storage_bucket
        and object.name = asset.storage_object_path
      where job.id = p_job_id
        and job.status = 'processing'
        and job.attempt_count = p_attempt_number
        and object.metadata ->> 'mimetype' = 'image/png'
        and object.metadata ->> 'size' ~ '^[0-9]{1,8}$'
        and (object.metadata ->> 'size')::bigint = p_output_byte_size
    );

  if not found then
    raise exception 'The exact generated output object is missing or invalid.'
      using errcode = '22023';
  end if;

  update public.ai_jobs as job
  set status = 'succeeded',
      actual_cost_microusd = accumulated_cost_microusd,
      public_error_code = null,
      completed_at = now()
  where job.id = p_job_id
    and job.status = 'processing'
    and job.attempt_count = p_attempt_number
    and exists (
      select 1
      from public.ai_job_media as link
      where link.job_id = job.id
        and link.family_id = job.family_id
        and link.media_asset_id = p_output_asset_id
        and link.slot = 'generated_image'
        and link.ordinal = 0
    );

  if not found then
    raise exception 'The AI job is no longer owned by this worker attempt.'
      using errcode = '40001';
  end if;

  update private.ai_job_attempts
  set status = 'succeeded',
      provider_request_id = left(p_provider_request_id, 200),
      usage = p_usage,
      cost_microusd = p_cost_microusd,
      completed_at = now()
  where job_id = p_job_id
    and attempt_number = p_attempt_number;
end;
$$;

revoke all on function public.complete_ai_media_job_for_worker(
  uuid,
  smallint,
  uuid,
  bigint,
  text,
  text,
  jsonb,
  bigint
) from public, anon, authenticated;
grant execute on function public.complete_ai_media_job_for_worker(
  uuid,
  smallint,
  uuid,
  bigint,
  text,
  text,
  jsonb,
  bigint
) to service_role;

create function public.fail_ai_media_job_for_worker(
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
declare
  cancelled_attempt_cost_microusd bigint;
begin
  if p_public_error_code is null
    or p_public_error_code !~ '^[a-z0-9]+([._-][a-z0-9]+)*$'
    or p_attempt_error_code is null
    or p_attempt_error_code !~ '^[a-z0-9]+([._-][a-z0-9]+)*$'
    or p_usage is null
    or jsonb_typeof(p_usage) <> 'object'
    or (p_cost_microusd is not null and p_cost_microusd < 0)
  then
    raise exception 'The worker error category is invalid.'
      using errcode = '22023';
  end if;

  -- A strict operation disable may have cancelled the public job just before
  -- an active worker reports a provider result. Preserve that late billing
  -- evidence exactly once without reopening the job or making output visible.
  select attempt.cost_microusd
  into cancelled_attempt_cost_microusd
  from public.ai_jobs as job
  join private.ai_job_attempts as attempt
    on attempt.job_id = job.id
    and attempt.attempt_number = p_attempt_number
    and attempt.status = 'failed'
    and attempt.error_code = 'operation_disabled'
  where job.id = p_job_id
    and job.status = 'cancelled'
    and job.public_error_code = 'operation_disabled'
  for update of attempt;

  if found then
    update private.ai_job_attempts as attempt
    set provider_request_id = coalesce(
          attempt.provider_request_id,
          left(p_provider_request_id, 200)
        ),
        usage = case
          when attempt.usage = '{}'::jsonb then p_usage
          else attempt.usage
        end,
        cost_microusd = coalesce(attempt.cost_microusd, p_cost_microusd)
    where attempt.job_id = p_job_id
      and attempt.attempt_number = p_attempt_number;

    if cancelled_attempt_cost_microusd is null
      and p_cost_microusd is not null
    then
      update public.ai_jobs
      set actual_cost_microusd = coalesce(actual_cost_microusd, 0)
        + p_cost_microusd
      where id = p_job_id
        and status = 'cancelled'
        and public_error_code = 'operation_disabled';
    end if;

    return;
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
    and status = 'processing'
    and attempt_count = p_attempt_number;

  if not found then
    raise exception 'The AI job is no longer owned by this worker attempt.'
      using errcode = '40001';
  end if;

  update public.media_assets as asset
  set status = 'failed'
  where asset.status = 'pending'
    and asset.asset_role = 'generated_output'
    and exists (
      select 1
      from public.ai_jobs as job
      join public.ai_job_media as link
        on link.job_id = job.id
        and link.family_id = job.family_id
        and link.media_asset_id = asset.id
        and link.slot = 'generated_image'
        and link.ordinal = 0
      where job.id = p_job_id
    );

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
    and attempt_number = p_attempt_number;
end;
$$;

revoke all on function public.fail_ai_media_job_for_worker(
  uuid,
  smallint,
  text,
  text,
  text,
  jsonb,
  bigint
) from public, anon, authenticated;
grant execute on function public.fail_ai_media_job_for_worker(
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
  description,
  is_enabled
)
values (
  'a1000000-0000-4000-8000-000000000001',
  'portrait.cartoon_3d',
  'image_transform',
  'Creates a friendly stylized 3D cartoon portrait from one reference image.',
  false
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
values (
  'a2000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  1,
  'Create a friendly stylized 3D cartoon version of this person. Preserve their recognizable face, hairstyle, skin tone and distinctive features.',
  'openrouter',
  'openai',
  'openai/gpt-image-2',
  '{
    "n": 1,
    "quality": "medium",
    "aspect_ratio": "1:1",
    "background": "opaque",
    "provider": {
      "only": ["openai"],
      "allow_fallbacks": false,
      "options": {
        "openai": { "moderation": "auto" }
      }
    }
  }'::jsonb,
  '{
    "reference_image": {
      "count": 1,
      "mime_types": ["image/jpeg", "image/png", "image/webp"],
      "max_bytes": 8388608,
      "allowed_subject_kinds": ["synthetic", "adult_test"]
    }
  }'::jsonb,
  '{
    "generated_image": {
      "count": 1,
      "mime_types": ["image/png"]
    }
  }'::jsonb,
  1,
  115000,
  250000
);

update public.ai_operations
set active_version_id = 'a2000000-0000-4000-8000-000000000001'
where id = 'a1000000-0000-4000-8000-000000000001';

-- The operation and the server-managed tester allowlist both start empty/off.
-- A client-supplied subject label cannot identify a person, so real child media
-- remains prohibited even for an allowlisted technical tester.

commit;
