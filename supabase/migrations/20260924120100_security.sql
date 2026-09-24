-- Access control: grants, Row Level Security, signup domain restriction, profile provisioning.
--
-- Model:
--   anon (public manager view) -> SELECT only, only data of profiles with is_public = true,
--                                 only non-sensitive columns, only confirmed documents.
--   authenticated @gosaas.ai   -> read public data + own data; write only own rows.
-- Hiding UI controls is NOT the security boundary; these rules are.

-- Helper functions in app_private are pure and called from RLS/metric code running as the caller.
-- app_private is not exposed through the Data API, so usage here grants no endpoint access.
grant usage on schema app_private to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Baseline: strip Supabase's default broad grants, then grant precisely.
-- ---------------------------------------------------------------------------

revoke all on public.profiles, public.qa_records, public.qa_documents, public.qa_record_metrics
  from anon, authenticated;

-- profiles: anon never sees email; users may only change presentation/config columns.
grant select (id, display_name, public_slug, is_public, role, reporting_period_days, reporting_period_anchor, created_at)
  on public.profiles to anon;
grant select on public.profiles to authenticated;
grant update (display_name, public_slug, is_public, reporting_period_days, reporting_period_anchor)
  on public.profiles to authenticated;

-- qa_records: read for both; writes only for authenticated (further restricted by RLS).
grant select on public.qa_records to anon, authenticated;
grant insert, update, delete on public.qa_records to authenticated;

-- qa_documents: anon may see file metadata of confirmed reports, never the raw AI extraction.
grant select (id, owner_id, record_id, storage_path, file_name, mime_type, size_bytes,
              extraction_status, confirmed_at, created_at)
  on public.qa_documents to anon;
grant select, insert, update, delete on public.qa_documents to authenticated;

grant select on public.qa_record_metrics to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.qa_records enable row level security;
alter table public.qa_documents enable row level security;

-- Is this profile visible to the caller (public, or the caller's own)?
create or replace function app_private.can_view_owner(p_owner uuid)
returns boolean language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_owner and (p.is_public or p.id = auth.uid())
  )
$$;

-- profiles
create policy "profiles: read public or own" on public.profiles
  for select to anon, authenticated
  using (is_public or id = (select auth.uid()));

create policy "profiles: update own" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) and (select public.is_qa_user()))
  with check (id = (select auth.uid()) and (select public.is_qa_user()));

-- qa_records
create policy "qa_records: read visible" on public.qa_records
  for select to anon, authenticated
  using (app_private.can_view_owner(owner_id));

create policy "qa_records: insert own" on public.qa_records
  for insert to authenticated
  with check (owner_id = (select auth.uid()) and (select public.is_qa_user()));

create policy "qa_records: update own" on public.qa_records
  for update to authenticated
  using (owner_id = (select auth.uid()) and (select public.is_qa_user()))
  with check (owner_id = (select auth.uid()) and (select public.is_qa_user()));

create policy "qa_records: delete own" on public.qa_records
  for delete to authenticated
  using (owner_id = (select auth.uid()) and (select public.is_qa_user()));

-- qa_documents: drafts/unconfirmed extractions are private to the owner.
create policy "qa_documents: read own" on public.qa_documents
  for select to authenticated
  using (owner_id = (select auth.uid()));

create policy "qa_documents: read confirmed public" on public.qa_documents
  for select to anon, authenticated
  using (
    extraction_status = 'confirmed'
    and record_id is not null
    and app_private.can_view_owner(owner_id)
  );

create policy "qa_documents: insert own" on public.qa_documents
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and (select public.is_qa_user())
    and extraction_status = 'pending'
    and record_id is null
  );

create policy "qa_documents: update own" on public.qa_documents
  for update to authenticated
  using (owner_id = (select auth.uid()) and (select public.is_qa_user()))
  with check (owner_id = (select auth.uid()) and (select public.is_qa_user()));

create policy "qa_documents: delete own" on public.qa_documents
  for delete to authenticated
  using (owner_id = (select auth.uid()) and (select public.is_qa_user()));

-- Function execution: metrics are read-only and RLS-scoped; confirm requires a QA user.
revoke execute on function public.confirm_extraction(uuid, jsonb) from public, anon;
grant execute on function public.confirm_extraction(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Signup restriction (layer 1): Supabase Auth "before user created" hook.
-- Rejects non-@gosaas.ai signups with a clear message before the user exists.
-- ---------------------------------------------------------------------------

create or replace function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
begin
  if app_private.is_allowed_email(event -> 'user' ->> 'email') then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'message', 'Only @' || app_private.allowed_email_domain() || ' accounts can sign in.'
    )
  );
end;
$$;

revoke execute on function public.hook_before_user_created(jsonb) from public, anon, authenticated;
grant usage on schema app_private to supabase_auth_admin;
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;

-- ---------------------------------------------------------------------------
-- Signup restriction (layer 2) + profile provisioning: trigger on auth.users.
-- Enforced even if the hook is not enabled in the hosted project settings.
-- ---------------------------------------------------------------------------

create or replace function app_private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_local text;
  v_base text;
  v_slug text;
  v_n int := 1;
  v_name text;
begin
  if not app_private.is_allowed_email(new.email) then
    raise exception 'Only @% accounts can sign in.', app_private.allowed_email_domain()
      using errcode = '42501';
  end if;

  v_local := lower(split_part(new.email, '@', 1));
  -- Slug from the first name part of the email (abdullah.butt@ -> abdullah); editable later.
  v_base := trim(both '-' from regexp_replace(split_part(regexp_replace(v_local, '[._+]', ' ', 'g'), ' ', 1), '[^a-z0-9]+', '-', 'g'));
  if v_base = '' or length(v_base) < 2 then
    v_base := 'qa-' || left(replace(new.id::text, '-', ''), 8);
  end if;
  v_base := left(v_base, 36);
  v_slug := v_base;
  while exists (select 1 from public.profiles where public_slug = v_slug)
        or v_slug in ('api', 'app', 'auth', 'login', 'logout', 'settings', 'admin', 'static', 'public',
                      'upload', 'review', 'tickets', 'workspace', 'dashboard', 'account') loop
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n;
  end loop;

  v_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
    initcap(regexp_replace(v_local, '[._+]+', ' ', 'g'))
  );

  insert into public.profiles (id, email, display_name, public_slug)
  values (new.id, lower(new.email), v_name, v_slug);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app_private.handle_new_user();
