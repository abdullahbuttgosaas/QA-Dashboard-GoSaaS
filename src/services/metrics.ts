import "server-only";
import type { Db } from "@/lib/supabase/public";
import { periodAnchorDate, type PeriodMode, type WeekBucket, type WeekTotals } from "@/lib/reporting";
import { todayIso } from "@/lib/format";
import type { Database } from "@/types/database";

export type PeriodMetrics = Database["public"]["Functions"]["qa_metrics_by_period"]["Returns"][number];
export type RecordMetrics = Database["public"]["Views"]["qa_record_metrics"]["Row"];

export const MAX_TREND_PERIODS = 26;

// Pass rate = passed / (passed + failed). Blocked and not-run are excluded and reported separately.
export function passRate(passed: number, failed: number): number | null {
  const denominator = passed + failed;
  return denominator === 0 ? null : passed / denominator;
}

// Calendar-week metrics for a reporting period of `weeksPerPeriod` weeks, plus the equally long comparison period
// before it: returns 2 x weeksPerPeriod Monday-Friday buckets, oldest first. `back` moves whole periods into the past.
// ownerId = null aggregates every QA visible to the caller (RLS decides who is included).
export async function getWeeklyMetrics(
  db: Db,
  ownerId: string | null,
  weeksPerPeriod: number,
  back = 0,
  today: string = todayIso(),
): Promise<WeekBucket[]> {
  const { data, error } = await db.rpc("qa_metrics_by_week", {
    p_owner: ownerId as string, // SQL accepts NULL for the team view
    p_count: weeksPerPeriod * 2,
    p_today: periodAnchorDate(today, weeksPerPeriod, back),
  });
  if (error) throw new Error(`Failed to load metrics: ${error.message}`);
  return data ?? [];
}

// Lifetime: totals over all history (no date cutoff) plus Monday-Friday weekly buckets from the first week with
// data through the current week. ownerId = null aggregates every QA visible to the caller (RLS).
export async function getLifetimeMetrics(
  db: Db,
  ownerId: string | null,
  today: string = todayIso(),
): Promise<{ weeks: WeekBucket[]; totals: WeekTotals }> {
  const [weeks, totals] = await Promise.all([
    db.rpc("qa_metrics_lifetime_weeks", { p_owner: ownerId as string, p_today: today }),
    db.rpc("qa_metrics_lifetime", { p_owner: ownerId as string }),
  ]);
  if (weeks.error || totals.error) throw new Error(`Failed to load metrics: ${(weeks.error ?? totals.error)!.message}`);
  return { weeks: weeks.data ?? [], totals: (totals.data ?? [])[0] };
}

// Dashboard data for either an N-week period (+ comparison) or Lifetime.
export async function getDashboardMetrics(
  db: Db,
  ownerId: string | null,
  mode: PeriodMode,
  back = 0,
): Promise<{ weeks: WeekBucket[]; lifetimeTotals?: WeekTotals }> {
  if (mode.kind === "lifetime") {
    const { weeks, totals } = await getLifetimeMetrics(db, ownerId);
    return { weeks, lifetimeTotals: totals };
  }
  return { weeks: await getWeeklyMetrics(db, ownerId, mode.weeks, back) };
}

// Legacy rolling periods (kept for backwards compatibility; the dashboards use getWeeklyMetrics).
// Metrics for the last `count` reporting periods (oldest first).
// ownerId = null aggregates every QA visible to the caller (team view; RLS decides who is included) using the
// default 14-day rolling periods. A single QA uses that QA's own period settings.
export async function getPeriodMetrics(db: Db, ownerId: string | null, count = MAX_TREND_PERIODS): Promise<PeriodMetrics[]> {
  const { data, error } = await db.rpc("qa_metrics_by_period", {
    p_owner: ownerId as string, // SQL accepts NULL for the team view
    p_count: Math.min(Math.max(count, 1), MAX_TREND_PERIODS),
  });
  if (error) throw new Error(`Failed to load metrics: ${error.message}`);
  return data ?? [];
}

export async function getRecordMetrics(db: Db, ownerId: string | null): Promise<RecordMetrics[]> {
  let query = db.from("qa_record_metrics").select("*");
  if (ownerId) query = query.eq("owner_id", ownerId);
  const { data, error } = await query;
  if (error) throw new Error(`Failed to load ticket metrics: ${error.message}`);
  return data ?? [];
}
