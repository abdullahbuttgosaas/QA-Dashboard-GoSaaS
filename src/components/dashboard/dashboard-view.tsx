import Link from "next/link";
import type { ReactNode } from "react";
import { passRate, type PeriodMetrics } from "@/services/metrics";
import { StatTile } from "@/components/dashboard/stat-tile";
import { SeverityBar } from "@/components/dashboard/severity-bar";
import { TrendChart, type TrendPeriod } from "@/components/dashboard/trend-chart";
import { TicketTable, type TicketRow } from "@/components/tickets/ticket-table";
import { Card, CardHeader } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { formatPercent, formatRange, formatShortDate } from "@/lib/format";

const TREND_WINDOW = 8;

type Props = {
  title: string;
  periods: PeriodMetrics[]; // oldest first
  back: number; // 0 = current period
  periodLabel: string;
  basePath: string; // dashboard path, e.g. "/manager" or "/qa"
  ticketsPath: string; // e.g. "/manager/tickets"
  params?: Record<string, string>; // query params to preserve (e.g. { qa: "abdullah" })
  rows: TicketRow[];
  showOwner?: boolean;
  toolbar?: ReactNode; // e.g. the manager's QA selector
  ticketActions?: ReactNode; // e.g. QA "New ticket" button; never passed by manager pages
};

function rate(p: PeriodMetrics) {
  return passRate(p.test_cases_passed, p.test_cases_failed);
}

function withParams(path: string, params: Record<string, string>, extra: Record<string, string> = {}) {
  const q = new URLSearchParams({ ...params, ...extra });
  return q.size ? `${path}?${q}` : path;
}

// Shared by the manager (read-only) and QA dashboards. Contains no mutation controls itself.
export function DashboardView({ title, periods, back: requestedBack, periodLabel, basePath, ticketsPath, params = {}, rows, showOwner, toolbar, ticketActions }: Props) {
  const back = Math.min(Math.max(requestedBack, 0), periods.length - 1);
  const idx = periods.length - 1 - back;
  const current = periods[idx];
  const previous = idx > 0 ? periods[idx - 1] : null;
  const trendWindow = periods.slice(Math.max(0, idx - TREND_WINDOW + 1), idx + 1);

  const currentRate = rate(current);
  const previousRate = previous ? rate(previous) : null;
  const rateDelta =
    currentRate !== null && previousRate !== null ? Math.round(currentRate * 100) - Math.round(previousRate * 100) : null;
  const d = (key: keyof PeriodMetrics) => (previous ? (current[key] as number) - (previous[key] as number) : null);

  const trendPeriods: TrendPeriod[] = trendWindow.map((p) => ({
    label: formatShortDate(p.period_start),
    range: formatRange(p.period_start, p.period_end),
  }));
  const col = (key: keyof PeriodMetrics) => trendWindow.map((p) => p[key] as number);
  const query = Object.keys(params).length ? `?${new URLSearchParams(params)}` : "";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">{title}</h1>
          <p className="text-sm text-ink-muted">
            {back === 0 ? periodLabel : "Earlier period"} · {formatRange(current.period_start, current.period_end)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {toolbar}
          <nav className="flex items-center gap-2" aria-label="Reporting period">
            <Link
              href={withParams(basePath, params, { back: String(back + 1) })}
              aria-disabled={idx === 0}
              className={buttonClass("secondary", "sm", idx === 0 ? "pointer-events-none opacity-50" : undefined)}
            >
              ← Previous period
            </Link>
            <Link
              href={back <= 1 ? withParams(basePath, params) : withParams(basePath, params, { back: String(back - 1) })}
              aria-disabled={back === 0}
              className={buttonClass("secondary", "sm", back === 0 ? "pointer-events-none opacity-50" : undefined)}
            >
              Next period →
            </Link>
          </nav>
        </div>
      </div>

      <section aria-labelledby="activity-heading">
        <h2 id="activity-heading" className="mb-2 text-xs font-semibold tracking-wide text-ink-muted uppercase">
          QA activity
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Tickets assigned" metric="tickets_assigned" value={String(current.tickets_assigned)} delta={d("tickets_assigned")} />
          <StatTile label="Tickets QA completed" metric="tickets_completed" value={String(current.tickets_completed)} delta={d("tickets_completed")} />
          <StatTile
            label="Test cases executed"
            metric="test_cases_executed"
            value={String(current.test_cases_executed)}
            delta={d("test_cases_executed")}
            hint={current.test_cases_blocked ? `Includes ${current.test_cases_blocked} blocked` : undefined}
          />
          <StatTile
            label="Retests required"
            metric="retests_total"
            value={String(current.retests_total)}
            hint={
              <>
                {current.retests_passed} passed · {current.retests_failed} failed
                {current.retests_pending ? ` · ${current.retests_pending} pending` : ""}
              </>
            }
          />
        </div>
      </section>

      <section aria-labelledby="quality-heading">
        <h2 id="quality-heading" className="mb-2 text-xs font-semibold tracking-wide text-ink-muted uppercase">
          Solution quality
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile
            label="Pass rate"
            metric="pass_rate"
            value={formatPercent(currentRate)}
            delta={rateDelta}
            deltaFormat="points"
            hint={`${current.test_cases_passed} passed of ${current.test_cases_passed + current.test_cases_failed} pass/fail`}
          />
          <StatTile label="Failed test cases" metric="test_cases_failed" value={String(current.test_cases_failed)} delta={d("test_cases_failed")} />
          <StatTile label="Retest outcomes" metric="retest_outcomes" value={`${current.retests_passed} / ${current.retests_failed}`} hint="Passed / failed" />
          <StatTile label="Bugs found" metric="bugs_total" value={String(current.bugs_total)} delta={d("bugs_total")}>
            <SeverityBar
              counts={{
                critical: current.bugs_critical,
                high: current.bugs_high,
                medium: current.bugs_medium,
                low: current.bugs_low,
              }}
            />
          </StatTile>
        </div>
      </section>

      <Card>
        <CardHeader title="Trends" description={`Last ${trendWindow.length} reporting periods`} />
        <div className="grid gap-x-8 gap-y-6 p-5 md:grid-cols-2">
          <TrendChart
            title="Tickets QA completed"
            kind="columns"
            periods={trendPeriods}
            series={[{ key: "done", label: "Tickets QA completed", color: "var(--series-1)", values: col("tickets_completed") }]}
          />
          <TrendChart
            title="Pass rate"
            description="Passed ÷ (passed + failed)"
            kind="line"
            format="percent"
            periods={trendPeriods}
            series={[{ key: "rate", label: "Pass rate", color: "var(--series-1)", values: trendWindow.map(rate) }]}
          />
          <TrendChart
            title="Test case outcomes"
            kind="columns"
            periods={trendPeriods}
            series={[
              { key: "pass", label: "Passed", color: "var(--series-1)", values: col("test_cases_passed") },
              { key: "fail", label: "Failed", color: "var(--series-2)", values: col("test_cases_failed") },
              { key: "blocked", label: "Blocked", color: "var(--series-3)", values: col("test_cases_blocked") },
            ]}
          />
          <TrendChart
            title="Bugs found by severity"
            kind="columns"
            periods={trendPeriods}
            series={[
              { key: "critical", label: "Critical", color: "var(--sev-critical)", values: col("bugs_critical") },
              { key: "high", label: "High", color: "var(--sev-high)", values: col("bugs_high") },
              { key: "medium", label: "Medium", color: "var(--sev-medium)", values: col("bugs_medium") },
              { key: "low", label: "Low", color: "var(--sev-low)", values: col("bugs_low") },
            ]}
          />
          <TrendChart
            title="Retests"
            kind="columns"
            periods={trendPeriods}
            series={[
              { key: "passed", label: "Passed", color: "var(--series-1)", values: col("retests_passed") },
              { key: "failed", label: "Failed", color: "var(--series-2)", values: col("retests_failed") },
            ]}
          />
          <TrendChart
            title="Tickets assigned"
            kind="columns"
            periods={trendPeriods}
            series={[{ key: "assigned", label: "Tickets assigned", color: "var(--series-1)", values: col("tickets_assigned") }]}
          />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Recent tickets"
          actions={
            <>
              {ticketActions}
              <Link href={`${ticketsPath}${query}`} className={buttonClass("ghost", "sm")}>
                View all
              </Link>
            </>
          }
        />
        <TicketTable rows={rows.slice(0, 8)} hrefBase={ticketsPath} linkQuery={query} showOwner={showOwner} filterable={false} />
      </Card>
    </div>
  );
}
