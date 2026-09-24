import type { ReactNode } from "react";

type Props = {
  label: string;
  value: string;
  delta?: number | null; // change vs previous period, in the metric's own unit
  deltaFormat?: "count" | "points";
  hint?: ReactNode;
  children?: ReactNode;
};

// Deltas are shown neutrally: whether "up" is good depends on context (more bugs found
// may mean better QA or a worse solution), so the dashboard does not color-judge them.
export function StatTile({ label, value, delta, deltaFormat = "count", hint, children }: Props) {
  return (
    <div className="flex flex-col rounded-lg border border-line bg-surface px-4 py-3.5">
      <div className="text-xs font-medium text-ink-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight text-ink">{value}</div>
      {delta !== undefined && delta !== null && (
        <div className="mt-0.5 text-xs text-ink-muted">
          {delta === 0 ? "No change" : `${delta > 0 ? "▲" : "▼"} ${Math.abs(delta)}${deltaFormat === "points" ? " pts" : ""}`}{" "}
          vs previous period
        </div>
      )}
      {hint && <div className="mt-0.5 text-xs text-ink-muted">{hint}</div>}
      {children}
    </div>
  );
}
