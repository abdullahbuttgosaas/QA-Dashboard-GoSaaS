import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

export type PeriodMetrics = Database["public"]["Functions"]["qa_metrics_by_period"]["Returns"][number];
export type RecordMetrics = Database["public"]["Views"]["qa_record_metrics"]["Row"];

export const MAX_TREND_PERIODS = 12;

// Pass rate = passed / (passed + failed). Blocked and not-run are excluded and reported separately.
export function passRate(passed: number, failed: number): number | null {
  const denominator = passed + failed;
  return denominator === 0 ? null : passed / denominator;
}

// Metrics for the last `count` reporting periods (oldest first). Period length/anchor
// come from the owner's profile settings, so no business dates are hard-coded here.
export async function getPeriodMetrics(ownerId: string, count = 8): Promise<PeriodMetrics[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("qa_metrics_by_period", {
    p_owner: ownerId,
    p_count: Math.min(Math.max(count, 1), MAX_TREND_PERIODS),
  });
  if (error) throw new Error(`Failed to load metrics: ${error.message}`);
  return data ?? [];
}

export async function getRecordMetrics(ownerId: string): Promise<RecordMetrics[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("qa_record_metrics").select("*").eq("owner_id", ownerId);
  if (error) throw new Error(`Failed to load ticket metrics: ${error.message}`);
  return data ?? [];
}
