begin;

-- Keep a durable profile pointer to the reviewed generated asset rather than
-- storing an expiring signed URL or an unvalidated Storage path. Existing
-- clients continue to use avatar_seed while this nullable column rolls out.
alter table public.child_profiles
  add column avatar_media_asset_id uuid;

comment on column public.child_profiles.avatar_media_asset_id is
  'The current private generated profile image. Signed URLs are minted at read time; avatar_seed remains the fallback.';

-- The existing media-asset family key prevents cross-family pointers. Include
-- the linked child as well so even trusted SQL cannot attach one sibling's
-- generated output to another child profile.
alter table public.media_assets
  add constraint media_assets_id_family_child_key
  unique (id, family_id, child_profile_id);

alter table public.child_profiles
  add constraint child_profiles_avatar_media_child_fkey
  foreign key (avatar_media_asset_id, family_id, id)
  references public.media_assets (id, family_id, child_profile_id)
  on delete restrict;

-- Authenticated family members may select a completed portrait for an active
-- child. The client supplies only stable row identities; operation, slot,
-- media role, MIME type, Storage path, and retention state are server-owned.
create function public.set_child_profile_avatar_from_ai_job(
  p_child_profile_id uuid,
  p_job_id uuid,
  p_expected_user_id uuid
)
returns table (
  child_profile_id uuid,
  avatar_media_asset_id uuid,
  previous_avatar_media_asset_id uuid,
  changed boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  selected_family_id uuid;
  selected_output_asset_id uuid;
  previous_asset_id uuid;
begin
  if caller_id is null then
    raise exception 'Authentication is required.'
      using errcode = '42501';
  end if;

  if caller_id is distinct from p_expected_user_id then
    raise exception 'The authenticated account changed before the profile image update.'
      using errcode = '28000';
  end if;

  if p_child_profile_id is null or p_job_id is null then
    raise exception 'A child profile and completed portrait job are required.'
      using errcode = '22023';
  end if;

  select child.family_id, child.avatar_media_asset_id
  into selected_family_id, previous_asset_id
  from public.child_profiles as child
  where child.id = p_child_profile_id
    and child.is_active
    and (select private.is_family_member(child.family_id))
  for update;

  if selected_family_id is null then
    raise exception 'The active child profile is unavailable to this family.'
      using errcode = '42501';
  end if;

  select asset.id
  into selected_output_asset_id
  from public.ai_jobs as job
  join public.ai_operations as operation
    on operation.id = job.operation_id
  join public.ai_job_media as link
    on link.job_id = job.id
    and link.family_id = job.family_id
    and link.slot = 'generated_image'
    and link.ordinal = 0
  join public.media_assets as asset
    on asset.id = link.media_asset_id
    and asset.family_id = link.family_id
  join storage.objects as object
    on object.bucket_id = asset.storage_bucket
    and object.name = asset.storage_object_path
  where job.id = p_job_id
    and job.scope_kind = 'family'
    and job.family_id = selected_family_id
    and job.child_profile_id = p_child_profile_id
    and job.subject_kind = 'child'
    and job.status = 'succeeded'
    and operation.operation_key = 'portrait.cartoon_3d'
    and operation.capability = 'image_transform'
    and asset.child_profile_id = p_child_profile_id
    and asset.subject_kind = 'child'
    and asset.asset_role = 'generated_output'
    and asset.status = 'ready'
    and asset.mime_type = 'image/png'
    and asset.storage_bucket = 'ai-media-private'
    and asset.deleted_at is null
    and object.metadata ->> 'mimetype' = 'image/png'
    and object.metadata ->> 'size' ~ '^[0-9]{1,8}$'
    and (object.metadata ->> 'size')::bigint between 1 and 8388608
  for update of asset;

  if selected_output_asset_id is null then
    raise exception 'The completed portrait result is unavailable.'
      using errcode = 'P0002';
  end if;

  -- An active profile asset is retained until it is replaced or the child is
  -- removed. The source photo keeps its original short retention deadline.
  update public.media_assets as asset
  set delete_after = null
  where asset.id = selected_output_asset_id
    and asset.family_id = selected_family_id
    and asset.child_profile_id = p_child_profile_id;

  if previous_asset_id is distinct from selected_output_asset_id then
    update public.child_profiles as child
    set avatar_media_asset_id = selected_output_asset_id
    where child.id = p_child_profile_id
      and child.family_id = selected_family_id;

    if previous_asset_id is not null then
      update public.media_assets as asset
      set delete_after = now() + interval '30 days'
      where asset.id = previous_asset_id
        and asset.family_id = selected_family_id
        and asset.child_profile_id = p_child_profile_id
        and not exists (
          select 1
          from public.child_profiles as child
          where child.avatar_media_asset_id = asset.id
        );
    end if;
  end if;

  return query
  select
    p_child_profile_id,
    selected_output_asset_id,
    case
      when previous_asset_id is distinct from selected_output_asset_id
        then previous_asset_id
      else null::uuid
    end,
    previous_asset_id is distinct from selected_output_asset_id;
end;
$$;

revoke all on function public.set_child_profile_avatar_from_ai_job(
  uuid,
  uuid,
  uuid
) from public, anon, authenticated, service_role;
grant execute on function public.set_child_profile_avatar_from_ai_job(
  uuid,
  uuid,
  uuid
) to authenticated;

comment on function public.set_child_profile_avatar_from_ai_job(
  uuid,
  uuid,
  uuid
) is
  'Atomically promotes one ready child-linked portrait output to the active private profile image and schedules the replaced output for later deletion.';

-- The original column grants are deliberately narrow. Keep the new pointer
-- RPC-only even if privilege defaults or a future grant are broadened.
revoke insert (avatar_media_asset_id)
  on public.child_profiles from authenticated;
revoke update (avatar_media_asset_id)
  on public.child_profiles from authenticated;

commit;
