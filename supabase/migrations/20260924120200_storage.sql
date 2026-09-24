-- Private bucket for original QA report documents.
-- Object path convention: {owner_id}/{document_id}/{file_name}
-- Files are never public URLs; access is via short-lived signed URLs checked by these policies.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'qa-reports',
  'qa-reports',
  false,
  26214400, -- 25 MB
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/markdown'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Owner can upload into their own folder only.
create policy "qa-reports: insert own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'qa-reports'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.is_qa_user())
  );

-- Owner can read everything in their folder (including drafts under review).
create policy "qa-reports: read own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'qa-reports'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Anyone may read a report once it is confirmed and attached to a ticket on a public profile.
create policy "qa-reports: read confirmed public" on storage.objects
  for select to anon, authenticated
  using (
    bucket_id = 'qa-reports'
    and exists (
      select 1
      from public.qa_documents d
      where d.storage_path = storage.objects.name
        and d.extraction_status = 'confirmed'
        and d.record_id is not null
        and app_private.can_view_owner(d.owner_id)
    )
  );

create policy "qa-reports: delete own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'qa-reports'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.is_qa_user())
  );
