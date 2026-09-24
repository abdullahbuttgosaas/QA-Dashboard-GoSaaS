-- Core schema: profiles, QA records (tickets), uploaded QA documents, and metric functions.
-- Flexible QA content lives in qa_records.data (JSONB); only fields needed for
-- ownership, lookup and period bucketing are relational columns.

create extension if not exists pgcrypto with schema extensions;

create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

create type public.user_role as enum ('qa', 'manager', 'admin');
create type public.qa_status as enum ('assigned', 'in_progress', 'qa_completed');
create type public.extraction_status as enum (
  'pending', 'processing', 'ready_for_review', 'confirmed', 'failed', 'discarded'
);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function app_private.allowed_email_domain()
returns text language sql immutable
as $$ select 'gosaas.ai'::text $$;

create or replace function app_private.is_allowed_email(p_email text)
returns boolean language sql immutable
as $$
  select p_email is not null
     and lower(split_part(p_email, '@', 2)) = app_private.allowed_email_domain()
     and array_length(string_to_array(p_email, '@'), 1) = 2
$$;

-- True when the caller is a signed-in user from the allowed domain.
create or replace function public.is_qa_user()
returns boolean language sql stable
set search_path = ''
as $$
  select auth.uid() is not null
     and app_private.is_allowed_email(auth.jwt() ->> 'email')
$$;

-- Lenient date parse for JSONB values; bad values count as "no date" instead of failing queries.
create or replace function app_private.try_date(p_value text)
returns date language plpgsql immutable
as $$
begin
  if p_value is null or p_value !~ '^\d{4}-\d{2}-\d{2}' then
    return null;
  end if;
  return left(p_value, 10)::date;
exception when others then
  return null;
end;
$$;

-- Returns p_value when it is a JSON array, otherwise an empty array.
create or replace function app_private.as_array(p_value jsonb)
returns jsonb language sql immutable
as $$ select case when jsonb_typeof(p_value) = 'array' then p_value else '[]'::jsonb end $$;

-- Structural check only; detailed validation happens in the app (zod) before writes.
create or replace function app_private.is_valid_qa_data(p_data jsonb)
returns boolean language sql immutable
as $$
  select jsonb_typeof(p_data) = 'object'
     and coalesce(jsonb_typeof(p_data -> 'requirements'), 'array') = 'array'
     and coalesce(jsonb_typeof(p_data -> 'test_cases'), 'array') = 'array'
     and coalesce(jsonb_typeof(p_data -> 'bugs'), 'array') = 'array'
     and coalesce(jsonb_typeof(p_data -> 'retests'), 'array') = 'array'
     and coalesce(jsonb_typeof(p_data -> 'evidence'), 'array') = 'array'
     and coalesce(jsonb_typeof(p_data -> 'custom_sections'), 'array') = 'array'
     and coalesce(jsonb_typeof(p_data -> 'custom_fields'), 'object') = 'object'
$$;

create or replace function app_private.set_updated_at()
returns trigger language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  display_name text not null,
  public_slug text not null unique,
  is_public boolean not null default true,
  role public.user_role not null default 'qa',
  -- Reporting period configuration. Null anchor = rolling window ending today.
  -- Set an anchor (e.g. a sprint start) to align periods to fixed boundaries.
  reporting_period_days integer not null default 14,
  reporting_period_anchor date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_slug_format check (public_slug ~ '^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$'),
  constraint profiles_slug_not_reserved check (public_slug not in (
    'api', 'app', 'auth', 'login', 'logout', 'settings', 'admin', 'static', 'public',
    'upload', 'review', 'tickets', 'workspace', 'dashboard', 'account', 'favicon-ico'
  )),
  constraint profiles_period_days check (reporting_period_days between 1 and 92)
);

create table public.qa_records (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  ticket_number text not null,
  title text not null default '',
  functional_area text,
  qa_status public.qa_status not null default 'assigned',
  assigned_on date,
  qa_completed_on date,
  source_document_id uuid,
  data jsonb not null default '{"schema_version": 1}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint qa_records_ticket_unique unique (owner_id, ticket_number),
  constraint qa_records_ticket_format check (ticket_number ~ '^\S.{0,63}$'),
  constraint qa_records_completed_has_date check (qa_status <> 'qa_completed' or qa_completed_on is not null),
  constraint qa_records_data_shape check (app_private.is_valid_qa_data(data))
);

create index qa_records_owner_completed_idx on public.qa_records (owner_id, qa_completed_on);
create index qa_records_owner_assigned_idx on public.qa_records (owner_id, assigned_on);

create table public.qa_documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  record_id uuid references public.qa_records (id) on delete set null,
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  extraction_status public.extraction_status not null default 'pending',
  -- Raw AI output. Never trusted as truth: only copied into qa_records after human confirmation.
  extraction jsonb,
  extraction_model text,
  extraction_error text,
  extracted_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint qa_documents_path_owner check (split_part(storage_path, '/', 1) = owner_id::text)
);

create index qa_documents_owner_idx on public.qa_documents (owner_id, created_at desc);
create index qa_documents_record_idx on public.qa_documents (record_id);

alter table public.qa_records
  add constraint qa_records_source_document_fk
  foreign key (source_document_id) references public.qa_documents (id) on delete set null;

create trigger profiles_updated_at before update on public.profiles
  for each row execute function app_private.set_updated_at();
create trigger qa_records_updated_at before update on public.qa_records
  for each row execute function app_private.set_updated_at();
create trigger qa_documents_updated_at before update on public.qa_documents
  for each row execute function app_private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Per-ticket metrics (derived from JSONB; always consistent with the data)
-- security_invoker: callers only see rows RLS allows them to see.
-- ---------------------------------------------------------------------------

create view public.qa_record_metrics with (security_invoker = true) as
select
  r.id as record_id,
  r.owner_id,
  r.ticket_number,
  r.qa_status,
  r.assigned_on,
  r.qa_completed_on,
  coalesce(tc.total, 0)::int as test_cases_total,
  coalesce(tc.passed, 0)::int as test_cases_passed,
  coalesce(tc.failed, 0)::int as test_cases_failed,
  coalesce(tc.blocked, 0)::int as test_cases_blocked,
  coalesce(tc.not_run, 0)::int as test_cases_not_run,
  coalesce(b.total, 0)::int as bugs_total,
  coalesce(b.critical, 0)::int as bugs_critical,
  coalesce(b.high, 0)::int as bugs_high,
  coalesce(b.medium, 0)::int as bugs_medium,
  coalesce(b.low, 0)::int as bugs_low,
  coalesce(rt.total, 0)::int as retests_total,
  coalesce(rt.passed, 0)::int as retests_passed,
  coalesce(rt.failed, 0)::int as retests_failed,
  coalesce(rt.pending, 0)::int as retests_pending
from public.qa_records r
left join lateral (
  select
    count(*) as total,
    count(*) filter (where lower(e ->> 'status') = 'pass') as passed,
    count(*) filter (where lower(e ->> 'status') = 'fail') as failed,
    count(*) filter (where lower(e ->> 'status') = 'blocked') as blocked,
    count(*) filter (where coalesce(lower(e ->> 'status'), 'not_run') not in ('pass', 'fail', 'blocked')) as not_run
  from jsonb_array_elements(app_private.as_array(r.data -> 'test_cases')) e
) tc on true
left join lateral (
  select
    count(*) as total,
    count(*) filter (where lower(e ->> 'severity') = 'critical') as critical,
    count(*) filter (where lower(e ->> 'severity') = 'high') as high,
    count(*) filter (where lower(e ->> 'severity') = 'medium') as medium,
    count(*) filter (where lower(e ->> 'severity') = 'low') as low
  from jsonb_array_elements(app_private.as_array(r.data -> 'bugs')) e
) b on true
left join lateral (
  select
    count(*) as total,
    count(*) filter (where lower(e ->> 'result') = 'pass') as passed,
    count(*) filter (where lower(e ->> 'result') = 'fail') as failed,
    count(*) filter (where coalesce(lower(e ->> 'result'), 'pending') not in ('pass', 'fail')) as pending
  from jsonb_array_elements(app_private.as_array(r.data -> 'retests')) e
) rt on true;

-- ---------------------------------------------------------------------------
-- Period metrics
-- Attribution rules:
--   tickets assigned  -> assigned_on in range
--   tickets completed -> qa_completed_on in range
--   test cases        -> executed_on, else the ticket's qa_completed_on
--   bugs              -> found_on, else qa_completed_on
--   retests           -> date, else qa_completed_on
-- Items without any resolvable date are not counted in period metrics.
-- SECURITY INVOKER (default): RLS on qa_records applies to the caller.
-- ---------------------------------------------------------------------------

create or replace function public.qa_metrics_for_range(p_owner uuid, p_start date, p_end date)
returns table (
  tickets_assigned int,
  tickets_completed int,
  test_cases_executed int,
  test_cases_passed int,
  test_cases_failed int,
  test_cases_blocked int,
  bugs_total int,
  bugs_critical int,
  bugs_high int,
  bugs_medium int,
  bugs_low int,
  retests_total int,
  retests_passed int,
  retests_failed int,
  retests_pending int
)
language sql stable
set search_path = ''
as $$
  with recs as (
    select * from public.qa_records where owner_id = p_owner
  ),
  tcs as (
    select lower(e ->> 'status') as status
    from recs r, jsonb_array_elements(app_private.as_array(r.data -> 'test_cases')) e
    where coalesce(app_private.try_date(e ->> 'executed_on'), r.qa_completed_on) between p_start and p_end
  ),
  bugs as (
    select lower(e ->> 'severity') as severity
    from recs r, jsonb_array_elements(app_private.as_array(r.data -> 'bugs')) e
    where coalesce(app_private.try_date(e ->> 'found_on'), r.qa_completed_on) between p_start and p_end
  ),
  rts as (
    select lower(e ->> 'result') as result
    from recs r, jsonb_array_elements(app_private.as_array(r.data -> 'retests')) e
    where coalesce(app_private.try_date(e ->> 'date'), r.qa_completed_on) between p_start and p_end
  )
  select
    (select count(*) from recs where assigned_on between p_start and p_end)::int,
    (select count(*) from recs where qa_status = 'qa_completed' and qa_completed_on between p_start and p_end)::int,
    (select count(*) from tcs where status in ('pass', 'fail', 'blocked'))::int,
    (select count(*) from tcs where status = 'pass')::int,
    (select count(*) from tcs where status = 'fail')::int,
    (select count(*) from tcs where status = 'blocked')::int,
    (select count(*) from bugs)::int,
    (select count(*) from bugs where severity = 'critical')::int,
    (select count(*) from bugs where severity = 'high')::int,
    (select count(*) from bugs where severity = 'medium')::int,
    (select count(*) from bugs where severity = 'low')::int,
    (select count(*) from rts)::int,
    (select count(*) from rts where result = 'pass')::int,
    (select count(*) from rts where result = 'fail')::int,
    (select count(*) from rts where coalesce(result, 'pending') not in ('pass', 'fail'))::int
$$;

-- Reporting periods for a profile, newest last. Uses the profile's configurable
-- period length and optional anchor; with no anchor, periods are rolling windows ending p_today.
create or replace function public.reporting_periods(p_owner uuid, p_count int default 8, p_today date default current_date)
returns table (period_index int, period_start date, period_end date)
language sql stable
set search_path = ''
as $$
  with cfg as (
    select
      p.reporting_period_days as days,
      case
        when p.reporting_period_anchor is null then p_today - p.reporting_period_days + 1
        else p.reporting_period_anchor
             + (floor((p_today - p.reporting_period_anchor)::numeric / p.reporting_period_days)::int
                * p.reporting_period_days)
      end as current_start
    from public.profiles p
    where p.id = p_owner
  )
  select
    (least(greatest(p_count, 1), 52) - 1 - g)::int as period_index,
    cfg.current_start - g * cfg.days as period_start,
    cfg.current_start - g * cfg.days + cfg.days - 1 as period_end
  from cfg, generate_series(least(greatest(p_count, 1), 52) - 1, 0, -1) g
$$;

create or replace function public.qa_metrics_by_period(p_owner uuid, p_count int default 8, p_today date default current_date)
returns table (
  period_index int,
  period_start date,
  period_end date,
  tickets_assigned int,
  tickets_completed int,
  test_cases_executed int,
  test_cases_passed int,
  test_cases_failed int,
  test_cases_blocked int,
  bugs_total int,
  bugs_critical int,
  bugs_high int,
  bugs_medium int,
  bugs_low int,
  retests_total int,
  retests_passed int,
  retests_failed int,
  retests_pending int
)
language sql stable
set search_path = ''
as $$
  select p.period_index, p.period_start, p.period_end, m.*
  from public.reporting_periods(p_owner, p_count, p_today) p
  cross join lateral public.qa_metrics_for_range(p_owner, p.period_start, p.period_end) m
  order by p.period_index
$$;

-- ---------------------------------------------------------------------------
-- Confirm a reviewed extraction: upsert the ticket and link the document atomically.
-- Runs as the caller, so RLS enforces ownership.
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
