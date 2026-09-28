-- Reporting attribution anchored on the ticket's QA completed date, plus Lifetime reporting.
--
-- 1) qa_metrics_for_range: for a ticket that HAS qa_completed_on, every ticket-level QA metric (test cases
--    executed/passed/failed/blocked, bugs by severity, retests by result) is attributed to qa_completed_on,
--    regardless of the dates stored on the individual test cases, bugs or retests. Tickets WITHOUT
--    qa_completed_on keep the previous behaviour (each item's own date). Tickets assigned (assigned_on) and
--    tickets completed (qa_completed_on) are unchanged. No stored data is modified.
-- 2) Lifetime: qa_metrics_lifetime (all history, no date cutoff) and qa_metrics_lifetime_weeks (Monday-Friday
--    weekly buckets from the first week with data up to the current week).
-- Same signatures/grants as before; SECURITY INVOKER, so RLS still scopes rows (managers: every QA; a QA: own rows).

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
    select * from public.qa_records where p_owner is null or owner_id = p_owner
  ),
  tcs as (
    select lower(e ->> 'status') as status
    from recs r, jsonb_array_elements(app_private.as_array(r.data -> 'test_cases')) e
    where coalesce(r.qa_completed_on, app_private.try_date(e ->> 'executed_on')) between p_start and p_end
  ),
  bugs as (
    select lower(e ->> 'severity') as severity
    from recs r, jsonb_array_elements(app_private.as_array(r.data -> 'bugs')) e
    where coalesce(r.qa_completed_on, app_private.try_date(e ->> 'found_on')) between p_start and p_end
  ),
  rts as (
    select lower(e ->> 'result') as result
    from recs r, jsonb_array_elements(app_private.as_array(r.data -> 'retests')) e
    where coalesce(r.qa_completed_on, app_private.try_date(e ->> 'date')) between p_start and p_end
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

-- Lifetime totals: all historical data for the owner (NULL = every QA visible to the caller), no date cutoff.
create or replace function public.qa_metrics_lifetime(p_owner uuid)
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
  select * from public.qa_metrics_for_range(p_owner, '-infinity'::date, 'infinity'::date)
$$;

-- Lifetime trend: consecutive Monday-Friday weeks from the week of the earliest reportable date (assigned,
-- completed, or - for tickets without a completion date - an item's own date) through the week containing p_today.
create or replace function public.qa_metrics_lifetime_weeks(p_owner uuid, p_today date default current_date)
returns table (
  week_index int,
  week_start date,
  week_end date,

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
    select * from public.qa_records where p_owner is null or owner_id = p_owner
  ),
  dates as (
    select assigned_on as d from recs
    union all select qa_completed_on from recs
    union all select app_private.try_date(e ->> 'executed_on')
      from recs r, jsonb_array_elements(app_private.as_array(r.data -> 'test_cases')) e where r.qa_completed_on is null
    union all select app_private.try_date(e ->> 'found_on')
      from recs r, jsonb_array_elements(app_private.as_array(r.data -> 'bugs')) e where r.qa_completed_on is null
    union all select app_private.try_date(e ->> 'date')
      from recs r, jsonb_array_elements(app_private.as_array(r.data -> 'retests')) e where r.qa_completed_on is null
  ),
  cfg as (
    select
      p_today - (extract(isodow from p_today)::int - 1) as current_monday,
      least(coalesce(min(d), p_today), p_today) as first_day
    from dates
    where d is not null
  ),
  span as (
    select current_monday, first_day - (extract(isodow from first_day)::int - 1) as first_monday from cfg
  ),
  weeks as (
    select g::int as week_index, s.first_monday + g * 7 as week_start
    from span s, generate_series(0, (s.current_monday - s.first_monday) / 7) g
  )
  select w.week_index, w.week_start, w.week_start + 4 as week_end, m.*
  from weeks w
  cross join lateral public.qa_metrics_for_range(p_owner, w.week_start, w.week_start + 4) m
  order by w.week_index
$$;
