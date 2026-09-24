-- Run with: npm run db:test (resets the local DB first)
begin;
create extension if not exists pgtap with schema extensions;
select plan(39);

-- Fixtures -------------------------------------------------------------------
-- QA 1 (seed): abdullah.butt@gosaas.ai = ...0001, 3 tickets.
-- QA 2: second.qa@gosaas.ai = ...0002 with the legacy is_public flag OFF, to prove it no longer hides anything.
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
values ('00000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'second.qa@gosaas.ai', '{}');
update public.profiles set is_public = false where id = '00000000-0000-4000-8000-000000000002';
insert into public.qa_records (id, owner_id, ticket_number, title, qa_status, qa_completed_on, data)
values ('00000000-0000-4000-7000-000000000002', '00000000-0000-4000-8000-000000000002', 'CHG-SECOND', 'Second QA ticket',
        'qa_completed', current_date,
        '{"schema_version":1,"test_cases":[{"status":"pass"},{"status":"pass"},{"status":"fail"}]}');

-- QA 1 has an unconfirmed draft (with raw AI output); QA 2 has a confirmed report on its ticket.
insert into public.qa_documents (id, owner_id, storage_path, file_name, mime_type, size_bytes, extraction_status, extraction)
values
  ('00000000-0000-4000-9000-000000000001', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000001/d1/draft.pdf', 'draft.pdf', 'application/pdf', 10, 'ready_for_review', '{"secret":"draft"}'),
  ('00000000-0000-4000-9000-000000000002', '00000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000000002/d2/final.pdf', 'final.pdf', 'application/pdf', 10, 'confirmed', '{"raw":"ai output"}');
update public.qa_documents set record_id = '00000000-0000-4000-7000-000000000002' where id = '00000000-0000-4000-9000-000000000002';

insert into storage.objects (bucket_id, name) values
  ('qa-reports', '00000000-0000-4000-8000-000000000001/d1/draft.pdf'),
  ('qa-reports', '00000000-0000-4000-8000-000000000001/other/unlinked.pdf'),
  ('qa-reports', '00000000-0000-4000-8000-000000000002/d2/final.pdf');

-- Signup domain restriction ---------------------------------------------------
select throws_ok(
  $$ insert into auth.users (id, instance_id, aud, role, email) values
     (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'someone@gmail.com') $$,
  '42501', null, 'non-gosaas signup rejected by trigger');
select is(public.hook_before_user_created('{"user":{"email":"a@gmail.com"}}') -> 'error' ->> 'http_code', '403', 'hook rejects other domain');
select is(public.hook_before_user_created('{"user":{"email":"a@GoSaaS.ai"}}'), '{}'::jsonb, 'hook allows gosaas.ai');
select is(public.hook_before_user_created('{"user":{"email":"a@evil.com@gosaas.ai"}}') -> 'error' ->> 'http_code', '403', 'hook rejects double-@');
select is((select public_slug from public.profiles where id = '00000000-0000-4000-8000-000000000001'), 'abdullah', 'slug derived from first name');

-- Anonymous manager: sees every QA, strictly read-only ------------------------
set local role anon;
select is((select count(*)::int from public.profiles), 2, 'manager sees every QA');
select is((select count(*)::int from public.profiles where id = '00000000-0000-4000-8000-000000000002'), 1,
  'is_public = false does NOT hide a QA from the manager');
select throws_ok($$ select email from public.profiles $$, '42501', null, 'manager cannot read emails');
select is((select count(*)::int from public.qa_records), 4, 'manager sees tickets of every QA');
select is((select count(*)::int from public.qa_records where ticket_number = 'CHG-SECOND'), 1, 'tickets of an is_public=false QA are visible');
select is((select count(*)::int from public.qa_documents where id = '00000000-0000-4000-9000-000000000001'), 0, 'manager cannot see unconfirmed documents');
select is((select count(*)::int from public.qa_documents where id = '00000000-0000-4000-9000-000000000002'), 1, 'manager sees confirmed reports of every QA');
select throws_ok($$ select extraction from public.qa_documents $$, '42501', null, 'manager cannot read raw AI extraction');
select throws_ok($$ select extraction_error from public.qa_documents $$, '42501', null, 'manager cannot read extraction errors');
select throws_ok($$ insert into public.qa_records (owner_id, ticket_number) values ('00000000-0000-4000-8000-000000000001', 'X') $$,
  '42501', null, 'manager cannot insert');
select throws_ok($$ update public.qa_records set title = 'hacked' $$, '42501', null, 'manager cannot update');
select throws_ok($$ delete from public.qa_records $$, '42501', null, 'manager cannot delete');
select throws_ok($$ update public.profiles set display_name = 'x' $$, '42501', null, 'manager cannot edit profiles');
select throws_ok($$ delete from public.qa_documents $$, '42501', null, 'manager cannot delete documents');
select throws_ok($$ select public.confirm_extraction('00000000-0000-4000-9000-000000000001', '{}') $$,
  '42501', null, 'manager cannot confirm extraction');
select is((select array_agg(name order by name)::text from storage.objects where bucket_id = 'qa-reports'),
  '{00000000-0000-4000-8000-000000000002/d2/final.pdf}', 'manager can read confirmed report files only (no drafts)');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('qa-reports', '00000000-0000-4000-8000-000000000001/x/y.pdf') $$,
  '42501', null, 'manager cannot upload files');
select is((select test_cases_executed from public.qa_metrics_for_range('00000000-0000-4000-8000-000000000002', current_date - 30, current_date)), 3,
  'manager can filter metrics to one QA');
select is(
  (select test_cases_executed from public.qa_metrics_for_range(null, current_date - 30, current_date)),
  (select test_cases_executed from public.qa_metrics_for_range('00000000-0000-4000-8000-000000000001', current_date - 30, current_date))
  + (select test_cases_executed from public.qa_metrics_for_range('00000000-0000-4000-8000-000000000002', current_date - 30, current_date)),
  'All QAs metrics equal the sum across every QA');
select is((select count(*)::int from public.reporting_periods(null, 3)), 3, 'team view has default reporting periods');
select is((select period_end - period_start + 1 from public.reporting_periods(null, 1)), 14, 'team periods are 14 days');
reset role;

-- Authenticated QA 1: own data only --------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","email":"abdullah.butt@gosaas.ai","role":"authenticated"}', true);
select is((select count(*)::int from public.qa_documents), 1, 'QA sees only own documents (incl. own draft)');
select is((select count(*)::int from public.qa_records where owner_id = '00000000-0000-4000-8000-000000000002'), 0, 'QA cannot read another QA''s tickets');
select is((select count(*)::int from public.profiles), 1, 'QA sees only own profile (no colleague emails)');
select is((select count(*)::int from storage.objects where name like '00000000-0000-4000-8000-000000000002/%'), 0, 'QA cannot read another QA''s files');
select is(
  (select test_cases_executed from public.qa_metrics_for_range(null, current_date - 30, current_date)),
  (select test_cases_executed from public.qa_metrics_for_range('00000000-0000-4000-8000-000000000001', current_date - 30, current_date)),
  'QA team metrics only include their own rows');
select lives_ok($$ update public.qa_records set title = title || '' where ticket_number = 'CHG0045893' $$, 'QA can update own ticket');
update public.qa_records set title = 'hijack' where ticket_number = 'CHG-SECOND';
delete from public.qa_records where ticket_number = 'CHG-SECOND';
select throws_ok($$ insert into public.qa_records (owner_id, ticket_number) values ('00000000-0000-4000-8000-000000000002', 'X') $$,
  '42501', null, 'QA cannot insert for another owner');
select throws_ok($$ update public.profiles set role = 'admin' where id = '00000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'QA cannot escalate own role');
select lives_ok($$ select public.confirm_extraction('00000000-0000-4000-9000-000000000001',
  '{"ticket_number":"CHG0099999","title":"New","qa_status":"qa_completed","qa_completed_on":"2026-09-20","data":{"schema_version":1,"test_cases":[{"status":"pass"}]}}') $$,
  'QA can confirm own extraction');
reset role;

select is((select title from public.qa_records where ticket_number = 'CHG-SECOND'), 'Second QA ticket', 'another QA''s ticket cannot be modified or deleted');
select is((select test_cases_passed from public.qa_record_metrics where ticket_number = 'CHG0099999'), 1, 'metrics view derives from JSONB');
select is((select extraction_status::text from public.qa_documents where id = '00000000-0000-4000-9000-000000000001'), 'confirmed', 'document marked confirmed');

set local role anon;
select is((select count(*)::int from storage.objects where name = '00000000-0000-4000-8000-000000000001/d1/draft.pdf'), 1,
  'once confirmed, the report becomes manager-visible');
reset role;

select * from finish();
rollback;
