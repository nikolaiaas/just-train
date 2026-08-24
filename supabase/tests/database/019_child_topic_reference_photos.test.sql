begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(58);

create temporary table prepared_topic_photos (
  label text primary key,
  request_id uuid not null,
  media_asset_id uuid not null,
  storage_bucket text not null,
  storage_object_path text not null,
  input_mime_type text not null,
  request_status text not null,
  created boolean not null
);
grant select, insert, update on prepared_topic_photos
  to authenticated, service_role;

create temporary table lifecycle_topic_photo (
  media_asset_id uuid primary key,
  storage_bucket text not null,
  storage_object_path text not null,
  input_mime_type text not null
);
grant select, insert on lifecycle_topic_photo to authenticated, service_role;

select has_column(
  'public',
  'media_assets',
  'topic_id',
  'private media can carry explicit topic lineage'
);
select has_table(
  'public',
  'child_topic_reference_photos',
  'one current child-topic reference pointer exists'
);
select has_table(
  'private',
  'child_topic_reference_photo_requests',
  'retry-safe topic photo upload history remains private'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'public.child_topic_reference_photos',
    'insert'
  )
  and not has_table_privilege(
    'authenticated',
    'public.child_topic_reference_photos',
    'update'
  )
  and not has_table_privilege(
    'authenticated',
    'public.child_topic_reference_photos',
    'delete'
  ),
  'family clients cannot write around the guarded photo transitions'
);
select is(
  has_table_privilege(
    'authenticated',
    'private.child_topic_reference_photo_requests',
    'select'
  ),
  false,
  'family clients cannot browse upload history'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.prepare_child_topic_reference_photo(uuid,uuid,uuid,uuid,uuid,text)',
    'execute'
  )
  and has_function_privilege(
    'authenticated',
    'public.finalize_child_topic_reference_photo(uuid,uuid,uuid,uuid,uuid)',
    'execute'
  )
  and has_function_privilege(
    'authenticated',
    'public.remove_child_topic_reference_photo(uuid,uuid,uuid,uuid,uuid)',
    'execute'
  )
  and has_function_privilege(
    'authenticated',
    'public.list_child_published_topics_with_photo(uuid,uuid,uuid)',
    'execute'
  ),
  'authenticated family clients receive only the four bounded operations'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.prepare_child_topic_reference_photo(uuid,uuid,uuid,uuid,uuid,text)',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'public.list_child_published_topics_with_photo(uuid,uuid,uuid)',
    'execute'
  ),
  'anonymous clients cannot prepare uploads or use child-bound discovery'
);
select results_eq(
  $$
    select policy.cmd::text collate "default", policy.roles
    from pg_policies as policy
    where policy.schemaname = 'storage'
      and policy.tablename = 'objects'
      and policy.policyname =
        'Family members can read current child topic reference bytes'
  $$,
  $$ values ('SELECT'::text, array['authenticated']::name[]) $$,
  'private topic bytes have one explicit authenticated read policy'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

select results_eq(
  $$
    select topic_id, slug, title, photo_media_asset_id
    from public.list_child_published_topics_with_photo(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001'
    )
    order by sort_order, topic_id
  $$,
  $$
    values (
      '40000000-0000-4000-8000-000000000001'::uuid,
      'fodbold'::text,
      'Fodbold'::text,
      null::uuid
    )
  $$,
  'real discovery returns only the published topic and no invented photo'
);
select throws_ok(
  $$
    select * from public.list_child_published_topics_with_photo(
      '20000000-0000-4000-8000-000000000002',
      '30000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000001'
    )
  $$,
  '42501',
  null,
  'one parent cannot discover topics through another family child context'
);
select throws_ok(
  $$
    select * from public.list_child_published_topics_with_photo(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000002'
    )
  $$,
  '28000',
  null,
  'discovery fails when the authenticated session changed'
);
select throws_ok(
  $$
    select * from public.prepare_child_topic_reference_photo(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000001',
      'f1000000-0000-4000-8000-000000000001',
      'image/jpeg'
    )
  $$,
  'P0002',
  null,
  'an unpublished topic cannot reserve a child photo'
);
select throws_ok(
  $$
    select * from public.prepare_child_topic_reference_photo(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      'f1000000-0000-4000-8000-000000000002',
      'image/webp'
    )
  $$,
  '22023',
  null,
  'the upload contract rejects an unsupported MIME type before reservation'
);
select throws_ok(
  $$
    select * from public.prepare_child_topic_reference_photo(
      '20000000-0000-4000-8000-000000000002',
      '30000000-0000-4000-8000-000000000002',
      '40000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      'f1000000-0000-4000-8000-000000000003',
      'image/jpeg'
    )
  $$,
  '42501',
  null,
  'a family cannot reserve a reference for another family child'
);

select lives_ok(
  $$
    insert into prepared_topic_photos
    select
      'first',
      prepared.request_id,
      prepared.media_asset_id,
      prepared.storage_bucket,
      prepared.storage_object_path,
      prepared.input_mime_type,
      prepared.request_status,
      prepared.created
    from public.prepare_child_topic_reference_photo(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      'f1000000-0000-4000-8000-000000000010',
      'image/jpeg'
    ) as prepared
  $$,
  'a family member can reserve one private topic photo'
);
select results_eq(
  $$
    select
      storage_bucket,
      input_mime_type,
      request_status,
      created,
      storage_object_path ~ (
        '^20000000-0000-4000-8000-000000000001/children/'
        || '30000000-0000-4000-8000-000000000001/topics/'
        || '40000000-0000-4000-8000-000000000001/'
        || '[0-9a-f-]{36}[.]jpg$'
      )
    from prepared_topic_photos
    where label = 'first'
  $$,
  $$ values ('ai-media-private', 'image/jpeg', 'awaiting_upload', true, true) $$,
  'the reservation returns only the canonical private path and bounded type'
);
select results_eq(
  $$
    select
      retry.media_asset_id,
      retry.storage_object_path,
      retry.request_status,
      retry.created
    from public.prepare_child_topic_reference_photo(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      'f1000000-0000-4000-8000-000000000010',
      'image/jpeg'
    ) as retry
  $$,
  $$
    select
      media_asset_id,
      storage_object_path,
      'awaiting_upload'::text,
      false
    from prepared_topic_photos where label = 'first'
  $$,
  'an exact prepare retry reuses the same reserved object'
);
select throws_ok(
  $$
    select * from public.prepare_child_topic_reference_photo(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      'f1000000-0000-4000-8000-000000000010',
      'image/png'
    )
  $$,
  '22023',
  null,
  'a client request id cannot be reused with different input'
);
select throws_ok(
  $$
    select * from public.finalize_child_topic_reference_photo(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      'f1000000-0000-4000-8000-000000000010'
    )
  $$,
  '22023',
  null,
  'finalization refuses a reservation whose Storage object is missing'
);
select throws_ok(
  $$
    insert into storage.objects (bucket_id, name, owner_id, metadata)
    select
      storage_bucket,
      storage_object_path,
      '10000000-0000-4000-8000-000000000001',
      '{"size":0,"mimetype":"image/jpeg"}'::jsonb
    from prepared_topic_photos where label = 'first'
  $$,
  '42501',
  null,
  'Storage RLS rejects an empty reserved photo'
);
select lives_ok(
  $$
    insert into storage.objects (bucket_id, name, owner_id, metadata)
    select
      storage_bucket,
      storage_object_path,
      '10000000-0000-4000-8000-000000000001',
      '{"contentLength":2048,"size":2048,"mimetype":"image/jpeg"}'::jsonb
    from prepared_topic_photos where label = 'first'
  $$,
  'the requester can upload the exact non-empty reserved JPEG'
);
select results_eq(
  $$
    select
      request_media_asset_id,
      current_media_asset_id,
      previous_media_asset_id,
      request_status,
      changed,
      photo_updated_at is not null
    from public.finalize_child_topic_reference_photo(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      'f1000000-0000-4000-8000-000000000010'
    )
  $$,
  $$
    select
      media_asset_id,
      media_asset_id,
      null::uuid,
      'current'::text,
      true,
      true
    from prepared_topic_photos where label = 'first'
  $$,
  'finalization makes the validated upload current without a previous photo'
);
select results_eq(
  $$
    select request_status, changed, current_media_asset_id
    from public.finalize_child_topic_reference_photo(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      'f1000000-0000-4000-8000-000000000010'
    )
  $$,
  $$
    select 'current'::text, false, media_asset_id
    from prepared_topic_photos where label = 'first'
  $$,
  'an exact finalize retry is a no-op that returns the current photo'
);
select is(
  (
    select count(*)::integer
    from public.child_topic_reference_photos
    where child_profile_id = '30000000-0000-4000-8000-000000000001'
      and topic_id = '40000000-0000-4000-8000-000000000001'
  ),
  1,
  'the child and topic have exactly one current pointer'
);
select results_eq(
  $$
    select
      topic_id,
      photo_media_asset_id,
      photo_mime_type,
      photo_storage_bucket,
      photo_updated_at is not null
    from public.list_child_published_topics_with_photo(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001'
    )
  $$,
  $$
    select
      '40000000-0000-4000-8000-000000000001'::uuid,
      media_asset_id,
      'image/jpeg'::text,
      'ai-media-private'::text,
      true
    from prepared_topic_photos where label = 'first'
  $$,
  'child-bound discovery returns the current private photo metadata'
);
select is(
  (
    select count(*)::integer
    from public.media_assets
    where id = (
      select media_asset_id from prepared_topic_photos where label = 'first'
    )
  ),
  1,
  'the family can read current reference metadata'
);
select is(
  (
    select count(*)::integer
    from storage.objects
    where bucket_id = 'ai-media-private'
      and name = (
        select storage_object_path
        from prepared_topic_photos where label = 'first'
      )
  ),
  1,
  'the family can read current reference bytes for signed URL creation'
);

-- Nine synthetic retained reservations plus the real current photo reach the
-- caller's rolling limit. A rejected replacement must leave that current
-- family photo untouched.
reset role;
with quota_fixture as (
  select gen_random_uuid() as media_asset_id
  from generate_series(1, 9)
)
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
  metadata,
  delete_after,
  created_by
)
select
  fixture.media_asset_id,
  '20000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  'child',
  'reference_input',
  'failed',
  format(
    '20000000-0000-4000-8000-000000000001/quota/daily/%s.jpg',
    fixture.media_asset_id
  ),
  'image/jpeg',
  '{"topic_photo_quota_fixture":"daily"}'::jsonb,
  now(),
  '10000000-0000-4000-8000-000000000001'
from quota_fixture as fixture;

insert into private.child_topic_reference_photo_requests (
  client_request_id,
  media_asset_id,
  family_id,
  child_profile_id,
  topic_id,
  requested_by,
  status,
  removed_at
)
select
  gen_random_uuid(),
  asset.id,
  asset.family_id,
  asset.child_profile_id,
  asset.topic_id,
  '10000000-0000-4000-8000-000000000001',
  'removed',
  now()
from public.media_assets as asset
where asset.metadata ->> 'topic_photo_quota_fixture' = 'daily';

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

select throws_ok(
  $$
    select * from public.prepare_child_topic_reference_photo(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      'f1000000-0000-4000-8000-000000000012',
      'image/png'
    )
  $$,
  '54000',
  'The daily child topic photo limit has been reached.',
  'a caller cannot create more than ten topic-photo reservations in 24 hours'
);
select is(
  (
    select media_asset_id
    from public.child_topic_reference_photos
    where child_profile_id = '30000000-0000-4000-8000-000000000001'
      and topic_id = '40000000-0000-4000-8000-000000000001'
  ),
  (select media_asset_id from prepared_topic_photos where label = 'first'),
  'a quota rejection preserves the current topic photo'
);

reset role;
update private.child_topic_reference_photo_requests as request
set created_at = now() - interval '2 days'
from public.media_assets as asset
where asset.id = request.media_asset_id
  and asset.metadata ->> 'topic_photo_quota_fixture' = 'daily';

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

select lives_ok(
  $$
    insert into prepared_topic_photos
    select
      'second',
      prepared.request_id,
      prepared.media_asset_id,
      prepared.storage_bucket,
      prepared.storage_object_path,
      prepared.input_mime_type,
      prepared.request_status,
      prepared.created
    from public.prepare_child_topic_reference_photo(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      'f1000000-0000-4000-8000-000000000011',
      'image/png'
    ) as prepared
  $$,
  'a replacement can reserve a distinct private PNG while the old photo stays current'
);
select is(
  (
    select count(*)::integer
    from public.media_assets
    where id = (
      select media_asset_id from prepared_topic_photos where label = 'first'
    )
  ),
  1,
  'preparing a replacement does not hide the current photo early'
);
select lives_ok(
  $$
    insert into storage.objects (bucket_id, name, owner_id, metadata)
    select
      storage_bucket,
      storage_object_path,
      '10000000-0000-4000-8000-000000000001',
      '{"size":4096,"mimetype":"image/png"}'::jsonb
    from prepared_topic_photos where label = 'second'
  $$,
  'the replacement PNG can be uploaded only to its reservation'
);
select results_eq(
  $$
    select
      current_media_asset_id,
      previous_media_asset_id,
      request_status,
      changed
    from public.finalize_child_topic_reference_photo(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      'f1000000-0000-4000-8000-000000000011'
    )
  $$,
  $$
    select
      second.media_asset_id,
      first.media_asset_id,
      'current'::text,
      true
    from prepared_topic_photos as first
    cross join prepared_topic_photos as second
    where first.label = 'first' and second.label = 'second'
  $$,
  'the validated replacement atomically returns both new and previous assets'
);
select is(
  (
    select count(*)::integer
    from public.child_topic_reference_photos
    where child_profile_id = '30000000-0000-4000-8000-000000000001'
      and topic_id = '40000000-0000-4000-8000-000000000001'
  ),
  1,
  'replacement preserves exactly one current pointer'
);

-- Upload history is intentionally private. Inspect the retention transition
-- only as the trusted test owner, then restore the family client role before
-- proving that the old metadata and bytes disappeared through RLS.
reset role;
select results_eq(
  $$
    select request.status, asset.status::text, asset.delete_after <= now()
    from private.child_topic_reference_photo_requests as request
    join public.media_assets as asset on asset.id = request.media_asset_id
    where request.media_asset_id = (
      select media_asset_id from prepared_topic_photos where label = 'first'
    )
  $$,
  $$ values ('superseded'::text, 'ready'::text, true) $$,
  'the old asset stays honestly ready but is immediately due for cleanup'
);
set local role authenticated;
select is(
  (
    select count(*)::integer
    from public.media_assets
    where id = (
      select media_asset_id from prepared_topic_photos where label = 'first'
    )
  ),
  0,
  'superseded reference metadata immediately loses family read access'
);
select is(
  (
    select count(*)::integer
    from storage.objects
    where name = (
      select storage_object_path from prepared_topic_photos where label = 'first'
    )
  ),
  0,
  'superseded private bytes immediately lose family read access'
);
select throws_ok(
  $$
    select * from public.remove_child_topic_reference_photo(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      (select media_asset_id from prepared_topic_photos where label = 'first')
    )
  $$,
  '40001',
  null,
  'optimistic removal refuses to remove a newer photo'
);
select results_eq(
  $$
    select removed_media_asset_id, delete_after is not null, removed
    from public.remove_child_topic_reference_photo(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      (select media_asset_id from prepared_topic_photos where label = 'second')
    )
  $$,
  $$
    select media_asset_id, true, true
    from prepared_topic_photos where label = 'second'
  $$,
  'removal clears the exact current pointer and records a deletion deadline'
);
select results_eq(
  $$
    select removed_media_asset_id, delete_after is not null, removed
    from public.remove_child_topic_reference_photo(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      (select media_asset_id from prepared_topic_photos where label = 'second')
    )
  $$,
  $$
    select media_asset_id, true, false
    from prepared_topic_photos where label = 'second'
  $$,
  'an exact removal retry is a no-op with the recorded deadline'
);
select is(
  (
    select count(*)::integer
    from public.child_topic_reference_photos
    where child_profile_id = '30000000-0000-4000-8000-000000000001'
  ),
  0,
  'the removed child has no current reference pointer'
);
select is(
  (
    select count(*)::integer
    from public.media_assets
    where id = (
      select media_asset_id from prepared_topic_photos where label = 'second'
    )
  ),
  0,
  'removed reference metadata immediately loses family read access'
);
select is(
  (
    select count(*)::integer
    from storage.objects
    where name = (
      select storage_object_path from prepared_topic_photos where label = 'second'
    )
  ),
  0,
  'removed private bytes immediately lose family read access'
);
select results_eq(
  $$
    select photo_media_asset_id, photo_storage_object_path
    from public.list_child_published_topics_with_photo(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001'
    )
  $$,
  $$ values (null::uuid, null::text) $$,
  'published topic discovery remains available after its optional photo is removed'
);

-- A topic with no goals, attempts, progress, or owned wardrobe rewards still
-- counts as child activity while it owns a current private family photo. The
-- additive lifecycle redefinition must report the existing controlled error,
-- not let the final DELETE leak a foreign-key failure.
reset role;
insert into public.topics (
  id,
  slug,
  title,
  description,
  icon,
  accent_color,
  sort_order,
  is_published,
  published_at,
  created_by
)
values (
  '4f000000-0000-4000-8000-000000000010',
  'foto-livscyklus',
  'Foto livscyklus',
  'Syntetisk emne til test af privat foto og kontrolleret sletning.',
  '📷',
  '#53C987',
  90,
  true,
  now(),
  '10000000-0000-4000-8000-000000000003'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

select lives_ok(
  $$
    insert into lifecycle_topic_photo
    select
      prepared.media_asset_id,
      prepared.storage_bucket,
      prepared.storage_object_path,
      prepared.input_mime_type
    from public.prepare_child_topic_reference_photo(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '4f000000-0000-4000-8000-000000000010',
      '10000000-0000-4000-8000-000000000001',
      'f1000000-0000-4000-8000-000000000020',
      'image/jpeg'
    ) as prepared
  $$,
  'a private photo can be reserved for the isolated lifecycle topic'
);
select lives_ok(
  $$
    insert into storage.objects (bucket_id, name, owner_id, metadata)
    select
      storage_bucket,
      storage_object_path,
      '10000000-0000-4000-8000-000000000001',
      '{"size":1024,"mimetype":"image/jpeg"}'::jsonb
    from lifecycle_topic_photo
  $$,
  'the lifecycle fixture uploads only to its exact reservation'
);
select lives_ok(
  $$
    select * from public.finalize_child_topic_reference_photo(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '4f000000-0000-4000-8000-000000000010',
      '10000000-0000-4000-8000-000000000001',
      'f1000000-0000-4000-8000-000000000020'
    )
  $$,
  'the lifecycle fixture becomes the current private topic photo'
);

reset role;
update public.topics
set is_published = false,
    published_at = null
where id = '4f000000-0000-4000-8000-000000000010';

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);
set local role authenticated;

select throws_ok(
  $$
    select * from public.delete_admin_topic(
      '4f000000-0000-4000-8000-000000000010',
      (
        select updated_at
        from public.topics
        where id = '4f000000-0000-4000-8000-000000000010'
      )
    )
  $$,
  '23503',
  'The topic has child activity and cannot be deleted. Keep it unpublished instead.',
  'a current family photo blocks deletion with the controlled child-activity outcome'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

select lives_ok(
  $$
    select * from public.remove_child_topic_reference_photo(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '4f000000-0000-4000-8000-000000000010',
      '10000000-0000-4000-8000-000000000001',
      (select media_asset_id from lifecycle_topic_photo)
    )
  $$,
  'the family transition can explicitly retire the preserved private photo'
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
    select
      id,
      deleted_goal_count,
      deleted_exercise_count,
      deleted_wardrobe_item_count
    from public.delete_admin_topic(
      '4f000000-0000-4000-8000-000000000010',
      (
        select updated_at
        from public.topics
        where id = '4f000000-0000-4000-8000-000000000010'
      )
    )
  $$,
  $$
    values (
      '4f000000-0000-4000-8000-000000000010'::uuid,
      0,
      0,
      0
    )
  $$,
  'the topic can be deleted after its current family photo is explicitly retired'
);

-- Age the caller's reservations out of the rolling window, then fill the
-- absolute family ceiling. This proves retained private objects stay bounded
-- even before a physical cleanup worker is available.
reset role;
update private.child_topic_reference_photo_requests
set created_at = now() - interval '2 days'
where family_id = '20000000-0000-4000-8000-000000000001';

with quota_fixture as (
  select gen_random_uuid() as media_asset_id
  from generate_series(1, 13)
)
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
  metadata,
  delete_after,
  created_by
)
select
  fixture.media_asset_id,
  '20000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  'child',
  'reference_input',
  'failed',
  format(
    '20000000-0000-4000-8000-000000000001/quota/family/%s.jpg',
    fixture.media_asset_id
  ),
  'image/jpeg',
  '{"topic_photo_quota_fixture":"family"}'::jsonb,
  now(),
  '10000000-0000-4000-8000-000000000001'
from quota_fixture as fixture;

insert into private.child_topic_reference_photo_requests (
  client_request_id,
  media_asset_id,
  family_id,
  child_profile_id,
  topic_id,
  requested_by,
  status,
  removed_at,
  created_at
)
select
  gen_random_uuid(),
  asset.id,
  asset.family_id,
  asset.child_profile_id,
  asset.topic_id,
  '10000000-0000-4000-8000-000000000001',
  'removed',
  now(),
  now() - interval '2 days'
from public.media_assets as asset
where asset.metadata ->> 'topic_photo_quota_fixture' = 'family';

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

select throws_ok(
  $$
    select * from public.prepare_child_topic_reference_photo(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      'f1000000-0000-4000-8000-000000000025',
      'image/jpeg'
    )
  $$,
  '54000',
  'The family child topic photo storage limit has been reached.',
  'a family cannot accumulate more than 25 not-yet-deleted topic-photo reservations'
);

reset role;
set local role service_role;

select is(
  (
    select count(*)::integer
    from storage.objects
    where name in (
      select storage_object_path from prepared_topic_photos
    )
  ),
  2,
  'removal does not falsely claim that private Storage bytes were physically deleted'
);
select results_eq(
  $$
    select request.status, asset.status::text, asset.delete_after <= now()
    from private.child_topic_reference_photo_requests as request
    join public.media_assets as asset on asset.id = request.media_asset_id
    where request.media_asset_id = (
      select media_asset_id from prepared_topic_photos where label = 'second'
    )
  $$,
  $$ values ('removed'::text, 'ready'::text, true) $$,
  'removed bytes stay privately queued for the retention worker'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  (
    select count(*)::integer
    from public.child_topic_reference_photos
  ),
  0,
  'another family cannot read current pointers'
);
select is(
  (
    select count(*)::integer
    from public.media_assets
    where id in (select media_asset_id from prepared_topic_photos)
  ),
  0,
  'another family cannot read current or historical reference metadata'
);
select is(
  (
    select count(*)::integer
    from storage.objects
    where name in (select storage_object_path from prepared_topic_photos)
  ),
  0,
  'another family cannot read current or historical private bytes'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);
set local role authenticated;

select throws_ok(
  $$
    select * from public.list_child_published_topics_with_photo(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000003'
    )
  $$,
  '42501',
  null,
  'administrator status alone does not grant child photo access'
);

reset role;
update public.child_profiles
set is_active = false
where id = '30000000-0000-4000-8000-000000000001';

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

select throws_ok(
  $$
    select * from public.list_child_published_topics_with_photo(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001'
    )
  $$,
  '42501',
  null,
  'an inactive child cannot enter topic discovery'
);

reset role;

select * from finish();
rollback;
