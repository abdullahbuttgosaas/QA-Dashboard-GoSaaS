-- 1) Ticket status vs QA completed date
-- 2) Calendar-week (Monday-Friday) reporting configured in weeks
--
-- Additive and backward compatible: the old rolling-period columns/functions stay in place (unused by the new app
-- code) so this migration can be applied before or after the matching app deploy without breaking either version.

-- ---------------------------------------------------------------------------
-- 1. A QA completed date is only valid on a ticket whose status is QA completed.
-- (qa_records_completed_has_date already requires the date when the status IS QA completed.)
-- ---------------------------------------------------------------------------

-- Clear impossible states before enforcing the rule (a completion date on an assigned/in-progress ticket).
update public.qa_records
   set qa_completed_on = null
 where qa_status <> 'qa_completed'
   and qa_completed_on is not null;

alter table public.qa_records
  add constraint qa_records_date_only_when_completed
  check (qa_status = 'qa_completed' or qa_completed_on is null);

-- ---------------------------------------------------------------------------
-- 2. Reporting period length in calendar weeks (default 2 = previous + current week).
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column reporting_period_weeks integer not null default 2,
  add constraint profiles_period_weeks check (reporting_period_weeks between 1 and 12);

-- profiles uses column-level grants: expose the new column like the other settings columns.
grant select (reporting_period_weeks) on public.profiles to anon;
grant update (reporting_period_weeks) on public.profiles to authenticated;

comment on column public.profiles.reporting_period_days is 'Deprecated: replaced by reporting_period_weeks (calendar weeks).';
comment on column public.profiles.reporting_period_anchor is 'Deprecated: replaced by reporting_period_weeks (calendar weeks).';

-- Weekly metric buckets: p_count consecutive calendar weeks, oldest first, the last one being the week that
-- contains p_today. Each bucket covers Monday..Friday only, so Saturday/Sunday dates never count.
-- Metric attribution (which date drives each metric) is exactly qa_metrics_for_range's.
-- SECURITY INVOKER: RLS scopes rows (managers see every QA, a signed-in QA only their own).
-- p_owner = NULL aggregates every QA visible to the caller.
create or replace function public.qa_metrics_by_week(p_owner uuid, p_count int default 4, p_today date default current_date)
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
  with cfg as (
    select
      least(greatest(coalesce(p_count, 4), 1), 104) as n,
      -- Monday of the ISO week containing p_today (a Saturday/Sunday belongs to the week that just ended).
      p_today - (extract(isodow from p_today)::int - 1) as current_monday
  ),
  weeks as (
    select g::int as week_index, cfg.current_monday - (cfg.n - 1 - g) * 7 as week_start
    from cfg, generate_series(0, cfg.n - 1) g
  )
  select w.week_index, w.week_start, w.week_start + 4 as week_end, m.*
  from weeks w
  cross join lateral public.qa_metrics_for_range(p_owner, w.week_start, w.week_start + 4) m
  order by w.week_index
$$;
