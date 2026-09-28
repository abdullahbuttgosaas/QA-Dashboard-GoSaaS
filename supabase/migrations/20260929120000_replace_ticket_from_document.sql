-- Upload & extract a QA report INTO an existing ticket, replacing its report data.
--
-- A replacement upload is an ordinary private draft in qa_documents that also names the ticket it will replace
-- (replaces_record_id). Nothing touches the ticket until the QA confirms the reviewed extraction; then
-- replace_record_from_extraction() overwrites the ticket and links the document in one transaction.
--
-- record_id keeps its existing meaning ("confirmed report of this ticket"; manager visibility depends on it), so
-- drafts never set it.

alter table public.qa_documents
  add column replaces_record_id uuid references public.qa_records (id) on delete set null;

create index qa_documents_replaces_record_idx on public.qa_documents (replaces_record_id);

-- anon (manager) has column-level SELECT grants on qa_documents; the new column is intentionally not granted.

-- ---------------------------------------------------------------------------
-- Confirm a replacement. Runs as the caller (SECURITY INVOKER), so RLS applies on top of the explicit checks.
--
-- Preserved from the existing ticket: id, owner_id, ticket_number, assigned_on, created_at.
-- Everything else comes from the reviewed extraction; absent values are cleared, never kept from the old ticket.
-- ---------------------------------------------------------------------------
create or replace function public.replace_record_from_extraction(p_document_id uuid, p_record jsonb)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_doc public.qa_documents;
  v_record public.qa_records;
begin
  if not public.is_qa_user() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select * into v_doc from public.qa_documents where id = p_document_id for update;
  if not found or v_doc.owner_id <> auth.uid() then
    raise exception 'Document not found' using errcode = 'P0002';
  end if;
  if v_doc.replaces_record_id is null then
    raise exception 'Document is not a replacement for an existing ticket';
  end if;
  if v_doc.extraction_status <> 'ready_for_review' then
    raise exception 'Document is not awaiting review (status: %)', v_doc.extraction_status;
  end if;

  select * into v_record from public.qa_records where id = v_doc.replaces_record_id for update;
  if not found or v_record.owner_id <> auth.uid() then
    raise exception 'Ticket not found' using errcode = 'P0002';
  end if;

  update public.qa_records
     set title = coalesce(p_record ->> 'title', ''),
         functional_area = nullif(trim(p_record ->> 'functional_area'), ''),
         qa_status = coalesce((p_record ->> 'qa_status')::public.qa_status, 'assigned'),
         qa_completed_on = app_private.try_date(p_record ->> 'qa_completed_on'),
         source_document_id = v_doc.id,
         data = coalesce(p_record -> 'data', '{"schema_version": 1}'::jsonb)
   where id = v_record.id;

  update public.qa_documents
     set record_id = v_record.id,
         extraction_status = 'confirmed',
         confirmed_at = now()
   where id = v_doc.id;

  return v_record.id;
end;
$$;

revoke execute on function public.replace_record_from_extraction(uuid, jsonb) from public, anon;
grant execute on function public.replace_record_from_extraction(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- confirm_extraction: unchanged, except that a replacement draft can only be confirmed through
-- replace_record_from_extraction (otherwise it could upsert by ticket number and overwrite assigned_on).
-- ---------------------------------------------------------------------------
create or replace function public.confirm_extraction(p_document_id uuid, p_record jsonb)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_doc public.qa_documents;
  v_record_id uuid;
begin
  if not public.is_qa_user() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select * into v_doc from public.qa_documents where id = p_document_id for update;
  if not found or v_doc.owner_id <> auth.uid() then
    raise exception 'Document not found' using errcode = 'P0002';
  end if;
  if v_doc.replaces_record_id is not null then
    raise exception 'This report replaces an existing ticket; confirm it from the replacement review';
  end if;
  if v_doc.extraction_status not in ('ready_for_review', 'failed') then
    raise exception 'Document is not awaiting review (status: %)', v_doc.extraction_status;
  end if;

  insert into public.qa_records as r (
    owner_id, ticket_number, title, functional_area, qa_status, assigned_on, qa_completed_on,
    source_document_id, data
  ) values (
    auth.uid(),
    trim(p_record ->> 'ticket_number'),
    coalesce(p_record ->> 'title', ''),
    nullif(trim(p_record ->> 'functional_area'), ''),
    coalesce((p_record ->> 'qa_status')::public.qa_status, 'qa_completed'),
    app_private.try_date(p_record ->> 'assigned_on'),
    app_private.try_date(p_record ->> 'qa_completed_on'),
    v_doc.id,
    coalesce(p_record -> 'data', '{"schema_version": 1}'::jsonb)
  )
  on conflict (owner_id, ticket_number) do update set
    title = excluded.title,
    functional_area = excluded.functional_area,
    qa_status = excluded.qa_status,
    assigned_on = excluded.assigned_on,
    qa_completed_on = excluded.qa_completed_on,
    source_document_id = excluded.source_document_id,
    data = excluded.data
  returning r.id into v_record_id;

  update public.qa_documents
     set record_id = v_record_id,
         extraction_status = 'confirmed',
         confirmed_at = now()
   where id = v_doc.id;

  return v_record_id;
end;
$$;
