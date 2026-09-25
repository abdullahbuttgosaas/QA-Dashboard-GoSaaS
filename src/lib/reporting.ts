// Calendar-week reporting helpers (pure; the week boundaries themselves come from the database function
// qa_metrics_by_week, which returns Monday..Friday buckets).
//
// A reporting period is N consecutive calendar weeks ending with the current week. The comparison period is the
// N weeks immediately before it. Only Monday-Friday counts; weekends are never part of any bucket.

export const DEFAULT_REPORTING_WEEKS = 2;
export const MAX_REPORTING_WEEKS = 12;
export const MAX_BACK_PERIODS = 52;

export type WeekTotals = {
  tickets_assigned: number;
  tickets_completed: number;
  test_cases_executed: number;
  test_cases_passed: number;
  test_cases_failed: number;
  test_cases_blocked: number;
  bugs_total: number;
  bugs_critical: number;
  bugs_high: number;
  bugs_medium: number;
  bugs_low: number;
  retests_total: number;
  retests_passed: number;
  retests_failed: number;
  retests_pending: number;
};

export type WeekBucket = WeekTotals & { week_index: number; week_start: string; week_end: string };

const METRIC_KEYS: Array<keyof WeekTotals> = [
  "tickets_assigned",
  "tickets_completed",
  "test_cases_executed",
  "test_cases_passed",
  "test_cases_failed",
  "test_cases_blocked",
  "bugs_total",
  "bugs_critical",
  "bugs_high",
  "bugs_medium",
  "bugs_low",
  "retests_total",
  "retests_passed",
  "retests_failed",
  "retests_pending",
];

export function clampWeeks(value: unknown): number {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) && n >= 1 ? Math.min(n, MAX_REPORTING_WEEKS) : DEFAULT_REPORTING_WEEKS;
}

export function clampBack(value: unknown): number {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) && n > 0 ? Math.min(n, MAX_BACK_PERIODS) : 0;
}

export function sumWeeks(weeks: WeekBucket[]): WeekTotals {
  const totals = Object.fromEntries(METRIC_KEYS.map((k) => [k, 0])) as WeekTotals;
  for (const w of weeks) for (const k of METRIC_KEYS) totals[k] += Number(w[k]) || 0;
  return totals;
}

// "Today" used to pick the current week, shifted back by whole periods for the Previous/Next period navigation.
export function periodAnchorDate(todayIso: string, weeksPerPeriod: number, back: number): string {
  const d = new Date(`${todayIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - back * weeksPerPeriod * 7);
  return d.toISOString().slice(0, 10);
}

export type ReportingPeriod = {
  weeksPerPeriod: number;
  current: WeekTotals;
  previous: WeekTotals | null;
  currentWeeks: WeekBucket[]; // the trend buckets, oldest first
  start: string; // Monday of the first week
  end: string; // Friday of the last week
};

// buckets = 2N consecutive weeks (oldest first): the first N are the comparison period, the last N the current one.
export function summarizePeriod(buckets: WeekBucket[], weeksPerPeriod: number): ReportingPeriod {
  const sorted = [...buckets].sort((a, b) => a.week_start.localeCompare(b.week_start));
  const currentWeeks = sorted.slice(-weeksPerPeriod);
  const previousWeeks = sorted.slice(0, Math.max(0, sorted.length - weeksPerPeriod)).slice(-weeksPerPeriod);
  return {
    weeksPerPeriod,
    current: sumWeeks(currentWeeks),
    previous: previousWeeks.length === weeksPerPeriod ? sumWeeks(previousWeeks) : null,
    currentWeeks,
    start: currentWeeks[0]?.week_start ?? "",
    end: currentWeeks.at(-1)?.week_end ?? "",
  };
}

// Trend bucket names: 1 week -> "Current week"; 2 weeks -> "Previous week", "Current week"; N weeks -> "Week 1".."Week N".
export function weekBucketLabel(index: number, weeksPerPeriod: number): string {
  if (weeksPerPeriod === 1) return "Current week";
  if (weeksPerPeriod === 2) return index === 0 ? "Previous week" : "Current week";
  return `Week ${index + 1}`;
}

export function periodTitle(weeksPerPeriod: number, back: number): string {
  if (back > 0) return weeksPerPeriod === 1 ? "Earlier week" : `Earlier ${weeksPerPeriod}-week period`;
  return weeksPerPeriod === 1 ? "This week" : `Last ${weeksPerPeriod} weeks`;
}
