-- Upload & extract into an existing ticket: replace_record_from_extraction (run with: npm run db:test)
begin;
create extension if not exists pgtap with schema extensions;
select plan(46);

-- Fixtures (as postgres) -------------------------------------------------------
-- QA 1 = seed user ...0001; QA 2 = ...0002.
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
values ('00000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'second.qa@gosaas.ai', '{}');

-- The existing ticket: completed, full report data, an original confirmed report.
insert into public.qa_records (id, owner_id, ticket_number, title, functional_area, qa_status, assigned_on, qa_completed_on, data)
values ('00000000-0000-4000-7000-00000000aa01', '00000000-0000-4000-8000-000000000001', 'REPL-1', 'Old title', 'Old area',
        'qa_completed', '2026-09-11', '2026-09-15',
        '{"schema_version":1,"summary":"Old overview","environment":"Old env",
          "requirements":[{"ref":"R1"},{"ref":"R2"}],
          "test_cases":[{"ref":"T1","status":"pass"},{"ref":"T2","status":"pass"},{"ref":"T3","status":"fail"},{"ref":"T4","status":"pass"},{"ref":"T5","status":"blocked"}],
          "bugs":[{"ref":"B1","severity":"high"},{"ref":"B2","severity":"low"},{"ref":"B3","severity":"medium"}],
          "retests":[{"result":"pass"},{"result":"fail"}],
          "evidence":[{"description":"old screenshot"}],
          "custom_fields":{"Old field":"old value"},
          "custom_sections":[{"title":"Old section","content":"old"}]}');
-- QA 2's ticket.
insert into public.qa_records (id, owner_id, ticket_number, title, qa_status, data)
values ('00000000-0000-4000-7000-00000000aa02', '00000000-0000-4000-8000-000000000002', 'OTHER-1', 'QA 2 ticket', 'assigned', '{}');

insert into public.qa_documents (id, owner_id, storage_path, file_name, mime_type, size_bytes, extraction_status, extraction, replaces_record_id) values
  -- d0: the ticket's original confirmed report (linked below)
  ('00000000-0000-4000-9000-00000000ab00', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001/r0/original.pdf', 'original.pdf', 'application/pdf', 10, 'confirmed', '{"raw":{}}', null),
  -- d1: replacement draft, ready for review
  ('00000000-0000-4000-9000-00000000ab01', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001/r1/new.pdf', 'new.pdf', 'application/pdf', 10, 'ready_for_review', '{"raw":{"secret":"draft"}}', '00000000-0000-4000-7000-00000000aa01'),
  -- d2: replacement whose extraction failed
  ('00000000-0000-4000-9000-00000000ab02', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001/r2/bad.pdf', 'bad.pdf', 'application/pdf', 10, 'failed', null, '00000000-0000-4000-7000-00000000aa01'),
  -- d3: QA 1's document aimed at QA 2's ticket
  ('00000000-0000-4000-9000-00000000ab03', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001/r3/x.pdf', 'x.pdf', 'application/pdf', 10, 'ready_for_review', '{}', '00000000-0000-4000-7000-00000000aa02'),
  -- d4: QA 2's document aimed at QA 1's ticket
  ('00000000-0000-4000-9000-00000000ab04', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002/r4/y.pdf', 'y.pdf', 'application/pdf', 10, 'ready_for_review', '{}', '00000000-0000-4000-7000-00000000aa01'),
  -- d5: standalone upload (no target)
  ('00000000-0000-4000-9000-00000000ab05', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001/r5/z.pdf', 'z.pdf', 'application/pdf', 10, 'ready_for_review', '{}', null),
  -- d6: replacement used for the invalid-payload (atomicity) test
  ('00000000-0000-4000-9000-00000000ab06', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001/r6/w.pdf', 'w.pdf', 'application/pdf', 10, 'ready_for_review', '{}', '00000000-0000-4000-7000-00000000aa01'),
  -- d7: second replacement (completed report) for the reporting-attribution test
  ('00000000-0000-4000-9000-00000000ab07', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001/r7/v.pdf', 'v.pdf', 'application/pdf', 10, 'ready_for_review', '{}', '00000000-0000-4000-7000-00000000aa01');
update public.qa_documents set record_id = '00000000-0000-4000-7000-00000000aa01', confirmed_at = now()
 where id = '00000000-0000-4000-9000-00000000ab00';
update public.qa_records set source_document_id = '00000000-0000-4000-9000-00000000ab00'
 where id = '00000000-0000-4000-7000-00000000aa01';

-- Snapshot of the ticket, to prove failed attempts change nothing.
create temp table before_ticket as select * from public.qa_records where id = '00000000-0000-4000-7000-00000000aa01';
grant select on before_ticket to anon, authenticated;
create function pg_temp.ticket_unchanged() returns boolean language sql as $$
  select (r.title, r.functional_area, r.qa_status, r.assigned_on, r.qa_completed_on, r.source_document_id, r.data, r.ticket_number)
         is not distinct from
         (b.title, b.functional_area, b.qa_status, b.assigned_on, b.qa_completed_on, b.source_document_id, b.data, b.ticket_number)
    from public.qa_records r, before_ticket b where r.id = b.id
$$;

-- Manager (anon): cannot replace, cannot see replacement drafts -------------------
set local role anon;
select throws_ok($$ select public.replace_record_from_extraction('00000000-0000-4000-9000-00000000ab01', '{}') $$,
  '42501', null, 'manager cannot execute the replacement');
select is((select count(*)::int from public.qa_documents where id = '00000000-0000-4000-9000-00000000ab01'), 0,
  'manager cannot see the unconfirmed replacement draft');
select throws_ok($$ select replaces_record_id from public.qa_documents $$, '42501', null,
  'manager cannot read replacement targets');
select is((select title from public.qa_records where id = '00000000-0000-4000-7000-00000000aa01'), 'Old title',
  'manager sees the old confirmed data before replacement');
reset role;

-- QA 1 -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","email":"abdullah.butt@gosaas.ai","role":"authenticated"}', true);

select throws_ok($$ select public.confirm_extraction('00000000-0000-4000-9000-00000000ab01', '{"ticket_number":"REPL-1"}') $$,
  'P0001', 'This report replaces an existing ticket; confirm it from the replacement review',
  'a replacement draft cannot go through the standalone confirm (it would overwrite assigned_on)');
select throws_ok($$ select public.replace_record_from_extraction('00000000-0000-4000-9000-00000000ab02', '{"title":"x"}') $$,
  'P0001', 'Document is not awaiting review (status: failed)', 'failed extraction cannot replace the ticket');
select ok(pg_temp.ticket_unchanged(), 'failed extraction leaves the ticket completely unchanged');
select throws_ok($$ select public.replace_record_from_extraction('00000000-0000-4000-9000-00000000ab03', '{"title":"x"}') $$,
  'P0002', 'Ticket not found', 'QA cannot replace another QA''s ticket');
select throws_ok($$ select public.replace_record_from_extraction('00000000-0000-4000-9000-00000000ab04', '{"title":"x"}') $$,
  'P0002', 'Document not found', 'QA cannot use another QA''s document');
select throws_ok($$ select public.replace_record_from_extraction('00000000-0000-4000-9000-00000000ab05', '{"title":"x"}') $$,
  'P0001', 'Document is not a replacement for an existing ticket', 'standalone upload cannot replace a ticket');
-- Status rule still enforced by the database: Assigned + completion date is rejected, and nothing is half-applied.
select throws_ok($$ select public.replace_record_from_extraction('00000000-0000-4000-9000-00000000ab06',
  '{"title":"Half","qa_status":"assigned","qa_completed_on":"2026-09-20","data":{"schema_version":1,"bugs":[]}}') $$,
  '23514', null, 'invalid status/completion date is rejected');
select ok(pg_temp.ticket_unchanged(), 'rejected replacement leaves the ticket completely unchanged (atomic)');
select is((select extraction_status::text from public.qa_documents where id = '00000000-0000-4000-9000-00000000ab06'), 'ready_for_review',
  'rejected replacement leaves the document unconfirmed');
select ok(pg_temp.ticket_unchanged(), 'drafts awaiting review do not change the ticket (cancel = no change)');

-- The replacement: new data has no status, no completion date, 1 bug, 8 test cases, 4 requirements, nothing else.
-- It also tries to change the ticket number and assigned date, which must be ignored.
select lives_ok($$ select public.replace_record_from_extraction('00000000-0000-4000-9000-00000000ab01',
  '{"ticket_number":"HACKED","assigned_on":"2020-01-01","title":"New title","functional_area":null,"qa_status":"assigned",
    "qa_completed_on":null,
    "data":{"schema_version":1,"summary":"New overview","environment":"",
      "requirements":[{"ref":"N1"},{"ref":"N2"},{"ref":"N3"},{"ref":"N4"}],
      "test_cases":[{"ref":"NT1","status":"pass"},{"ref":"NT2","status":"pass"},{"ref":"NT3","status":"pass"},{"ref":"NT4","status":"pass"},
                    {"ref":"NT5","status":"fail"},{"ref":"NT6","status":"pass"},{"ref":"NT7","status":"not_run"},{"ref":"NT8","status":"pass"}],
      "bugs":[{"ref":"NB1","severity":"critical"}],
      "retests":[],"evidence":[],"custom_fields":{},"custom_sections":[]}}') $$,
  'QA replaces own ticket from a reviewed extraction');

select is((select count(*)::int from public.qa_records where id = '00000000-0000-4000-7000-00000000aa01'
           and owner_id = '00000000-0000-4000-8000-000000000001'), 1, 'ticket id and owner unchanged');
select is((select count(*)::int from public.qa_records where owner_id = '00000000-0000-4000-8000-000000000001'
           and ticket_number in ('REPL-1', 'HACKED')), 1, 'no second ticket was created');
select is((select assigned_on from public.qa_records where id = '00000000-0000-4000-7000-00000000aa01'), '2026-09-11'::date,
  'assigned_on preserved');
select is((select ticket_number from public.qa_records where id = '00000000-0000-4000-7000-00000000aa01'), 'REPL-1',
  'ticket number preserved');
select is((select title from public.qa_records where id = '00000000-0000-4000-7000-00000000aa01'), 'New title', 'title replaced');
select is((select functional_area from public.qa_records where id = '00000000-0000-4000-7000-00000000aa01'), null,
  'functional area cleared (absent in the document)');
select is((select qa_status::text from public.qa_records where id = '00000000-0000-4000-7000-00000000aa01'), 'assigned',
  'old status QA completed does not survive');
select is((select qa_completed_on from public.qa_records where id = '00000000-0000-4000-7000-00000000aa01'), null,
  'old completion date cleared');
select is((select data from public.qa_records where id = '00000000-0000-4000-7000-00000000aa01') ->> 'summary', 'New overview', 'overview replaced');
select is((select data from public.qa_records where id = '00000000-0000-4000-7000-00000000aa01') ->> 'environment', '', 'environment cleared');
select is((select jsonb_array_length(data -> 'bugs') from public.qa_records where id = '00000000-0000-4000-7000-00000000aa01'), 1,
  'bugs replaced, not appended (3 -> exactly 1)');
select is((select data -> 'bugs' -> 0 ->> 'ref' from public.qa_records where id = '00000000-0000-4000-7000-00000000aa01'), 'NB1',
  'only the new bug remains');
select is((select jsonb_array_length(data -> 'test_cases') from public.qa_records where id = '00000000-0000-4000-7000-00000000aa01'), 8,
  'test cases replaced, not appended (5 -> exactly 8)');
select is((select jsonb_array_length(data -> 'requirements') from public.qa_records where id = '00000000-0000-4000-7000-00000000aa01'), 4,
  'requirements replaced, not appended (2 -> exactly 4)');
select is((select jsonb_array_length(data -> 'retests') from public.qa_records where id = '00000000-0000-4000-7000-00000000aa01'), 0,
  'retests replaced (2 -> none)');
select is((select jsonb_array_length(data -> 'evidence') from public.qa_records where id = '00000000-0000-4000-7000-00000000aa01'), 0,
  'evidence replaced');
select is((select data -> 'custom_fields' from public.qa_records where id = '00000000-0000-4000-7000-00000000aa01'), '{}'::jsonb,
  'custom fields replaced');
select is((select jsonb_array_length(data -> 'custom_sections') from public.qa_records where id = '00000000-0000-4000-7000-00000000aa01'), 0,
  'custom sections replaced');
select is((select (extraction_status::text, record_id, confirmed_at is not null) from public.qa_documents
            where id = '00000000-0000-4000-9000-00000000ab01'),
  ('confirmed'::text, '00000000-0000-4000-7000-00000000aa01'::uuid, true), 'uploaded document confirmed and linked to the ticket');
select is((select source_document_id from public.qa_records where id = '00000000-0000-4000-7000-00000000aa01'),
  '00000000-0000-4000-9000-00000000ab01'::uuid, 'ticket data now sourced from the new document');
select is((select record_id from public.qa_documents where id = '00000000-0000-4000-9000-00000000ab00'),
  '00000000-0000-4000-7000-00000000aa01'::uuid, 'the original report stays attached (still downloadable)');
select throws_ok($$ select public.replace_record_from_extraction('00000000-0000-4000-9000-00000000ab01', '{"title":"again"}') $$,
  'P0001', 'Document is not awaiting review (status: confirmed)', 'the same replacement cannot be applied twice');

-- Reporting attribution still uses qa_completed_on (Mon-Fri 2025-03-03..07 has no other data).
select lives_ok($$ select public.replace_record_from_extraction('00000000-0000-4000-9000-00000000ab07',
  '{"title":"Completed","qa_status":"qa_completed","qa_completed_on":"2025-03-05",
    "data":{"schema_version":1,"test_cases":[{"status":"pass","executed_on":"2024-01-01"},{"status":"fail"}]}}') $$,
  'replacement with a completed report');
select is((select (tickets_completed, test_cases_executed, tickets_assigned)
             from public.qa_metrics_for_range('00000000-0000-4000-8000-000000000001', '2025-03-03', '2025-03-07')),
  (1, 2, 0), 'metrics attribute the replaced ticket to its new qa_completed_on (assigned_on unchanged)');
select is((select assigned_on from public.qa_records where id = '00000000-0000-4000-7000-00000000aa01'), '2026-09-11'::date,
  'assigned_on still preserved after a second replacement');
reset role;

-- QA 2 cannot see or touch QA 1's ticket or drafts ----------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000002","email":"second.qa@gosaas.ai","role":"authenticated"}', true);
select is((select count(*)::int from public.qa_documents where owner_id = '00000000-0000-4000-8000-000000000001'), 0,
  'another QA cannot see replacement documents');
select throws_ok($$ select public.replace_record_from_extraction('00000000-0000-4000-9000-00000000ab06', '{"title":"x"}') $$,
  'P0002', 'Document not found', 'another QA cannot confirm my replacement draft');
reset role;

-- Manager after replacement: sees the confirmed data and document, not the raw extraction --------------------------
set local role anon;
select is((select (title, qa_completed_on) from public.qa_records where id = '00000000-0000-4000-7000-00000000aa01'),
  ('Completed'::text, '2025-03-05'::date), 'manager sees the confirmed replacement');
select is((select count(*)::int from public.qa_documents where record_id = '00000000-0000-4000-7000-00000000aa01'), 3,
  'manager sees the confirmed reports of the ticket');
select throws_ok($$ select extraction from public.qa_documents $$, '42501', null, 'manager cannot read raw AI extraction');
select is((select count(*)::int from public.qa_documents where id = '00000000-0000-4000-9000-00000000ab06'), 0,
  'manager still cannot see unconfirmed replacement drafts');
reset role;

select * from finish();
rollback;
