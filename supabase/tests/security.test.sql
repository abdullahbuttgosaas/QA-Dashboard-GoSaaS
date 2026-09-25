-- Run with: npm run db:test (resets the local DB first)
begin;
create extension if not exists pgtap with schema extensions;
select plan(66);

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

-- QA 3: calendar fixtures with fixed dates around Friday 2026-09-25.
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
values ('00000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'calendar.qa@gosaas.ai', '{}');
insert into public.qa_records (owner_id, ticket_number, qa_status, assigned_on, qa_completed_on, data) values
  ('00000000-0000-4000-8000-000000000003', 'CAL-MON',     'qa_completed', '2026-08-31', '2026-09-14', '{"test_cases":[{"status":"pass"}]}'),
  ('00000000-0000-4000-8000-000000000003', 'CAL-FRI',     'qa_completed', null,         '2026-09-25', '{"test_cases":[{"status":"pass"},{"status":"fail"}],"retests":[{"result":"pass"}]}'),
  ('00000000-0000-4000-8000-000000000003', 'CAL-SUN',     'qa_completed', '2026-09-13', '2026-09-13', '{"test_cases":[{"status":"pass"}]}'),
  ('00000000-0000-4000-8000-000000000003', 'CAL-SAT-IN',  'qa_completed', null,         '2026-09-19', '{"test_cases":[{"status":"pass"}]}'),
  ('00000000-0000-4000-8000-000000000003', 'CAL-SAT-OUT', 'qa_completed', '2026-09-26', '2026-09-26', '{"test_cases":[{"status":"fail"}]}'),
  ('00000000-0000-4000-8000-000000000003', 'CAL-OPEN',    'in_progress',  '2026-09-22', null,
   '{"test_cases":[{"status":"blocked","executed_on":"2026-09-11"}],"bugs":[{"severity":"high","found_on":"2026-09-04"}]}');

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
select is((select count(*)::int from public.profiles), 3, 'manager sees every QA');
select is((select count(*)::int from public.profiles where id = '00000000-0000-4000-8000-000000000002'), 1,
  'is_public = false does NOT hide a QA from the manager');
select throws_ok($$ select email from public.profiles $$, '42501', null, 'manager cannot read emails');
select is((select count(*)::int from public.qa_records), 10, 'manager sees tickets of every QA');
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
select throws_ok($$ -- QA 3: calendar fixtures with fixed dates around Friday 2026-09-25.
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
values ('00000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'calendar.qa@gosaas.ai', '{}');
insert into public.qa_records (owner_id, ticket_number, qa_status, assigned_on, qa_completed_on, data) values
  ('00000000-0000-4000-8000-000000000003', 'CAL-MON',     'qa_completed', '2026-08-31', '2026-09-14', '{"test_cases":[{"status":"pass"}]}'),
  ('00000000-0000-4000-8000-000000000003', 'CAL-FRI',     'qa_completed', null,         '2026-09-25', '{"test_cases":[{"status":"pass"},{"status":"fail"}],"retests":[{"result":"pass"}]}'),
  ('00000000-0000-4000-8000-000000000003', 'CAL-SUN',     'qa_completed', '2026-09-13', '2026-09-13', '{"test_cases":[{"status":"pass"}]}'),
  ('00000000-0000-4000-8000-000000000003', 'CAL-SAT-IN',  'qa_completed', null,         '2026-09-19', '{"test_cases":[{"status":"pass"}]}'),
  ('00000000-0000-4000-8000-000000000003', 'CAL-SAT-OUT', 'qa_completed', '2026-09-26', '2026-09-26', '{"test_cases":[{"status":"fail"}]}'),
  ('00000000-0000-4000-8000-000000000003', 'CAL-OPEN',    'in_progress',  '2026-09-22', null,
   '{"test_cases":[{"status":"blocked","executed_on":"2026-09-11"}],"bugs":[{"severity":"high","found_on":"2026-09-04"}]}');

insert into storage.objects (bucket_id, name) values ('qa-reports', '00000000-0000-4000-8000-000000000001/x/y.pdf') $$,
  '42501', null, 'manager cannot upload files');
select is((select test_cases_executed from public.qa_metrics_for_range('00000000-0000-4000-8000-000000000002', current_date - 30, current_date)), 3,
  'manager can filter metrics to one QA');
select is(
  (select test_cases_executed from public.qa_metrics_for_range(null, current_date - 30, current_date)),
  (select test_cases_executed from public.qa_metrics_for_range('00000000-0000-4000-8000-000000000001', current_date - 30, current_date))
  + (select test_cases_executed from public.qa_metrics_for_range('00000000-0000-4000-8000-000000000002', current_date - 30, current_date))
  + (select test_cases_executed from public.qa_metrics_for_range('00000000-0000-4000-8000-000000000003', current_date - 30, current_date)),
  'All QAs metrics equal the sum across every QA');

-- Calendar weeks (manager, fixed "today" = Friday 2026-09-25) --------------------
select is((select array_agg(week_start || '..' || week_end order by week_index)::text
           from public.qa_metrics_by_week('00000000-0000-4000-8000-000000000003', 4, '2026-09-25')),
  '{2026-08-31..2026-09-04,2026-09-07..2026-09-11,2026-09-14..2026-09-18,2026-09-21..2026-09-25}',
  '2-week period: comparison Aug 31-Sep 4 + Sep 7-11, current Sep 14-18 + Sep 21-25');
select is((select count(*)::int from public.qa_metrics_by_week(null, 2, '2026-09-25')), 2, '1-week configuration: 2 buckets (current + comparison)');
select is((select count(*)::int from public.qa_metrics_by_week(null, 8, '2026-09-25')), 8, '4-week configuration: 8 buckets (current + comparison)');
select is((select min(week_start)::text || '..' || max(week_end)::text from public.qa_metrics_by_week(null, 8, '2026-09-25')),
  '2026-08-03..2026-09-25', '4-week configuration spans Aug 3 - Sep 25');
select is((select count(*)::int from public.qa_metrics_by_week(null, 8, '2026-09-25')
           where extract(isodow from week_start) = 1 and extract(isodow from week_end) = 5 and week_end - week_start = 4), 8,
  'every bucket is a complete Monday-Friday calendar week');
select is((select week_start::text from public.qa_metrics_by_week(null, 1, '2026-09-26')), '2026-09-21', 'a Saturday "today" belongs to the week just ended');
select is((select week_start::text from public.qa_metrics_by_week(null, 1, '2026-09-28')), '2026-09-28', 'Monday starts a new week');
select is((select test_cases_executed from public.qa_metrics_by_week('00000000-0000-4000-8000-000000000003', 4, '2026-09-25') where week_start = '2026-09-14'), 1,
  'record completed on Monday Sep 14 is included in its week');
select is((select test_cases_executed from public.qa_metrics_by_week('00000000-0000-4000-8000-000000000003', 4, '2026-09-25') where week_start = '2026-09-21'), 2,
  'record completed on Friday Sep 25 is included in its week');
select is((select tickets_completed from public.qa_metrics_by_week('00000000-0000-4000-8000-000000000003', 4, '2026-09-25') where week_start = '2026-09-14'), 1,
  'Saturday Sep 19 inside the period is not counted');
select is((select sum(tickets_completed)::int from public.qa_metrics_by_week('00000000-0000-4000-8000-000000000003', 4, '2026-09-25')), 2,
  'preceding Sunday Sep 13 and following Saturday Sep 26 are excluded');
select is((select tickets_assigned from public.qa_metrics_by_week('00000000-0000-4000-8000-000000000003', 4, '2026-09-25') where week_start = '2026-08-31'), 1,
  'tickets assigned are bucketed by assigned date (Mon Aug 31)');
select is((select tickets_assigned from public.qa_metrics_by_week('00000000-0000-4000-8000-000000000003', 4, '2026-09-25') where week_start = '2026-09-21'), 1,
  'in-progress ticket assigned Tue Sep 22 counts as assigned in the current week');
select is((select test_cases_blocked from public.qa_metrics_by_week('00000000-0000-4000-8000-000000000003', 4, '2026-09-25') where week_start = '2026-09-07'), 1,
  'test cases use their execution date (Fri Sep 11)');
select is((select bugs_high from public.qa_metrics_by_week('00000000-0000-4000-8000-000000000003', 4, '2026-09-25') where week_start = '2026-08-31'), 1,
  'bugs use their found date (Fri Sep 4)');
select is((select retests_passed from public.qa_metrics_by_week('00000000-0000-4000-8000-000000000003', 4, '2026-09-25') where week_start = '2026-09-21'), 1,
  'retests without their own date fall back to the ticket completion date');
select is(
  (select sum(test_cases_executed)::int from public.qa_metrics_by_week(null, 4, '2026-09-25')),
  (select sum(test_cases_executed)::int from public.qa_metrics_by_week('00000000-0000-4000-8000-000000000001', 4, '2026-09-25'))
  + (select sum(test_cases_executed)::int from public.qa_metrics_by_week('00000000-0000-4000-8000-000000000002', 4, '2026-09-25'))
  + (select sum(test_cases_executed)::int from public.qa_metrics_by_week('00000000-0000-4000-8000-000000000003', 4, '2026-09-25')),
  'weekly All QAs buckets equal the sum of every QA');
select is((select reporting_period_weeks from public.profiles where id = '00000000-0000-4000-8000-000000000003'), 2,
  'manager can read the weeks setting (default 2)');
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
select is((select count(*)::int from public.qa_metrics_by_week('00000000-0000-4000-8000-000000000003', 4, '2026-09-25') where test_cases_executed > 0), 0,
  'QA weekly metrics never include another QA''s rows');
select lives_ok($$ update public.profiles set reporting_period_weeks = 4 where id = '00000000-0000-4000-8000-000000000001' $$, 'QA can set own reporting weeks');
select throws_ok($$ update public.profiles set reporting_period_weeks = 13 where id = '00000000-0000-4000-8000-000000000001' $$,
  '23514', null, 'reporting weeks limited to 1-12');

-- Ticket status vs QA completed date (database enforcement) ---------------------
select lives_ok($$ insert into public.qa_records (owner_id, ticket_number, qa_status, qa_completed_on)
  values ('00000000-0000-4000-8000-000000000001', 'ST-1', 'assigned', null) $$, 'assigned without completion date is valid');
select throws_ok($$ insert into public.qa_records (owner_id, ticket_number, qa_status, qa_completed_on)
  values ('00000000-0000-4000-8000-000000000001', 'ST-2', 'assigned', '2026-09-25') $$, '23514', null, 'assigned with completion date is rejected');
select lives_ok($$ insert into public.qa_records (owner_id, ticket_number, qa_status, qa_completed_on)
  values ('00000000-0000-4000-8000-000000000001', 'ST-3', 'in_progress', null) $$, 'in progress without completion date is valid');
select throws_ok($$ insert into public.qa_records (owner_id, ticket_number, qa_status, qa_completed_on)
  values ('00000000-0000-4000-8000-000000000001', 'ST-4', 'in_progress', '2026-09-25') $$, '23514', null, 'in progress with completion date is rejected');
select lives_ok($$ insert into public.qa_records (owner_id, ticket_number, qa_status, qa_completed_on)
  values ('00000000-0000-4000-8000-000000000001', 'ST-5', 'qa_completed', '2026-09-25') $$, 'QA completed with completion date is valid');
select throws_ok($$ update public.qa_records set qa_status = 'in_progress' where ticket_number = 'ST-5' $$,
  '23514', null, 'QA completed -> in progress while keeping the date is rejected');
select lives_ok($$ update public.qa_records set qa_status = 'in_progress', qa_completed_on = null where ticket_number = 'ST-5' $$,
  'QA completed -> in progress with the date cleared is accepted');
select throws_ok($$ select public.confirm_extraction('00000000-0000-4000-9000-000000000001',
  '{"ticket_number":"ST-6","qa_status":"assigned","qa_completed_on":"2026-09-25","data":{"schema_version":1}}') $$,
  '23514', null, 'confirming an extraction cannot create an assigned ticket with a completion date');
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
