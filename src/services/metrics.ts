import "server-only";
import type { Db } from "@/lib/supabase/public";
import { periodAnchorDate, type WeekBucket } from "@/lib/reporting";
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
