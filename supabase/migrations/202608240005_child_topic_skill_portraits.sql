begin;

create type public.child_topic_portrait_render_kind as enum (
  'base',
  'wardrobe'
);

create type public.child_topic_portrait_display_kind as enum (
  'base',
  'wardrobe'
);

comment on type public.child_topic_portrait_render_kind is
  'Append-only child/topic portrait render kinds: a source-photo base or a derived wardrobe look.';
comment on type public.child_topic_portrait_display_kind is
  'The kind of ready asset currently displayed for a child/topic portrait.';

-- One durable pointer row keeps the immutable base separate from the current
-- derived look. A wardrobe render can replace only display_media_asset_id; it
-- never rewrites base_media_asset_id or uses a previous derived look as input.
create table public.child_topic_portraits (
  child_profile_id uuid not null,
  topic_id uuid not null references public.topics (id) on delete restrict,
  family_id uuid not null,
  base_source_media_asset_id uuid,
  base_job_id uuid references public.ai_jobs (id) on delete restrict,
  base_media_asset_id uuid,
  display_kind public.child_topic_portrait_display_kind,
  display_job_id uuid references public.ai_jobs (id) on delete restrict,
  display_media_asset_id uuid,
  display_equipment_fingerprint text,
  display_wardrobe_item_ids uuid[] not null default '{}'::uuid[],
  desired_render_sequence bigint not null default 0
    check (desired_render_sequence >= 0),
  pending_job_id uuid references public.ai_jobs (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (child_profile_id, topic_id),
  unique (family_id, child_profile_id, topic_id),
  constraint child_topic_portraits_child_family_fkey
    foreign key (child_profile_id, family_id)
    references public.child_profiles (id, family_id)
    on delete restrict,
  constraint child_topic_portraits_base_source_fkey
    foreign key (
      base_source_media_asset_id,
      family_id,
      child_profile_id,
      topic_id
    )
    references public.media_assets (id, family_id, child_profile_id, topic_id)
    on delete restrict,
  constraint child_topic_portraits_base_asset_fkey
    foreign key (base_media_asset_id, family_id, child_profile_id, topic_id)
    references public.media_assets (id, family_id, child_profile_id, topic_id)
    on delete restrict,
  constraint child_topic_portraits_display_asset_fkey
    foreign key (display_media_asset_id, family_id, child_profile_id, topic_id)
    references public.media_assets (id, family_id, child_profile_id, topic_id)
    on delete restrict,
  constraint child_topic_portraits_base_shape check (
    (
      base_source_media_asset_id is null
      and base_job_id is null
      and base_media_asset_id is null
    )
    or (
      base_source_media_asset_id is not null
      and base_job_id is not null
      and base_media_asset_id is not null
    )
  ),
  constraint child_topic_portraits_display_shape check (
    (
      display_kind is null
      and display_job_id is null
      and display_media_asset_id is null
      and display_equipment_fingerprint is null
      and cardinality(display_wardrobe_item_ids) = 0
    )
    or (
      display_kind = 'base'
      and display_job_id is not null
      and display_media_asset_id = base_media_asset_id
      and display_equipment_fingerprint ~ '^[0-9a-f]{64}$'
      and cardinality(display_wardrobe_item_ids) = 0
    )
    or (
      display_kind = 'wardrobe'
      and display_job_id is not null
      and display_media_asset_id is not null
      and display_equipment_fingerprint ~ '^[0-9a-f]{64}$'
      and cardinality(display_wardrobe_item_ids) between 1 and 5
    )
  )
);

create function private.uuid_array_has_unique_non_null_values(p_values uuid[])
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(
    cardinality(p_values) = (
      select count(distinct value)::integer
      from unnest(p_values) as value
      where value is not null
    )
    and array_position(p_values, null::uuid) is null,
    false
  );
$$;

revoke all on function private.uuid_array_has_unique_non_null_values(uuid[])
  from public, anon, authenticated, service_role;

alter table public.child_topic_portraits
  add constraint child_topic_portraits_display_ids_are_unique check (
    private.uuid_array_has_unique_non_null_values(display_wardrobe_item_ids)
  );

comment on table public.child_topic_portraits is
  'Current child/topic portrait pointers. The ready base is immutable input for every wardrobe render; display may advance independently.';

-- Every successful or failed provider job keeps its exact lineage. Ready
-- outputs have no retention deadline in this private play-app flow, so prior
-- bases and derived looks remain available as history instead of being
-- overwritten by a later render.
create table public.child_topic_portrait_renders (
  job_id uuid primary key references public.ai_jobs (id) on delete restrict,
  family_id uuid not null,
  child_profile_id uuid not null,
  topic_id uuid not null references public.topics (id) on delete restrict,
  render_kind public.child_topic_portrait_render_kind not null,
  render_sequence bigint not null check (render_sequence > 0),
  source_reference_media_asset_id uuid not null,
  base_media_asset_id uuid,
  output_media_asset_id uuid not null unique,
  equipment_fingerprint text not null
    check (equipment_fingerprint ~ '^[0-9a-f]{64}$'),
  wardrobe_item_ids uuid[] not null default '{}'::uuid[],
  promoted_as_current boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (family_id, child_profile_id, topic_id, render_sequence),
  constraint child_topic_portrait_renders_child_family_fkey
    foreign key (child_profile_id, family_id)
    references public.child_profiles (id, family_id)
    on delete restrict,
  constraint child_topic_portrait_renders_source_fkey
    foreign key (
      source_reference_media_asset_id,
      family_id,
      child_profile_id,
      topic_id
    )
    references public.media_assets (id, family_id, child_profile_id, topic_id)
    on delete restrict,
  constraint child_topic_portrait_renders_base_fkey
    foreign key (base_media_asset_id, family_id, child_profile_id, topic_id)
    references public.media_assets (id, family_id, child_profile_id, topic_id)
    on delete restrict,
  constraint child_topic_portrait_renders_output_fkey
    foreign key (output_media_asset_id, family_id, child_profile_id, topic_id)
    references public.media_assets (id, family_id, child_profile_id, topic_id)
    on delete restrict,
  constraint child_topic_portrait_renders_kind_shape check (
    (
      render_kind = 'base'
      and base_media_asset_id is null
      and cardinality(wardrobe_item_ids) = 0
    )
    or (
      render_kind = 'wardrobe'
      and base_media_asset_id is not null
      and cardinality(wardrobe_item_ids) between 1 and 5
    )
  ),
  constraint child_topic_portrait_renders_item_ids_are_unique check (
    private.uuid_array_has_unique_non_null_values(wardrobe_item_ids)
  )
);

comment on table public.child_topic_portrait_renders is
  'Append-only lineage for every child/topic base and wardrobe AI job, including the captured base and complete equipped-item snapshot.';

create table private.child_topic_portrait_job_items (
  job_id uuid not null
    references public.child_topic_portrait_renders (job_id) on delete cascade,
  ordinal smallint not null check (ordinal between 1 and 5),
  wardrobe_item_id uuid not null references public.wardrobe_items (id) on delete restrict,
  equip_slot public.wardrobe_equip_slot not null,
  name text not null
    check (name = btrim(name) and char_length(name) between 1 and 80),
  image_path text not null
    check (private.is_valid_wardrobe_item_image_path(image_path)),
  created_at timestamptz not null default now(),
  primary key (job_id, ordinal),
  unique (job_id, wardrobe_item_id),
  unique (job_id, equip_slot)
);

comment on table private.child_topic_portrait_job_items is
  'Worker-only immutable catalogue-image snapshot for a wardrobe render; no client supplies these trusted paths.';

create table private.child_topic_wardrobe_render_requests (
  request_id uuid primary key default gen_random_uuid(),
  requested_by uuid not null references public.profiles (id) on delete restrict,
  client_request_id uuid not null
    check (client_request_id <> '00000000-0000-0000-0000-000000000000'::uuid),
  family_id uuid not null,
  child_profile_id uuid not null,
  topic_id uuid not null references public.topics (id) on delete restrict,
  wardrobe_item_id uuid not null references public.wardrobe_items (id) on delete restrict,
  equipped boolean not null,
  equip_slot public.wardrobe_equip_slot not null,
  acquired_at timestamptz not null,
  equipped_at timestamptz,
  render_sequence bigint not null check (render_sequence > 0),
  render_mode text not null check (render_mode in ('base', 'ai_job', 'stale')),
  render_error_code text
    check (
      render_error_code is null
      or render_error_code ~ '^[a-z0-9]+([._-][a-z0-9]+)*$'
    ),
  job_id uuid unique references public.ai_jobs (id) on delete restrict,
  base_media_asset_id uuid,
  output_media_asset_id uuid,
  equipment_fingerprint text not null
    check (equipment_fingerprint ~ '^[0-9a-f]{64}$'),
  wardrobe_item_ids uuid[] not null default '{}'::uuid[],
  created_at timestamptz not null default now(),
  unique (requested_by, client_request_id),
  constraint child_topic_wardrobe_requests_child_family_fkey
    foreign key (child_profile_id, family_id)
    references public.child_profiles (id, family_id)
    on delete restrict,
  constraint child_topic_wardrobe_requests_base_asset_fkey
    foreign key (base_media_asset_id, family_id, child_profile_id, topic_id)
    references public.media_assets (id, family_id, child_profile_id, topic_id)
    on delete restrict,
  constraint child_topic_wardrobe_requests_output_asset_fkey
    foreign key (output_media_asset_id, family_id, child_profile_id, topic_id)
    references public.media_assets (id, family_id, child_profile_id, topic_id)
    on delete restrict,
  constraint child_topic_wardrobe_requests_mode_shape check (
    (
      render_mode = 'base'
      and render_error_code is null
      and job_id is null
      and base_media_asset_id is not null
      and output_media_asset_id is null
      and cardinality(wardrobe_item_ids) = 0
    )
    or (
      render_mode = 'ai_job'
      and render_error_code is null
      and job_id is not null
      and base_media_asset_id is not null
      and output_media_asset_id is not null
      and cardinality(wardrobe_item_ids) between 1 and 5
    )
    or (
      render_mode = 'stale'
      and render_error_code is not null
      and job_id is null
      and output_media_asset_id is null
      and cardinality(wardrobe_item_ids) between 0 and 5
    )
  ),
  constraint child_topic_wardrobe_requests_item_ids_are_unique check (
    private.uuid_array_has_unique_non_null_values(wardrobe_item_ids)
  )
);

comment on table private.child_topic_wardrobe_render_requests is
  'Retry-safe atomic equipment-change history, including zero-item resets that deliberately avoid a paid provider call.';

create index child_topic_portrait_renders_context_idx
  on public.child_topic_portrait_renders (
    family_id,
    child_profile_id,
    topic_id,
    created_at desc
  );
create index child_topic_portraits_pending_idx
  on public.child_topic_portraits (pending_job_id)
  where pending_job_id is not null;

create trigger child_topic_portraits_set_updated_at
before update on public.child_topic_portraits
for each row execute function private.set_updated_at();

alter table public.child_topic_portraits enable row level security;
alter table public.child_topic_portrait_renders enable row level security;
alter table private.child_topic_portrait_job_items enable row level security;
alter table private.child_topic_wardrobe_render_requests enable row level security;

create policy "Family members can read current child topic portraits"
on public.child_topic_portraits for select to authenticated
using ((select private.is_family_member(family_id)));

create policy "Family members can read child topic portrait history"
on public.child_topic_portrait_renders for select to authenticated
using ((select private.is_family_member(family_id)));

create policy "Family members can read current child topic portrait metadata"
on public.media_assets for select to authenticated
using (
  subject_kind = 'child'
  and asset_role = 'generated_output'
  and status = 'ready'
  and deleted_at is null
  and topic_id is not null
  and (select private.is_family_member(family_id))
  and exists (
    select 1
    from public.child_topic_portraits as portrait
    where portrait.family_id = media_assets.family_id
      and portrait.child_profile_id = media_assets.child_profile_id
      and portrait.topic_id = media_assets.topic_id
      and media_assets.id in (
        portrait.base_media_asset_id,
        portrait.display_media_asset_id
      )
  )
);

create policy "Family members can read current child topic portrait bytes"
on storage.objects for select to authenticated
using (
  bucket_id = 'ai-media-private'
  and exists (
    select 1
    from public.media_assets as asset
    join public.child_topic_portraits as portrait
      on portrait.family_id = asset.family_id
      and portrait.child_profile_id = asset.child_profile_id
      and portrait.topic_id = asset.topic_id
      and asset.id in (
        portrait.base_media_asset_id,
        portrait.display_media_asset_id
      )
    where asset.storage_bucket = storage.objects.bucket_id
      and asset.storage_object_path = storage.objects.name
      and asset.subject_kind = 'child'
      and asset.asset_role = 'generated_output'
      and asset.status = 'ready'
      and asset.deleted_at is null
      and (select private.is_family_member(asset.family_id))
  )
);

revoke all on table
  public.child_topic_portraits,
  public.child_topic_portrait_renders
from public, anon, authenticated, service_role;
grant select on table
  public.child_topic_portraits,
  public.child_topic_portrait_renders
to authenticated, service_role;

revoke all on table
  private.child_topic_portrait_job_items,
  private.child_topic_wardrobe_render_requests
from public, anon, authenticated, service_role;
grant select on table
  private.child_topic_portrait_job_items,
  private.child_topic_wardrobe_render_requests
to service_role;

-- Expand/contract rollout guard. If this migration reaches the database before
-- the new Edge bundle, the old worker still calls the generic claim RPC. Keep
-- its implementation available behind a private wrapper, but make the public
-- compatibility RPC refuse every portrait-lineage job. Those jobs remain
-- awaiting until the dedicated worker is deployed; legacy avatar jobs continue
-- through the unchanged implementation.
alter function public.claim_ai_media_job_for_worker(uuid)
  rename to claim_ai_media_job_for_worker_without_child_topic_portraits;
alter function public.claim_ai_media_job_for_worker_without_child_topic_portraits(uuid)
  set schema private;

revoke all on function private.claim_ai_media_job_for_worker_without_child_topic_portraits(uuid)
  from public, anon, authenticated, service_role;

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
begin
  if exists (
    select 1
    from public.child_topic_portrait_renders as render
    where render.job_id = p_job_id
  ) then
    return;
  end if;

  return query
  select claim.*
  from private.claim_ai_media_job_for_worker_without_child_topic_portraits(
    p_job_id
  ) as claim;
end;
$$;

revoke all on function public.claim_ai_media_job_for_worker(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_ai_media_job_for_worker(uuid)
  to service_role;

comment on function public.claim_ai_media_job_for_worker(uuid) is
  'Compatibility worker claim for non-child-topic jobs. Portrait lineage is reserved for the dedicated multi-reference claim so either migration/Edge deployment order is safe.';

-- These two operations are separate so their prompts and contracts can evolve
-- without an app release and without changing already-created jobs.
insert into public.ai_operations (
  id,
  operation_key,
  capability,
  description
)
values
  (
    'a1000000-0000-4000-8000-000000000009',
    'portrait.child_topic_base',
    'image_transform',
    'Creates the immutable base cartoon for one child and published training topic.'
  ),
  (
    'a1000000-0000-4000-8000-000000000010',
    'portrait.child_topic_wardrobe',
    'image_transform',
    'Applies the complete equipped wardrobe snapshot to an immutable child/topic base portrait.'
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
    'a2000000-0000-4000-8000-000000000011',
    'a1000000-0000-4000-8000-000000000009',
    1,
    'Create a friendly stylized 3D cartoon version of this person for the training subject {{topic_title}}. Subject context: {{topic_description}}. Preserve their recognizable face, hairstyle, skin tone, body proportions, clothing and distinctive features. Show the complete person from head to feet in a neutral, child-friendly standing pose so wardrobe items can be added later. Remove the original background completely. Show only the person, isolated with clean edges against a plain solid white background. Do not add scenery, props, other people, text, borders, frames, shadows or decorative elements.',
    'openrouter',
    'openai',
    'openai/gpt-image-2',
    '{
      "n": 1,
      "aspect_ratio": "1:1",
      "background": "opaque",
      "quality": "low",
      "provider": {
        "only": ["openai"],
        "allow_fallbacks": false
      }
    }'::jsonb,
    '{
      "reference_images": {
        "minimum_count": 1,
        "maximum_count": 1,
        "mime_types": ["image/jpeg", "image/png"],
        "max_bytes_each": 8388608,
        "allowed_subject_kinds": ["child"]
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
  ),
  (
    'a2000000-0000-4000-8000-000000000012',
    'a1000000-0000-4000-8000-000000000010',
    1,
    'Use reference image 1 as the immutable base person for the training subject {{topic_title}}. Keep that person''s face, identity, hairstyle, skin tone, body proportions, pose, framing and plain white background unchanged. Apply every wardrobe item shown in reference images 2 onward to that same person. The complete equipped set is {{wardrobe_items}}. Put each item in its stated body slot, preserve the item''s design and colours, and do not omit any item. Do not add unequipped clothing, props, scenery, text, logos, borders, frames, shadows or other people. Return one clean full-body 3D cartoon of the base person wearing exactly the complete equipped set.',
    'openrouter',
    'openai',
    'openai/gpt-image-2',
    '{
      "n": 1,
      "aspect_ratio": "1:1",
      "background": "opaque",
      "quality": "low",
      "provider": {
        "only": ["openai"],
        "allow_fallbacks": false
      }
    }'::jsonb,
    '{
      "reference_images": {
        "minimum_count": 2,
        "maximum_count": 6,
        "mime_types": ["image/png"],
        "max_bytes_each": 8388608,
        "allowed_subject_kinds": ["child", "synthetic_catalogue"]
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

update public.ai_operations as operation
set active_version_id = version.id
from public.ai_operation_versions as version
where version.operation_id = operation.id
  and operation.id in (
    'a1000000-0000-4000-8000-000000000009',
    'a1000000-0000-4000-8000-000000000010'
  );

create function private.empty_wardrobe_fingerprint()
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select encode(extensions.digest(''::text, 'sha256'), 'hex');
$$;

create function private.child_equipped_wardrobe_fingerprint(
  p_child_profile_id uuid
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select encode(
    extensions.digest(
      coalesce(
        string_agg(
          concat_ws(
            ':',
            inventory.wardrobe_item_id::text,
            inventory.equip_slot::text,
            item.content_version::text,
            coalesce(item.image_path, '')
          ),
          ','
          order by inventory.equip_slot, inventory.wardrobe_item_id
        ),
        ''
      ),
      'sha256'
    ),
    'hex'
  )
  from public.child_wardrobe_items as inventory
  join public.wardrobe_items as item on item.id = inventory.wardrobe_item_id
  where inventory.child_profile_id = p_child_profile_id
    and inventory.is_equipped;
$$;

revoke all on function private.empty_wardrobe_fingerprint()
  from public, anon, authenticated, service_role;
revoke all on function private.child_equipped_wardrobe_fingerprint(uuid)
  from public, anon, authenticated, service_role;

-- Reserve a base portrait from the current private child/topic reference. The
-- client supplies identities only; the source object and operation version are
-- selected and pinned by trusted SQL.
create function public.prepare_child_topic_base_portrait(
  p_family_id uuid,
  p_child_profile_id uuid,
  p_topic_id uuid,
  p_expected_user_id uuid,
  p_client_request_id uuid
)
returns table (
  job_id uuid,
  source_reference_media_asset_id uuid,
  output_media_asset_id uuid,
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
  selected_version_id uuid;
  selected_max_attempts smallint;
  selected_max_cost bigint;
  selected_reference public.media_assets%rowtype;
  existing_job public.ai_jobs%rowtype;
  existing_render public.child_topic_portrait_renders%rowtype;
  selected_sequence bigint;
  inserted_job_id uuid := gen_random_uuid();
  inserted_output_id uuid := gen_random_uuid();
  inserted_output_path text;
begin
  if caller_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if caller_id is distinct from p_expected_user_id then
    raise exception 'The authenticated account changed before the skill portrait request.'
      using errcode = '28000';
  end if;
  if p_family_id is null or p_child_profile_id is null or p_topic_id is null then
    raise exception 'Family, child, and topic identifiers are required.'
      using errcode = '22023';
  end if;
  if p_client_request_id is null
    or p_client_request_id = '00000000-0000-0000-0000-000000000000'::uuid
  then
    raise exception 'A non-zero client request id is required.'
      using errcode = '22023';
  end if;

  perform child.id
  from public.child_profiles as child
  where child.id = p_child_profile_id
    and child.family_id = p_family_id
    and child.is_active
    and (select private.is_family_member(child.family_id))
  for update;
  if not found then
    raise exception 'The active child is unavailable to this family.'
      using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.topics as topic
    where topic.id = p_topic_id and topic.is_published
  ) then
    raise exception 'The published topic is unavailable.' using errcode = 'P0002';
  end if;

  select asset.*
  into selected_reference
  from public.child_topic_reference_photos as reference
  join public.media_assets as asset
    on asset.id = reference.media_asset_id
    and asset.family_id = reference.family_id
    and asset.child_profile_id = reference.child_profile_id
    and asset.topic_id = reference.topic_id
  join storage.objects as object
    on object.bucket_id = asset.storage_bucket
    and object.name = asset.storage_object_path
  where reference.family_id = p_family_id
    and reference.child_profile_id = p_child_profile_id
    and reference.topic_id = p_topic_id
    and asset.subject_kind = 'child'
    and asset.asset_role = 'reference_input'
    and asset.status = 'ready'
    and asset.mime_type in ('image/jpeg', 'image/png')
    and asset.storage_bucket = 'ai-media-private'
    and asset.deleted_at is null;

  if selected_reference.id is null then
    raise exception 'A ready topic photo is required before creating the skill portrait.'
      using errcode = 'P0002';
  end if;

  select job.* into existing_job
  from public.ai_jobs as job
  where job.requested_by = caller_id
    and job.client_request_id = p_client_request_id;

  if existing_job.id is not null then
    select render.* into existing_render
    from public.child_topic_portrait_renders as render
    where render.job_id = existing_job.id;

    if existing_render.job_id is null
      or existing_render.render_kind <> 'base'
      or existing_render.family_id <> p_family_id
      or existing_render.child_profile_id <> p_child_profile_id
      or existing_render.topic_id <> p_topic_id
    then
      raise exception 'A client request id cannot be reused with different input.'
        using errcode = '22023';
    end if;

    return query select
      existing_job.id,
      existing_render.source_reference_media_asset_id,
      existing_render.output_media_asset_id,
      existing_job.status,
      false;
    return;
  end if;

  select operation.id, operation.active_version_id,
         version.max_attempts, version.max_cost_microusd
  into selected_operation_id, selected_version_id,
       selected_max_attempts, selected_max_cost
  from public.ai_operations as operation
  join public.ai_operation_versions as version
    on version.id = operation.active_version_id
    and version.operation_id = operation.id
  where operation.operation_key = 'portrait.child_topic_base'
    and operation.capability = 'image_transform';

  if selected_version_id is null then
    raise exception 'The base portrait operation is unavailable.' using errcode = 'P0002';
  end if;

  if (
    select count(*) from public.ai_jobs as recent
    where recent.requested_by = caller_id
      and recent.created_at >= now() - interval '24 hours'
  ) >= 20 then
    raise exception 'The daily AI media limit has been reached.' using errcode = '54000';
  end if;

  insert into public.child_topic_portraits (
    child_profile_id, topic_id, family_id
  ) values (p_child_profile_id, p_topic_id, p_family_id)
  on conflict on constraint child_topic_portraits_pkey do nothing;

  select portrait.desired_render_sequence + 1
  into selected_sequence
  from public.child_topic_portraits as portrait
  where portrait.child_profile_id = p_child_profile_id
    and portrait.topic_id = p_topic_id
  for update;

  -- Cancel only work that has not reached a provider. A processing output may
  -- still finish as history, but sequence checks prevent it becoming current.
  update public.ai_jobs as job
  set status = 'cancelled',
      public_error_code = 'request_superseded',
      completed_at = now()
  where job.id in (
    select render.job_id
    from public.child_topic_portrait_renders as render
    where render.family_id = p_family_id
      and render.child_profile_id = p_child_profile_id
      and render.topic_id = p_topic_id
      and render.render_kind = 'base'
  )
    and job.status = 'awaiting_upload';

  update public.media_assets as asset
  set status = 'failed'
  where asset.status = 'pending'
    and exists (
      select 1
      from public.child_topic_portrait_renders as render
      join public.ai_jobs as job on job.id = render.job_id
      where render.family_id = p_family_id
        and render.child_profile_id = p_child_profile_id
        and render.topic_id = p_topic_id
        and render.render_kind = 'base'
        and render.output_media_asset_id = asset.id
        and job.status = 'cancelled'
        and job.public_error_code = 'request_superseded'
    );

  inserted_output_path := format(
    '%s/children/%s/topics/%s/portraits/%s/output.png',
    p_family_id,
    p_child_profile_id,
    p_topic_id,
    inserted_job_id
  );

  insert into public.media_assets (
    id, family_id, child_profile_id, topic_id, subject_kind, asset_role,
    status, storage_object_path, mime_type, delete_after, created_by
  ) values (
    inserted_output_id, p_family_id, p_child_profile_id, p_topic_id,
    'child', 'generated_output', 'pending', inserted_output_path,
    'image/png', null, caller_id
  );

  insert into public.ai_jobs (
    id, family_id, child_profile_id, subject_kind, operation_id,
    operation_version_id, requested_by, client_request_id, status,
    max_attempts, max_cost_microusd, input_data
  ) values (
    inserted_job_id, p_family_id, p_child_profile_id, 'child',
    selected_operation_id, selected_version_id, caller_id,
    p_client_request_id, 'awaiting_upload', selected_max_attempts,
    selected_max_cost,
    jsonb_build_object(
      'topic_id', p_topic_id,
      'render_kind', 'base',
      'source_reference_media_asset_id', selected_reference.id
    )
  );

  insert into public.ai_job_media (
    job_id, media_asset_id, family_id, slot, ordinal
  ) values
    (inserted_job_id, selected_reference.id, p_family_id, 'reference_image', 0),
    (inserted_job_id, inserted_output_id, p_family_id, 'generated_image', 0);

  insert into public.child_topic_portrait_renders (
    job_id, family_id, child_profile_id, topic_id, render_kind,
    render_sequence, source_reference_media_asset_id, base_media_asset_id,
    output_media_asset_id, equipment_fingerprint, wardrobe_item_ids
  ) values (
    inserted_job_id, p_family_id, p_child_profile_id, p_topic_id, 'base',
    selected_sequence, selected_reference.id, null, inserted_output_id,
    private.empty_wardrobe_fingerprint(), '{}'::uuid[]
  );

  update public.child_topic_portraits as portrait
  set desired_render_sequence = selected_sequence,
      pending_job_id = inserted_job_id
  where portrait.child_profile_id = p_child_profile_id
    and portrait.topic_id = p_topic_id;

  return query select
    inserted_job_id,
    selected_reference.id,
    inserted_output_id,
    'awaiting_upload'::public.ai_job_status,
    true;
end;
$$;

revoke all on function public.prepare_child_topic_base_portrait(
  uuid, uuid, uuid, uuid, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.prepare_child_topic_base_portrait(
  uuid, uuid, uuid, uuid, uuid
) to authenticated;

comment on function public.prepare_child_topic_base_portrait(
  uuid, uuid, uuid, uuid, uuid
) is
  'Idempotently reserves an immutable child/topic base portrait from the current private topic reference without accepting a path, prompt, provider, or model.';

-- Equipment selection and render reservation are one transaction. This makes
-- the database equipment state authoritative and guarantees that the job
-- captures all currently equipped owned items, not just the item tapped by the
-- child. With zero items the base becomes current immediately and no provider
-- request is created.
create function public.set_child_topic_wardrobe_item_equipped_and_prepare_render(
  p_family_id uuid,
  p_child_profile_id uuid,
  p_topic_id uuid,
  p_wardrobe_item_id uuid,
  p_equipped boolean,
  p_expected_user_id uuid,
  p_client_request_id uuid
)
returns table (
  child_profile_id uuid,
  wardrobe_item_id uuid,
  equip_slot public.wardrobe_equip_slot,
  is_equipped boolean,
  acquired_at timestamptz,
  equipped_at timestamptz,
  render_mode text,
  render_error_code text,
  job_id uuid,
  job_status public.ai_job_status,
  created boolean,
  base_media_asset_id uuid,
  output_media_asset_id uuid,
  equipment_fingerprint text,
  equipped_wardrobe_item_ids uuid[]
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  selected_portrait public.child_topic_portraits%rowtype;
  selected_reference_id uuid;
  selected_target public.child_wardrobe_items%rowtype;
  existing_request private.child_topic_wardrobe_render_requests%rowtype;
  existing_job_status public.ai_job_status;
  selected_operation_id uuid;
  selected_version_id uuid;
  selected_max_attempts smallint;
  selected_max_cost bigint;
  selected_sequence bigint;
  selected_fingerprint text;
  selected_item_ids uuid[];
  selected_item_count integer;
  selected_missing_image_count integer;
  selected_equipped_at timestamptz;
  selected_render_error_code text;
  selected_base_is_ready boolean := false;
  inserted_job_id uuid := gen_random_uuid();
  inserted_output_id uuid := gen_random_uuid();
  inserted_output_path text;
begin
  if caller_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if caller_id is distinct from p_expected_user_id then
    raise exception 'The authenticated account changed before the wardrobe request.'
      using errcode = '28000';
  end if;
  if p_family_id is null or p_child_profile_id is null or p_topic_id is null
    or p_wardrobe_item_id is null or p_equipped is null
  then
    raise exception 'Family, child, topic, wardrobe item, and equipment state are required.'
      using errcode = '22023';
  end if;
  if p_client_request_id is null
    or p_client_request_id = '00000000-0000-0000-0000-000000000000'::uuid
  then
    raise exception 'A non-zero client request id is required.'
      using errcode = '22023';
  end if;

  perform child.id
  from public.child_profiles as child
  where child.id = p_child_profile_id
    and child.family_id = p_family_id
    and child.is_active
    and (select private.is_family_member(child.family_id))
  for update;
  if not found then
    raise exception 'The active child is unavailable to this family.'
      using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.topics as topic
    where topic.id = p_topic_id and topic.is_published
  ) then
    raise exception 'The published topic is unavailable.' using errcode = 'P0002';
  end if;

  select request.* into existing_request
  from private.child_topic_wardrobe_render_requests as request
  where request.requested_by = caller_id
    and request.client_request_id = p_client_request_id;

  if existing_request.request_id is not null then
    if existing_request.family_id <> p_family_id
      or existing_request.child_profile_id <> p_child_profile_id
      or existing_request.topic_id <> p_topic_id
      or existing_request.wardrobe_item_id <> p_wardrobe_item_id
      or existing_request.equipped <> p_equipped
    then
      raise exception 'A client request id cannot be reused with different wardrobe input.'
        using errcode = '22023';
    end if;

    if existing_request.job_id is not null then
      select job.status into existing_job_status
      from public.ai_jobs as job where job.id = existing_request.job_id;
    end if;

    return query select
      existing_request.child_profile_id,
      existing_request.wardrobe_item_id,
      existing_request.equip_slot,
      existing_request.equipped,
      existing_request.acquired_at,
      existing_request.equipped_at,
      existing_request.render_mode,
      existing_request.render_error_code,
      existing_request.job_id,
      existing_job_status,
      false,
      existing_request.base_media_asset_id,
      existing_request.output_media_asset_id,
      existing_request.equipment_fingerprint,
      existing_request.wardrobe_item_ids;
    return;
  end if;

  if exists (
    select 1 from public.ai_jobs as job
    where job.requested_by = caller_id
      and job.client_request_id = p_client_request_id
  ) then
    raise exception 'A client request id cannot be reused with different input.'
      using errcode = '22023';
  end if;

  insert into public.child_topic_portraits (
    child_profile_id, topic_id, family_id
  ) values (p_child_profile_id, p_topic_id, p_family_id)
  on conflict on constraint child_topic_portraits_pkey do nothing;

  select portrait.* into selected_portrait
  from public.child_topic_portraits as portrait
  where portrait.family_id = p_family_id
    and portrait.child_profile_id = p_child_profile_id
    and portrait.topic_id = p_topic_id
  for update;

  select reference.media_asset_id into selected_reference_id
  from public.child_topic_reference_photos as reference
  join public.media_assets as source_asset
    on source_asset.id = reference.media_asset_id
    and source_asset.family_id = reference.family_id
    and source_asset.child_profile_id = reference.child_profile_id
    and source_asset.topic_id = reference.topic_id
  where reference.family_id = p_family_id
    and reference.child_profile_id = p_child_profile_id
    and reference.topic_id = p_topic_id
    and source_asset.status = 'ready'
    and source_asset.deleted_at is null;

  selected_base_is_ready := selected_portrait.base_media_asset_id is not null
    and exists (
      select 1
      from public.media_assets as base_asset
      join storage.objects as object
        on object.bucket_id = base_asset.storage_bucket
        and object.name = base_asset.storage_object_path
      where base_asset.id = selected_portrait.base_media_asset_id
        and base_asset.family_id = p_family_id
        and base_asset.child_profile_id = p_child_profile_id
        and base_asset.topic_id = p_topic_id
        and base_asset.subject_kind = 'child'
        and base_asset.asset_role = 'generated_output'
        and base_asset.status = 'ready'
        and base_asset.mime_type = 'image/png'
        and base_asset.storage_bucket = 'ai-media-private'
        and base_asset.deleted_at is null
    );

  select inventory.* into selected_target
  from public.child_wardrobe_items as inventory
  where inventory.child_profile_id = p_child_profile_id
    and inventory.wardrobe_item_id = p_wardrobe_item_id
  for update;

  if selected_target.child_profile_id is null then
    raise exception 'The wardrobe item is not in this child''s wardrobe.'
      using errcode = '22023';
  end if;

  if selected_target.is_equipped is distinct from p_equipped then
    if p_equipped then
      update public.child_wardrobe_items as inventory
      set is_equipped = false,
          equipped_at = null
      where inventory.child_profile_id = p_child_profile_id
        and inventory.equip_slot = selected_target.equip_slot
        and inventory.wardrobe_item_id <> p_wardrobe_item_id
        and inventory.is_equipped;
    end if;

    update public.child_wardrobe_items as inventory
    set is_equipped = p_equipped,
        equipped_at = case when p_equipped then now() else null end
    where inventory.child_profile_id = p_child_profile_id
      and inventory.wardrobe_item_id = p_wardrobe_item_id
    returning inventory.equipped_at into selected_equipped_at;
  else
    selected_equipped_at := selected_target.equipped_at;
  end if;

  select
    count(*)::integer,
    count(*) filter (
      where item.image_path is null or catalogue_object.name is null
    )::integer,
    coalesce(
      array_agg(inventory.wardrobe_item_id order by inventory.equip_slot, inventory.wardrobe_item_id),
      '{}'::uuid[]
    )
  into selected_item_count, selected_missing_image_count, selected_item_ids
  from public.child_wardrobe_items as inventory
  join public.wardrobe_items as item on item.id = inventory.wardrobe_item_id
  left join storage.objects as catalogue_object
    on catalogue_object.bucket_id = 'wardrobe-images'
    and catalogue_object.name = item.image_path
  where inventory.child_profile_id = p_child_profile_id
    and inventory.is_equipped;

  if selected_item_count > 5 then
    raise exception 'The equipped wardrobe exceeds the five supported body slots.'
      using errcode = '23514';
  end if;
  selected_fingerprint := private.child_equipped_wardrobe_fingerprint(
    p_child_profile_id
  );
  selected_sequence := selected_portrait.desired_render_sequence + 1;

  if not selected_base_is_ready then
    selected_render_error_code := 'base_required';
  elsif selected_reference_id is not null
    and selected_portrait.base_source_media_asset_id is distinct from selected_reference_id
  then
    selected_render_error_code := 'base_stale';
  elsif selected_missing_image_count > 0 then
    selected_render_error_code := 'catalogue_image_missing';
  end if;

  -- An older unclaimed wardrobe render is free to cancel. A processing render
  -- remains history, and its sequence/hash can no longer promote it.
  update public.ai_jobs as job
  set status = 'cancelled',
      public_error_code = 'request_superseded',
      completed_at = now()
  where job.id in (
    select render.job_id
    from public.child_topic_portrait_renders as render
    where render.family_id = p_family_id
      and render.child_profile_id = p_child_profile_id
      and render.topic_id = p_topic_id
      and render.render_kind = 'wardrobe'
  )
    and job.status = 'awaiting_upload';

  update public.media_assets as asset
  set status = 'failed'
  where asset.status = 'pending'
    and exists (
      select 1
      from public.child_topic_portrait_renders as render
      join public.ai_jobs as job on job.id = render.job_id
      where render.family_id = p_family_id
        and render.child_profile_id = p_child_profile_id
        and render.topic_id = p_topic_id
        and render.render_kind = 'wardrobe'
        and render.output_media_asset_id = asset.id
        and job.status = 'cancelled'
        and job.public_error_code = 'request_superseded'
    );

  if selected_render_error_code is null and selected_item_count = 0 then
    update public.child_topic_portraits as portrait
    set display_kind = 'base',
        display_job_id = portrait.base_job_id,
        display_media_asset_id = portrait.base_media_asset_id,
        display_equipment_fingerprint = selected_fingerprint,
        display_wardrobe_item_ids = '{}'::uuid[],
        desired_render_sequence = selected_sequence,
        pending_job_id = null
    where portrait.child_profile_id = p_child_profile_id
      and portrait.topic_id = p_topic_id;

    insert into private.child_topic_wardrobe_render_requests (
      requested_by, client_request_id, family_id, child_profile_id, topic_id,
      wardrobe_item_id, equipped, equip_slot, acquired_at, equipped_at,
      render_sequence, render_mode, render_error_code, job_id, base_media_asset_id,
      output_media_asset_id, equipment_fingerprint, wardrobe_item_ids
    ) values (
      caller_id, p_client_request_id, p_family_id, p_child_profile_id, p_topic_id,
      p_wardrobe_item_id, p_equipped, selected_target.equip_slot,
      selected_target.acquired_at, selected_equipped_at, selected_sequence,
      'base', null, null, selected_portrait.base_media_asset_id, null,
      selected_fingerprint, '{}'::uuid[]
    );

    return query select
      p_child_profile_id,
      p_wardrobe_item_id,
      selected_target.equip_slot,
      p_equipped,
      selected_target.acquired_at,
      selected_equipped_at,
      'base'::text,
      null::text,
      null::uuid,
      null::public.ai_job_status,
      true,
      selected_portrait.base_media_asset_id,
      null::uuid,
      selected_fingerprint,
      '{}'::uuid[];
    return;
  end if;

  if selected_render_error_code is null then
    select operation.id, operation.active_version_id,
         version.max_attempts, version.max_cost_microusd
    into selected_operation_id, selected_version_id,
       selected_max_attempts, selected_max_cost
    from public.ai_operations as operation
    join public.ai_operation_versions as version
      on version.id = operation.active_version_id
      and version.operation_id = operation.id
    where operation.operation_key = 'portrait.child_topic_wardrobe'
      and operation.capability = 'image_transform';

    if selected_version_id is null then
      selected_render_error_code := 'operation_unavailable';
    elsif (
      select count(*) from public.ai_jobs as recent
      where recent.requested_by = caller_id
        and recent.created_at >= now() - interval '24 hours'
    ) >= 20 then
      selected_render_error_code := 'daily_limit_reached';
    end if;
  end if;

  if selected_render_error_code is not null then
    update public.child_topic_portraits as portrait
    set desired_render_sequence = selected_sequence,
        pending_job_id = null
    where portrait.child_profile_id = p_child_profile_id
      and portrait.topic_id = p_topic_id;

    insert into private.child_topic_wardrobe_render_requests (
      requested_by, client_request_id, family_id, child_profile_id, topic_id,
      wardrobe_item_id, equipped, equip_slot, acquired_at, equipped_at,
      render_sequence, render_mode, render_error_code, job_id,
      base_media_asset_id, output_media_asset_id, equipment_fingerprint,
      wardrobe_item_ids
    ) values (
      caller_id, p_client_request_id, p_family_id, p_child_profile_id, p_topic_id,
      p_wardrobe_item_id, p_equipped, selected_target.equip_slot,
      selected_target.acquired_at, selected_equipped_at, selected_sequence,
      'stale', selected_render_error_code, null,
      selected_portrait.base_media_asset_id, null, selected_fingerprint,
      selected_item_ids
    );

    return query select
      p_child_profile_id,
      p_wardrobe_item_id,
      selected_target.equip_slot,
      p_equipped,
      selected_target.acquired_at,
      selected_equipped_at,
      'stale'::text,
      selected_render_error_code,
      null::uuid,
      null::public.ai_job_status,
      true,
      selected_portrait.base_media_asset_id,
      null::uuid,
      selected_fingerprint,
      selected_item_ids;
    return;
  end if;

  inserted_output_path := format(
    '%s/children/%s/topics/%s/portraits/%s/output.png',
    p_family_id,
    p_child_profile_id,
    p_topic_id,
    inserted_job_id
  );

  insert into public.media_assets (
    id, family_id, child_profile_id, topic_id, subject_kind, asset_role,
    status, storage_object_path, mime_type, delete_after, created_by
  ) values (
    inserted_output_id, p_family_id, p_child_profile_id, p_topic_id,
    'child', 'generated_output', 'pending', inserted_output_path,
    'image/png', null, caller_id
  );

  insert into public.ai_jobs (
    id, family_id, child_profile_id, subject_kind, operation_id,
    operation_version_id, requested_by, client_request_id, status,
    max_attempts, max_cost_microusd, input_data
  ) values (
    inserted_job_id, p_family_id, p_child_profile_id, 'child',
    selected_operation_id, selected_version_id, caller_id,
    p_client_request_id, 'awaiting_upload', selected_max_attempts,
    selected_max_cost,
    jsonb_build_object(
      'topic_id', p_topic_id,
      'render_kind', 'wardrobe',
      'base_media_asset_id', selected_portrait.base_media_asset_id,
      'equipment_fingerprint', selected_fingerprint,
      'wardrobe_item_ids', to_jsonb(selected_item_ids)
    )
  );

  insert into public.ai_job_media (
    job_id, media_asset_id, family_id, slot, ordinal
  ) values
    (inserted_job_id, selected_portrait.base_media_asset_id, p_family_id, 'reference_image', 0),
    (inserted_job_id, inserted_output_id, p_family_id, 'generated_image', 0);

  insert into public.child_topic_portrait_renders (
    job_id, family_id, child_profile_id, topic_id, render_kind,
    render_sequence, source_reference_media_asset_id, base_media_asset_id,
    output_media_asset_id, equipment_fingerprint, wardrobe_item_ids
  ) values (
    inserted_job_id, p_family_id, p_child_profile_id, p_topic_id, 'wardrobe',
    selected_sequence, selected_portrait.base_source_media_asset_id,
    selected_portrait.base_media_asset_id, inserted_output_id,
    selected_fingerprint, selected_item_ids
  );

  insert into private.child_topic_portrait_job_items (
    job_id, ordinal, wardrobe_item_id, equip_slot, name, image_path
  )
  select
    inserted_job_id,
    row_number() over (order by inventory.equip_slot, inventory.wardrobe_item_id)::smallint,
    inventory.wardrobe_item_id,
    inventory.equip_slot,
    item.name,
    item.image_path
  from public.child_wardrobe_items as inventory
  join public.wardrobe_items as item on item.id = inventory.wardrobe_item_id
  where inventory.child_profile_id = p_child_profile_id
    and inventory.is_equipped
  order by inventory.equip_slot, inventory.wardrobe_item_id;

  insert into private.child_topic_wardrobe_render_requests (
    requested_by, client_request_id, family_id, child_profile_id, topic_id,
    wardrobe_item_id, equipped, equip_slot, acquired_at, equipped_at,
    render_sequence, render_mode, render_error_code, job_id, base_media_asset_id,
    output_media_asset_id, equipment_fingerprint, wardrobe_item_ids
  ) values (
    caller_id, p_client_request_id, p_family_id, p_child_profile_id, p_topic_id,
    p_wardrobe_item_id, p_equipped, selected_target.equip_slot,
    selected_target.acquired_at, selected_equipped_at, selected_sequence,
    'ai_job', null, inserted_job_id, selected_portrait.base_media_asset_id,
    inserted_output_id, selected_fingerprint, selected_item_ids
  );

  update public.child_topic_portraits as portrait
  set desired_render_sequence = selected_sequence,
      pending_job_id = inserted_job_id
  where portrait.child_profile_id = p_child_profile_id
    and portrait.topic_id = p_topic_id;

  return query select
    p_child_profile_id,
    p_wardrobe_item_id,
    selected_target.equip_slot,
    p_equipped,
    selected_target.acquired_at,
    selected_equipped_at,
    'ai_job'::text,
    null::text,
    inserted_job_id,
    'awaiting_upload'::public.ai_job_status,
    true,
    selected_portrait.base_media_asset_id,
    inserted_output_id,
    selected_fingerprint,
    selected_item_ids;
end;
$$;

revoke all on function public.set_child_topic_wardrobe_item_equipped_and_prepare_render(
  uuid, uuid, uuid, uuid, boolean, uuid, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.set_child_topic_wardrobe_item_equipped_and_prepare_render(
  uuid, uuid, uuid, uuid, boolean, uuid, uuid
) to authenticated;

comment on function public.set_child_topic_wardrobe_item_equipped_and_prepare_render(
  uuid, uuid, uuid, uuid, boolean, uuid, uuid
) is
  'Atomically changes one exclusive equipment slot and snapshots all equipped owned catalogue items for an idempotent base-derived wardrobe render; zero items select the base without a paid call.';

-- A new base may finish while wardrobe choices already exist, and a failed
-- provider request may need an explicit retry. Reusing the combined operation
-- with an unchanged owned item is side-effect free: the equipment timestamp is
-- preserved, while the complete live set is captured under the new request id.
create function public.prepare_child_topic_wardrobe_render(
  p_family_id uuid,
  p_child_profile_id uuid,
  p_topic_id uuid,
  p_expected_user_id uuid,
  p_client_request_id uuid
)
returns table (
  render_mode text,
  render_error_code text,
  job_id uuid,
  job_status public.ai_job_status,
  created boolean,
  base_media_asset_id uuid,
  output_media_asset_id uuid,
  equipment_fingerprint text,
  equipped_wardrobe_item_ids uuid[]
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  selected_item public.child_wardrobe_items%rowtype;
  selected_portrait public.child_topic_portraits%rowtype;
  selected_reference_id uuid;
  selected_base_ready boolean := false;
  selected_pending_is_wardrobe boolean := false;
  existing_request private.child_topic_wardrobe_render_requests%rowtype;
  existing_job_status public.ai_job_status;
begin
  if caller_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if caller_id is distinct from p_expected_user_id then
    raise exception 'The authenticated account changed before the wardrobe render request.'
      using errcode = '28000';
  end if;
  if p_family_id is null or p_child_profile_id is null or p_topic_id is null then
    raise exception 'Family, child, and topic identifiers are required.'
      using errcode = '22023';
  end if;
  if p_client_request_id is null
    or p_client_request_id = '00000000-0000-0000-0000-000000000000'::uuid
  then
    raise exception 'A non-zero client request id is required.'
      using errcode = '22023';
  end if;

  perform child.id
  from public.child_profiles as child
  where child.id = p_child_profile_id
    and child.family_id = p_family_id
    and child.is_active
    and (select private.is_family_member(child.family_id))
  for update;
  if not found then
    raise exception 'The active child is unavailable to this family.'
      using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.topics as topic
    where topic.id = p_topic_id and topic.is_published
  ) then
    raise exception 'The published topic is unavailable.' using errcode = 'P0002';
  end if;

  select request.* into existing_request
  from private.child_topic_wardrobe_render_requests as request
  where request.requested_by = caller_id
    and request.client_request_id = p_client_request_id;

  if existing_request.request_id is not null then
    if existing_request.family_id <> p_family_id
      or existing_request.child_profile_id <> p_child_profile_id
      or existing_request.topic_id <> p_topic_id
    then
      raise exception 'A client request id cannot be reused with different wardrobe input.'
        using errcode = '22023';
    end if;

    if existing_request.job_id is not null then
      select job.status into existing_job_status
      from public.ai_jobs as job where job.id = existing_request.job_id;
    end if;

    return query select
      existing_request.render_mode,
      existing_request.render_error_code,
      existing_request.job_id,
      existing_job_status,
      false,
      existing_request.base_media_asset_id,
      existing_request.output_media_asset_id,
      existing_request.equipment_fingerprint,
      existing_request.wardrobe_item_ids;
    return;
  end if;

  select inventory.* into selected_item
  from public.child_wardrobe_items as inventory
  where inventory.child_profile_id = p_child_profile_id
  order by inventory.is_equipped desc, inventory.equip_slot, inventory.wardrobe_item_id
  limit 1;

  if selected_item.child_profile_id is not null then
    return query
    select
      result.render_mode,
      result.render_error_code,
      result.job_id,
      result.job_status,
      result.created,
      result.base_media_asset_id,
      result.output_media_asset_id,
      result.equipment_fingerprint,
      result.equipped_wardrobe_item_ids
    from public.set_child_topic_wardrobe_item_equipped_and_prepare_render(
      p_family_id,
      p_child_profile_id,
      p_topic_id,
      selected_item.wardrobe_item_id,
      selected_item.is_equipped,
      p_expected_user_id,
      p_client_request_id
    ) as result;
    return;
  end if;

  -- No inventory means no equipped item and therefore no paid render. Return
  -- the already-current base when it is safe; there is no mutation to retry.
  select portrait.* into selected_portrait
  from public.child_topic_portraits as portrait
  where portrait.family_id = p_family_id
    and portrait.child_profile_id = p_child_profile_id
    and portrait.topic_id = p_topic_id
  for update;

  select reference.media_asset_id into selected_reference_id
  from public.child_topic_reference_photos as reference
  join public.media_assets as asset
    on asset.id = reference.media_asset_id
    and asset.family_id = reference.family_id
    and asset.child_profile_id = reference.child_profile_id
    and asset.topic_id = reference.topic_id
  where reference.family_id = p_family_id
    and reference.child_profile_id = p_child_profile_id
    and reference.topic_id = p_topic_id
    and asset.status = 'ready'
    and asset.deleted_at is null;

  selected_base_ready := selected_portrait.base_media_asset_id is not null
    and exists (
      select 1
      from public.media_assets as asset
      join storage.objects as object
        on object.bucket_id = asset.storage_bucket
        and object.name = asset.storage_object_path
      where asset.id = selected_portrait.base_media_asset_id
        and asset.status = 'ready'
        and asset.deleted_at is null
    );

  select exists (
    select 1
    from public.child_topic_portrait_renders as render
    where render.job_id = selected_portrait.pending_job_id
      and render.render_kind = 'wardrobe'
  ) into selected_pending_is_wardrobe;

  if selected_base_ready
    and (
      selected_reference_id is null
      or selected_reference_id = selected_portrait.base_source_media_asset_id
    )
  then
    update public.ai_jobs as job
    set status = 'cancelled',
        public_error_code = 'request_superseded',
        completed_at = now()
    where job.id in (
      select render.job_id
      from public.child_topic_portrait_renders as render
      where render.family_id = p_family_id
        and render.child_profile_id = p_child_profile_id
        and render.topic_id = p_topic_id
        and render.render_kind = 'wardrobe'
    )
      and job.status = 'awaiting_upload';

    update public.media_assets as asset
    set status = 'failed'
    where asset.status = 'pending'
      and exists (
        select 1
        from public.child_topic_portrait_renders as render
        join public.ai_jobs as job on job.id = render.job_id
        where render.family_id = p_family_id
          and render.child_profile_id = p_child_profile_id
          and render.topic_id = p_topic_id
          and render.render_kind = 'wardrobe'
          and render.output_media_asset_id = asset.id
          and job.status = 'cancelled'
          and job.public_error_code = 'request_superseded'
      );

    update public.child_topic_portraits as portrait
    set display_kind = 'base',
        display_job_id = portrait.base_job_id,
        display_media_asset_id = portrait.base_media_asset_id,
        display_equipment_fingerprint = private.empty_wardrobe_fingerprint(),
        display_wardrobe_item_ids = '{}'::uuid[],
        desired_render_sequence = portrait.desired_render_sequence
          + case when selected_pending_is_wardrobe then 1 else 0 end,
        pending_job_id = case
          when selected_pending_is_wardrobe then null
          else portrait.pending_job_id
        end
    where portrait.child_profile_id = p_child_profile_id
      and portrait.topic_id = p_topic_id;
  end if;

  return query select
    case
      when selected_base_ready
        and (
          selected_reference_id is null
          or selected_reference_id = selected_portrait.base_source_media_asset_id
        )
      then 'base'::text
      else 'stale'::text
    end,
    case
      when not selected_base_ready then 'base_required'::text
      when selected_reference_id is not null
        and selected_reference_id <> selected_portrait.base_source_media_asset_id
      then 'base_stale'::text
      else null::text
    end,
    null::uuid,
    null::public.ai_job_status,
    false,
    selected_portrait.base_media_asset_id,
    null::uuid,
    private.empty_wardrobe_fingerprint(),
    '{}'::uuid[];
end;
$$;

revoke all on function public.prepare_child_topic_wardrobe_render(
  uuid, uuid, uuid, uuid, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.prepare_child_topic_wardrobe_render(
  uuid, uuid, uuid, uuid, uuid
) to authenticated;

comment on function public.prepare_child_topic_wardrobe_render(
  uuid, uuid, uuid, uuid, uuid
) is
  'Idempotently prepares the current complete equipped look without changing or re-timestamping any wardrobe item; useful after a new base or a failed render.';

-- Any current adult family member may reconcile a portrait job requested by a
-- different adult. Generic AI jobs remain requester-only. If the child/topic
-- context stopped being playable before claim, this operation closes an
-- unclaimed job/output instead of leaving mobile controls polling forever.
create function public.reconcile_child_topic_portrait_job_start(
  p_job_id uuid,
  p_expected_user_id uuid
)
returns table (
  job_id uuid,
  job_status public.ai_job_status,
  may_process boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  selected_job public.ai_jobs%rowtype;
  selected_render public.child_topic_portrait_renders%rowtype;
  selected_context_is_active boolean := false;
begin
  if caller_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if caller_id is distinct from p_expected_user_id then
    raise exception 'The authenticated account changed before the portrait job was started.'
      using errcode = '28000';
  end if;
  if p_job_id is null then return; end if;

  select job.*
  into selected_job
  from public.ai_jobs as job
  join public.child_topic_portrait_renders as render on render.job_id = job.id
  where job.id = p_job_id
    and job.scope_kind = 'family'
    and job.family_id = render.family_id
    and job.child_profile_id = render.child_profile_id
    and (select private.is_family_member(render.family_id))
  for update of job;

  if selected_job.id is null then return; end if;

  select render.*
  into selected_render
  from public.child_topic_portrait_renders as render
  where render.job_id = selected_job.id;

  if selected_render.job_id is null then return; end if;

  selected_context_is_active := exists (
    select 1
    from public.child_profiles as child
    join public.topics as topic on topic.id = selected_render.topic_id
    where child.id = selected_render.child_profile_id
      and child.family_id = selected_render.family_id
      and child.is_active
      and topic.is_published
  );

  if not selected_context_is_active
    and selected_job.status = 'awaiting_upload'
  then
    update public.media_assets
    set status = 'failed'
    where id = selected_render.output_media_asset_id
      and status = 'pending';

    update public.ai_jobs
    set status = 'cancelled',
        public_error_code = 'request_superseded',
        completed_at = now()
    where id = selected_job.id
      and status = 'awaiting_upload';

    update public.child_topic_portraits
    set pending_job_id = null,
        updated_at = now()
    where child_profile_id = selected_render.child_profile_id
      and topic_id = selected_render.topic_id
      and pending_job_id = selected_job.id;

    selected_job.status := 'cancelled';
  end if;

  return query select
    selected_job.id,
    selected_job.status,
    selected_job.status = 'processing'
      or (
        selected_context_is_active
        and selected_job.status = 'awaiting_upload'
      );
end;
$$;

revoke all on function public.reconcile_child_topic_portrait_job_start(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.reconcile_child_topic_portrait_job_start(uuid, uuid)
  to authenticated;

comment on function public.reconcile_child_topic_portrait_job_start(uuid, uuid) is
  'Authorizes any current adult family member to start only a valid child/topic portrait job, or atomically cancels an invalid unclaimed portrait so clients do not remain busy.';

-- Portrait jobs already reference trusted media metadata. This dedicated
-- claim adds the ordered catalogue inputs while leaving the original generic
-- claim unchanged for installed clients and profile-avatar jobs.
create function public.claim_child_topic_portrait_job_for_worker(p_job_id uuid)
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
  output_object_path text,
  input_images jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_job public.ai_jobs%rowtype;
  selected_render public.child_topic_portrait_renders%rowtype;
  selected_portrait public.child_topic_portraits%rowtype;
  selected_version public.ai_operation_versions%rowtype;
  selected_input public.media_assets%rowtype;
  selected_output public.media_assets%rowtype;
  selected_reference_id uuid;
  selected_live_fingerprint text;
  selected_topic_title text;
  selected_topic_description text;
  selected_items_json jsonb;
  selected_input_images jsonb;
  selected_prompt text;
  selected_item_count integer;
  next_attempt smallint;
begin
  select job.* into selected_job
  from public.ai_jobs as job
  where job.id = p_job_id
  for update;

  if selected_job.id is null then return; end if;

  select render.* into selected_render
  from public.child_topic_portrait_renders as render
  where render.job_id = selected_job.id;
  if selected_render.job_id is null then return; end if;

  if selected_job.status in ('succeeded', 'cancelled') then return; end if;

  if selected_job.status = 'processing'
    and selected_job.processing_started_at > now() - interval '7 minutes'
  then
    return;
  end if;

  if selected_job.status = 'processing'
    and (
      selected_job.processing_started_at is null
      or selected_job.processing_started_at <= now() - interval '7 minutes'
    )
  then
    update private.ai_job_attempts as attempt
    set status = 'outcome_unknown', error_code = 'worker_lease_expired',
        completed_at = now()
    where attempt.job_id = selected_job.id
      and attempt.attempt_number = selected_job.attempt_count
      and attempt.status = 'processing';

    if selected_job.attempt_count >= selected_job.max_attempts then
      update public.ai_jobs
      set status = 'failed', public_error_code = 'provider_outcome_unknown',
          completed_at = now()
      where id = selected_job.id and status = 'processing';

      update public.media_assets
      set status = 'failed'
      where id = selected_render.output_media_asset_id and status = 'pending';
      return;
    end if;
  end if;

  if selected_job.status = 'failed'
    and selected_job.public_error_code not in (
      'provider_rate_limited', 'provider_unavailable', 'worker_interrupted'
    )
  then
    return;
  end if;
  if selected_job.attempt_count >= selected_job.max_attempts then return; end if;

  select portrait.* into selected_portrait
  from public.child_topic_portraits as portrait
  where portrait.family_id = selected_render.family_id
    and portrait.child_profile_id = selected_render.child_profile_id
    and portrait.topic_id = selected_render.topic_id
  for update;

  select reference.media_asset_id into selected_reference_id
  from public.child_topic_reference_photos as reference
  join public.media_assets as asset
    on asset.id = reference.media_asset_id
    and asset.family_id = reference.family_id
    and asset.child_profile_id = reference.child_profile_id
    and asset.topic_id = reference.topic_id
  where reference.family_id = selected_render.family_id
    and reference.child_profile_id = selected_render.child_profile_id
    and reference.topic_id = selected_render.topic_id
    and asset.status = 'ready'
    and asset.deleted_at is null;

  selected_live_fingerprint := private.child_equipped_wardrobe_fingerprint(
    selected_render.child_profile_id
  );

  -- Avoid a paid call when the source, base, equipment, or desired sequence
  -- changed after reservation. The immutable job remains cancelled history.
  if selected_portrait.child_profile_id is null
    or selected_portrait.pending_job_id is distinct from selected_job.id
    or selected_portrait.desired_render_sequence <> selected_render.render_sequence
    or not exists (
      select 1
      from public.child_profiles as child
      where child.id = selected_render.child_profile_id
        and child.family_id = selected_render.family_id
        and child.is_active
    )
    or not exists (
      select 1
      from public.topics as topic
      where topic.id = selected_render.topic_id
        and topic.is_published
    )
    or (
      selected_render.render_kind = 'base'
      and selected_reference_id is distinct from selected_render.source_reference_media_asset_id
    )
    or (
      selected_render.render_kind = 'wardrobe'
      and selected_reference_id is not null
      and selected_reference_id is distinct from selected_render.source_reference_media_asset_id
    )
    or (
      selected_render.render_kind = 'wardrobe'
      and (
        selected_portrait.base_media_asset_id is distinct from selected_render.base_media_asset_id
        or (
          selected_reference_id is not null
          and selected_portrait.base_source_media_asset_id is distinct from selected_reference_id
        )
        or selected_live_fingerprint is distinct from selected_render.equipment_fingerprint
      )
    )
  then
    update public.ai_jobs
    set status = 'cancelled', public_error_code = 'request_superseded',
        completed_at = now()
    where id = selected_job.id
      and status in ('awaiting_upload', 'processing', 'failed');
    update public.media_assets
    set status = 'failed'
    where id = selected_render.output_media_asset_id and status = 'pending';
    return;
  end if;

  select version.* into selected_version
  from public.ai_operation_versions as version
  where version.id = selected_job.operation_version_id
    and version.operation_id = selected_job.operation_id;

  select asset.* into selected_input
  from public.ai_job_media as link
  join public.media_assets as asset
    on asset.id = link.media_asset_id and asset.family_id = link.family_id
  join storage.objects as object
    on object.bucket_id = asset.storage_bucket
    and object.name = asset.storage_object_path
  where link.job_id = selected_job.id
    and link.family_id = selected_job.family_id
    and link.slot = 'reference_image'
    and link.ordinal = 0
    and asset.subject_kind = 'child'
    and asset.child_profile_id = selected_job.child_profile_id
    and asset.topic_id = selected_render.topic_id
    and asset.status = 'ready'
    and asset.deleted_at is null
    and (
      (selected_render.render_kind = 'base' and asset.asset_role = 'reference_input')
      or (
        selected_render.render_kind = 'wardrobe'
        and asset.asset_role = 'generated_output'
        and asset.id = selected_render.base_media_asset_id
      )
    );

  select asset.* into selected_output
  from public.ai_job_media as link
  join public.media_assets as asset
    on asset.id = link.media_asset_id and asset.family_id = link.family_id
  where link.job_id = selected_job.id
    and link.family_id = selected_job.family_id
    and link.slot = 'generated_image'
    and link.ordinal = 0
    and asset.id = selected_render.output_media_asset_id
    and asset.asset_role = 'generated_output'
    and asset.subject_kind = 'child'
    and asset.child_profile_id = selected_job.child_profile_id
    and asset.topic_id = selected_render.topic_id
    and asset.status = 'pending'
    and asset.mime_type = 'image/png'
    and asset.storage_bucket = 'ai-media-private';

  select topic.title, topic.description
  into selected_topic_title, selected_topic_description
  from public.topics as topic where topic.id = selected_render.topic_id;

  if selected_version.id is null or selected_input.id is null
    or selected_output.id is null or selected_topic_title is null
  then
    update public.media_assets
    set status = 'failed'
    where id = selected_render.output_media_asset_id and status = 'pending';
    update public.ai_jobs
    set status = 'failed', public_error_code = 'server_configuration',
        completed_at = now()
    where id = selected_job.id
      and status in ('awaiting_upload', 'processing', 'failed');
    return;
  end if;

  selected_input_images := jsonb_build_array(
    jsonb_build_object(
      'bucket', selected_input.storage_bucket,
      'object_path', selected_input.storage_object_path,
      'mime_type', selected_input.mime_type,
      'role', case selected_render.render_kind
        when 'base' then 'source_person'
        else 'immutable_base_person'
      end
    )
  );

  if selected_render.render_kind = 'wardrobe' then
    select count(*)::integer,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'image_number', snapshot.ordinal + 1,
            'name', snapshot.name,
            'slot', snapshot.equip_slot
          ) order by snapshot.ordinal
        ),
        '[]'::jsonb
      ),
      selected_input_images || coalesce(
        jsonb_agg(
          jsonb_build_object(
            'bucket', 'wardrobe-images',
            'object_path', snapshot.image_path,
            'mime_type', 'image/png',
            'role', 'wardrobe_item',
            'wardrobe_item_id', snapshot.wardrobe_item_id,
            'equip_slot', snapshot.equip_slot
          ) order by snapshot.ordinal
        ),
        '[]'::jsonb
      )
    into selected_item_count, selected_items_json, selected_input_images
    from private.child_topic_portrait_job_items as snapshot
    join storage.objects as object
      on object.bucket_id = 'wardrobe-images'
      and object.name = snapshot.image_path
    where snapshot.job_id = selected_job.id;

    if selected_item_count <> cardinality(selected_render.wardrobe_item_ids)
      or selected_item_count not between 1 and 5
    then
      update public.media_assets
      set status = 'failed'
      where id = selected_render.output_media_asset_id and status = 'pending';
      update public.ai_jobs
      set status = 'failed', public_error_code = 'invalid_input_image',
          completed_at = now()
      where id = selected_job.id
        and status in ('awaiting_upload', 'processing', 'failed');
      return;
    end if;
  else
    selected_items_json := '[]'::jsonb;
  end if;

  selected_prompt := replace(
    replace(
      replace(
        selected_version.prompt_template,
        '{{topic_title}}',
        to_jsonb(selected_topic_title)::text
      ),
      '{{topic_description}}',
      to_jsonb(coalesce(selected_topic_description, ''))::text
    ),
    '{{wardrobe_items}}',
    selected_items_json::text
  );

  next_attempt := selected_job.attempt_count + 1;

  update public.ai_jobs
  set status = 'processing', attempt_count = next_attempt,
      public_error_code = null, queued_at = coalesce(queued_at, now()),
      processing_started_at = now(), completed_at = null
  where id = selected_job.id;

  insert into private.ai_job_attempts (
    job_id, attempt_number, gateway, provider, model, status
  ) values (
    selected_job.id, next_attempt, selected_version.gateway,
    selected_version.provider, selected_version.model, 'processing'
  );

  return query select
    selected_job.id,
    next_attempt,
    selected_version.gateway,
    selected_version.provider,
    selected_version.model,
    selected_prompt,
    selected_version.request_options,
    selected_version.input_contract,
    selected_version.output_contract,
    selected_version.timeout_ms,
    selected_version.max_cost_microusd,
    selected_input.storage_bucket,
    selected_input.storage_object_path,
    selected_input.mime_type,
    selected_output.id,
    selected_output.storage_object_path,
    selected_input_images;
end;
$$;

revoke all on function public.claim_child_topic_portrait_job_for_worker(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_child_topic_portrait_job_for_worker(uuid)
  to service_role;

comment on function public.claim_child_topic_portrait_job_for_worker(uuid) is
  'Claims only server-prepared child/topic jobs and returns ordered trusted Storage inputs plus a bounded server-expanded immutable prompt version.';

-- The generic completion RPC remains the sole output validator. This trigger
-- advances the visible portrait only after that RPC has made the output ready,
-- and only if source/base/sequence/equipment still match. Failures and stale
-- completions preserve the last successful current look.
create function private.finalize_child_topic_portrait_job()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_render public.child_topic_portrait_renders%rowtype;
  selected_portrait public.child_topic_portraits%rowtype;
  selected_reference_id uuid;
  selected_live_fingerprint text;
  promoted boolean := false;
begin
  if old.status is not distinct from new.status
    or new.status not in ('succeeded', 'failed', 'cancelled')
  then
    return new;
  end if;

  select render.* into selected_render
  from public.child_topic_portrait_renders as render
  where render.job_id = new.id;
  if selected_render.job_id is null then return new; end if;

  update public.child_topic_portrait_renders as render
  set completed_at = coalesce(new.completed_at, now())
  where render.job_id = new.id;

  select portrait.* into selected_portrait
  from public.child_topic_portraits as portrait
  where portrait.family_id = selected_render.family_id
    and portrait.child_profile_id = selected_render.child_profile_id
    and portrait.topic_id = selected_render.topic_id
  for update;

  if selected_portrait.child_profile_id is null then return new; end if;

  if new.status = 'succeeded'
    and selected_portrait.pending_job_id = new.id
    and selected_portrait.desired_render_sequence = selected_render.render_sequence
    and exists (
      select 1
      from public.child_profiles as child
      join public.topics as topic on topic.id = selected_render.topic_id
      where child.id = selected_render.child_profile_id
        and child.family_id = selected_render.family_id
        and child.is_active
        and topic.is_published
    )
    and exists (
      select 1
      from public.media_assets as asset
      join storage.objects as object
        on object.bucket_id = asset.storage_bucket
        and object.name = asset.storage_object_path
      where asset.id = selected_render.output_media_asset_id
        and asset.family_id = selected_render.family_id
        and asset.child_profile_id = selected_render.child_profile_id
        and asset.topic_id = selected_render.topic_id
        and asset.subject_kind = 'child'
        and asset.asset_role = 'generated_output'
        and asset.status = 'ready'
        and asset.mime_type = 'image/png'
        and asset.storage_bucket = 'ai-media-private'
        and asset.deleted_at is null
    )
  then
    select reference.media_asset_id into selected_reference_id
    from public.child_topic_reference_photos as reference
    join public.media_assets as asset
      on asset.id = reference.media_asset_id
      and asset.family_id = reference.family_id
      and asset.child_profile_id = reference.child_profile_id
      and asset.topic_id = reference.topic_id
    where reference.family_id = selected_render.family_id
      and reference.child_profile_id = selected_render.child_profile_id
      and reference.topic_id = selected_render.topic_id
      and asset.status = 'ready'
      and asset.deleted_at is null;

    if selected_render.render_kind = 'base'
      and selected_reference_id = selected_render.source_reference_media_asset_id
    then
      update public.child_topic_portraits as portrait
      set base_source_media_asset_id = selected_render.source_reference_media_asset_id,
          base_job_id = selected_render.job_id,
          base_media_asset_id = selected_render.output_media_asset_id,
          display_kind = 'base',
          display_job_id = selected_render.job_id,
          display_media_asset_id = selected_render.output_media_asset_id,
          display_equipment_fingerprint = private.empty_wardrobe_fingerprint(),
          display_wardrobe_item_ids = '{}'::uuid[],
          pending_job_id = null
      where portrait.child_profile_id = selected_render.child_profile_id
        and portrait.topic_id = selected_render.topic_id;
      promoted := true;
    elsif selected_render.render_kind = 'wardrobe'
      and selected_portrait.base_media_asset_id = selected_render.base_media_asset_id
      and (
        selected_reference_id is null
        or selected_portrait.base_source_media_asset_id = selected_reference_id
      )
    then
      selected_live_fingerprint := private.child_equipped_wardrobe_fingerprint(
        selected_render.child_profile_id
      );
      if selected_live_fingerprint = selected_render.equipment_fingerprint then
        update public.child_topic_portraits as portrait
        set display_kind = 'wardrobe',
            display_job_id = selected_render.job_id,
            display_media_asset_id = selected_render.output_media_asset_id,
            display_equipment_fingerprint = selected_render.equipment_fingerprint,
            display_wardrobe_item_ids = selected_render.wardrobe_item_ids,
            pending_job_id = null
        where portrait.child_profile_id = selected_render.child_profile_id
          and portrait.topic_id = selected_render.topic_id;
        promoted := true;
      end if;
    end if;
  end if;

  if promoted then
    update public.child_topic_portrait_renders
    set promoted_as_current = true
    where job_id = new.id;
  elsif selected_portrait.pending_job_id = new.id
    and selected_portrait.desired_render_sequence = selected_render.render_sequence
  then
    update public.child_topic_portraits
    set pending_job_id = null
    where child_profile_id = selected_render.child_profile_id
      and topic_id = selected_render.topic_id;
  end if;

  return new;
end;
$$;

revoke all on function private.finalize_child_topic_portrait_job()
  from public, anon, authenticated, service_role;

create trigger finalize_child_topic_portrait_job
after update of status on public.ai_jobs
for each row execute function private.finalize_child_topic_portrait_job();

create function public.get_child_topic_portrait(
  p_family_id uuid,
  p_child_profile_id uuid,
  p_topic_id uuid,
  p_expected_user_id uuid
)
returns table (
  family_id uuid,
  child_profile_id uuid,
  topic_id uuid,
  current_reference_media_asset_id uuid,
  base_source_media_asset_id uuid,
  base_job_id uuid,
  base_media_asset_id uuid,
  base_storage_bucket text,
  base_storage_object_path text,
  display_kind public.child_topic_portrait_display_kind,
  display_job_id uuid,
  display_media_asset_id uuid,
  display_storage_bucket text,
  display_storage_object_path text,
  display_equipment_fingerprint text,
  display_wardrobe_item_ids uuid[],
  live_equipment_fingerprint text,
  live_wardrobe_item_ids uuid[],
  has_live_equipment_render_attempt boolean,
  is_base_stale boolean,
  is_look_stale boolean,
  pending_job_id uuid,
  pending_job_status public.ai_job_status,
  pending_public_error_code text,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
begin
  if caller_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if caller_id is distinct from p_expected_user_id then
    raise exception 'The authenticated account changed before loading the skill portrait.'
      using errcode = '28000';
  end if;
  if not exists (
    select 1 from public.child_profiles as child
    where child.id = p_child_profile_id
      and child.family_id = p_family_id
      and child.is_active
      and (select private.is_family_member(child.family_id))
  ) then
    raise exception 'The active child is unavailable to this family.'
      using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.topics as topic
    where topic.id = p_topic_id and topic.is_published
  ) then
    raise exception 'The published topic is unavailable.' using errcode = 'P0002';
  end if;

  return query
  with current_reference as (
    select reference.media_asset_id
    from public.child_topic_reference_photos as reference
    join public.media_assets as asset
      on asset.id = reference.media_asset_id
      and asset.family_id = reference.family_id
      and asset.child_profile_id = reference.child_profile_id
      and asset.topic_id = reference.topic_id
    where reference.family_id = p_family_id
      and reference.child_profile_id = p_child_profile_id
      and reference.topic_id = p_topic_id
      and asset.status = 'ready'
      and asset.deleted_at is null
  ),
  live_equipment as (
    select
      private.child_equipped_wardrobe_fingerprint(p_child_profile_id) as fingerprint,
      coalesce(
        array_agg(inventory.wardrobe_item_id order by inventory.equip_slot, inventory.wardrobe_item_id)
          filter (where inventory.wardrobe_item_id is not null),
        '{}'::uuid[]
      ) as item_ids
    from public.child_wardrobe_items as inventory
    where inventory.child_profile_id = p_child_profile_id
      and inventory.is_equipped
  )
  select
    p_family_id,
    p_child_profile_id,
    p_topic_id,
    reference.media_asset_id,
    portrait.base_source_media_asset_id,
    portrait.base_job_id,
    portrait.base_media_asset_id,
    base_asset.storage_bucket,
    base_asset.storage_object_path,
    portrait.display_kind,
    portrait.display_job_id,
    portrait.display_media_asset_id,
    display_asset.storage_bucket,
    display_asset.storage_object_path,
    portrait.display_equipment_fingerprint,
    coalesce(portrait.display_wardrobe_item_ids, '{}'::uuid[]),
    equipment.fingerprint,
    equipment.item_ids,
    exists (
      select 1
      from public.child_topic_portrait_renders as attempted_render
      where attempted_render.family_id = p_family_id
        and attempted_render.child_profile_id = p_child_profile_id
        and attempted_render.topic_id = p_topic_id
        and attempted_render.render_kind = 'wardrobe'
        and attempted_render.base_media_asset_id = portrait.base_media_asset_id
        and attempted_render.equipment_fingerprint = equipment.fingerprint
        and attempted_render.wardrobe_item_ids = equipment.item_ids
    ),
    portrait.base_media_asset_id is null
      or (
        reference.media_asset_id is not null
        and portrait.base_source_media_asset_id is distinct from reference.media_asset_id
      ),
    portrait.display_media_asset_id is null
      or portrait.base_media_asset_id is null
      or (
        reference.media_asset_id is not null
        and portrait.base_source_media_asset_id is distinct from reference.media_asset_id
      )
      or portrait.display_equipment_fingerprint is distinct from equipment.fingerprint,
    portrait.pending_job_id,
    pending_job.status,
    pending_job.public_error_code,
    portrait.updated_at
  from live_equipment as equipment
  left join current_reference as reference on true
  left join public.child_topic_portraits as portrait
    on portrait.family_id = p_family_id
    and portrait.child_profile_id = p_child_profile_id
    and portrait.topic_id = p_topic_id
  left join public.media_assets as base_asset
    on base_asset.id = portrait.base_media_asset_id
    and base_asset.family_id = portrait.family_id
    and base_asset.child_profile_id = portrait.child_profile_id
    and base_asset.topic_id = portrait.topic_id
    and base_asset.status = 'ready'
    and base_asset.deleted_at is null
  left join public.media_assets as display_asset
    on display_asset.id = portrait.display_media_asset_id
    and display_asset.family_id = portrait.family_id
    and display_asset.child_profile_id = portrait.child_profile_id
    and display_asset.topic_id = portrait.topic_id
    and display_asset.status = 'ready'
    and display_asset.deleted_at is null
  left join public.ai_jobs as pending_job on pending_job.id = portrait.pending_job_id;
end;
$$;

revoke all on function public.get_child_topic_portrait(uuid, uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_child_topic_portrait(uuid, uuid, uuid, uuid)
  to authenticated;

comment on function public.get_child_topic_portrait(uuid, uuid, uuid, uuid) is
  'Returns one family-bound child/topic portrait state with safe Storage pointers, pending progress, current-reference staleness, live-vs-rendered equipment staleness, and durable exact-look attempt state for bounded automatic rendering.';

-- Topic deletion already has a controlled child-activity outcome. Keep that
-- contract when portrait lineage is the blocker instead of leaking whichever
-- new restrict FK happens to fire first.
create function private.prevent_topic_delete_with_child_portraits()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.child_topic_portraits as portrait
    where portrait.topic_id = old.id
  ) or exists (
    select 1
    from public.child_topic_portrait_renders as render
    where render.topic_id = old.id
  ) then
    raise exception using
      errcode = '23503',
      message = 'The topic has child activity and cannot be deleted. Keep it unpublished instead.';
  end if;

  return old;
end;
$$;

revoke all on function private.prevent_topic_delete_with_child_portraits()
  from public, anon, authenticated, service_role;

create trigger prevent_topic_delete_with_child_portraits
before delete on public.topics
for each row execute function private.prevent_topic_delete_with_child_portraits();

commit;
