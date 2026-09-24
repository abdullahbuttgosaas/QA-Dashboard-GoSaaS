-- Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

-- Fixtures (seed provides abdullah.butt@gosaas.ai = ...0001 with public profile)
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
values ('00000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'private.person@gosaas.ai', '{}');
update public.profiles set is_public = false where id = '00000000-0000-4000-8000-000000000002';
insert into public.qa_records (owner_id, ticket_number, title)
values ('00000000-0000-4000-8000-000000000002', 'CHG-PRIVATE', 'Private ticket');
insert into public.qa_documents (id, owner_id, storage_path, file_name, mime_type, size_bytes, extraction_status, extraction)
values ('00000000-0000-4000-9000-000000000001', '00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000001/d1/draft.pdf', 'draft.pdf', 'application/pdf', 10,
        'ready_for_review', '{"secret":"draft"}');

insert into storage.objects (bucket_id, name) values
  ('qa-reports', '00000000-0000-4000-8000-000000000001/d1/draft.pdf'),
  ('qa-reports', '00000000-0000-4000-8000-000000000001/other/unlinked.pdf');

-- Signup domain restriction ---------------------------------------------------
select throws_ok(
  $$ insert into auth.users (id, instance_id, aud, role, email) values
     (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'someone@gmail.com') $$,
  '42501', null, 'non-gosaas signup rejected by trigger');
select is(public.hook_before_user_created('{"user":{"email":"a@gmail.com"}}') -> 'error' ->> 'http_code', '403', 'hook rejects other domain');
select is(public.hook_before_user_created('{"user":{"email":"a@GoSaaS.ai"}}'), '{}'::jsonb, 'hook allows gosaas.ai');
select is(public.hook_before_user_created('{"user":{"email":"a@evil.com@gosaas.ai"}}') -> 'error' ->> 'http_code', '403', 'hook rejects double-@');
select is((select public_slug from public.profiles where id = '00000000-0000-4000-8000-000000000001'), 'abdullah', 'slug derived from first name');

-- Anonymous (manager) ---------------------------------------------------------
set local role anon;
select is((select count(*)::int from public.profiles), 1, 'anon sees only public profiles');
select throws_ok($$ select email from public.profiles $$, '42501', null, 'anon cannot read emails');
select is((select count(*)::int from public.qa_records), 3, 'anon sees public tickets only');
select is((select count(*)::int from public.qa_records where ticket_number = 'CHG-PRIVATE'), 0, 'anon cannot see private tickets');
select is((select count(*)::int from public.qa_documents), 0, 'anon cannot see unconfirmed documents');
select throws_ok($$ select extraction from public.qa_documents $$, '42501', null, 'anon cannot read raw extraction');
select throws_ok($$ insert into public.qa_records (owner_id, ticket_number) values ('00000000-0000-4000-8000-000000000001', 'X') $$,
  '42501', null, 'anon cannot insert');
select throws_ok($$ update public.qa_records set title = 'hacked' $$, '42501', null, 'anon cannot update');
select throws_ok($$ delete from public.qa_records $$, '42501', null, 'anon cannot delete');
select throws_ok($$ select public.confirm_extraction('00000000-0000-4000-9000-000000000001', '{}') $$,
  '42501', null, 'anon cannot confirm extraction');
select is((select count(*)::int from storage.objects where bucket_id = 'qa-reports'), 0, 'anon cannot read draft report files');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('qa-reports', '00000000-0000-4000-8000-000000000001/x/y.pdf') $$,
  '42501', null, 'anon cannot upload files');
select is((select tickets_completed from public.qa_metrics_for_range('00000000-0000-4000-8000-000000000001', current_date - 30, current_date)), 2,
  'anon can read public metrics');
reset role;

-- Authenticated QA user (owner 0001) ------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","email":"abdullah.butt@gosaas.ai","role":"authenticated"}', true);
select is((select count(*)::int from public.qa_documents), 1, 'owner sees own draft documents');
select lives_ok($$ update public.qa_records set title = title || '' where ticket_number = 'CHG0045893' $$, 'owner can update own ticket');
update public.qa_records set title = 'hijack' where ticket_number = 'CHG-PRIVATE';
select throws_ok($$ insert into public.qa_records (owner_id, ticket_number) values ('00000000-0000-4000-8000-000000000002', 'X') $$,
  '42501', null, 'cannot insert for another owner');
select throws_ok($$ update public.profiles set role = 'admin' where id = '00000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'cannot escalate own role');
select lives_ok($$ select public.confirm_extraction('00000000-0000-4000-9000-000000000001',
  '{"ticket_number":"CHG0099999","title":"New","qa_status":"qa_completed","qa_completed_on":"2026-09-20","data":{"schema_version":1,"test_cases":[{"status":"pass"}]}}') $$,
  'owner can confirm own extraction');
reset role;

select is((select title from public.qa_records where ticket_number = 'CHG-PRIVATE'), 'Private ticket', 'other owner''s ticket untouched');
select is((select test_cases_passed from public.qa_record_metrics where ticket_number = 'CHG0099999'), 1, 'metrics view derives from JSONB');
select is((select extraction_status::text from public.qa_documents where id = '00000000-0000-4000-9000-000000000001'), 'confirmed', 'document marked confirmed');

set local role anon;
select is((select array_agg(name)::text from storage.objects where bucket_id = 'qa-reports'),
  '{00000000-0000-4000-8000-000000000001/d1/draft.pdf}', 'anon can read confirmed report file only');
reset role;

select * from finish();
rollback;
