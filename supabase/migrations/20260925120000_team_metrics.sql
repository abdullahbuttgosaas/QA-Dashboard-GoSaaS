-- Team-wide metrics for the manager view.
-- p_owner = NULL now means "all QA users visible to the caller". These functions are SECURITY INVOKER,
-- so RLS still decides which QAs are included: anonymous managers only ever see public profiles.
-- No table, policy, grant or signature changes.

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

-- With p_owner = NULL (team view) periods use the default configuration: 14-day rolling windows ending today.
create or replace function public.reporting_periods(p_owner uuid, p_count int default 8, p_today date default current_date)
returns table (period_index int, period_start date, period_end date)
language sql stable
set search_path = ''
as $$
  with settings as (
    select p.reporting_period_days as days, p.reporting_period_anchor as anchor
    from public.profiles p
    where p.id = p_owner
    union all
    select 14, null::date where p_owner is null
  ),
  cfg as (
    select
      s.days,
      case
        when s.anchor is null then p_today - s.days + 1
        else s.anchor + (floor((p_today - s.anchor)::numeric / s.days)::int * s.days)
      end as current_start
    from settings s
  )
  select
    (least(greatest(p_count, 1), 52) - 1 - g)::int as period_index,
    cfg.current_start - g * cfg.days as period_start,
    cfg.current_start - g * cfg.days + cfg.days - 1 as period_end
  from cfg, generate_series(least(greatest(p_count, 1), 52) - 1, 0, -1) g
$$;
