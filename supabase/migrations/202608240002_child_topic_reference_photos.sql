begin;

-- A child may keep one private, durable reference photo for each training
-- topic. The photo is family media: it is never copied into the public
-- wardrobe catalogue and it does not start a paid AI operation by itself.
alter table public.media_assets
  add column topic_id uuid references public.topics (id) on delete set null,
  add constraint media_assets_topic_requires_child check (
    topic_id is null
    or (subject_kind = 'child' and child_profile_id is not null)
  ),
  add constraint media_assets_id_family_child_topic_key
    unique (id, family_id, child_profile_id, topic_id);

comment on column public.media_assets.topic_id is
  'Optional topic lineage for private child media. Current topic references use it; non-topic AI media remains null.';

create table public.child_topic_reference_photos (
  child_profile_id uuid not null,
  topic_id uuid not null references public.topics (id) on delete restrict,
  family_id uuid not null,
  media_asset_id uuid not null unique,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (child_profile_id, topic_id),
  constraint child_topic_reference_photos_child_family_fkey
    foreign key (child_profile_id, family_id)
    references public.child_profiles (id, family_id)
    on delete restrict,
  constraint child_topic_reference_photos_asset_lineage_fkey
    foreign key (media_asset_id, family_id, child_profile_id, topic_id)
    references public.media_assets (id, family_id, child_profile_id, topic_id)
    on delete restrict
);

comment on table public.child_topic_reference_photos is
  'The single current ready private reference photo for one child and one topic. Superseded and removed assets remain outside this pointer and are due for retention cleanup.';

create table private.child_topic_reference_photo_requests (
  request_id uuid primary key default gen_random_uuid(),
  client_request_id uuid not null
    check (client_request_id <> '00000000-0000-0000-0000-000000000000'::uuid),
  media_asset_id uuid not null unique,
  family_id uuid not null,
  child_profile_id uuid not null,
  topic_id uuid references public.topics (id) on delete set null,
  requested_by uuid not null references public.profiles (id) on delete restrict,
  status text not null default 'awaiting_upload'
    check (status in ('awaiting_upload', 'current', 'superseded', 'removed')),
  finalized_at timestamptz,
  superseded_at timestamptz,
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (requested_by, client_request_id),
  constraint child_topic_reference_requests_child_family_fkey
    foreign key (child_profile_id, family_id)
    references public.child_profiles (id, family_id)
    on delete restrict,
  constraint child_topic_reference_requests_asset_lineage_fkey
    foreign key (media_asset_id, family_id, child_profile_id)
    references public.media_assets (id, family_id, child_profile_id)
    on delete restrict,
  constraint child_topic_reference_requests_timestamps check (
    (
      status = 'awaiting_upload'
      and finalized_at is null
      and superseded_at is null
      and removed_at is null
    )
    or (
      status = 'current'
      and finalized_at is not null
      and superseded_at is null
      and removed_at is null
    )
    or (
      status = 'superseded'
      and finalized_at is not null
      and superseded_at is not null
      and removed_at is null
    )
    or (
      status = 'removed'
      and removed_at is not null
      and superseded_at is null
    )
  )
);

comment on table private.child_topic_reference_photo_requests is
  'Retry-safe upload history for child-topic photos. It is not exposed through the API schema; clients see only guarded RPC results and the current pointer.';

create index child_topic_reference_requests_context_idx
  on private.child_topic_reference_photo_requests (
    family_id,
    child_profile_id,
    topic_id,
    status,
    created_at
  );

create trigger child_topic_reference_photos_set_updated_at
before update on public.child_topic_reference_photos
for each row execute function private.set_updated_at();

create trigger child_topic_reference_requests_set_updated_at
before update on private.child_topic_reference_photo_requests
for each row execute function private.set_updated_at();

alter table public.child_topic_reference_photos enable row level security;
alter table private.child_topic_reference_photo_requests enable row level security;

create policy "Family members can read current child topic reference photos"
on public.child_topic_reference_photos for select to authenticated
using ((select private.is_family_member(family_id)));

create policy "Family members can read current child topic reference metadata"
on public.media_assets for select to authenticated
using (
  subject_kind = 'child'
  and asset_role = 'reference_input'
  and status = 'ready'
  and topic_id is not null
  and (select private.is_family_member(family_id))
  and exists (
    select 1
    from public.child_topic_reference_photos as reference
    where reference.media_asset_id = media_assets.id
      and reference.family_id = media_assets.family_id
      and reference.child_profile_id = media_assets.child_profile_id
      and reference.topic_id = media_assets.topic_id
  )
);

create policy "Family members can read current child topic reference bytes"
on storage.objects for select to authenticated
using (
  bucket_id = 'ai-media-private'
  and exists (
    select 1
    from public.media_assets as asset
    join public.child_topic_reference_photos as reference
      on reference.media_asset_id = asset.id
      and reference.family_id = asset.family_id
      and reference.child_profile_id = asset.child_profile_id
      and reference.topic_id = asset.topic_id
    where asset.storage_bucket = storage.objects.bucket_id
      and asset.storage_object_path = storage.objects.name
      and asset.subject_kind = 'child'
      and asset.asset_role = 'reference_input'
      and asset.status = 'ready'
      and (select private.is_family_member(asset.family_id))
  )
);

revoke all on table public.child_topic_reference_photos
  from public, anon, authenticated, service_role;
grant select on table public.child_topic_reference_photos
  to authenticated, service_role;

revoke all on table private.child_topic_reference_photo_requests
  from public, anon, authenticated, service_role;
grant select on table private.child_topic_reference_photo_requests
  to service_role;

create function public.prepare_child_topic_reference_photo(
  p_family_id uuid,
  p_child_profile_id uuid,
  p_topic_id uuid,
  p_expected_user_id uuid,
  p_client_request_id uuid,
  p_input_mime_type text
)
returns table (
  request_id uuid,
  media_asset_id uuid,
  storage_bucket text,
  storage_object_path text,
  input_mime_type text,
  request_status text,
  created boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  selected_child_family_id uuid;
  selected_child_active boolean;
  existing_request private.child_topic_reference_photo_requests%rowtype;
  existing_asset public.media_assets%rowtype;
  inserted_request_id uuid := gen_random_uuid();
  inserted_asset_id uuid := gen_random_uuid();
  input_extension text;
  inserted_path text;
  recent_caller_reservation_count integer;
  retained_family_reservation_count integer;
begin
  if caller_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if caller_id is distinct from p_expected_user_id then
    raise exception 'The authenticated account changed before the photo request.'
      using errcode = '28000';
  end if;

  if p_family_id is null
    or p_child_profile_id is null
    or p_topic_id is null
  then
    raise exception 'Family, child, and topic identifiers are required.'
      using errcode = '22023';
  end if;

  if p_client_request_id is null
    or p_client_request_id = '00000000-0000-0000-0000-000000000000'::uuid
  then
    raise exception 'A non-zero client request id is required.'
      using errcode = '22023';
  end if;

  if p_input_mime_type not in ('image/jpeg', 'image/png') then
    raise exception 'The topic photo type is not supported.'
      using errcode = '22023';
  end if;

  -- Serialize caller and family quota checks before locking the selected child.
  -- Exact retries are returned below without consuming another reservation.
  perform profile.id
  from public.profiles as profile
  where profile.id = caller_id
  for update;

  if not found then
    raise exception 'The authenticated profile is missing.'
      using errcode = 'P0002';
  end if;

  perform family.id
  from public.families as family
  where family.id = p_family_id
  for no key update;

  if not found then
    raise exception 'The family is unavailable.'
      using errcode = '42501';
  end if;

  select child.family_id, child.is_active
  into selected_child_family_id, selected_child_active
  from public.child_profiles as child
  where child.id = p_child_profile_id
  for update;

  if selected_child_family_id is null
    or selected_child_family_id <> p_family_id
    or not selected_child_active
    or not (select private.is_family_member(p_family_id))
  then
    raise exception 'The active child is unavailable to this family.'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.topics as topic
    where topic.id = p_topic_id
      and topic.is_published
  ) then
    raise exception 'The published topic is unavailable.'
      using errcode = 'P0002';
  end if;

  select request.*
  into existing_request
  from private.child_topic_reference_photo_requests as request
  where request.requested_by = caller_id
    and request.client_request_id = p_client_request_id;

  if existing_request.request_id is not null then
    select asset.*
    into existing_asset
    from public.media_assets as asset
    where asset.id = existing_request.media_asset_id;

    if existing_request.family_id <> p_family_id
      or existing_request.child_profile_id <> p_child_profile_id
      or existing_request.topic_id is distinct from p_topic_id
      or existing_asset.id is null
      or existing_asset.family_id <> p_family_id
      or existing_asset.child_profile_id is distinct from p_child_profile_id
      or existing_asset.topic_id is distinct from p_topic_id
      or existing_asset.subject_kind <> 'child'
      or existing_asset.asset_role <> 'reference_input'
      or existing_asset.mime_type <> p_input_mime_type
    then
      raise exception 'A client request id cannot be reused with different topic photo input.'
        using errcode = '22023';
    end if;

    return query
    select
      existing_request.request_id,
      existing_asset.id,
      existing_asset.storage_bucket,
      existing_asset.storage_object_path,
      existing_asset.mime_type,
      existing_request.status,
      false;
    return;
  end if;

  select count(*)::integer
  into recent_caller_reservation_count
  from private.child_topic_reference_photo_requests as request
  where request.requested_by = caller_id
    and request.family_id = p_family_id
    and request.created_at >= now() - interval '24 hours';

  if recent_caller_reservation_count >= 10 then
    raise exception 'The daily child topic photo limit has been reached.'
      using errcode = '54000';
  end if;

  -- Until physical retention cleanup is available, keep an absolute family
  -- ceiling as well. Counting every not-yet-deleted reservation (including an
  -- interrupted upload) makes the maximum deterministic under concurrency and
  -- prevents private bytes from growing without bound. A future cleanup worker
  -- restores capacity only after recording deleted_at on the media asset.
  select count(*)::integer
  into retained_family_reservation_count
  from private.child_topic_reference_photo_requests as request
  join public.media_assets as asset
    on asset.id = request.media_asset_id
    and asset.family_id = request.family_id
  where request.family_id = p_family_id
    and asset.deleted_at is null;

  if retained_family_reservation_count >= 25 then
    raise exception 'The family child topic photo storage limit has been reached.'
      using errcode = '54000';
  end if;

  -- A new choice closes only older uploads that never became current. The
  -- current photo stays visible until this new upload is validated.
  update public.media_assets as asset
  set status = 'failed',
      delete_after = now()
  from private.child_topic_reference_photo_requests as request
  where request.requested_by = caller_id
    and request.family_id = p_family_id
    and request.child_profile_id = p_child_profile_id
    and request.topic_id = p_topic_id
    and request.status = 'awaiting_upload'
    and asset.id = request.media_asset_id
    and asset.status = 'pending';

  update private.child_topic_reference_photo_requests as request
  set status = 'removed',
      removed_at = now()
  where request.requested_by = caller_id
    and request.family_id = p_family_id
    and request.child_profile_id = p_child_profile_id
    and request.topic_id = p_topic_id
    and request.status = 'awaiting_upload';

  input_extension := case p_input_mime_type
    when 'image/jpeg' then 'jpg'
    when 'image/png' then 'png'
  end;
  inserted_path := format(
    '%s/children/%s/topics/%s/%s.%s',
    p_family_id,
    p_child_profile_id,
    p_topic_id,
    inserted_asset_id,
    input_extension
  );

  insert into public.media_assets (
    id,
    family_id,
    child_profile_id,
    topic_id,
    subject_kind,
    asset_role,
    status,
    storage_object_path,
    mime_type,
    delete_after,
    created_by
  ) values (
    inserted_asset_id,
    p_family_id,
    p_child_profile_id,
    p_topic_id,
    'child',
    'reference_input',
    'pending',
    inserted_path,
    p_input_mime_type,
    now() + interval '24 hours',
    caller_id
  );

  insert into private.child_topic_reference_photo_requests (
    request_id,
    client_request_id,
    media_asset_id,
    family_id,
    child_profile_id,
    topic_id,
    requested_by
  ) values (
    inserted_request_id,
    p_client_request_id,
    inserted_asset_id,
    p_family_id,
    p_child_profile_id,
    p_topic_id,
    caller_id
  );

  return query
  select
    inserted_request_id,
    inserted_asset_id,
    'ai-media-private'::text,
    inserted_path,
    p_input_mime_type,
    'awaiting_upload'::text,
    true;
end;
$$;

revoke all on function public.prepare_child_topic_reference_photo(
  uuid, uuid, uuid, uuid, uuid, text
) from public, anon, authenticated, service_role;
grant execute on function public.prepare_child_topic_reference_photo(
  uuid, uuid, uuid, uuid, uuid, text
) to authenticated;

comment on function public.prepare_child_topic_reference_photo(
  uuid, uuid, uuid, uuid, uuid, text
) is
  'Retry-safely reserves one private child-topic upload after binding the current session, family, active child, published topic, and MIME type.';

create function public.finalize_child_topic_reference_photo(
  p_family_id uuid,
  p_child_profile_id uuid,
  p_topic_id uuid,
  p_expected_user_id uuid,
  p_client_request_id uuid
)
returns table (
  request_media_asset_id uuid,
  current_media_asset_id uuid,
  previous_media_asset_id uuid,
  request_status text,
  changed boolean,
  photo_updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  selected_child_family_id uuid;
  selected_child_active boolean;
  selected_request private.child_topic_reference_photo_requests%rowtype;
  selected_asset public.media_assets%rowtype;
  selected_object_owner_id text;
  selected_object_metadata jsonb;
  stored_byte_size bigint;
  previous_asset_id uuid;
  current_asset_id uuid;
  current_updated_at timestamptz;
begin
  if caller_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if caller_id is distinct from p_expected_user_id then
    raise exception 'The authenticated account changed before the photo was saved.'
      using errcode = '28000';
  end if;

  select child.family_id, child.is_active
  into selected_child_family_id, selected_child_active
  from public.child_profiles as child
  where child.id = p_child_profile_id
  for update;

  if selected_child_family_id is null
    or selected_child_family_id <> p_family_id
    or not selected_child_active
    or not (select private.is_family_member(p_family_id))
  then
    raise exception 'The active child is unavailable to this family.'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.topics as topic
    where topic.id = p_topic_id
      and topic.is_published
  ) then
    raise exception 'The published topic is unavailable.'
      using errcode = 'P0002';
  end if;

  select request.*
  into selected_request
  from private.child_topic_reference_photo_requests as request
  where request.requested_by = caller_id
    and request.client_request_id = p_client_request_id
  for update;

  if selected_request.request_id is null
    or selected_request.family_id <> p_family_id
    or selected_request.child_profile_id <> p_child_profile_id
    or selected_request.topic_id is distinct from p_topic_id
  then
    raise exception 'The topic photo request is unavailable.'
      using errcode = 'P0002';
  end if;

  if selected_request.status <> 'awaiting_upload' then
    select reference.media_asset_id, reference.updated_at
    into current_asset_id, current_updated_at
    from public.child_topic_reference_photos as reference
    where reference.child_profile_id = p_child_profile_id
      and reference.topic_id = p_topic_id;

    return query
    select
      selected_request.media_asset_id,
      current_asset_id,
      null::uuid,
      selected_request.status,
      false,
      current_updated_at;
    return;
  end if;

  select asset.*
  into selected_asset
  from public.media_assets as asset
  where asset.id = selected_request.media_asset_id
  for update;

  if selected_asset.id is null
    or selected_asset.family_id <> p_family_id
    or selected_asset.child_profile_id is distinct from p_child_profile_id
    or selected_asset.topic_id is distinct from p_topic_id
    or selected_asset.subject_kind <> 'child'
    or selected_asset.asset_role <> 'reference_input'
    or selected_asset.status <> 'pending'
  then
    raise exception 'The reserved topic photo is invalid.'
      using errcode = '55000';
  end if;

  select object.owner_id, object.metadata
  into selected_object_owner_id, selected_object_metadata
  from storage.objects as object
  where object.bucket_id = selected_asset.storage_bucket
    and object.name = selected_asset.storage_object_path;

  if selected_object_metadata is null
    or selected_object_owner_id is distinct from caller_id::text
    or selected_object_metadata ->> 'mimetype' is distinct from selected_asset.mime_type
  then
    raise exception 'The uploaded topic photo is missing or invalid.'
      using errcode = '22023';
  end if;

  stored_byte_size := case
    when coalesce(
      (selected_object_metadata ->> 'contentLength') ~ '^[0-9]{1,8}$',
      false
    ) and coalesce(
      (selected_object_metadata ->> 'size') ~ '^[0-9]{1,8}$',
      false
    ) and (selected_object_metadata ->> 'contentLength')::bigint
      = (selected_object_metadata ->> 'size')::bigint
      then (selected_object_metadata ->> 'contentLength')::bigint
    when not (selected_object_metadata ? 'size') and coalesce(
      (selected_object_metadata ->> 'contentLength') ~ '^[0-9]{1,8}$',
      false
    ) then (selected_object_metadata ->> 'contentLength')::bigint
    when not (selected_object_metadata ? 'contentLength') and coalesce(
      (selected_object_metadata ->> 'size') ~ '^[0-9]{1,8}$',
      false
    ) then (selected_object_metadata ->> 'size')::bigint
    else null
  end;

  if stored_byte_size is null or stored_byte_size not between 1 and 8388608 then
    raise exception 'The uploaded topic photo size is invalid.'
      using errcode = '22023';
  end if;

  select reference.media_asset_id
  into previous_asset_id
  from public.child_topic_reference_photos as reference
  where reference.child_profile_id = p_child_profile_id
    and reference.topic_id = p_topic_id
  for update;

  update public.media_assets as asset
  set status = 'ready',
      byte_size = stored_byte_size,
      delete_after = null
  where asset.id = selected_asset.id;

  insert into public.child_topic_reference_photos (
    child_profile_id,
    topic_id,
    family_id,
    media_asset_id,
    created_by
  ) values (
    p_child_profile_id,
    p_topic_id,
    p_family_id,
    selected_asset.id,
    caller_id
  )
  on conflict (child_profile_id, topic_id) do update
  set family_id = excluded.family_id,
      media_asset_id = excluded.media_asset_id,
      created_by = excluded.created_by,
      updated_at = now()
  returning media_asset_id, updated_at
  into current_asset_id, current_updated_at;

  update private.child_topic_reference_photo_requests as request
  set status = 'current',
      finalized_at = now()
  where request.request_id = selected_request.request_id;

  if previous_asset_id is not null and previous_asset_id <> selected_asset.id then
    update private.child_topic_reference_photo_requests as request
    set status = 'superseded',
        superseded_at = now()
    where request.media_asset_id = previous_asset_id
      and request.status = 'current';

    update public.media_assets as asset
    set delete_after = now()
    where asset.id = previous_asset_id
      and asset.status = 'ready';
  end if;

  return query
  select
    selected_asset.id,
    current_asset_id,
    previous_asset_id,
    'current'::text,
    true,
    current_updated_at;
end;
$$;

revoke all on function public.finalize_child_topic_reference_photo(
  uuid, uuid, uuid, uuid, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.finalize_child_topic_reference_photo(
  uuid, uuid, uuid, uuid, uuid
) to authenticated;

comment on function public.finalize_child_topic_reference_photo(
  uuid, uuid, uuid, uuid, uuid
) is
  'Validates a reserved Storage object and atomically makes it the single current child-topic reference. The superseded asset immediately loses family read access and becomes due for physical cleanup.';

create function public.remove_child_topic_reference_photo(
  p_family_id uuid,
  p_child_profile_id uuid,
  p_topic_id uuid,
  p_expected_user_id uuid,
  p_expected_media_asset_id uuid
)
returns table (
  removed_media_asset_id uuid,
  delete_after timestamptz,
  removed boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  selected_child_family_id uuid;
  current_asset_id uuid;
  scheduled_delete_after timestamptz;
begin
  if caller_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if caller_id is distinct from p_expected_user_id then
    raise exception 'The authenticated account changed before the photo was removed.'
      using errcode = '28000';
  end if;

  if p_expected_media_asset_id is null then
    raise exception 'The expected topic photo is required.'
      using errcode = '22023';
  end if;

  select child.family_id
  into selected_child_family_id
  from public.child_profiles as child
  where child.id = p_child_profile_id
  for update;

  if selected_child_family_id is null
    or selected_child_family_id <> p_family_id
    or not (select private.is_family_member(p_family_id))
  then
    raise exception 'The child is unavailable to this family.'
      using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.topics as topic where topic.id = p_topic_id
  ) then
    raise exception 'The topic is unavailable.' using errcode = 'P0002';
  end if;

  select reference.media_asset_id
  into current_asset_id
  from public.child_topic_reference_photos as reference
  where reference.child_profile_id = p_child_profile_id
    and reference.topic_id = p_topic_id
  for update;

  if current_asset_id is null then
    select asset.delete_after
    into scheduled_delete_after
    from private.child_topic_reference_photo_requests as request
    join public.media_assets as asset on asset.id = request.media_asset_id
    where request.media_asset_id = p_expected_media_asset_id
      and request.family_id = p_family_id
      and request.child_profile_id = p_child_profile_id
      and request.topic_id = p_topic_id
      and request.status in ('removed', 'superseded');

    if not found then
      raise exception 'The topic photo is unavailable.' using errcode = 'P0002';
    end if;

    return query
    select p_expected_media_asset_id, scheduled_delete_after, false;
    return;
  end if;

  if current_asset_id <> p_expected_media_asset_id then
    raise exception 'The topic photo changed before it could be removed.'
      using errcode = '40001';
  end if;

  delete from public.child_topic_reference_photos as reference
  where reference.child_profile_id = p_child_profile_id
    and reference.topic_id = p_topic_id
    and reference.media_asset_id = current_asset_id;

  update private.child_topic_reference_photo_requests as request
  set status = 'removed',
      removed_at = now()
  where request.media_asset_id = current_asset_id
    and request.status = 'current';

  update public.media_assets as asset
  set delete_after = now()
  where asset.id = current_asset_id
  returning asset.delete_after into scheduled_delete_after;

  return query
  select current_asset_id, scheduled_delete_after, true;
end;
$$;

revoke all on function public.remove_child_topic_reference_photo(
  uuid, uuid, uuid, uuid, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.remove_child_topic_reference_photo(
  uuid, uuid, uuid, uuid, uuid
) to authenticated;

comment on function public.remove_child_topic_reference_photo(
  uuid, uuid, uuid, uuid, uuid
) is
  'Immediately removes family read access to the current topic photo and records that its private bytes are due for cleanup. It does not claim physical deletion before the retention worker succeeds.';

create function public.list_child_published_topics_with_photo(
  p_family_id uuid,
  p_child_profile_id uuid,
  p_expected_user_id uuid
)
returns table (
  topic_id uuid,
  slug text,
  title text,
  description text,
  icon text,
  accent_color text,
  sort_order integer,
  photo_media_asset_id uuid,
  photo_mime_type text,
  photo_storage_bucket text,
  photo_storage_object_path text,
  photo_updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  selected_child_family_id uuid;
  selected_child_active boolean;
begin
  if caller_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if caller_id is distinct from p_expected_user_id then
    raise exception 'The authenticated account changed before topics were loaded.'
      using errcode = '28000';
  end if;

  select child.family_id, child.is_active
  into selected_child_family_id, selected_child_active
  from public.child_profiles as child
  where child.id = p_child_profile_id;

  if selected_child_family_id is null
    or selected_child_family_id <> p_family_id
    or not selected_child_active
    or not (select private.is_family_member(p_family_id))
  then
    raise exception 'The active child is unavailable to this family.'
      using errcode = '42501';
  end if;

  return query
  select
    topic.id,
    topic.slug,
    topic.title,
    topic.description,
    topic.icon,
    topic.accent_color,
    topic.sort_order,
    asset.id,
    asset.mime_type,
    asset.storage_bucket,
    asset.storage_object_path,
    reference.updated_at
  from public.topics as topic
  left join public.child_topic_reference_photos as reference
    on reference.child_profile_id = p_child_profile_id
    and reference.family_id = p_family_id
    and reference.topic_id = topic.id
  left join public.media_assets as asset
    on asset.id = reference.media_asset_id
    and asset.family_id = reference.family_id
    and asset.child_profile_id = reference.child_profile_id
    and asset.topic_id = reference.topic_id
    and asset.subject_kind = 'child'
    and asset.asset_role = 'reference_input'
    and asset.status = 'ready'
  where topic.is_published
  order by topic.sort_order, topic.id;
end;
$$;

revoke all on function public.list_child_published_topics_with_photo(
  uuid, uuid, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.list_child_published_topics_with_photo(
  uuid, uuid, uuid
) to authenticated;

comment on function public.list_child_published_topics_with_photo(
  uuid, uuid, uuid
) is
  'Lists real published topics for one active child and returns only that child''s current private reference metadata. The family client mints short-lived signed URLs under Storage RLS.';

-- The topic lifecycle function predates private child-topic photos. Redefine it
-- additively after the new table exists so a current family photo is treated as
-- child activity and produces the existing controlled 23503 outcome instead of
-- leaking a raw foreign-key failure from the final topic delete.
create or replace function public.delete_admin_topic(
  p_topic_id uuid,
  p_expected_updated_at timestamptz
)
returns table (
  id uuid,
  deleted_goal_count integer,
  deleted_exercise_count integer,
  deleted_wardrobe_item_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  selected_topic public.topics%rowtype;
  selected_goal_count integer;
  selected_exercise_count integer;
  selected_wardrobe_item_count integer;
  selected_tree_updated_at timestamptz;
  has_child_wardrobe_items boolean := false;
  has_child_topic_reference_photos boolean := false;
begin
  if caller_id is null or not (select private.is_admin()) then
    raise exception using
      errcode = '42501',
      message = 'Administrator access is required.';
  end if;

  if p_topic_id is null or p_expected_updated_at is null then
    raise exception using
      errcode = '22023',
      message = 'A topic identifier and expected revision are required.';
  end if;

  select topic.*
    into selected_topic
  from public.topics as topic
  where topic.id = p_topic_id
  for update;

  if selected_topic.id is null then
    raise exception using
      errcode = 'P0002',
      message = 'The topic does not exist.';
  end if;

  if selected_topic.is_published then
    raise exception using
      errcode = '55000',
      message = 'The topic must be unpublished before it can be deleted.';
  end if;

  perform goal.id
  from public.goals as goal
  where goal.topic_id = selected_topic.id
  order by goal.id
  for update;

  perform exercise.id
  from public.exercises as exercise
  join public.goals as goal on goal.id = exercise.goal_id
  where goal.topic_id = selected_topic.id
  order by exercise.id
  for update of exercise;

  perform item.id
  from public.wardrobe_items as item
  where item.topic_id = selected_topic.id
  order by item.id
  for update;

  perform reference.child_profile_id
  from public.child_topic_reference_photos as reference
  where reference.topic_id = selected_topic.id
  order by reference.child_profile_id
  for update;

  select private.admin_topic_tree_updated_at(selected_topic.id)
    into selected_tree_updated_at;

  if selected_tree_updated_at is distinct from p_expected_updated_at then
    raise exception using
      errcode = '40001',
      message = 'The topic changed before it could be deleted.';
  end if;

  if to_regclass('public.child_wardrobe_items') is not null then
    execute $query$
      select exists (
        select 1
        from public.child_wardrobe_items as inventory
        join public.wardrobe_items as item
          on item.id = inventory.wardrobe_item_id
        where item.topic_id = $1
      )
    $query$
    into has_child_wardrobe_items
    using selected_topic.id;
  end if;

  select exists (
    select 1
    from public.child_topic_reference_photos as reference
    where reference.topic_id = selected_topic.id
  )
  into has_child_topic_reference_photos;

  if has_child_topic_reference_photos
    or has_child_wardrobe_items
    or exists (
      select 1
      from public.child_goals as child_goal
      join public.goals as goal on goal.id = child_goal.goal_id
      where goal.topic_id = selected_topic.id
    )
    or exists (
      select 1
      from public.exercise_attempts as attempt
      join public.exercises as exercise on exercise.id = attempt.exercise_id
      join public.goals as goal on goal.id = exercise.goal_id
      where goal.topic_id = selected_topic.id
    )
    or exists (
      select 1
      from public.child_exercise_progress as progress
      join public.exercises as exercise on exercise.id = progress.exercise_id
      join public.goals as goal on goal.id = exercise.goal_id
      where goal.topic_id = selected_topic.id
    )
  then
    raise exception using
      errcode = '23503',
      message = 'The topic has child activity and cannot be deleted. Keep it unpublished instead.';
  end if;

  select count(*)::integer
    into selected_goal_count
  from public.goals as goal
  where goal.topic_id = selected_topic.id;

  select count(*)::integer
    into selected_exercise_count
  from public.exercises as exercise
  join public.goals as goal on goal.id = exercise.goal_id
  where goal.topic_id = selected_topic.id;

  select count(*)::integer
    into selected_wardrobe_item_count
  from public.wardrobe_items as item
  where item.topic_id = selected_topic.id;

  delete from public.topics as topic
  where topic.id = selected_topic.id;

  return query
  select
    selected_topic.id,
    selected_goal_count,
    selected_exercise_count,
    selected_wardrobe_item_count;
end;
$$;

comment on function public.delete_admin_topic(uuid, timestamptz) is
  'Optimistically deletes one unpublished topic and its editorial tree, while treating child activity, owned wardrobe rewards, and current private child-topic photos as controlled in-use blockers.';

revoke all on function public.delete_admin_topic(uuid, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.delete_admin_topic(uuid, timestamptz)
  to authenticated;

commit;
