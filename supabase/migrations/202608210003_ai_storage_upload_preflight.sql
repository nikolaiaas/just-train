drop policy if exists "Requesters can upload reserved family AI inputs"
on storage.objects;

create policy "Requesters can upload reserved family AI inputs"
on storage.objects for insert to authenticated
with check (
  storage.objects.bucket_id = 'ai-media-private'
  and storage.objects.owner_id = (select auth.uid())::text
  and case
    when storage.objects.metadata ? 'contentLength'
      and storage.objects.metadata ? 'size'
    then case
      when coalesce(
        (storage.objects.metadata ->> 'contentLength') ~ '^[0-9]{1,8}$',
        false
      )
        and coalesce(
          (storage.objects.metadata ->> 'size') ~ '^[0-9]{1,8}$',
          false
        )
      then (storage.objects.metadata ->> 'contentLength')::bigint
        = (storage.objects.metadata ->> 'size')::bigint
      else false
    end
    when storage.objects.metadata ? 'contentLength'
    then coalesce(
      (storage.objects.metadata ->> 'contentLength') ~ '^[0-9]{1,8}$',
      false
    )
    when storage.objects.metadata ? 'size'
    then coalesce(
      (storage.objects.metadata ->> 'size') ~ '^[0-9]{1,8}$',
      false
    )
    else false
  end
  and private.can_upload_reserved_ai_input(
    storage.objects.bucket_id,
    storage.objects.name,
    storage.objects.metadata ->> 'mimetype',
    case
      when coalesce(
        (storage.objects.metadata ->> 'contentLength') ~ '^[0-9]{1,8}$',
        false
      )
      then (storage.objects.metadata ->> 'contentLength')::bigint
      when coalesce(
        (storage.objects.metadata ->> 'size') ~ '^[0-9]{1,8}$',
        false
      )
      then (storage.objects.metadata ->> 'size')::bigint
      else null
    end
  )
);

comment on policy "Requesters can upload reserved family AI inputs"
on storage.objects is
  'Allows only the requester to upload a pre-reserved family AI input. Current Storage preflights use contentLength; the previous size shape remains supported, while malformed or conflicting values are rejected.';
